import type { Request } from 'express';

export type Role = 'ADMIN' | 'LECTURER' | 'STUDENT';
export interface Profile {
  id: string;
  email: string;
  displayName: string;
  role: Role;
}
export interface AuthenticatedRequest extends Request {
  user: Profile;
}

export function cookieValue(request: Request, name: string): string {
  const value: unknown = (request.cookies as Record<string, unknown> | undefined)?.[name];
  return typeof value === 'string' ? value : '';
}
