import { Module } from '@nestjs/common';
import { FILE_CONFIG, fileConfiguration } from './files.config';
import { PrivateStore } from './private-store';
import { ScanQueue } from './scan-queue';
import { PdfScanner } from './pdf-scanner';
import { ScanProcessor } from './scan-processor';
@Module({
  providers: [
    { provide: FILE_CONFIG, useFactory: () => fileConfiguration(process.env) },
    PrivateStore,
    ScanQueue,
    PdfScanner,
    ScanProcessor,
  ],
  exports: [FILE_CONFIG, PrivateStore, ScanQueue, PdfScanner, ScanProcessor],
})
export class FilesModule {}
