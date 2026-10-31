import { isRecord, isNumericId } from './guards';
import { ApiError, apiRequest, csrfToken } from './auth';

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
