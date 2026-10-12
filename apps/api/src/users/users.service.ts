import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { DatabaseService } from '../database/database.module';
import { Prisma } from '../generated/prisma/client';
import { passwordOptions } from '../auth/auth.service';
import { CreateUserDto, ListUsersDto, UpdateUserDto, UserStatusDto } from './users.dto';

const fields = {
  id: true,
  email: true,
  display_name: true,
  role: true,
  status: true,
  verified_at: true,
  created_at: true,
  updated_at: true,
  revision: true,
} satisfies Prisma.usersSelect;
type SafeUser = Prisma.usersGetPayload<{ select: typeof fields }>;
const serialize = (user: SafeUser) => ({
  id: user.id.toString(),
  email: user.email,
  displayName: user.display_name,
  role: user.role,
  status: user.status,
  verifiedAt: user.verified_at?.toISOString() ?? null,
  createdAt: user.created_at.toISOString(),
  updatedAt: user.updated_at.toISOString(),
  revision: user.revision,
});
const conflict = () =>
  new ConflictException({
    code: 'STALE_REVISION',
    message: 'Thông tin đã thay đổi. Tải lại danh sách rồi thử lại.',
  });

function userId(value: string): bigint {
  if (!/^[1-9]\d{0,18}$/.test(value) || BigInt(value) > 9223372036854775807n)
    throw new BadRequestException('Mã tài khoản không hợp lệ.');
  return BigInt(value);
}

@Injectable()
export class UsersService {
  constructor(private readonly db: DatabaseService) {}

  async get(rawId: string) {
    const user = await this.db.users.findUnique({ where: { id: userId(rawId) }, select: fields });
    if (!user) throw new NotFoundException('Không tìm thấy tài khoản.');
    return { user: serialize(user) };
  }

  async list(query: ListUsersDto) {
    const where: Prisma.usersWhereInput = {
      role: query.role,
      status: query.status,
      ...(query.search
        ? {
            OR: [
              { email: { contains: query.search, mode: 'insensitive' } },
              { display_name: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [items, total] = await this.db.$transaction(
      [
        this.db.users.findMany({
          where,
          select: fields,
          orderBy: { id: 'desc' },
          skip: (query.page - 1) * query.limit,
          take: query.limit,
        }),
        this.db.users.count({ where }),
      ],
      { isolationLevel: 'RepeatableRead' },
    );
    return { items: items.map(serialize), total, page: query.page, limit: query.limit };
  }

  private async requireAdmin(tx: Prisma.TransactionClient, actorId: bigint) {
    // Hold the actor's role/status stable through the write, even if an external tool changes it.
    await tx.$queryRaw`SELECT id FROM hucescholar.users WHERE id=${actorId} FOR SHARE`;
    const actor = await tx.users.findUnique({
      where: { id: actorId },
      select: { role: true, status: true, verified_at: true },
    });
    if (!actor || actor.role !== 'ADMIN' || actor.status !== 'ACTIVE' || !actor.verified_at)
      throw new ForbiddenException('Tài khoản quản trị không còn quyền thực hiện thao tác.');
  }

  private async editable(tx: Prisma.TransactionClient, id: bigint, revision: number) {
    await tx.$queryRaw`SELECT id FROM hucescholar.users WHERE id=${id} FOR UPDATE`;
    const current = await tx.users.findUnique({ where: { id }, select: fields });
    if (!current) throw new NotFoundException('Không tìm thấy tài khoản.');
    if (current.role === 'ADMIN')
      throw new ForbiddenException('Tài khoản quản trị chỉ được xem ở chức năng này.');
    if (current.revision !== revision) throw conflict();
    return current;
  }

  private async audit(tx: Prisma.TransactionClient, actorId: bigint, id: bigint, event: string) {
    await tx.audit_events.create({
      data: { actor_id: actorId, entity_type: 'USER', entity_id: id, event_type: event },
    });
  }

  private duplicate(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
      throw new ConflictException({
        code: 'EMAIL_TAKEN',
        message: 'Email này đã được sử dụng. Chọn email khác.',
      });
    throw error;
  }

  async create(actor: string, body: CreateUserDto) {
    const actorId = userId(actor);
    const hash = await argon2.hash(body.password, passwordOptions);
    try {
      const user = await this.db.$transaction(async (tx) => {
        await this.requireAdmin(tx, actorId);
        const created = await tx.users.create({
          data: {
            email: body.email,
            display_name: body.displayName,
            role: body.role,
            password_hash: hash,
            status: 'ACTIVE',
            verified_at: new Date(),
            verified_by: actorId,
          },
          select: fields,
        });
        await this.audit(tx, actorId, created.id, 'ACCOUNT_CREATED');
        return created;
      });
      return { user: serialize(user) };
    } catch (error) {
      this.duplicate(error);
    }
  }

  async update(actor: string, rawId: string, body: UpdateUserDto) {
    const id = userId(rawId);
    const actorId = userId(actor);
    try {
      const user = await this.db.$transaction(async (tx) => {
        await this.requireAdmin(tx, actorId);
        const current = await this.editable(tx, id, body.revision);
        const updated = await tx.users.update({
          where: { id },
          data: {
            email: body.email,
            display_name: body.displayName,
            updated_at: new Date(),
            revision: { increment: 1 },
          },
          select: fields,
        });
        if (current.email !== body.email) {
          await tx.$executeRaw`UPDATE hucescholar.auth_sessions
            SET revoked_at=greatest(clock_timestamp(), created_at)
            WHERE user_id=${id} AND revoked_at IS NULL`;
        }
        await this.audit(
          tx,
          actorId,
          id,
          current.email !== body.email ? 'ACCOUNT_EMAIL_CHANGED' : 'ACCOUNT_PROFILE_UPDATED',
        );
        return updated;
      });
      return { user: serialize(user) };
    } catch (error) {
      this.duplicate(error);
    }
  }

  async setStatus(actor: string, rawId: string, body: UserStatusDto) {
    const id = userId(rawId);
    const actorId = userId(actor);
    const user = await this.db.$transaction(async (tx) => {
      await this.requireAdmin(tx, actorId);
      const current = await this.editable(tx, id, body.revision);
      if (current.status === body.status) return current;
      const verify = body.status === 'ACTIVE' && !current.verified_at;
      if (verify && body.eligibilityConfirmed !== true)
        throw new BadRequestException('Cần xác nhận người dùng thuộc danh sách hợp lệ.');
      const updated = await tx.users.update({
        where: { id },
        data: {
          status: body.status,
          updated_at: new Date(),
          revision: { increment: 1 },
          ...(verify ? { verified_at: new Date(), verified_by: actorId } : {}),
        },
        select: fields,
      });
      // The database trigger revokes sessions; restoring ACTIVE never restores old sessions.
      await this.audit(
        tx,
        actorId,
        id,
        verify
          ? 'ACCOUNT_VERIFIED'
          : body.status === 'LOCKED'
            ? 'ACCOUNT_LOCKED'
            : 'ACCOUNT_UNLOCKED',
      );
      return updated;
    });
    return { user: serialize(user) };
  }
}
