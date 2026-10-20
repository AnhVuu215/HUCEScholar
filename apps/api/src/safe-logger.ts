import { ConsoleLogger } from '@nestjs/common';
import { currentRequestId } from './ops/request-context';

export class SafeLogger extends ConsoleLogger {
  override error(): void {
    // Driver/exception messages may contain queries or connection credentials.
    const requestId = currentRequestId();
    super.error(
      `An internal error occurred${requestId ? ` (request ${requestId})` : ''}. Check service availability and configuration.`,
      'Application',
    );
  }
}
