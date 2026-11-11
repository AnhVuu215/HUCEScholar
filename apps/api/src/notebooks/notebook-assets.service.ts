import {
  BadRequestException,
  ConflictException,
  GoneException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { isIP } from 'node:net';
import type { Readable } from 'node:stream';
import { Profile } from '../auth/auth.types';
import { DatabaseService } from '../database/database.module';
import type { notebook_assets } from '../generated/prisma/client';
import { MissingObjectError, PrivateStore } from '../files/private-store';
import { ScanQueue } from '../files/scan-queue';
import { encodeImage, MAX_IMAGE_BYTES } from './image-encode';
import { fetchImage, isBlockedAddress } from './image-fetch';
import { readCapped } from './read-capped';
import { parseId } from '../common/ids';
import { lockKey } from '../common/locks';

/** Images (full size and thumbnail) a user may keep across all notebooks. */
export const ASSET_QUOTA_BYTES = 1024 * 1024 * 1024;
const MAX_ACTIVE = 3;

export const thumbKey = (key: string) => key.replace(/\.webp$/, '-t.webp');
const assetItem = (a: notebook_assets) => ({
  id: String(a.id),
  status: a.scan_status,
  width: a.width,
  height: a.height,
  error: a.check_error,
  sourceHost: a.source_host,
});

/**
 * Test runs serve the dragged-in image from the local web server; only then, and only when the
 * test environment asks for it, may the fetcher reach loopback. Everything else stays blocked.
 */
export function fetchBlocker(env: NodeJS.ProcessEnv) {
  const loopback = env.NODE_ENV === 'test' && env.NOTEBOOK_FETCH_LOOPBACK === '1';
  return (address: string, family: 4 | 6) =>
    loopback && (address === '127.0.0.1' || address === '::1')
      ? false
      : isBlockedAddress(address, family);
}

@Injectable()
export class NotebookAssetsService {
  private readonly active = new Map<string, number>();
  private total = 0;
  private readonly blocker = fetchBlocker(process.env);
  constructor(
    private readonly db: DatabaseService,
    private readonly store: PrivateStore,
    private readonly queue: ScanQueue,
  ) {}

  /** Re-encoding holds an image in memory; a few at a time, one per user at a time. */
  private async busy<T>(actor: Profile, work: () => Promise<T>) {
    if ((this.active.get(actor.id) ?? 0) >= 1 || this.total >= MAX_ACTIVE)
      throw new HttpException(
        { code: 'IMAGE_BUSY', message: 'Đang xử lý ảnh khác. Thử lại sau giây lát.' },
        429,
      );
    this.active.set(actor.id, (this.active.get(actor.id) ?? 0) + 1);
    this.total++;
    try {
      return await work();
    } finally {
      this.total--;
      const left = (this.active.get(actor.id) ?? 1) - 1;
      if (left) this.active.set(actor.id, left);
      else this.active.delete(actor.id);
    }
  }

  private async existing(userId: bigint, requestId: string) {
    return this.db.notebook_assets.findUnique({
      where: { user_id_request_id: { user_id: userId, request_id: requestId } },
    });
  }

  private async keep(
    actor: Profile,
    requestId: string,
    bytes: Buffer,
    source: { kind: 'UPLOAD' } | { kind: 'URL'; host: string },
  ) {
    const userId = parseId(actor.id);
    const image = await encodeImage(bytes);
    const key = `notebook/${randomUUID()}.webp`;
    let stored = false;
    try {
      await this.store.putImage(key, image.data);
      await this.store.putImage(thumbKey(key), image.thumb);
      stored = true;
      const row = await this.db.$transaction(async (tx) => {
        await lockKey(tx, `notebook:${userId}`);
        const again = await tx.notebook_assets.findUnique({
          where: { user_id_request_id: { user_id: userId, request_id: requestId } },
        });
        if (again) return { row: again, fresh: false };
        const used = await tx.notebook_assets.aggregate({
          where: { user_id: userId },
          _sum: { byte_size: true, thumb_size: true },
        });
        const total =
          (used._sum.byte_size ?? 0) +
          (used._sum.thumb_size ?? 0) +
          image.data.length +
          image.thumb.length;
        if (total > ASSET_QUOTA_BYTES)
          throw new HttpException(
            {
              code: 'NOTEBOOK_QUOTA',
              message: 'Kho ảnh của vở ghi đã đầy (1 GB). Xóa bớt ảnh hoặc vở cũ rồi thử lại.',
            },
            413,
          );
        return {
          row: await tx.notebook_assets.create({
            data: {
              request_id: requestId,
              user_id: userId,
              object_key: key,
              byte_size: image.data.length,
              thumb_size: image.thumb.length,
              width: image.width,
              height: image.height,
              sha256: image.sha256,
              source: source.kind,
              source_host: source.kind === 'URL' ? source.host : null,
            },
          }),
          fresh: true,
        };
      });
      if (!row.fresh) await this.discard(key);
      else
        await this.queue
          .enqueueImage(String(row.row.id))
          .catch(() =>
            Logger.warn('Notebook image saved; queue reconciliation required.', 'Files'),
          );
      return { item: assetItem(row.row) };
    } catch (error) {
      if (stored) await this.discard(key);
      throw error;
    }
  }
  private async discard(key: string) {
    await Promise.all([this.store.removeImage(key), this.store.removeImage(thumbKey(key))]).catch(
      () => Logger.warn('Notebook image cleanup required.', 'Files'),
    );
  }

  /** The request body is the image itself (`image/*`), at most 10 MB. */
  async upload(actor: Profile, requestId: string | undefined, contentType: string, body: Readable) {
    if (
      !requestId ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestId)
    )
      throw new BadRequestException({ code: 'IMAGE_INVALID', message: 'Thiếu mã yêu cầu.' });
    if (!/^image\/[a-z0-9.+-]+$/i.test(contentType.split(';')[0].trim()))
      throw new UnsupportedMediaTypeException({
        code: 'IMAGE_UNSUPPORTED',
        message: 'Chỉ nhận ảnh PNG, JPG, WebP, GIF hoặc AVIF.',
      });
    const userId = parseId(actor.id);
    const known = await this.existing(userId, requestId);
    if (known) {
      body.resume();
      return { item: assetItem(known) };
    }
    return this.busy(actor, async () => {
      const bytes = await readCapped(body, MAX_IMAGE_BYTES);
      if (!bytes)
        throw new PayloadTooLargeException({
          code: 'IMAGE_TOO_LARGE',
          message: 'Ảnh lớn hơn 10 MB.',
        });
      return this.keep(actor, requestId, bytes, { kind: 'UPLOAD' });
    });
  }

  /** "Kéo ảnh từ Google": the API fetches the URL under the SSRF rules in image-fetch.ts. */
  async fromUrl(actor: Profile, requestId: string, url: string) {
    const userId = parseId(actor.id);
    const known = await this.existing(userId, requestId);
    if (known) return { item: assetItem(known) };
    return this.busy(actor, async () => {
      const fetched = await fetchImage(url, { isBlocked: this.blocker });
      const host = isIP(fetched.host.replace(/^\[|\]$/g, ''))
        ? fetched.host
        : fetched.host.toLowerCase();
      return this.keep(actor, requestId, fetched.bytes, { kind: 'URL', host });
    });
  }

  async status(actor: Profile, ids: string) {
    const userId = parseId(actor.id);
    const rows = await this.db.notebook_assets.findMany({
      where: { id: { in: ids.split(',').map((id) => BigInt(id)) }, user_id: userId },
    });
    return { items: rows.map(assetItem) };
  }

  async usage(actor: Profile) {
    const userId = parseId(actor.id);
    const [used, notebooks] = await Promise.all([
      this.db.notebook_assets.aggregate({
        where: { user_id: userId },
        _sum: { byte_size: true, thumb_size: true },
        _count: { _all: true },
      }),
      this.db.notebooks.count({ where: { user_id: userId } }),
    ]);
    return {
      imageBytes: (used._sum.byte_size ?? 0) + (used._sum.thumb_size ?? 0),
      imageCount: used._count._all,
      imageLimit: ASSET_QUOTA_BYTES,
      notebooks,
    };
  }

  /** The image bytes, only for its owner and only once the file check passed. */
  async open(actor: Profile, rawId: string, thumb: boolean) {
    const row = await this.db.notebook_assets.findFirst({
      where: { id: parseId(rawId), user_id: parseId(actor.id) },
    });
    if (!row)
      throw new NotFoundException({ code: 'ASSET_NOT_FOUND', message: 'Không tìm thấy ảnh.' });
    if (row.scan_status === 'CHECKING')
      throw new ConflictException({ code: 'ASSET_CHECKING', message: 'Ảnh đang được kiểm tra.' });
    if (row.scan_status !== 'SAFE')
      throw new GoneException({
        code: 'ASSET_REJECTED',
        message: 'Ảnh không qua được bước kiểm tra.',
      });
    try {
      return await this.store.readImage(thumb ? thumbKey(row.object_key) : row.object_key);
    } catch (error) {
      if (error instanceof MissingObjectError) {
        Logger.warn(`Private image missing for notebook asset ${row.id}.`, 'Files');
        throw new GoneException({ code: 'FILE_MISSING', message: 'Ảnh không còn trên máy chủ.' });
      }
      throw error;
    }
  }
}
