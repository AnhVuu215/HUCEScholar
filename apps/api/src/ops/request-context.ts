import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

const store = new AsyncLocalStorage<{ requestId: string }>();
const acceptable = /^[A-Za-z0-9._-]{8,64}$/;

/** Request id of the HTTP request being handled, if any (used to correlate error logs). */
export function currentRequestId(): string | undefined {
  return store.getStore()?.requestId;
}

/**
 * Assigns every request an id (a sane upstream X-Request-Id is kept) and returns it in the
 * response. When `log` is given, writes one line per request with method, path without query
 * string, status and duration only: never cookies, headers, bodies, PDFs or note text.
 */
export function requestContext(log?: (line: string) => void) {
  return (request: Request, response: Response, next: NextFunction) => {
    const incoming = request.get('x-request-id');
    const requestId = incoming && acceptable.test(incoming) ? incoming : randomUUID();
    response.setHeader('X-Request-Id', requestId);
    if (log) {
      const started = process.hrtime.bigint();
      response.on('finish', () => {
        const path = (request.originalUrl ?? request.url).split('?')[0];
        if (path.startsWith('/api/v1/health')) return;
        const ms = Number(process.hrtime.bigint() - started) / 1e6;
        log(`${request.method} ${path} ${response.statusCode} ${ms.toFixed(0)}ms id=${requestId}`);
      });
    }
    store.run({ requestId }, next);
  };
}
