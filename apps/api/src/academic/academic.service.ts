import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.module';
import { Prisma } from '../generated/prisma/client';
import { CreateCatalogDto, ListCatalogDto, UpdateCatalogDto } from './academic.dto';

// Identifiers below are static application constants, never interpolated request values.
const resources = {
  faculties: { table: 'hucescholar.faculties', entity: 'FACULTY' },
  programs: { table: 'hucescholar.programs', entity: 'PROGRAM' },
} as const;
export type CatalogKind = keyof typeof resources;
export type CatalogItem = {
  id: string;
  code: string;
  name: string;
  active: boolean;
  revision: number;
  facultyId?: string;
  facultyName?: string;
};
export function academicId(value: string): bigint {
  if (!/^[1-9]\d{0,18}$/.test(value) || BigInt(value) > 9223372036854775807n)
    throw new BadRequestException('Mã định danh không hợp lệ.');
  return BigInt(value);
}
export function catalogKind(value: string): CatalogKind {
  if (!Object.hasOwn(resources, value))
    throw new BadRequestException('Loại danh mục không hợp lệ.');
  return value as CatalogKind;
}
function columns(kind: CatalogKind) {
  return Prisma.sql`id::text, code, name, is_active AS active, revision ${kind !== 'faculties' ? Prisma.sql`, faculty_id::text AS "facultyId", (SELECT code || ' · ' || name FROM hucescholar.faculties WHERE id=faculty_id) AS "facultyName"` : Prisma.empty}`;
}
export const staleCatalog = () =>
  new ConflictException({
    code: 'STALE_REVISION',
    message: 'Danh mục đã thay đổi. Tải bản hiện hành trước khi sửa tiếp.',
  });

@Injectable()
export class AcademicService {
  constructor(private readonly db: DatabaseService) {}
  async beginWrite(tx: Prisma.TransactionClient, actor: string) {
    const id = academicId(actor);
    await tx.$queryRaw`SELECT id FROM hucescholar.users WHERE id=${id} FOR SHARE`;
    const user = await tx.users.findUnique({
      where: { id },
      select: { role: true, status: true, verified_at: true },
    });
    if (!user || user.role !== 'ADMIN' || user.status !== 'ACTIVE' || !user.verified_at)
      throw new ForbiddenException('Không còn quyền quản trị.');
    // Low-volume administrative writes share one lock to keep cross-catalog invariants atomic.
    await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(68467, 1)`;
    return id;
  }
  async audit(
    tx: Prisma.TransactionClient,
    actorId: bigint,
    kind: string,
    id: bigint,
    event: string,
  ) {
    await tx.audit_events.create({
      data: { actor_id: actorId, entity_type: kind, entity_id: id, event_type: event },
    });
  }
  async list(rawKind: string, query: ListCatalogDto) {
    const kind = catalogKind(rawKind);
    const table = Prisma.raw(resources[kind].table);
    const predicates: Prisma.Sql[] = [Prisma.sql`true`];
    if (query.facultyId) {
      if (kind === 'faculties') throw new BadRequestException('Khoa không có khoa cha.');
      predicates.push(Prisma.sql`faculty_id=${academicId(query.facultyId)}`);
    }
    if (query.search)
      predicates.push(
        Prisma.sql`(strpos(lower(code),lower(${query.search})) > 0 OR strpos(lower(name),lower(${query.search})) > 0)`,
      );
    if (query.status) predicates.push(Prisma.sql`is_active=${query.status === 'ACTIVE'}`);
    const where = Prisma.join(predicates, ' AND ');
    const [items, count] = await this.db.$transaction(
      [
        this.db.$queryRaw<CatalogItem[]>(
          Prisma.sql`SELECT ${columns(kind)} FROM ${table} WHERE ${where} ORDER BY code,id LIMIT ${query.limit} OFFSET ${(query.page - 1) * query.limit}`,
        ),
        this.db.$queryRaw<{ total: number }[]>(
          Prisma.sql`SELECT count(*)::int AS total FROM ${table} WHERE ${where}`,
        ),
      ],
      { isolationLevel: 'RepeatableRead' },
    );
    return { items, total: count[0].total, page: query.page, limit: query.limit };
  }
  async get(rawKind: string, rawId: string) {
    const kind = catalogKind(rawKind);
    return { item: await this.read(this.db, kind, academicId(rawId)) };
  }
  private async read(tx: Prisma.TransactionClient, kind: CatalogKind, id: bigint, lock = false) {
    const rows = await tx.$queryRaw<CatalogItem[]>(
      Prisma.sql`SELECT ${columns(kind)} FROM ${Prisma.raw(resources[kind].table)} WHERE id=${id} ${lock ? Prisma.sql`FOR UPDATE` : Prisma.empty}`,
    );
    if (!rows[0]) throw new NotFoundException('Không tìm thấy danh mục.');
    return rows[0];
  }
  private duplicate(error: unknown): never {
    const adapter =
      error instanceof Prisma.PrismaClientKnownRequestError ? error.meta?.driverAdapterError : null;
    const cause =
      adapter && typeof adapter === 'object' && 'cause' in adapter ? adapter.cause : null;
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === 'P2002' ||
        (error.code === 'P2010' &&
          cause &&
          typeof cause === 'object' &&
          'originalCode' in cause &&
          cause.originalCode === '23505'))
    )
      throw new ConflictException({ code: 'CODE_TAKEN', message: 'Mã danh mục đã được sử dụng.' });
    throw error;
  }
  async create(actor: string, rawKind: string, body: CreateCatalogDto) {
    const kind = catalogKind(rawKind);
    if ((kind === 'faculties') === !!body.facultyId)
      throw new BadRequestException('Kiểm tra khoa phụ trách.');
    try {
      const item = await this.db.$transaction(async (tx) => {
        const actorId = await this.beginWrite(tx, actor);
        if (body.facultyId) await this.activeFaculty(tx, academicId(body.facultyId));
        const rows = await tx.$queryRaw<CatalogItem[]>(
          Prisma.sql`INSERT INTO ${Prisma.raw(resources[kind].table)} (code,name ${body.facultyId ? Prisma.sql`,faculty_id` : Prisma.empty}) VALUES (${body.code},${body.name} ${body.facultyId ? Prisma.sql`,${academicId(body.facultyId)}` : Prisma.empty}) RETURNING ${columns(kind)}`,
        );
        await this.audit(
          tx,
          actorId,
          resources[kind].entity,
          BigInt(rows[0].id),
          `${resources[kind].entity}_CREATED`,
        );
        return rows[0];
      });
      return { item };
    } catch (error) {
      this.duplicate(error);
    }
  }
  async update(actor: string, rawKind: string, rawId: string, body: UpdateCatalogDto) {
    const kind = catalogKind(rawKind);
    const id = academicId(rawId);
    try {
      const item = await this.db.$transaction(async (tx) => {
        const actorId = await this.beginWrite(tx, actor);
        const current = await this.read(tx, kind, id, true);
        if (current.revision !== body.revision) throw staleCatalog();
        if (kind !== 'faculties' && body.active)
          await this.activeFaculty(tx, BigInt(current.facultyId!));
        if (kind === 'faculties' && !body.active) {
          const children = await tx.$queryRaw<
            { n: number }[]
          >`SELECT ((SELECT count(*) FROM hucescholar.programs WHERE faculty_id=${id} AND is_active) + (SELECT count(*) FROM hucescholar.courses WHERE faculty_id=${id} AND is_active))::int AS n`;
          if (children[0].n)
            throw new ConflictException({
              code: 'ACTIVE_CHILDREN',
              message: 'Ngừng ngành và môn thuộc khoa trước.',
            });
        }
        const rows = await tx.$queryRaw<CatalogItem[]>(
          Prisma.sql`UPDATE ${Prisma.raw(resources[kind].table)} SET code=${body.code}, name=${body.name}, is_active=${body.active}, revision=revision+1 WHERE id=${id} RETURNING ${columns(kind)}`,
        );
        await this.audit(
          tx,
          actorId,
          resources[kind].entity,
          id,
          `${resources[kind].entity}_UPDATED`,
        );
        return rows[0];
      });
      return { item };
    } catch (error) {
      this.duplicate(error);
    }
  }
  async activeFaculty(tx: Prisma.TransactionClient, id: bigint) {
    await tx.$queryRaw`SELECT id FROM hucescholar.faculties WHERE id=${id} FOR SHARE`;
    const parent = await tx.faculties.findUnique({ where: { id }, select: { is_active: true } });
    if (!parent) throw new NotFoundException('Không tìm thấy khoa.');
    if (!parent.is_active)
      throw new ConflictException({ code: 'INACTIVE_FACULTY', message: 'Khoa đã ngừng sử dụng.' });
  }
}
