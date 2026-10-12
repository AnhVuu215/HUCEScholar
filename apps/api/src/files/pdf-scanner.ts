import { Inject, Injectable } from '@nestjs/common';
import { spawn } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { createConnection } from 'node:net';
import { once } from 'node:events';
import { FILE_CONFIG, FileConfiguration } from './files.config';

export function parsePdfInfo(output: string) {
  const pages = Number(/^Pages:\s+(\d+)\s*$/m.exec(output)?.[1]);
  if (
    !Number.isInteger(pages) ||
    pages < 1 ||
    pages > 10000 ||
    !/^Encrypted:\s+no\s*$/m.test(output)
  )
    throw new Error('Invalid or encrypted PDF.');
  return pages;
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
      stdio: ['ignore', 'pipe', 'ignore'],
      env: { ...process.env, LC_ALL: 'C', LANG: 'C' },
    });
    let output = '';
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
    child.on('error', () => {
      clearTimeout(timer);
      reject(new Error('PDF tool unavailable.'));
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (failed || code !== 0) reject(new Error('PDF parsing failed.'));
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
      timer = setTimeout(() => socket.destroy(new Error('Scanner timeout.')), timeout);
      socket.on('error', () => reject(new Error('Scanner unavailable.')));
      socket.on('close', () => {
        if (!response.includes('\0')) reject(new Error('Scanner disconnected.'));
      });
      socket.on('data', (data: Buffer) => {
        response += data.toString('utf8');
        if (response.length > 1024) {
          socket.destroy();
          reject(new Error('Invalid scanner response.'));
        } else if (response.includes('\0')) {
          if (response === 'stream: OK\0') resolve();
          else reject(new Error('Scanner rejected PDF.'));
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
        })().catch(() => reject(new Error('Scanner stream failed.')));
      });
    });
  } finally {
    if (timer) clearTimeout(timer);
    socket.destroy();
  }
}
@Injectable()
export class PdfScanner {
  constructor(@Inject(FILE_CONFIG) private readonly config: FileConfiguration) {}
  async scan(path: string) {
    await clamScan(path, this.config.clamHost, this.config.clamPort);
    const pageCount = parsePdfInfo(await runTool(this.config.pdfinfo, ['-isodates', path], 30_000));
    const text = await runTool(this.config.pdftotext, ['-enc', 'UTF-8', path, '-'], 30_000, true);
    return { pageCount, hasTextLayer: !!text };
  }
}
