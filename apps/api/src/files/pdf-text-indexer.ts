import { Inject, Injectable, Logger } from '@nestjs/common';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { DatabaseService } from '../database/database.module';
import { foldVietnamese } from '../library/search-fold';
import { FILE_CONFIG, FileConfiguration } from './files.config';
import { extractPdfText, pagesFromText } from './pdf-text';
import { PrivateStore } from './private-store';
import { receivePdf } from './receive-pdf';
import { TEXT_INDEX_MAX_ATTEMPTS as MAX_ATTEMPTS } from './text-index-state';

const BATCH = 5;
const INSERT_CHUNK = 200;

/**
 * SEARCH-04. Fills file_pages for every approved PDF with a text layer: new uploads, Word
 * renditions and files from before this existed all come through the same sweep. Drafts stay out
 * of the index, and so do PDFs whose owner disallowed copying text.
 */
@Injectable()
export class PdfTextIndexer {
  constructor(
    private readonly db: DatabaseService,
    private readonly store: PrivateStore,
    @Inject(FILE_CONFIG) private readonly config: FileConfiguration,
  ) {}
  private pending() {
    return this.db.files.findMany({
      where: {
        scan_status: 'SAFE',
        has_text_layer: true,
        copy_restricted: false,
        document_versions: { some: { review_status: 'APPROVED' } },
        OR: [
          { file_text: { is: null } },
          { file_text: { is: { indexed_at: null, attempts: { lt: MAX_ATTEMPTS } } } },
        ],
      },
      select: { id: true, object_key: true },
      orderBy: { id: 'asc' },
      take: BATCH,
    });
  }
  /** Runs until nothing is left; a failure counts an attempt, so the loop always ends. */
  async sweep() {
    for (;;) {
      const files = await this.pending();
      for (const file of files) await this.index(file);
      if (files.length < BATCH) return;
    }
  }
  private async index(file: { id: bigint; object_key: string }) {
    let directory: string | undefined;
    try {
      const root = join(this.config.root, 'tmp');
      await mkdir(root, { recursive: true, mode: 0o700 });
      directory = await mkdtemp(join(root, 'text-'));
      const path = join(directory, 'document.pdf');
      await receivePdf(await this.store.read(file.object_key), path, this.config.maxBytes);
      const { text, truncated } = await extractPdfText(this.config.pdftotext, path);
      await this.save(file.id, pagesFromText(text), truncated);
    } catch {
      Logger.warn(`Text index failed for file ${file.id}.`, 'Files');
      await this.db.file_text.upsert({
        where: { file_id: file.id },
        create: { file_id: file.id, attempts: 1 },
        update: { attempts: { increment: 1 } },
      });
    } finally {
      if (directory) await rm(directory, { recursive: true, force: true }).catch(() => undefined);
    }
  }
  private async save(
    file_id: bigint,
    pages: { pageNumber: number; content: string }[],
    truncated: boolean,
  ) {
    const state = { pages: pages.length, truncated, indexed_at: new Date() };
    await this.db.$transaction(async (tx) => {
      await tx.file_text.upsert({
        where: { file_id },
        create: { file_id, ...state },
        update: state,
      });
      await tx.file_pages.deleteMany({ where: { file_id } });
      for (let start = 0; start < pages.length; start += INSERT_CHUNK)
        await tx.file_pages.createMany({
          data: pages.slice(start, start + INSERT_CHUNK).map((page) => ({
            file_id,
            page_number: page.pageNumber,
            content: page.content,
            folded: foldVietnamese(page.content),
          })),
        });
    });
  }
}
