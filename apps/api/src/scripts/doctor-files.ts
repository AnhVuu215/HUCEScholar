import 'reflect-metadata';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import { parseAuthEnvironment } from '../auth/auth.config';
import { fileConfiguration } from '../files/files.config';
import { PrivateStore } from '../files/private-store';

/**
 * Read-only check: lists PDFs and Word sources the database points at but the private store no
 * longer has. Prints ids and the document title, never object keys, paths or file contents, and
 * changes nothing; the owner uploads a new version or an admin hides the document.
 */
async function doctor(): Promise<void> {
  const config = parseAuthEnvironment(process.env);
  const store = new PrivateStore(fileConfiguration(process.env));
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: config.databaseUrl }) });
  let missing = 0;
  try {
    const files = await db.files.findMany({
      select: {
        id: true,
        object_key: true,
        scan_status: true,
        document_versions: {
          select: { id: true, document_id: true, title: true, review_status: true },
        },
      },
      orderBy: { id: 'asc' },
    });
    for (const file of files) {
      if (await store.exists(file.object_key)) continue;
      missing++;
      const versions = file.document_versions
        .map((v) => `version ${v.id} (document ${v.document_id}, ${v.review_status}) “${v.title}”`)
        .join('; ');
      console.log(
        `PDF file ${file.id} [${file.scan_status}] missing — ${versions || 'not attached'}`,
      );
    }
    const sources = await db.document_source_uploads.findMany({
      select: { id: true, object_key: true },
      orderBy: { id: 'asc' },
    });
    for (const source of sources) {
      if (await store.exists(source.object_key, true)) continue;
      missing++;
      console.log(`Word source ${source.id} missing`);
    }
    console.log(
      missing
        ? `${missing} stored object(s) missing out of ${files.length + sources.length}.`
        : `All ${files.length + sources.length} stored objects are present.`,
    );
    if (missing) process.exitCode = 2;
  } finally {
    await db.$disconnect();
    store.onModuleDestroy();
  }
}

doctor().catch(() => {
  // Do not print driver errors, URLs or the environment.
  console.error('File check failed. Check local configuration, database and storage availability.');
  process.exitCode = 1;
});
