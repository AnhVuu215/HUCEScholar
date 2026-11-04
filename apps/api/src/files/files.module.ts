import { Module } from '@nestjs/common';
import { FILE_CONFIG, fileConfiguration } from './files.config';
import { PrivateStore } from './private-store';
import { ScanQueue } from './scan-queue';
import { PdfScanner } from './pdf-scanner';
import { PdfTextIndexer } from './pdf-text-indexer';
import { ScanProcessor } from './scan-processor';
import { SourceConversionQueue } from './source-conversion-queue';
@Module({
  providers: [
    { provide: FILE_CONFIG, useFactory: () => fileConfiguration(process.env) },
    PrivateStore,
    ScanQueue,
    PdfScanner,
    PdfTextIndexer,
    ScanProcessor,
    SourceConversionQueue,
  ],
  exports: [
    FILE_CONFIG,
    PrivateStore,
    ScanQueue,
    PdfScanner,
    PdfTextIndexer,
    ScanProcessor,
    SourceConversionQueue,
  ],
})
export class FilesModule {}
