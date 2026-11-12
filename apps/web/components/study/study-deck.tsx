'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  deleteStudyCard,
  exportStudyCards,
  formatStudyDay,
  MAX_REVIEW_BOX,
  resetStudySchedule,
  scopeParams,
  studyCardError,
  studyCardFilters,
  studyCards,
  studySchedule,
  studyStats,
  updateStudyCard,
  type StudyCard,
  type StudyCardFilters,
  type StudyCardList,
  type StudyCardScope,
  type StudySchedule,
  type StudyStats,
  type StudyTally,
} from '../../lib/study-cards';
import { SelectField } from '../ui/select-field';
import { NotesExport } from '../library/notebook-parts';
import { StudyPractice } from './study-practice';
import { useNotesLeaveGuard } from '../library/use-notes-leave-guard';
import { useApiResource } from '../../lib/use-api-resource';

function nextReviewLabel(card: StudyCard, today: string) {
  const box = card.reviewBox ? ` · Hộp ${card.reviewBox}/${MAX_REVIEW_BOX}` : ' · Thẻ mới';
  if (today && card.dueOn <= today) return `Đến hạn ôn${box}`;
  return `Ôn lại ngày ${formatStudyDay(card.dueOn)}${box}`;
}

function Card({
  card,
  today,
  replaced,
  removed,
  rescheduled,
}: {
  card: StudyCard;
  today: string;
  replaced: (card: StudyCard) => void;
  removed: () => void;
  rescheduled: () => void;
}) {
  const [shown, setShown] = useState(false);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [question, setQuestion] = useState(card.question);
  const [answer, setAnswer] = useState(card.answer);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const dirty = editing && (question !== card.question || answer !== card.answer);
  useNotesLeaveGuard(dirty, busy, 'Bạn có thay đổi thẻ ôn tập chưa lưu. Rời trang và bỏ thay đổi?');
  async function save() {
    setBusy(true);
    setError('');
    try {
      replaced(await updateStudyCard(card, question.trim(), answer.trim()));
      setEditing(false);
    } catch (failure) {
      setError(studyCardError(failure));
    } finally {
      setBusy(false);
    }
  }
  async function restart() {
    setBusy(true);
    setError('');
    try {
      await resetStudySchedule(card);
      rescheduled();
    } catch (failure) {
      setError(studyCardError(failure));
      setBusy(false);
    }
  }
  async function remove() {
    setBusy(true);
    setError('');
    try {
      await deleteStudyCard(card);
      removed();
    } catch (failure) {
      setError(studyCardError(failure));
      setBusy(false);
    }
  }
  return (
    <article className="study-card" aria-label={card.question}>
      {editing ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <div className="form-field">
            <label htmlFor={`edit-q-${card.id}`}>Câu hỏi</label>
            <input
              id={`edit-q-${card.id}`}
              required
              maxLength={500}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
            />
          </div>
          <div className="form-field">
            <label htmlFor={`edit-a-${card.id}`}>Đáp án</label>
            <textarea
              id={`edit-a-${card.id}`}
              required
              maxLength={2000}
              rows={3}
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
            />
          </div>
          <div className="note-actions">
            <button
              className="primary-button"
              disabled={busy || !question.trim() || !answer.trim()}
            >
              {busy ? 'Đang lưu…' : 'Lưu thẻ'}
            </button>
            <button
              type="button"
              className="secondary-button"
              disabled={busy}
              onClick={() => {
                setEditing(false);
                setQuestion(card.question);
                setAnswer(card.answer);
                setError('');
              }}
            >
              Hủy
            </button>
          </div>
        </form>
      ) : (
        <>
          <h3>{card.question}</h3>
          <button
            type="button"
            className="secondary-button"
            aria-expanded={shown}
            aria-controls={`answer-${card.id}`}
            onClick={() => setShown((v) => !v)}
          >
            {shown ? 'Ẩn đáp án' : 'Hiện đáp án'}
          </button>
          <div id={`answer-${card.id}`} hidden={!shown}>
            <p className="study-answer">{card.answer}</p>
            <blockquote className="highlight-quote">{card.quote}</blockquote>
          </div>
          <p className="field-hint">
            {card.title ?? 'Tài liệu'} · Trang {card.pageNumber} ·{' '}
            <Link href={`/workspace/library/versions/${card.versionId}?page=${card.pageNumber}`}>
              Mở trang nguồn
            </Link>
            {card.highlightId ? '' : ' · Đoạn tô gốc đã xóa'}
          </p>
          <p className="field-hint">{nextReviewLabel(card, today)}</p>
          <div className="note-actions">
            <button type="button" className="text-button" onClick={() => setEditing(true)}>
              Sửa thẻ
            </button>
            {card.reviewBox > 0 && (
              <button
                type="button"
                className="text-button"
                disabled={busy}
                onClick={() => void restart()}
              >
                Ôn lại từ đầu
              </button>
            )}
            <button type="button" className="text-button" onClick={() => setDeleting(true)}>
              Xóa thẻ
            </button>
          </div>
          {deleting && (
            <div className="note-delete">
              <p>Xóa thẻ này? Đoạn tô trong tài liệu không bị ảnh hưởng.</p>
              <div className="note-actions">
                <button className="primary-button" disabled={busy} onClick={() => void remove()}>
                  Xác nhận xóa
                </button>
                <button
                  className="secondary-button"
                  disabled={busy}
                  onClick={() => setDeleting(false)}
                >
                  Giữ thẻ
                </button>
              </div>
            </div>
          )}
        </>
      )}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
    </article>
  );
}

const boxLabel = (box: number) => (box === 0 ? 'Thẻ mới' : `Hộp ${box}`);
/** "Nhớ" share of one day's answers, rounded for the table. */
const share = (day: StudyTally) => Math.round((100 * day.known) / (day.known + day.again));

/**
 * STUDY-04: what the saved answers of scheduled reviews add up to. Covers every card the owner
 * has reviewed, deleted ones included; free practice rounds are not counted.
 */
function StudyHistory({ attempt }: { attempt: number }) {
  // `attempt` changes after a review round, so the figures include the answers just saved.
  const {
    data: stats,
    error,
    reload,
  } = useApiResource<StudyStats>(`stats:${attempt}`, studyStats, studyCardError);
  const answers = stats ? stats.totals.known + stats.totals.again : 0;
  return (
    <details className="study-history">
      <summary>Thống kê ôn tập</summary>
      {error ? (
        <div>
          <p role="alert" className="form-error">
            {error}
          </p>
          <button className="text-button" onClick={reload}>
            Tải lại thống kê
          </button>
        </div>
      ) : !stats ? (
        <p role="status">Đang tải thống kê…</p>
      ) : (
        <>
          <p>
            {stats.streak > 0
              ? `Chuỗi ôn ${stats.streak} ngày liên tiếp.${stats.reviewedToday ? '' : ' Ôn hôm nay để giữ chuỗi.'}`
              : 'Chưa có chuỗi ngày ôn. Mỗi ngày ôn thẻ đến hạn sẽ nối dài chuỗi.'}{' '}
            {answers > 0
              ? `Đã lưu ${answers} câu trả lời: nhớ ${stats.totals.known}, chưa nhớ ${stats.totals.again}.`
              : 'Chưa lưu câu trả lời nào.'}
          </p>
          <p className="field-hint">
            Thẻ theo lịch:{' '}
            {stats.boxes
              .filter((b) => b.cards > 0)
              .map((b) => `${boxLabel(b.box)}: ${b.cards}`)
              .join(' · ') || 'chưa có thẻ'}
            . Chỉ lượt “Ôn thẻ đến hạn” được tính; lượt luyện tự do không lưu kết quả.
          </p>
          {stats.days.length === 0 ? (
            <p className="field-hint">Chưa có lượt ôn nào trong 30 ngày qua.</p>
          ) : (
            <table className="study-history-table">
              <caption className="sr-only">Kết quả ôn từng ngày, 30 ngày gần nhất</caption>
              <thead>
                <tr>
                  <th scope="col">Ngày</th>
                  <th scope="col">Nhớ</th>
                  <th scope="col">Chưa nhớ</th>
                  <th scope="col">Tỉ lệ nhớ</th>
                </tr>
              </thead>
              <tbody>
                {[...stats.days].reverse().map((day) => (
                  <tr key={day.date}>
                    <th scope="row">
                      {day.date === stats.today ? 'Hôm nay' : formatStudyDay(day.date)}
                    </th>
                    <td>{day.known}</td>
                    <td>{day.again}</td>
                    <td>{share(day)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </details>
  );
}

export function StudyDeck({ startDue = false }: { startDue?: boolean }) {
  const [page, setPage] = useState(1);
  const [data, setData] = useState<StudyCardList | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [scope, setScope] = useState<StudyCardScope>({ versionId: '', courseId: '' });
  const [filters, setFilters] = useState<StudyCardFilters | null>(null);
  const [practicing, setPracticing] = useState<'free' | 'due' | null>(startDue ? 'due' : null);
  const [schedule, setSchedule] = useState<StudySchedule | null>(null);
  // The menus only narrow the list; if they fail to load, the whole deck still shows.
  useEffect(() => {
    const controller = new AbortController();
    studyCardFilters(controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setFilters(result);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [attempt]);
  // Without the schedule the deck still lists cards and offers free practice.
  useEffect(() => {
    const controller = new AbortController();
    studySchedule(scopeParams(scope), controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setSchedule(result);
      })
      .catch(() => {
        if (!controller.signal.aborted) setSchedule(null);
      });
    return () => controller.abort();
  }, [scope, attempt]);
  useEffect(() => {
    const controller = new AbortController();
    const params = scopeParams(scope);
    params.set('page', String(page));
    params.set('limit', '20');
    void studyCards(params, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setData(result);
      })
      .catch((failure) => {
        if (!controller.signal.aborted) setError(studyCardError(failure));
      });
    return () => controller.abort();
  }, [page, attempt, scope]);
  function reload() {
    setError('');
    setData(null);
    setAttempt((v) => v + 1);
  }
  function narrow(next: Partial<StudyCardScope>) {
    setData(null);
    setPage(1);
    setScope((v) => ({ ...v, ...next }));
  }
  const filtered = Boolean(scope.versionId || scope.courseId);
  const upcoming = schedule?.days[0];
  const dueNow = schedule?.dueNow ?? 0;
  return (
    <section className="users-directory study-deck" aria-labelledby="study-title">
      <h2 id="study-title">Thẻ ôn tập của tôi</h2>
      <p className="field-hint">
        Tạo thẻ từ đoạn tô trong trang đọc: tự viết câu hỏi và đáp án, rồi lật để tự kiểm tra. Thẻ
        nhớ được sẽ giãn dần sau 1, 3, 7, 14, 30 và 60 ngày. Chỉ bạn xem được.
      </p>
      {filters && (filters.documents.length > 1 || filters.courses.length > 0) && (
        <div className="study-filters">
          <SelectField
            id="study-course"
            label="Môn học"
            value={scope.courseId}
            disabled={practicing !== null}
            options={[
              { value: '', label: 'Mọi môn' },
              ...filters.courses.map((c) => ({ value: c.id, label: `${c.code} · ${c.name}` })),
            ]}
            onChange={(courseId) => narrow({ courseId })}
          />
          <SelectField
            id="study-document"
            label="Tài liệu"
            value={scope.versionId}
            disabled={practicing !== null}
            options={[
              { value: '', label: 'Mọi tài liệu' },
              ...filters.documents.map((d) => ({
                value: d.versionId,
                label: `${d.title} (${d.cards} thẻ)`,
              })),
            ]}
            onChange={(versionId) => narrow({ versionId })}
          />
        </div>
      )}
      {practicing ? (
        <StudyPractice
          scope={scope}
          due={practicing === 'due'}
          close={() => {
            setPracticing(null);
            reload();
          }}
        />
      ) : error ? (
        <div className="users-list-message">
          <p role="alert" className="form-error">
            {error}
          </p>
          <button className="secondary-button" onClick={reload}>
            Thử tải lại
          </button>
        </div>
      ) : !data ? (
        <p role="status">Đang tải thẻ ôn tập…</p>
      ) : (
        <>
          {data.unavailable > 0 && (
            <p className="field-hint">
              {data.unavailable} thẻ thuộc tài liệu bạn không còn đọc được nên tạm ẩn; thẻ vẫn được
              giữ.
            </p>
          )}
          {data.total > 0 && (
            <div className="note-actions">
              {dueNow > 0 && (
                <button className="primary-button" onClick={() => setPracticing('due')}>
                  Ôn {dueNow} thẻ đến hạn
                </button>
              )}
              <button
                className={dueNow > 0 ? 'secondary-button' : 'primary-button'}
                onClick={() => setPracticing('free')}
              >
                Luyện {data.total} thẻ{filtered ? ' đang lọc' : ''}
              </button>
            </div>
          )}
          <StudyHistory attempt={attempt} />
          {data.total > 0 && (
            <NotesExport
              label={filtered ? 'Tải thẻ đang lọc' : 'Tải thẻ ôn tập'}
              noun="thẻ ôn tập"
              tooLarge="Quá nhiều thẻ để xuất một lần. Chọn môn hoặc tài liệu để xuất từng phần."
              download={(format) => exportStudyCards(scope, format)}
            />
          )}
          {data.total > 0 && schedule && dueNow === 0 && (
            <p className="field-hint">
              Hôm nay không có thẻ đến hạn.
              {upcoming
                ? ` Lần ôn tiếp theo: ${formatStudyDay(upcoming.date)} (${upcoming.count} thẻ).`
                : ''}
            </p>
          )}
          {data.items.length === 0 ? (
            <p className="users-list-message">
              {filtered
                ? 'Không có thẻ nào trong bộ lọc này.'
                : 'Chưa có thẻ nào. Mở một tài liệu, tô một đoạn rồi chọn “Tạo thẻ ôn tập”.'}
            </p>
          ) : (
            <div className="study-cards">
              {data.items.map((card) => (
                <Card
                  key={card.id}
                  card={card}
                  today={schedule?.today ?? ''}
                  rescheduled={reload}
                  replaced={(next) =>
                    setData((v) =>
                      v
                        ? {
                            ...v,
                            items: v.items.map((c) =>
                              c.id === next.id ? { ...next, title: c.title } : c,
                            ),
                          }
                        : v,
                    )
                  }
                  removed={reload}
                />
              ))}
            </div>
          )}
          <div className="users-pagination">
            <button
              className="secondary-button"
              disabled={data.page <= 1}
              onClick={() => {
                setData(null);
                setPage((v) => v - 1);
              }}
            >
              Trang trước
            </button>
            <button
              className="secondary-button"
              disabled={data.page * data.limit >= data.total}
              onClick={() => {
                setData(null);
                setPage((v) => v + 1);
              }}
            >
              Trang sau
            </button>
          </div>
        </>
      )}
    </section>
  );
}
