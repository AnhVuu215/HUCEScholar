import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.module';
import { Profile } from '../auth/auth.types';
import { academicId } from '../academic/academic.service';
import { Prisma } from '../generated/prisma/client';
import { DraftListDto } from './materials.dto';
import { LibraryService } from './library.service';
@Injectable()
export class PersonalLibraryService {
  constructor(
    private readonly db: DatabaseService,
    private readonly library: LibraryService,
  ) {}
  private run<T>(
    actor: Profile,
    writing: boolean,
    action: (tx: Prisma.TransactionClient, owner: bigint) => Promise<T>,
  ) {
    const owner = academicId(actor.id);
    return this.db.$transaction(
      async (tx) => {
        if (writing)
          await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${`hucescholar:saved:${owner}`}, 0))`;
        await tx.$queryRaw`SELECT id FROM hucescholar.users WHERE id=${owner} FOR SHARE`;
        const user = await tx.users.findUnique({
          where: { id: owner },
          select: { status: true, verified_at: true },
        });
        if (!user || user.status !== 'ACTIVE' || !user.verified_at)
          throw new ForbiddenException('Tài khoản không còn quyền truy cập.');
        return action(tx, owner);
      },
      { isolationLevel: writing ? 'ReadCommitted' : 'RepeatableRead' },
    );
  }
  status(actor: Profile, rawId: string) {
    const document_id = academicId(rawId);
    return this.run(actor, false, async (tx, user_id) => ({
      saved: !!(await tx.saved_documents.findUnique({
        where: { user_id_document_id: { user_id, document_id } },
      })),
    }));
  }
  change(actor: Profile, rawId: string, saved: boolean) {
    const document_id = academicId(rawId);
    return this.run(actor, true, async (tx, user_id) => {
      if (saved) {
        await tx.$queryRaw`SELECT id FROM hucescholar.documents WHERE id=${document_id} FOR SHARE`;
        const document = await tx.documents.findUnique({
          where: { id: document_id },
          select: { current_version_id: true },
        });
        if (!document?.current_version_id)
          throw new NotFoundException('Tài liệu chưa có bản công bố khả dụng.');
        await this.library.access(tx, actor, document.current_version_id);
        await tx.saved_documents.upsert({
          where: { user_id_document_id: { user_id, document_id } },
          create: { user_id, document_id },
          update: {},
        });
      } else await tx.saved_documents.deleteMany({ where: { user_id, document_id } });
      return { saved };
    });
  }
  saved(actor: Profile, query: DraftListDto) {
    return this.run(actor, false, async (tx, user_id) => {
      const rows = await tx.saved_documents.findMany({
        where: { user_id },
        orderBy: [{ created_at: 'desc' }, { document_id: 'desc' }],
        take: query.limit,
        skip: (query.page - 1) * query.limit,
        select: {
          document_id: true,
          created_at: true,
          documents: { select: { current_version_id: true } },
        },
      });
      const items = await this.library.readableItems(
        tx,
        rows.flatMap((r) =>
          r.documents.current_version_id ? [r.documents.current_version_id] : [],
        ),
      );
      return {
        items: rows.map((r) => ({
          documentId: String(r.document_id),
          savedAt: r.created_at.toISOString(),
          material: items.get(String(r.documents.current_version_id)) ?? null,
        })),
        total: await tx.saved_documents.count({ where: { user_id } }),
        page: query.page,
        limit: query.limit,
      };
    });
  }
  recent(actor: Profile, query: DraftListDto) {
    return this.run(actor, false, async (tx, user_id) => {
      const rows = await tx.reading_progress.findMany({
        where: { user_id },
        orderBy: [{ updated_at: 'desc' }, { version_id: 'desc' }],
        take: query.limit,
        skip: (query.page - 1) * query.limit,
        select: {
          version_id: true,
          page_number: true,
          updated_at: true,
          document_versions: { select: { document_id: true } },
        },
      });
      const items = await this.library.readableItems(
        tx,
        rows.map((r) => r.version_id),
      );
      return {
        items: rows.map((r) => ({
          documentId: String(r.document_versions.document_id),
          versionId: String(r.version_id),
          pageNumber: r.page_number,
          readAt: r.updated_at.toISOString(),
          material: items.get(String(r.version_id)) ?? null,
        })),
        total: await tx.reading_progress.count({ where: { user_id } }),
        page: query.page,
        limit: query.limit,
      };
    });
  }
}
