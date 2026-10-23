import 'reflect-metadata';
import { Logger, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Worker } from 'bullmq';
import Redis from 'ioredis';
import { DatabaseModule } from './database/database.module';
import { FilesModule } from './files/files.module';
import { ScanProcessor } from './files/scan-processor';
import { PDF_QUEUE, queueConnection } from './files/scan-queue';
import { parseAuthEnvironment } from './auth/auth.config';
import { SafeLogger } from './safe-logger';
import { MaterialDraftCoreModule } from './materials/material-draft-core.module';
import { SourceConversionProcessor } from './materials/source-conversion.processor';
import { SOURCE_QUEUE } from './files/source-conversion-queue';
import { WORKER_HEARTBEAT_INTERVAL_MS, WORKER_HEARTBEAT_KEY } from './ops/readiness.service';
import { CalendarReminders, CalendarRemindersModule } from './calendar/calendar-reminders';

@Module({
  imports: [DatabaseModule, FilesModule, MaterialDraftCoreModule, CalendarRemindersModule],
})
class FileWorkerModule {}
async function bootstrap() {
  const app = await NestFactory.createApplicationContext(FileWorkerModule, {
    logger: new SafeLogger(),
    abortOnError: false,
  });
  const processor = app.get(ScanProcessor);
  const config = parseAuthEnvironment(process.env);
  const sources = app.get(SourceConversionProcessor);
  const sourceWorker = new Worker(
    SOURCE_QUEUE,
    (job) => sources.process(String(job.data.sourceId)),
    { connection: queueConnection(config.redisUrl, true), concurrency: 1 },
  );
  sourceWorker.on('error', () =>
    Logger.warn('Source worker connection interrupted.', 'FileWorker'),
  );
  sourceWorker.on('failed', () =>
    Logger.warn('Source conversion attempt interrupted.', 'FileWorker'),
  );
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
      await sources.reconcile();
    } catch {
      Logger.warn('PDF reconciliation interrupted; will retry.', 'FileWorker');
    } finally {
      reconciling = false;
    }
  };
  await reconcile();
  const interval = setInterval(() => void reconcile(), 30_000);
  // CAL-03: due calendar reminders become in-app notices (and email when the owner asked).
  const reminders = app.get(CalendarReminders);
  let reminding = false;
  const remind = async () => {
    if (reminding) return;
    reminding = true;
    try {
      await reminders.dispatch();
    } catch {
      Logger.warn('Calendar reminders interrupted; will retry.', 'FileWorker');
    } finally {
      reminding = false;
    }
  };
  await remind();
  const remindTimer = setInterval(() => void remind(), 60_000);
  // Heartbeat for API readiness. Expires on its own if this process dies without cleanup.
  const heartbeat = new Redis(queueConnection(config.redisUrl));
  heartbeat.on('error', () => undefined);
  const beat = () =>
    heartbeat
      .set(WORKER_HEARTBEAT_KEY, String(Date.now()), 'EX', 60)
      .catch(() => Logger.warn('Worker heartbeat not recorded; will retry.', 'FileWorker'));
  await beat();
  const beating = setInterval(() => void beat(), WORKER_HEARTBEAT_INTERVAL_MS);
  let closing = false;
  const close = async () => {
    if (closing) return;
    closing = true;
    clearInterval(interval);
    clearInterval(remindTimer);
    clearInterval(beating);
    await heartbeat
      .del(WORKER_HEARTBEAT_KEY)
      .catch(() => undefined)
      .finally(() => heartbeat.disconnect());
    await worker.close();
    await sourceWorker.close();
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
