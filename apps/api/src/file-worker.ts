import 'reflect-metadata';
import { Logger, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Worker } from 'bullmq';
import { DatabaseModule } from './database/database.module';
import { FilesModule } from './files/files.module';
import { ScanProcessor } from './files/scan-processor';
import { PDF_QUEUE, queueConnection } from './files/scan-queue';
import { parseAuthEnvironment } from './auth/auth.config';
import { SafeLogger } from './safe-logger';

@Module({ imports: [DatabaseModule, FilesModule] })
class FileWorkerModule {}
async function bootstrap() {
  const app = await NestFactory.createApplicationContext(FileWorkerModule, {
    logger: new SafeLogger(),
    abortOnError: false,
  });
  const processor = app.get(ScanProcessor);
  const config = parseAuthEnvironment(process.env);
  const worker = new Worker(
    PDF_QUEUE,
    (job) =>
      processor.process(String(job.data.fileId), job.attemptsMade + 1 >= (job.opts.attempts ?? 1)),
    { connection: queueConnection(config.redisUrl, true), concurrency: 2 },
  );
  worker.on('error', () => Logger.warn('PDF worker connection interrupted.', 'FileWorker'));
  worker.on('failed', () =>
    Logger.warn('PDF scan attempt failed; see private file state.', 'FileWorker'),
  );
  let reconciling = false;
  const reconcile = async () => {
    if (reconciling) return;
    reconciling = true;
    try {
      await processor.reconcile();
    } catch {
      Logger.warn('PDF reconciliation interrupted; will retry.', 'FileWorker');
    } finally {
      reconciling = false;
    }
  };
  await reconcile();
  const interval = setInterval(() => void reconcile(), 30_000);
  let closing = false;
  const close = async () => {
    if (closing) return;
    closing = true;
    clearInterval(interval);
    await worker.close();
    await app.close();
  };
  process.once('SIGINT', () => void close());
  process.once('SIGTERM', () => void close());
  Logger.log('Private PDF worker ready.', 'FileWorker');
}
bootstrap().catch(() => {
  Logger.error('File worker startup failed; check private configuration.', 'FileWorker');
  process.exitCode = 1;
});
