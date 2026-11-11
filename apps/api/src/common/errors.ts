import { ConflictException } from '@nestjs/common';

/**
 * A 409 the web turns into Vietnamese text by its stable `code` (e.g. STALE_REVISION).
 * `message` is the API's own wording for clients that do not know the code.
 */
export const conflict = (code: string, message: string) => new ConflictException({ code, message });
