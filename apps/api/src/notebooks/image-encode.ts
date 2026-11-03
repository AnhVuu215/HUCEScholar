import {
  BadRequestException,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import sharp from 'sharp';

/** Largest image accepted from an upload or a fetched URL, before re-encoding. */
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
/** Longest side kept after re-encoding; the thumbnail is for page previews. */
export const MAX_IMAGE_SIDE = 2400;
export const THUMB_SIDE = 480;
/** Decoding bombs: refuse anything whose pixel count would exceed this before decoding. */
const MAX_INPUT_PIXELS = 50_000_000;

export type ImageKind = 'png' | 'jpeg' | 'gif' | 'webp' | 'avif' | 'heic';

/** Recognises the formats by their magic bytes; the declared Content-Type is never trusted. */
export function sniffImage(bytes: Buffer): ImageKind | null {
  if (bytes.length < 12) return null;
  if (bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
    return 'png';
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpeg';
  const head = bytes.subarray(0, 6).toString('latin1');
  if (head === 'GIF87a' || head === 'GIF89a') return 'gif';
  if (
    bytes.subarray(0, 4).toString('latin1') === 'RIFF' &&
    bytes.subarray(8, 12).toString('latin1') === 'WEBP'
  )
    return 'webp';
  if (bytes.subarray(4, 8).toString('latin1') === 'ftyp') {
    const size = Math.min(bytes.readUInt32BE(0), bytes.length, 256);
    const brands: string[] = [];
    for (let at = 8; at + 4 <= size; at += 4)
      if (at !== 12) brands.push(bytes.subarray(at, at + 4).toString('latin1'));
    if (brands.some((b) => b === 'avif' || b === 'avis')) return 'avif';
    if (brands.some((b) => /^(heic|heix|hevc|hevx|heim|heis|mif1|msf1)$/.test(b))) return 'heic';
  }
  return null;
}

export interface EncodedImage {
  data: Buffer;
  thumb: Buffer;
  width: number;
  height: number;
  sha256: string;
}

/**
 * Decodes the first frame, applies the EXIF orientation, shrinks to 2400 px and writes a fresh
 * WebP: metadata (EXIF, GPS, ICC comments) and anything hidden after the pixels are dropped.
 */
export async function encodeImage(bytes: Buffer): Promise<EncodedImage> {
  if (bytes.length > MAX_IMAGE_BYTES)
    throw new PayloadTooLargeException({
      code: 'IMAGE_TOO_LARGE',
      message: 'Ảnh lớn hơn 10 MB.',
    });
  const kind = sniffImage(bytes);
  if (kind === 'heic')
    throw new UnsupportedMediaTypeException({
      code: 'IMAGE_HEIC',
      message: 'Ảnh HEIC (iPhone) chưa đọc được. Lưu ảnh dưới dạng JPG hoặc PNG rồi thử lại.',
    });
  if (!kind)
    throw new UnsupportedMediaTypeException({
      code: 'IMAGE_UNSUPPORTED',
      message: 'Chỉ nhận ảnh PNG, JPG, WebP, GIF hoặc AVIF.',
    });
  try {
    const { data, info } = await sharp(bytes, {
      limitInputPixels: MAX_INPUT_PIXELS,
      failOn: 'error',
      animated: false,
    })
      .timeout({ seconds: 20 })
      .rotate()
      .resize(MAX_IMAGE_SIDE, MAX_IMAGE_SIDE, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 85, effort: 4 })
      .toBuffer({ resolveWithObject: true });
    const thumb = await sharp(data)
      .timeout({ seconds: 10 })
      .resize(THUMB_SIDE, THUMB_SIDE, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 75 })
      .toBuffer();
    return {
      data,
      thumb,
      width: info.width,
      height: info.height,
      sha256: createHash('sha256').update(data).digest('hex'),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (/pixel limit/i.test(message))
      throw new PayloadTooLargeException({
        code: 'IMAGE_TOO_LARGE',
        message: 'Ảnh có độ phân giải quá lớn (tối đa 50 megapixel).',
      });
    throw new BadRequestException({
      code: 'IMAGE_INVALID',
      message: 'Không đọc được ảnh này. File có thể bị hỏng.',
    });
  }
}
