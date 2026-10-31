'use client';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { createStudyCard, studyCardError } from '../../lib/study-cards';
import { useNotesLeaveGuard } from '../library/use-notes-leave-guard';

/**
 * Turns one of the reader's own highlights into a private question/answer card. The request id
 * is fixed while the form is open, so a retry after a lost response cannot create a duplicate.
 */
export function StudyCardMaker({
  versionId,
  highlightId,
  disabled,
}: {
  versionId: string;
  highlightId: string;
  disabled?: boolean;
}) {
  const [requestId, setRequestId] = useState<string | null>(null);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState(false);
  // An opened form nobody typed in is not a draft; leaving it asks nothing.
  const dirty = requestId !== null && (question.trim() !== '' || answer.trim() !== '');
  useNotesLeaveGuard(dirty, busy, 'Bạn có thẻ ôn tập chưa lưu. Rời trang và bỏ thay đổi?');
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!requestId) return;
    setBusy(true);
    setError('');
    try {
      await createStudyCard(versionId, {
        highlightId,
        question: question.trim(),
        answer: answer.trim(),
        requestId,
      });
      setRequestId(null);
      setQuestion('');
      setAnswer('');
      setCreated(true);
    } catch (failure) {
      setError(studyCardError(failure));
    } finally {
      setBusy(false);
    }
  }
  if (!requestId)
    return (
      <div className="study-card-maker">
        <button
          type="button"
          className="text-button"
          disabled={disabled}
          onClick={() => {
            setRequestId(crypto.randomUUID());
            setCreated(false);
          }}
        >
          Tạo thẻ ôn tập
        </button>
        {created && (
          <p role="status" className="field-hint">
            Đã tạo thẻ. <Link href="/workspace/study">Xem thẻ ôn tập</Link>
          </p>
        )}
      </div>
    );
  return (
    <form className="study-card-maker" onSubmit={submit} aria-label="Tạo thẻ ôn tập">
      <div className="form-field">
        <label htmlFor={`card-question-${highlightId}`}>Câu hỏi</label>
        <input
          id={`card-question-${highlightId}`}
          required
          maxLength={500}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
        />
      </div>
      <div className="form-field">
        <label htmlFor={`card-answer-${highlightId}`}>Đáp án</label>
        <textarea
          id={`card-answer-${highlightId}`}
          required
          maxLength={2000}
          rows={3}
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
        />
      </div>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <div className="note-actions">
        <button className="primary-button" disabled={busy || !question.trim() || !answer.trim()}>
          {busy ? 'Đang lưu…' : 'Lưu thẻ'}
        </button>
        <button
          type="button"
          className="secondary-button"
          disabled={busy}
          onClick={() => {
            setRequestId(null);
            setQuestion('');
            setAnswer('');
            setError('');
          }}
        >
          Hủy
        </button>
      </div>
    </form>
  );
}
