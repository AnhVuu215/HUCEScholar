'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import {
  practiceCards,
  studyCardError,
  type StudyCard,
  type StudyCardScope,
} from '../../lib/study-cards';

type Result = 'known' | 'again';

/** Fisher–Yates on a copy. */
function shuffled<T>(items: T[]) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * STUDY-02: one card at a time, answer hidden until asked, then "Nhớ" or "Chưa nhớ". Results
 * live only in this round; the end offers another pass over the cards not yet remembered.
 */
export function StudyPractice({ scope, close }: { scope: StudyCardScope; close: () => void }) {
  const [loaded, setLoaded] = useState<{ items: StudyCard[]; total: number } | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [shuffle, setShuffle] = useState(true);
  const [order, setOrder] = useState<StudyCard[]>([]);
  const [index, setIndex] = useState(0);
  const [shown, setShown] = useState(false);
  const [results, setResults] = useState<Map<string, Result>>(new Map());
  const question = useRef<HTMLHeadingElement>(null);
  const summary = useRef<HTMLHeadingElement>(null);
  const knownButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const controller = new AbortController();
    practiceCards(scope, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        setLoaded(result);
        setOrder(shuffled(result.items));
      })
      .catch((failure) => {
        if (!controller.signal.aborted) setError(studyCardError(failure));
      });
    return () => controller.abort();
  }, [scope, attempt]);
  const done = loaded !== null && order.length > 0 && index >= order.length;
  useEffect(() => {
    (done ? summary : question).current?.focus();
  }, [index, done, loaded]);
  // The reveal button goes away with a click, so the answer buttons take its focus.
  useEffect(() => {
    if (shown) knownButton.current?.focus();
  }, [shown]);

  function start(cards: StudyCard[]) {
    setOrder(shuffle ? shuffled(cards) : cards);
    setIndex(0);
    setShown(false);
    setResults(new Map());
  }
  function answer(result: Result) {
    setResults((v) => new Map(v).set(order[index].id, result));
    setShown(false);
    setIndex((v) => v + 1);
  }
  const known = order.filter((c) => results.get(c.id) === 'known');
  const again = order.filter((c) => results.get(c.id) === 'again');

  if (error)
    return (
      <div className="users-list-message">
        <p role="alert" className="form-error">
          {error}
        </p>
        <button
          className="secondary-button"
          onClick={() => {
            setError('');
            setAttempt((v) => v + 1);
          }}
        >
          Thử tải lại
        </button>
        <button className="text-button" onClick={close}>
          Về danh sách thẻ
        </button>
      </div>
    );
  if (!loaded) return <p role="status">Đang chuẩn bị lượt luyện…</p>;
  if (!loaded.items.length)
    return (
      <div className="users-list-message">
        <p>Không có thẻ nào trong bộ lọc này.</p>
        <button className="secondary-button" onClick={close}>
          Về danh sách thẻ
        </button>
      </div>
    );
  const card = order[index];
  return (
    <section className="study-practice" aria-labelledby="study-practice-title">
      <div className="study-practice-head">
        <h3 id="study-practice-title">Luyện thẻ</h3>
        <label className="calendar-check">
          <input type="checkbox" checked={shuffle} onChange={(e) => setShuffle(e.target.checked)} />
          Xáo thứ tự khi bắt đầu lượt
        </label>
        <button type="button" className="text-button" onClick={close}>
          Kết thúc luyện
        </button>
      </div>
      {loaded.total > loaded.items.length && (
        <p className="field-hint">
          Lượt này gồm {loaded.items.length} thẻ mới nhất trong {loaded.total} thẻ. Chọn môn hoặc
          tài liệu để luyện phần còn lại.
        </p>
      )}
      {done ? (
        <div className="study-card">
          <h3 ref={summary} tabIndex={-1}>
            Xong lượt: nhớ {known.length} / {order.length} thẻ
          </h3>
          {again.length > 0 ? (
            <p>{again.length} thẻ chưa nhớ. Ôn lại riêng các thẻ này?</p>
          ) : (
            <p>Bạn đã nhớ hết các thẻ trong lượt này.</p>
          )}
          <div className="note-actions">
            {again.length > 0 && (
              <button className="primary-button" onClick={() => start(again)}>
                Ôn lại {again.length} thẻ chưa nhớ
              </button>
            )}
            <button className="secondary-button" onClick={() => start(loaded.items)}>
              Luyện lại tất cả
            </button>
            <button className="text-button" onClick={close}>
              Về danh sách thẻ
            </button>
          </div>
        </div>
      ) : (
        <article className="study-card" aria-label={`Thẻ ${index + 1} / ${order.length}`}>
          <p className="field-hint" role="status">
            Thẻ {index + 1} / {order.length} · Nhớ {known.length} · Chưa nhớ {again.length}
          </p>
          <h3 ref={question} tabIndex={-1}>
            {card.question}
          </h3>
          {shown ? (
            <>
              <div>
                <p className="study-answer">{card.answer}</p>
                <blockquote className="highlight-quote">{card.quote}</blockquote>
                <p className="field-hint">
                  {card.title ?? 'Tài liệu'} · Trang {card.pageNumber} ·{' '}
                  <Link
                    href={`/workspace/library/versions/${card.versionId}?page=${card.pageNumber}`}
                  >
                    Mở trang nguồn
                  </Link>
                </p>
              </div>
              <div className="note-actions" role="group" aria-label="Bạn đã nhớ thẻ này chưa?">
                <button
                  ref={knownButton}
                  className="primary-button"
                  onClick={() => answer('known')}
                >
                  Nhớ
                </button>
                <button className="secondary-button" onClick={() => answer('again')}>
                  Chưa nhớ
                </button>
              </div>
            </>
          ) : (
            <button type="button" className="primary-button" onClick={() => setShown(true)}>
              Hiện đáp án
            </button>
          )}
        </article>
      )}
    </section>
  );
}
