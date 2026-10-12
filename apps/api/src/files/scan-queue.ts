import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import { AUTH_CONFIG, AuthConfiguration } from '../auth/auth.config';

export const PDF_QUEUE = 'hs-pdf-scan';
export function queueConnection(url: string, worker = false) {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: Number(parsed.port || 6379),
    username: decodeURIComponent(parsed.username) || undefined,
    password: decodeURIComponent(parsed.password) || undefined,
    db: Number(parsed.pathname.slice(1) || 0),
    ...(parsed.protocol === 'rediss:' ? { tls: {} } : {}),
    maxRetriesPerRequest: worker ? null : 1,
    connectTimeout: 2000,
    retryStrategy: (attempt: number) => Math.min(attempt * 500, 5000),
  };
}
@Injectable()
export class ScanQueue implements OnModuleDestroy {
  readonly queue: Queue;
  constructor(@Inject(AUTH_CONFIG) config: AuthConfiguration) {
    this.queue = new Queue(PDF_QUEUE, { connection: queueConnection(config.redisUrl) });
    this.queue.on('error', () => undefined);
  }
  async enqueue(id: string) {
    const operation = this.queue.add(
      'scan',
      { fileId: id },
      {
        jobId: `file-${id}`,
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: { age: 86400 },
        removeOnFail: { age: 604800 },
      },
    );
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        operation,
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => reject(new Error('PDF queue acknowledgment timeout.')), 3000);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
  async onModuleDestroy() {
    await this.queue.close();
  }
}
