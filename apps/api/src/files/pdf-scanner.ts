import { Inject, Injectable } from '@nestjs/common';
import { spawn } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { createConnection } from 'node:net';
import { once } from 'node:events';
import { FILE_CONFIG, FileConfiguration } from './files.config';

/** Why a file was rejected; stored in files.check_error, never the tool's own message. */
export type FileCheckCode = 'MALWARE' | 'PASSWORD_PROTECTED' | 'INVALID_PDF' | 'TOO_MANY_PAGES';

export class FileCheckError extends Error {
  constructor(
    readonly retryable: boolean,
    readonly code: FileCheckCode | null = null,
  ) {
    super(retryable ? 'File check temporarily unavailable.' : 'File check rejected.');
  }
}

/**
 * Accepts PDFs that open without a password. An owner-password PDF reports
 * `Encrypted: yes (print:… copy:no …)`; copy:no is kept so the API can refuse text highlights.
 */
export function parsePdfInfo(output: string) {
  const pages = Number(/^Pages:\s+(\d+)\s*$/m.exec(output)?.[1]);
  const encrypted = /^Encrypted:\s+(no|yes\b.*?)\s*$/m.exec(output)?.[1];
  if (!Number.isInteger(pages) || pages < 1 || !encrypted)
    throw new FileCheckError(false, 'INVALID_PDF');
  if (pages > 10000) throw new FileCheckError(false, 'TOO_MANY_PAGES');
  return { pageCount: pages, copyRestricted: /\bcopy:no\b/.test(encrypted) };
}
export function runTool(
  binary: string,
  args: string[],
  timeout: number,
  textOnly = false,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, {
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, LC_ALL: 'C', LANG: 'C' },
    });
    let output = '';
    // Only matched against Poppler's fixed C-locale wording; never stored or logged.
    let errors = '';
    let hasText = false;
    let failed = false;
    const fail = () => {
      failed = true;
      child.kill('SIGKILL');
    };
    const timer = setTimeout(fail, timeout);
    child.stdout.on('data', (data: Buffer) => {
      if (textOnly) {
        if (data.toString('utf8').trim()) hasText = true;
      } else {
        output += data.toString('utf8');
        if (output.length > 32768) fail();
      }
    });
    child.stderr.on('data', (data: Buffer) => {
      if (errors.length < 4096) errors += data.toString('utf8');
    });
    child.on('error', () => {
      clearTimeout(timer);
      reject(new FileCheckError(true));
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      // Timeouts and oversized output stay retryable; a clean non-zero exit is the file's fault.
      if (failed) reject(new Error('PDF parsing failed.'));
      else if (code !== 0)
        reject(
          new FileCheckError(
            false,
            /Incorrect password/.test(errors) ? 'PASSWORD_PROTECTED' : 'INVALID_PDF',
          ),
        );
      else resolve(textOnly ? (hasText ? 'text' : '') : output);
    });
  });
}
export async function clamScan(
  path: string,
  host: string,
  port: number,
  timeout = 60_000,
): Promise<void> {
  const socket = createConnection({ host, port });
  let response = '';
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await new Promise<void>((resolve, reject) => {
      timer = setTimeout(() => socket.destroy(new FileCheckError(true)), timeout);
      socket.on('error', () => reject(new FileCheckError(true)));
      socket.on('close', () => {
        if (!response.includes('\0')) reject(new FileCheckError(true));
      });
      socket.on('data', (data: Buffer) => {
        response += data.toString('utf8');
        if (response.length > 1024) {
          socket.destroy();
          reject(new FileCheckError(true));
        } else if (response.includes('\0')) {
          if (response === 'stream: OK\0') resolve();
          else if (/^stream: .+ FOUND\0$/.test(response))
            reject(new FileCheckError(false, 'MALWARE'));
          else reject(new FileCheckError(true));
        }
      });
      socket.once('connect', () => {
        void (async () => {
          socket.write('zINSTREAM\0');
          for await (const chunk of createReadStream(path, { highWaterMark: 64 * 1024 })) {
            const bytes = chunk as Buffer;
            const size = Buffer.alloc(4);
            size.writeUInt32BE(bytes.length);
            if (!socket.write(Buffer.concat([size, bytes]))) await once(socket, 'drain');
          }
          socket.write(Buffer.alloc(4));
        })().catch(() => reject(new FileCheckError(true)));
      });
    });
  } finally {
    if (timer) clearTimeout(timer);
    socket.destroy();
  }
}
/** True only when clamd answers PING; clamd refuses connections while it loads signatures. */
export async function clamPing(host: string, port: number, timeout = 2_000): Promise<boolean> {
  const socket = createConnection({ host, port });
  try {
    return await new Promise<boolean>((resolve) => {
      let response = '';
      socket.setTimeout(timeout, () => resolve(false));
      socket.on('error', () => resolve(false));
      socket.on('close', () => resolve(response === 'PONG\0'));
      socket.on('data', (data: Buffer) => {
        response += data.toString('utf8');
        if (response.includes('\0') || response.length > 64) resolve(response === 'PONG\0');
      });
      socket.once('connect', () => socket.write('zPING\0'));
    });
  } finally {
    socket.destroy();
  }
}
@Injectable()
export class PdfScanner {
  constructor(@Inject(FILE_CONFIG) private readonly config: FileConfiguration) {}
  reachable() {
    return clamPing(this.config.clamHost, this.config.clamPort);
  }
  async scan(path: string) {
    await clamScan(path, this.config.clamHost, this.config.clamPort);
    const info = parsePdfInfo(await runTool(this.config.pdfinfo, ['-isodates', path], 30_000));
    const text = await runTool(this.config.pdftotext, ['-enc', 'UTF-8', path, '-'], 30_000, true);
    return { ...info, hasTextLayer: !!text };
  }
}
