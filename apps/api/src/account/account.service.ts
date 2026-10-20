import {
  ConflictException,
  HttpException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.module';
import { AuthService } from '../auth/auth.service';
import { AuthenticatedRequest } from '../auth/auth.types';
import { PreferencesUpdateDto, ProfileUpdateDto } from './account.dto';
import { Prisma } from '../generated/prisma/client';

export const accountConflict = () =>
  new ConflictException({
    code: 'REVISION_CONFLICT',
    message: 'Thông tin đã thay đổi. Tải lại để đối chiếu trước khi lưu.',
  });
const profile = (user: {
  id: bigint;
  email: string;
  display_name: string;
  role: string;
  revision: number;
  must_change_password: boolean;
}) => ({
  id: String(user.id),
  email: user.email,
  displayName: user.display_name,
  role: user.role,
  revision: user.revision,
  mustChangePassword: user.must_change_password,
});
@Injectable()
export class AccountService {
  async preferences(request: AuthenticatedRequest, update?: PreferencesUpdateDto) {
    const id = BigInt(request.user.id);
    try {
      return await this.db.$transaction(async (tx) => {
        await this.auth.lockUser(tx, id);
        await this.auth.requireLiveSession(tx, request, id);
        let row = await tx.user_preferences.findUnique({ where: { user_id: id } });
        if (update) {
          if ((row?.revision ?? 0) !== update.revision || (row && row.revision >= 2147483646))
            throw accountConflict();
          const data = {
            highlight_color: update.preferences.highlightColor,
            default_zoom: update.preferences.defaultZoom,
            annotation_panel_open: update.preferences.annotationPanelOpen,
            updated_at: new Date(),
          };
          row = row
            ? await tx.user_preferences.update({
                where: { user_id: id },
                data: { ...data, revision: { increment: 1 } },
              })
            : await tx.user_preferences.create({ data: { user_id: id, ...data } });
          await tx.audit_events.create({
            data: {
              actor_id: id,
              entity_type: 'USER',
              entity_id: id,
              event_type: 'SELF_PREFERENCES_UPDATED',
            },
          });
        }
        return {
          userId: String(id),
          preferences: row
            ? {
                highlightColor: row.highlight_color,
                defaultZoom: row.default_zoom,
                annotationPanelOpen: row.annotation_panel_open,
              }
            : { highlightColor: '#FFF59D', defaultZoom: 'fit-width', annotationPanelOpen: false },
          revision: row?.revision ?? 0,
        };
      });
    } catch (error) {
      if (error instanceof HttpException) throw error;
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        throw accountConflict();
      throw new ServiceUnavailableException('Chưa xác nhận được cài đặt. Tải lại để đối chiếu.');
    }
  }
  constructor(
    private readonly db: DatabaseService,
    private readonly auth: AuthService,
  ) {}
  async profile(request: AuthenticatedRequest, update?: ProfileUpdateDto) {
    const id = BigInt(request.user.id);
    return this.db
      .$transaction(async (tx) => {
        const current = await this.auth.lockUser(tx, id);
        await this.auth.requireLiveSession(tx, request, id);
        if (!update) return { user: profile(current) };
        if (current.revision !== update.revision || current.revision >= 2147483646)
          throw accountConflict();
        const user = await tx.users.update({
          where: { id },
          data: {
            display_name: update.displayName,
            revision: { increment: 1 },
            updated_at: new Date(),
          },
        });
        await tx.audit_events.create({
          data: {
            actor_id: id,
            entity_id: id,
            entity_type: 'USER',
            event_type: 'SELF_PROFILE_UPDATED',
          },
        });
        return { user: profile(user) };
      })
      .catch((error: unknown) => {
        if (error instanceof HttpException) throw error;
        throw new ServiceUnavailableException(
          'Chưa xác nhận được cập nhật hồ sơ. Tải lại để đối chiếu.',
        );
      });
  }
}
