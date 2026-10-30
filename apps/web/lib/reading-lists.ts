import { isRecord, isNumericId } from './guards';
import { ApiError, apiRequest, csrfToken } from './auth';
import { materialTypes } from './materials';

export type ReadingItem = {
  position: number;
  section: string;
  note: string;
  /** CAL-04b due date as a calendar day (`YYYY-MM-DD`), or null. */
  dueOn: string | null;
  versionId: string;
  /** COURSE-02: the viewer's own "đã đọc" mark; always false when `material` is null. */
  read: boolean;
  /** null when the viewer can no longer read this version; its title is then withheld. */
  material: {
    title: string;
    authors: string;
    versionNo: number;
    materialType: keyof typeof materialTypes;
    newerVersionId: string | null;
  } | null;
};
export type ReadingList = {
  id: string;
  courseId: string;
  title: string;
  published: boolean;
  revision: number;
  updatedAt: string;
  owner: { id: string; name: string };
  items: ReadingItem[];
};
export type ReadingDraftItem = {
  section: string;
  versionId: string;
  note: string;
  dueOn: string | null;
};
/** CAL-04b: one due date on a followed course's published list, for the calendar. */
export type ReadingDeadline = {
  dueOn: string;
  listId: string;
  listTitle: string;
  course: { id: string; code: string; name: string };
  position: number;
  section: string;
  versionId: string;
  title: string;
  /** CAL-04c: the reader has marked this version read (COURSE-02). */
  read: boolean;
};
const day = (v: unknown) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

function validItem(v: unknown): v is ReadingItem {
  if (
    !isRecord(v) ||
    !Number.isInteger(v.position) ||
    typeof v.section !== 'string' ||
    typeof v.note !== 'string' ||
    !(v.dueOn === null || day(v.dueOn)) ||
    !isNumericId(v.versionId) ||
    typeof v.read !== 'boolean'
  )
    return false;
  if (v.material === null) return true;
  const m = v.material;
  return (
    isRecord(m) &&
    typeof m.title === 'string' &&
    typeof m.authors === 'string' &&
    Number.isInteger(m.versionNo) &&
    Object.hasOwn(materialTypes, String(m.materialType)) &&
    (m.newerVersionId === null || isNumericId(m.newerVersionId))
  );
}
function validList(v: unknown): v is ReadingList {
  return (
    isRecord(v) &&
    isNumericId(v.id) &&
    isNumericId(v.courseId) &&
    typeof v.title === 'string' &&
    typeof v.published === 'boolean' &&
    Number.isInteger(v.revision) &&
    typeof v.updatedAt === 'string' &&
    isRecord(v.owner) &&
    isNumericId(v.owner.id) &&
    typeof v.owner.name === 'string' &&
    Array.isArray(v.items) &&
    v.items.every(validItem)
  );
}
const path = (courseId: string) => `/courses/${encodeURIComponent(courseId)}/reading-lists`;

export async function publishedReadingLists(courseId: string, signal: AbortSignal) {
  const body: unknown = await (await apiRequest(path(courseId), { signal })).json();
  if (
    isRecord(body) &&
    isRecord(body.course) &&
    typeof body.course.code === 'string' &&
    typeof body.course.name === 'string' &&
    typeof body.following === 'boolean' &&
    Array.isArray(body.items) &&
    body.items.every(validList)
  )
    return body as {
      course: { id: string; code: string; name: string };
      following: boolean;
      items: ReadingList[];
    };
  throw new Error('Invalid reading lists.');
}
export async function myReadingList(courseId: string, signal: AbortSignal) {
  const body: unknown = await (await apiRequest(`${path(courseId)}/mine`, { signal })).json();
  if (isRecord(body) && (body.item === null || validList(body.item))) return body.item;
  throw new Error('Invalid reading list.');
}
export async function saveReadingList(
  courseId: string,
  data: { title: string; published: boolean; revision: number; items: ReadingDraftItem[] },
) {
  const token = await csrfToken();
  const body: unknown = await (
    await apiRequest(`${path(courseId)}/mine`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': token },
      body: JSON.stringify(data),
    })
  ).json();
  if (isRecord(body) && validList(body.item)) return body.item;
  throw new Error('Invalid reading list.');
}
/** A `YYYY-MM-DD` day as local midnight, so it lands on that day in the calendar. */
export function dueDay(dueOn: string) {
  const [y, m, d] = dueOn.split('-').map(Number);
  return new Date(y, m - 1, d);
}
export const formatDue = (dueOn: string) => dueDay(dueOn).toLocaleDateString('vi-VN');
/** Show or hide this course's due dates on the signed-in reader's calendar. */
export async function followReadingLists(courseId: string, following: boolean) {
  const token = await csrfToken();
  const body: unknown = await (
    await apiRequest(`${path(courseId)}/follow`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': token },
      body: JSON.stringify({ following }),
    })
  ).json();
  if (isRecord(body) && typeof body.following === 'boolean') return body.following;
  throw new Error('Invalid follow state.');
}
/** COURSE-02: mark or unmark a listed version as read; only the signed-in reader sees it. */
export async function markRead(courseId: string, versionId: string, read: boolean) {
  const token = await csrfToken();
  const body: unknown = await (
    await apiRequest(`${path(courseId)}/read/${encodeURIComponent(versionId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': token },
      body: JSON.stringify({ read }),
    })
  ).json();
  if (isRecord(body) && body.versionId === versionId && typeof body.read === 'boolean')
    return body.read;
  throw new Error('Invalid read mark.');
}
function validDeadline(v: unknown): v is ReadingDeadline {
  return (
    isRecord(v) &&
    day(v.dueOn) &&
    isNumericId(v.listId) &&
    typeof v.listTitle === 'string' &&
    isRecord(v.course) &&
    isNumericId(v.course.id) &&
    typeof v.course.code === 'string' &&
    typeof v.course.name === 'string' &&
    Number.isInteger(v.position) &&
    typeof v.section === 'string' &&
    isNumericId(v.versionId) &&
    typeof v.title === 'string' &&
    typeof v.read === 'boolean'
  );
}
/** Due dates on calendar days [from, to) of the courses the reader follows. */
export async function readingDeadlines(from: string, to: string, signal: AbortSignal) {
  const query = new URLSearchParams({ from, to });
  const body: unknown = await (
    await apiRequest(`/calendar/reading-deadlines?${query}`, { signal })
  ).json();
  if (
    isRecord(body) &&
    typeof body.truncated === 'boolean' &&
    Array.isArray(body.items) &&
    body.items.every(validDeadline)
  )
    return body as { items: ReadingDeadline[]; truncated: boolean };
  throw new Error('Invalid reading deadlines.');
}
/** Home: the reader's progress on one followed course. */
export type FollowedCourse = {
  course: { id: string; code: string; name: string };
  /** Distinct listed versions the reader can open now, and how many of those are marked read. */
  total: number;
  read: number;
  /** The earliest due date among unread versions, or null. */
  next: { dueOn: string; versionId: string; title: string } | null;
};
function validFollowed(v: unknown): v is FollowedCourse {
  return (
    isRecord(v) &&
    isRecord(v.course) &&
    isNumericId(v.course.id) &&
    typeof v.course.code === 'string' &&
    typeof v.course.name === 'string' &&
    Number.isInteger(v.total) &&
    Number.isInteger(v.read) &&
    (v.next === null ||
      (isRecord(v.next) &&
        day(v.next.dueOn) &&
        isNumericId(v.next.versionId) &&
        typeof v.next.title === 'string'))
  );
}
/** Reading progress of every course the signed-in reader follows. */
export async function followedReadingLists(signal: AbortSignal) {
  const body: unknown = await (await apiRequest('/reading-lists/following', { signal })).json();
  if (isRecord(body) && Array.isArray(body.items) && body.items.every(validFollowed))
    return body.items as FollowedCourse[];
  throw new Error('Invalid followed reading lists.');
}
export function readingListError(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 401) {
      window.location.replace('/login');
      return 'Phiên đăng nhập đã hết hạn.';
    }
    const codes: Record<string, string> = {
      STALE_REVISION: 'Danh sách đã thay đổi ở lượt khác. Tải lại để đối chiếu trước khi lưu.',
      DUPLICATE_ITEM: 'Mỗi phiên bản chỉ xuất hiện một lần trong danh sách.',
      ITEM_UNAVAILABLE:
        'Có tài liệu không thuộc môn này hoặc không còn đọc được. Bỏ mục đó rồi lưu lại.',
      ASSIGNMENT_REQUIRED: 'Bạn không còn được phân công môn này.',
    };
    if (error.code && codes[error.code]) return codes[error.code];
    if (error.status === 404) return 'Không tìm thấy môn học hoặc môn đã ngừng hoạt động.';
    if (error.status === 403) return 'Bạn không có quyền với danh sách này.';
    if (error.status === 400) return 'Kiểm tra tiêu đề, phần, ghi chú và hạn đọc (tối đa 100 mục).';
  }
  return 'Chưa kết nối được máy chủ. Kiểm tra mạng rồi thử lại.';
}
