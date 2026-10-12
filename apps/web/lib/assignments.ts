import { apiRequest } from './auth';
import { academicWrite } from './academic';
export interface Assignment {
  id: string;
  lecturerId: string;
  lecturerName: string;
  lecturerEmail: string;
  lecturerActive: boolean;
  courseId: string;
  courseCode: string;
  courseName: string;
  courseActive: boolean;
  facultyName: string;
  assignedAt: string;
  revokedAt: string | null;
  reason: string | null;
}
export interface AssignmentList {
  items: Assignment[];
  total: number;
  page: number;
  limit: number;
}
function isAssignment(value: unknown): value is Assignment {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return (
    ['id', 'lecturerId', 'courseId'].every(
      (key) => typeof row[key] === 'string' && /^[1-9]\d*$/.test(row[key]),
    ) &&
    [
      'lecturerName',
      'lecturerEmail',
      'courseCode',
      'courseName',
      'facultyName',
      'assignedAt',
    ].every((key) => typeof row[key] === 'string') &&
    typeof row.courseActive === 'boolean' &&
    typeof row.lecturerActive === 'boolean' &&
    (row.revokedAt === null || typeof row.revokedAt === 'string') &&
    (row.reason === null || typeof row.reason === 'string')
  );
}
export async function listAssignments(
  own: boolean,
  params: URLSearchParams,
  signal: AbortSignal,
): Promise<AssignmentList> {
  const data: unknown = await (
    await apiRequest(`/${own ? 'lecturer' : 'admin'}/assignments?${params}`, { signal })
  ).json();
  if (
    data &&
    typeof data === 'object' &&
    'items' in data &&
    Array.isArray(data.items) &&
    data.items.every(isAssignment) &&
    'total' in data &&
    Number.isInteger(data.total) &&
    Number(data.total) >= 0 &&
    'page' in data &&
    Number.isInteger(data.page) &&
    'limit' in data &&
    Number.isInteger(data.limit)
  )
    return data as AssignmentList;
  throw new Error('Invalid assignment response.');
}
export async function saveAssignment(body: object, revokeId?: string) {
  const response = await academicWrite(
    `/admin/assignments${revokeId ? `/${revokeId}/revoke` : ''}`,
    body,
    revokeId ? 'PATCH' : 'POST',
  );
  const data: unknown = await response.json();
  if (data && typeof data === 'object' && 'item' in data && isAssignment(data.item))
    return data.item;
  throw new Error('Invalid assignment response.');
}
