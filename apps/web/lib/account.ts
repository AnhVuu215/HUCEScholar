import { ApiError, apiRequest, csrfToken, readProfile, type Profile } from './auth';
import { isHighlightColor, type HighlightColor } from './highlights';
export interface AccountProfile extends Profile {
  revision: number;
}
async function profileResponse(response: Response): Promise<AccountProfile> {
  const body: unknown = await response.json();
  const user = await readProfile(new Response(JSON.stringify(body)));
  const revision = (body as { user?: { revision?: unknown } }).user?.revision;
  if (!Number.isInteger(revision) || Number(revision) < 1 || Number(revision) > 2147483646)
    throw new Error('Invalid profile revision.');
  return { ...user, revision: Number(revision) };
}
export async function accountProfile(signal?: AbortSignal) {
  return profileResponse(await apiRequest('/account/profile', { signal }));
}
export async function updateProfile(displayName: string, revision: number) {
  const token = await csrfToken();
  return profileResponse(
    await apiRequest('/account/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': token },
      body: JSON.stringify({ displayName, revision }),
    }),
  );
}
export const readerZooms = {
  'fit-width': 'Vừa chiều rộng',
  '100': '100%',
  '125': '125%',
  '150': '150%',
} as const;
export interface ReaderPreferences {
  highlightColor: HighlightColor;
  defaultZoom: keyof typeof readerZooms;
  annotationPanelOpen: boolean;
  /** CAL-07: whether calendar reminders may be emailed at all. */
  reminderEmail: boolean;
}
export interface PreferencesSnapshot {
  userId: string;
  preferences: ReaderPreferences;
  revision: number;
}
export const defaultReaderPreferences: ReaderPreferences = {
  highlightColor: '#FFF59D',
  defaultZoom: 'fit-width',
  annotationPanelOpen: false,
  reminderEmail: true,
};
export function isReaderPreferences(value: unknown): value is ReaderPreferences {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return (
    isHighlightColor(item.highlightColor) &&
    typeof item.defaultZoom === 'string' &&
    Object.hasOwn(readerZooms, item.defaultZoom) &&
    typeof item.annotationPanelOpen === 'boolean' &&
    typeof item.reminderEmail === 'boolean'
  );
}
async function preferencesResponse(
  response: Response,
  userId: string,
): Promise<PreferencesSnapshot> {
  const body: unknown = await response.json();
  if (
    !body ||
    typeof body !== 'object' ||
    !('preferences' in body) ||
    !isReaderPreferences(body.preferences) ||
    !('revision' in body) ||
    !Number.isInteger(body.revision) ||
    Number(body.revision) < 0 ||
    Number(body.revision) > 2147483646 ||
    !('userId' in body) ||
    typeof body.userId !== 'string'
  )
    throw new Error('Invalid preferences response.');
  if (body.userId !== userId) throw new ApiError(401, 'ACCOUNT_CHANGED');
  return { userId, preferences: body.preferences, revision: Number(body.revision) };
}
export async function accountPreferences(userId: string, signal?: AbortSignal) {
  return preferencesResponse(await apiRequest('/account/preferences', { signal }), userId);
}
export async function updatePreferences(
  userId: string,
  preferences: ReaderPreferences,
  revision: number,
) {
  const token = await csrfToken();
  return preferencesResponse(
    await apiRequest('/account/preferences', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': token },
      body: JSON.stringify({ preferences, revision }),
    }),
    userId,
  );
}
