import { isRecord, isNumericId } from './guards';
import { ApiError, apiRequest, csrfToken } from './auth';
import { downloadedFile, type NotesExportFormat } from './annotations';

export type StudyCard = {
  id: string;
  versionId: string;
  pageNumber: number;
  highlightId: string | null;
  quote: string;
  question: string;
  answer: string;
  revision: number;
  updatedAt: string;
  /** STUDY-03: Leitner box, 0 until the first scheduled answer. */
  reviewBox: number;
  dueOn: string;
  lastReviewedAt: string | null;
  title?: string;
};
export type StudyCardList = {
  items: StudyCard[];
  total: number;
  /** Cards kept for versions the owner can no longer read; never listed. */
  unavailable: number;
  page: number;
  limit: number;
};

function valid(v: unknown): v is StudyCard {
  return (
    isRecord(v) &&
    isNumericId(v.id) &&
    isNumericId(v.versionId) &&
    Number.isInteger(v.pageNumber) &&
    (v.highlightId === null || isNumericId(v.highlightId)) &&
    typeof v.quote === 'string' &&
    typeof v.question === 'string' &&
    typeof v.answer === 'string' &&
    Number.isInteger(v.revision) &&
    typeof v.updatedAt === 'string' &&
    Number.isInteger(v.reviewBox) &&
    typeof v.dueOn === 'string' &&
    (v.lastReviewedAt === null || typeof v.lastReviewedAt === 'string') &&
    (v.title === undefined || typeof v.title === 'string')
  );
}
async function send(path: string, method: string, body: object) {
  const token = await csrfToken();
  return apiRequest(path, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': token },
    body: JSON.stringify(body),
  });
}
function item(body: unknown) {
  if (isRecord(body) && valid(body.item)) return body.item;
  throw new Error('Invalid study card.');
}

export async function studyCards(params: URLSearchParams, signal: AbortSignal) {
  const body: unknown = await (await apiRequest(`/study-cards?${params}`, { signal })).json();
  if (
    isRecord(body) &&
    Array.isArray(body.items) &&
    body.items.every(valid) &&
    Number.isSafeInteger(body.total) &&
    Number.isSafeInteger(body.unavailable) &&
    Number.isInteger(body.page) &&
    Number.isInteger(body.limit)
  )
    return body as unknown as StudyCardList;
  throw new Error('Invalid study cards.');
}
export async function createStudyCard(
  versionId: string,
  data: { highlightId: string; question: string; answer: string; requestId: string },
) {
  return item(
    await (
      await send(`/library/versions/${encodeURIComponent(versionId)}/study-cards`, 'POST', {
        annotationId: data.highlightId,
        question: data.question,
        answer: data.answer,
        requestId: data.requestId,
      })
    ).json(),
  );
}
export async function updateStudyCard(card: StudyCard, question: string, answer: string) {
  return item(
    await (
      await send(`/study-cards/${encodeURIComponent(card.id)}`, 'PATCH', {
        question,
        answer,
        revision: card.revision,
      })
    ).json(),
  );
}
export async function deleteStudyCard(card: StudyCard) {
  await send(`/study-cards/${encodeURIComponent(card.id)}`, 'DELETE', { revision: card.revision });
}
export function studyCardError(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 401) {
      window.location.replace('/login');
      return 'Phiên đăng nhập đã hết hạn.';
    }
    if (error.code === 'STUDY_CARD_CONFLICT')
      return 'Thẻ đã thay đổi ở lượt khác. Tải lại danh sách trước khi sửa.';
    if (error.code === 'STUDY_CARD_REQUEST_REUSED')
      return 'Yêu cầu tạo thẻ đã được dùng. Tải lại để đối soát.';
    if (error.status === 404) return 'Thẻ hoặc đoạn tô không còn khả dụng. Tải lại rồi thử lại.';
    if (error.status === 400) return 'Nhập câu hỏi (tối đa 500 ký tự) và đáp án (tối đa 2000).';
  }
  return 'Chưa xác nhận được với máy chủ. Nội dung vẫn còn trong ô; thử lại.';
}

/** STUDY-02: which cards a list or a practice round covers. */
export type StudyCardScope = { versionId: string; courseId: string };
export type StudyCardFilters = {
  documents: { versionId: string; title: string; cards: number }[];
  courses: { id: string; code: string; name: string }[];
};
export function scopeParams(scope: StudyCardScope) {
  const params = new URLSearchParams();
  if (scope.versionId) params.set('versionId', scope.versionId);
  if (scope.courseId) params.set('courseId', scope.courseId);
  return params;
}
export async function studyCardFilters(signal: AbortSignal): Promise<StudyCardFilters> {
  const body: unknown = await (await apiRequest('/study-cards/filters', { signal })).json();
  if (
    isRecord(body) &&
    Array.isArray(body.documents) &&
    body.documents.every(
      (d) =>
        isRecord(d) &&
        isNumericId(d.versionId) &&
        typeof d.title === 'string' &&
        Number.isSafeInteger(d.cards),
    ) &&
    Array.isArray(body.courses) &&
    body.courses.every(
      (c) =>
        isRecord(c) &&
        isNumericId(c.id) &&
        typeof c.code === 'string' &&
        typeof c.name === 'string',
    )
  )
    return body as unknown as StudyCardFilters;
  throw new Error('Invalid study card filters.');
}
/** STUDY-03: the last box a card can reach; the API owns the intervals. */
export const MAX_REVIEW_BOX = 6;
export type StudySchedule = {
  today: string;
  dueNow: number;
  days: { date: string; count: number }[];
};
export const formatStudyDay = (day: string) =>
  new Date(`${day}T00:00:00`).toLocaleDateString('vi-VN');
export async function studySchedule(params: URLSearchParams, signal: AbortSignal) {
  const body: unknown = await (
    await apiRequest(`/study-cards/schedule?${params}`, { signal })
  ).json();
  if (
    isRecord(body) &&
    typeof body.today === 'string' &&
    Number.isSafeInteger(body.dueNow) &&
    Array.isArray(body.days) &&
    body.days.every(
      (d) => isRecord(d) && typeof d.date === 'string' && Number.isSafeInteger(d.count),
    )
  )
    return body as unknown as StudySchedule;
  throw new Error('Invalid study schedule.');
}
/** The cards due today or overdue, longest overdue first, capped by the API. */
export async function dueCards(scope: StudyCardScope, signal: AbortSignal) {
  const body: unknown = await (
    await apiRequest(`/study-cards/due?${scopeParams(scope)}`, { signal })
  ).json();
  if (
    isRecord(body) &&
    Array.isArray(body.items) &&
    body.items.every(valid) &&
    Number.isSafeInteger(body.total)
  )
    return body as unknown as { items: StudyCard[]; total: number };
  throw new Error('Invalid due cards.');
}
export async function reviewStudyCard(
  card: StudyCard,
  result: 'KNOWN' | 'AGAIN',
  requestId: string,
) {
  return item(
    await (
      await send(`/study-cards/${encodeURIComponent(card.id)}/review`, 'POST', {
        result,
        requestId,
      })
    ).json(),
  );
}
export async function resetStudySchedule(card: StudyCard) {
  return item(
    await (
      await send(`/study-cards/${encodeURIComponent(card.id)}/reset-schedule`, 'POST', {})
    ).json(),
  );
}
/** A card another tab already answered; its date is settled, so the round just moves on. */
export const alreadyReviewed = (error: unknown) =>
  error instanceof ApiError && error.code === 'STUDY_CARD_NOT_DUE';
/** Every readable card in the scope for one round, newest first, capped by the API. */
export async function practiceCards(scope: StudyCardScope, signal: AbortSignal) {
  const body: unknown = await (
    await apiRequest(`/study-cards/practice?${scopeParams(scope)}`, { signal })
  ).json();
  if (
    isRecord(body) &&
    Array.isArray(body.items) &&
    body.items.every(valid) &&
    Number.isSafeInteger(body.total)
  )
    return body as unknown as { items: StudyCard[]; total: number };
  throw new Error('Invalid practice cards.');
}
/** STUDY-04: saved answers on one day of scheduled review. */
export type StudyTally = { date: string; known: number; again: number };
export type StudyStats = {
  today: string;
  /** First day of the chart; days without reviews are left out of `days`. */
  from: string;
  days: StudyTally[];
  totals: { known: number; again: number };
  /** Consecutive days with at least one review, ending today or yesterday. */
  streak: number;
  reviewedToday: boolean;
  /** Readable cards per box; box 0 is a card never reviewed. */
  boxes: { box: number; cards: number }[];
};
const tally = (v: unknown) =>
  isRecord(v) &&
  typeof v.date === 'string' &&
  Number.isSafeInteger(v.known) &&
  Number.isSafeInteger(v.again);
/** STUDY-04: the owner's review history and where their cards stand, across every card. */
export async function studyStats(signal: AbortSignal) {
  const body: unknown = await (await apiRequest('/study-cards/stats', { signal })).json();
  if (
    isRecord(body) &&
    typeof body.today === 'string' &&
    typeof body.from === 'string' &&
    Array.isArray(body.days) &&
    body.days.every(tally) &&
    isRecord(body.totals) &&
    Number.isSafeInteger(body.totals.known) &&
    Number.isSafeInteger(body.totals.again) &&
    Number.isSafeInteger(body.streak) &&
    typeof body.reviewedToday === 'boolean' &&
    Array.isArray(body.boxes) &&
    body.boxes.every(
      (b) => isRecord(b) && Number.isSafeInteger(b.box) && Number.isSafeInteger(b.cards),
    )
  )
    return body as unknown as StudyStats;
  throw new Error('Invalid study stats.');
}
/** STUDY-04: the readable cards in the filter as a file; the API re-checks access. */
export async function exportStudyCards(scope: StudyCardScope, format: NotesExportFormat) {
  const params = scopeParams(scope);
  params.set('format', format);
  const response = await apiRequest(`/study-cards/export?${params}`, {}, 20_000);
  return downloadedFile(response, 'the-on-tap', format);
}
