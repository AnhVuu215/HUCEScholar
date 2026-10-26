/** Runtime shape checks shared by the API response parsers. */
export const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object';
/** Database ids travel as decimal strings so they never lose precision in JavaScript. */
export const isNumericId = (v: unknown): v is string =>
  typeof v === 'string' && /^[1-9]\d*$/.test(v);
