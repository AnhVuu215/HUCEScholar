import { ConsoleLogger } from '@nestjs/common';

export class SafeLogger extends ConsoleLogger {
  override error(): void {
    // Driver/exception messages may contain queries or connection credentials.
    super.error(
      'An internal error occurred. Check service availability and configuration.',
      'Application',
    );
  }
}
