// Opt-in real-tool verification helper. Refuse application databases and Redis sessions.
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { MaterialDraftCoreModule } from '../materials/material-draft-core.module';
import { SourceConversionProcessor } from '../materials/source-conversion.processor';
import { DatabaseService } from '../database/database.module';
async function main() {
  if (
    process.env.NODE_ENV !== 'test' ||
    !new URL(process.env.DATABASE_URL ?? '').pathname.endsWith('_test') ||
    new URL(process.env.REDIS_URL ?? '').pathname !== '/15'
  )
    throw new Error('Isolated test services required.');
  const id = process.argv[2];
  if (!/^[1-9]\d*$/.test(id ?? '')) throw new Error('Source ID required.');
  const app = await NestFactory.createApplicationContext(MaterialDraftCoreModule, {
    logger: false,
    abortOnError: false,
  });
  try {
    const source = await app.get(DatabaseService).document_source_uploads.findUniqueOrThrow({
      where: { id: BigInt(id) },
      include: { uploader: { select: { email: true } } },
    });
    if (
      !source.uploader.email.startsWith('e2e-docx-') ||
      !source.uploader.email.endsWith('@example.test')
    )
      throw new Error('Synthetic fixture required.');
    await app.get(SourceConversionProcessor).process(id);
    const result = await app
      .get(DatabaseService)
      .document_source_uploads.findUniqueOrThrow({ where: { id: BigInt(id) } });
    if (result.conversion_status !== 'READY')
      throw new Error('Real conversion did not reach READY.');
    process.stdout.write('Real source and PDF checks reached SAFE/READY.\n');
  } finally {
    await app.close();
  }
}
main().catch(() => {
  process.stderr.write('Real DOCX verification failed; inspect private source state.\n');
  process.exitCode = 1;
});
