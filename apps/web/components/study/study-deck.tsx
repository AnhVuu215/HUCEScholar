'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  deleteStudyCard,
  studyCardError,
  studyCards,
  updateStudyCard,
  type StudyCard,
  type StudyCardList,
} from '../../lib/study-cards';
import { useNotesLeaveGuard } from '../library/use-notes-leave-guard';

function Card({
  card,
  replaced,
  removed,
}: {
  card: StudyCard;
  replaced: (card: StudyCard) => void;
  removed: () => void;
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
          <div className="note-actions">
            <button type="button" className="text-button" onClick={() => setEditing(true)}>
              Sửa thẻ
            </button>
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

export function StudyDeck() {
  const [page, setPage] = useState(1);
  const [data, setData] = useState<StudyCardList | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void studyCards(new URLSearchParams({ page: String(page), limit: '20' }), controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setData(result);
      })
      .catch((failure) => {
        if (!controller.signal.aborted) setError(studyCardError(failure));
      });
    return () => controller.abort();
  }, [page, attempt]);
  function reload() {
    setError('');
    setData(null);
    setAttempt((v) => v + 1);
  }
  return (
    <section className="users-directory study-deck" aria-labelledby="study-title">
      <h2 id="study-title">Thẻ ôn tập của tôi</h2>
      <p className="field-hint">
        Tạo thẻ từ đoạn tô trong trang đọc: tự viết câu hỏi và đáp án, rồi lật để tự kiểm tra. Chỉ
        bạn xem được.
      </p>
      {error ? (
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
          {data.items.length === 0 ? (
            <p className="users-list-message">
              Chưa có thẻ nào. Mở một tài liệu, tô một đoạn rồi chọn “Tạo thẻ ôn tập”.
            </p>
          ) : (
            <div className="study-cards">
              {data.items.map((card) => (
                <Card
                  key={card.id}
                  card={card}
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
