export const roleLabels = {
  ADMIN: 'Quản trị viên',
  LECTURER: 'Giảng viên',
  STUDENT: 'Sinh viên',
} as const;
export type Role = keyof typeof roleLabels;
export interface Profile {
  id: string;
  email: string;
  displayName: string;
  role: Role;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code?: string,
  ) {
    super(`Request failed (${status}).`);
  }
}

export async function apiRequest(path: string, options: RequestInit = {}): Promise<Response> {
  const response = await fetch(`/api/v1${path}`, {
    ...options,
    credentials: 'same-origin',
    cache: 'no-store',
    signal: options.signal
      ? AbortSignal.any([options.signal, AbortSignal.timeout(8_000)])
      : AbortSignal.timeout(8_000),
  });
  if (!response.ok) {
    let code: string | undefined;
    try {
      const body: unknown = await response.json();
      if (body && typeof body === 'object' && 'code' in body && typeof body.code === 'string')
        code = body.code;
    } catch {
      /* A non-JSON failure still uses the HTTP status. */
    }
    throw new ApiError(response.status, code);
  }
  return response;
}

export async function csrfToken(): Promise<string> {
  const response = await apiRequest('/auth/csrf');
  const body: unknown = await response.json();
  if (
    !body ||
    typeof body !== 'object' ||
    !('csrfToken' in body) ||
    typeof body.csrfToken !== 'string' ||
    !/^[a-f0-9]{64}$/.test(body.csrfToken)
  )
    throw new Error('Invalid CSRF response.');
  return body.csrfToken;
}

export async function readProfile(response: Response): Promise<Profile> {
  const body: unknown = await response.json();
  if (
    body &&
    typeof body === 'object' &&
    'user' in body &&
    body.user &&
    typeof body.user === 'object'
  ) {
    const user = body.user;
    if (
      'id' in user &&
      typeof user.id === 'string' &&
      /^\d+$/.test(user.id) &&
      'email' in user &&
      typeof user.email === 'string' &&
      'displayName' in user &&
      typeof user.displayName === 'string' &&
      'role' in user &&
      typeof user.role === 'string' &&
      Object.hasOwn(roleLabels, user.role)
    )
      return user as Profile;
  }
  throw new Error('Invalid profile response.');
}

export function workspacePath(role: Role): string {
  return `/workspace/${role.toLowerCase()}`;
}
