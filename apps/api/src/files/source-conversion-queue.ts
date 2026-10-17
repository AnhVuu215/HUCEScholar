import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import { AUTH_CONFIG, AuthConfiguration } from '../auth/auth.config';
import { queueConnection } from './scan-queue';
export const SOURCE_QUEUE = 'hs-docx-convert';
@Injectable()
export class SourceConversionQueue implements OnModuleDestroy {
  readonly queue: Queue;
  constructor(@Inject(AUTH_CONFIG) config: AuthConfiguration) {
    this.queue = new Queue(SOURCE_QUEUE, { connection: queueConnection(config.redisUrl) });
    this.queue.on('error', () => undefined);
  }
  async enqueue(id: string) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        this.queue.add(
          'convert',
          { sourceId: id },
          {
            jobId: `source-${id}`,
            attempts: 3,
            backoff: { type: 'exponential', delay: 5000 },
            removeOnComplete: true,
            removeOnFail: true,
          },
        ),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => reject(new Error('Source queue unavailable.')), 3000);
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
