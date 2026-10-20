import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.module';
import { Prisma } from '../generated/prisma/client';
import { academicId } from '../academic/academic.service';
import { Profile } from '../auth/auth.types';
import { LibraryService } from './library.service';
import { LifecycleService } from './lifecycle.service';
import { CreateReportDto, ReportActionDto, ReportListDto } from './reports.dto';

const fail = (code: string, message: string) => new ConflictException({ code, message });
const reviewing = 'Quản trị viên đang xem xét báo cáo.';
const ownSelect = {
  id: true,
  version_id: true,
  category: true,
  description: true,
  status: true,
  created_at: true,
  report_actions: {
    select: { action: true, result: true, created_at: true },
    orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
    take: 1,
  },
} satisfies Prisma.reportsSelect;
const adminSelect = {
  id: true,
  document_id: true,
  version_id: true,
  category: true,
  description: true,
  status: true,
  created_at: true,
  updated_at: true,
  revision: true,
  users: { select: { display_name: true, email: true } },
  document_versions: { select: { title: true, version_no: true } },
} satisfies Prisma.reportsSelect;

type OwnRow = Prisma.reportsGetPayload<{ select: typeof ownSelect }>;
type AdminRow = Prisma.reportsGetPayload<{ select: typeof adminSelect }>;
/** What the reporter sees: their own text, the status and the latest result written for them. */
const own = (r: OwnRow) => ({
  id: String(r.id),
  versionId: String(r.version_id),
  category: r.category,
  description: r.description,
  status: r.status,
  createdAt: r.created_at.toISOString(),
  result: r.report_actions[0]?.result ?? null,
  resultAt: r.report_actions[0]?.created_at.toISOString() ?? null,
});
const admin = (r: AdminRow) => ({
  id: String(r.id),
  documentId: String(r.document_id),
  versionId: String(r.version_id),
  title: r.document_versions?.title ?? '',
  versionNo: r.document_versions?.version_no ?? 0,
  category: r.category,
  description: r.description,
  status: r.status,
  reporter: { displayName: r.users.display_name, email: r.users.email },
  createdAt: r.created_at.toISOString(),
  updatedAt: r.updated_at.toISOString(),
  revision: r.revision,
});

@Injectable()
export class ReportsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly library: LibraryService,
    private readonly lifecycle: LifecycleService,
  ) {}

  /** Anyone who can read the version may report it. Reports never change visibility. */
  async create(actor: Profile, rawVersionId: string, body: CreateReportDto) {
    const versionId = academicId(rawVersionId),
      actorId = academicId(actor.id);
    return this.db.$transaction(async (tx) => {
      const readable = (await this.library.readableItems(tx, [versionId])).get(String(versionId));
      if (!readable)
        throw new NotFoundException('Học liệu không còn khả dụng hoặc bạn không có quyền đọc.');
      // Serialize one reporter's submissions for a version so a double submit cannot duplicate.
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`report:${actorId}:${versionId}`}, 0)) IS NULL AS locked`;
      const duplicate = await tx.reports.findFirst({
        where: {
          reported_by: actorId,
          version_id: versionId,
          category: body.category,
          status: { in: ['OPEN', 'IN_REVIEW'] },
        },
        select: { id: true },
      });
      if (duplicate)
        throw fail(
          'DUPLICATE_REPORT',
          'Bạn đã có báo cáo cùng loại đang chờ xử lý cho phiên bản này.',
        );
      const report = await tx.reports.create({
        data: {
          reported_by: actorId,
          document_id: BigInt(readable.documentId),
          version_id: versionId,
          category: body.category,
          description: body.description,
        },
        select: ownSelect,
      });
      await this.audit(tx, actorId, report.id, 'REPORT_CREATED');
      return { item: own(report) };
    });
  }

  /** The caller's own reports for one version; never other people's reports. */
  async mine(actor: Profile, rawVersionId: string) {
    const rows = await this.db.reports.findMany({
      where: { reported_by: academicId(actor.id), version_id: academicId(rawVersionId) },
      select: ownSelect,
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      take: 20,
    });
    return { items: rows.map(own) };
  }

  async list(query: ReportListDto) {
    const where: Prisma.reportsWhereInput = {
      document_id: { not: null },
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? { document_versions: { title: { contains: query.search, mode: 'insensitive' } } }
        : {}),
    };
    return this.db.$transaction(
      async (tx) => ({
        items: (
          await tx.reports.findMany({
            where,
            select: adminSelect,
            orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
            skip: (query.page - 1) * query.limit,
            take: query.limit,
          })
        ).map(admin),
        total: await tx.reports.count({ where }),
        page: query.page,
        limit: query.limit,
      }),
      { isolationLevel: 'RepeatableRead' },
    );
  }

  async get(rawId: string) {
    return this.db.$transaction(
      async (tx) => ({ item: await this.detail(tx, academicId(rawId)) }),
      { isolationLevel: 'RepeatableRead' },
    );
  }

  async act(actor: Profile, rawId: string, body: ReportActionDto) {
    const id = academicId(rawId),
      actorId = academicId(actor.id);
    if (body.action !== 'RESOLVE' && body.hide)
      throw new BadRequestException('Chỉ ẩn tài liệu khi đánh dấu báo cáo đã xử lý.');
    if (body.action !== 'TAKE_REVIEW' && !body.result)
      throw new BadRequestException('Ghi kết quả gửi người báo cáo.');
    if (body.hide && (!body.hideReason || !body.documentRevision))
      throw new BadRequestException('Ẩn tài liệu cần lý do và trạng thái tài liệu hiện tại.');
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM hucescholar.users WHERE id=${actorId} FOR SHARE`;
      const user = await tx.users.findUnique({ where: { id: actorId } });
      if (!user || user.role !== 'ADMIN' || user.status !== 'ACTIVE' || !user.verified_at)
        throw new ForbiddenException('Không còn quyền xử lý báo cáo.');
      await tx.$queryRaw`SELECT id FROM hucescholar.reports WHERE id=${id} FOR UPDATE`;
      const report = await tx.reports.findUnique({ where: { id } });
      if (!report?.document_id) throw new NotFoundException('Không tìm thấy báo cáo.');
      if (report.revision !== body.revision)
        throw fail('STALE_REVISION', 'Báo cáo đã thay đổi. Tải lại trước khi xử lý.');
      const allowed =
        body.action === 'TAKE_REVIEW'
          ? report.status === 'OPEN'
          : ['OPEN', 'IN_REVIEW'].includes(report.status);
      if (!allowed) throw fail('REPORT_CLOSED', 'Báo cáo đã được xử lý hoặc đang được xem xét.');
      const event = body.hide
        ? await this.lifecycle.hideWithin(
            tx,
            actorId,
            report.document_id,
            body.documentRevision!,
            body.hideReason!,
          )
        : null;
      await tx.report_actions.create({
        data: {
          report_id: id,
          performed_by: actorId,
          action: body.action,
          result: body.action === 'TAKE_REVIEW' ? reviewing : body.result!,
          visibility_event_id: event,
        },
      });
      await tx.reports.update({
        where: { id },
        data: {
          status:
            body.action === 'TAKE_REVIEW'
              ? 'IN_REVIEW'
              : body.action === 'RESOLVE'
                ? 'RESOLVED'
                : 'DISMISSED',
          revision: { increment: 1 },
          updated_at: new Date(),
        },
      });
      await this.audit(tx, actorId, id, `REPORT_${body.action}`);
      return { item: await this.detail(tx, id) };
    });
  }

  private async detail(tx: Prisma.TransactionClient, id: bigint) {
    const row = await tx.reports.findUnique({
      where: { id },
      select: {
        ...adminSelect,
        report_actions: {
          select: {
            id: true,
            action: true,
            result: true,
            created_at: true,
            users: { select: { display_name: true } },
            visibility_events: { select: { reason: true } },
          },
          orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
        },
        documents: { select: { visibility: true, revision: true } },
      },
    });
    if (!row?.document_id || !row.documents) throw new NotFoundException('Không tìm thấy báo cáo.');
    return {
      ...admin(row),
      document: { visibility: row.documents.visibility, revision: row.documents.revision },
      actions: row.report_actions.map((a) => ({
        id: String(a.id),
        action: a.action,
        result: a.result,
        performedBy: a.users.display_name,
        hiddenReason: a.visibility_events?.reason ?? null,
        createdAt: a.created_at.toISOString(),
      })),
    };
  }

  private async audit(tx: Prisma.TransactionClient, actorId: bigint, id: bigint, event: string) {
    await tx.audit_events.create({
      data: { actor_id: actorId, entity_type: 'REPORT', entity_id: id, event_type: event },
    });
  }
}
