/** class-transformer helpers shared by request DTOs. */
export const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
/** Query strings arrive as text; small non-negative integers are converted, anything else is left for validation to reject. */
export const integer = ({ value }: { value: unknown }) =>
  typeof value === 'string' && /^\d{1,6}$/.test(value) ? Number(value) : value;
