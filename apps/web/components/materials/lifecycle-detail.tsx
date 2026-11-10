'use client';
import { useEffect, useRef, useState } from 'react';
import {
  changeMaterial,
  lifecycleError,
  materialLifecycle,
  type MaterialLifecycle,
} from '../../lib/lifecycle';
import { fileFailedLabel, publicationLabel } from '../../lib/materials';
import { useReturnFocus } from '../../lib/use-return-focus';
export function LifecycleDetail({
  id,
  close,
  changed,
}: {
  id: string;
  close: () => void;
  changed: () => void;
}) {
  const returnFocus = useReturnFocus();
  const [current, setCurrent] = useState<MaterialLifecycle | null>(null),
    [page, setPage] = useState(1),
    [attempt, setAttempt] = useState(0);
  const [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [uncertain, setUncertain] = useState(false),
    [pending, setPending] = useState(false);
  const [visibilityReason, setVisibilityReason] = useState(''),
    [resolved, setResolved] = useState(false);
  const [confirmation, setConfirmation] = useState<'visibility' | null>(null);
  const feedback = useRef<HTMLParagraphElement>(null),
    heading = useRef<HTMLHeadingElement>(null),
    alive = useRef(true);
  useEffect(() => {
    const controller = new AbortController();
    void materialLifecycle(id, page, controller.signal)
      .then((item) => {
        if (!controller.signal.aborted) {
          setCurrent(item);
          setError('');
          setUncertain(false);
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(lifecycleError(e));
      });
    return () => controller.abort();
  }, [id, page, attempt]);
  useEffect(() => {
    alive.current = true;
    heading.current?.focus();
    return () => {
      alive.current = false;
    };
  }, []);
  function refresh() {
    setUncertain(true);
    setConfirmation(null);
    setResolved(false);
    setNotice('');
    setError('');
    setAttempt((n) => n + 1);
  }
  async function run() {
    if (!current || pending || uncertain) return;
    setPending(true);
    setError('');
    setNotice('');
    try {
      const item = await changeMaterial(current, 'visibility', {
        visibility: current.visibility === 'VISIBLE' ? 'HIDDEN' : 'VISIBLE',
        reason: visibilityReason.trim(),
        resolved,
      });
      if (!alive.current) return;
      setCurrent(item);
      setConfirmation(null);
      setResolved(false);
      setVisibilityReason('');
      setNotice(item.visibility === 'HIDDEN' ? 'Đã ẩn toàn tài liệu.' : 'Đã khôi phục hiển thị.');
      changed();
      requestAnimationFrame(() => feedback.current?.focus());
    } catch (e) {
      if (alive.current) {
        setError(lifecycleError(e));
        setUncertain(true);
        requestAnimationFrame(() => feedback.current?.focus());
      }
    } finally {
      if (alive.current) setPending(false);
    }
  }
  const locked = pending || uncertain;
  return (
    <section className="user-editor lifecycle-detail" aria-label="Chi tiết quản lý học liệu">
      <h2 ref={heading} tabIndex={-1}>
        Quản lý tài liệu
      </h2>
      {error && (
        <p role="alert" className="form-error" ref={feedback} tabIndex={-1}>
          {error} {uncertain && 'Tải trạng thái tài liệu để đối chiếu trước khi thử lại.'}
        </p>
      )}
      {notice && (
        <p role="status" className="user-success" ref={feedback} tabIndex={-1}>
          {notice}
        </p>
      )}
      {!current ? (
        <p role="status">Đang tải tài liệu…</p>
      ) : (
        <>
          <h3>{current.latest.title}</h3>
          <dl className="scope-list">
            <div>
              <dt>Quản lý hiện tại</dt>
              <dd>{current.manager.name}</dd>
            </div>
            <div>
              <dt>Hiển thị</dt>
              <dd>
                {current.visibility === 'VISIBLE' ? 'Đang hiển thị' : 'Đang ẩn toàn tài liệu'}
              </dd>
            </div>
            <div>
              <dt>Phiên bản mới nhất</dt>
              <dd>
                {current.latest.versionNo} · {publicationLabel(current.latest)}
                {current.latest.fileState === 'FAILED' &&
                  ` · ${fileFailedLabel(current.latest.fileError)}`}
              </dd>
            </div>
            <div>
              <dt>Bản công bố</dt>
              <dd>{current.current ? `Phiên bản ${current.current.versionNo}` : 'Chưa có'}</dd>
            </div>
          </dl>
          <p className="field-hint">
            Môn trong các phiên bản:{' '}
            {current.courses.map((c) => `${c.code} · ${c.name}`).join('; ') || 'Chưa có môn'}
          </p>
          <fieldset className="draft-fields" disabled={locked}>
            <legend>Hiển thị toàn tài liệu</legend>
            <p className="field-hint">
              Ẩn chặn lượt đọc/tải mới ở mọi phiên bản, giữ dữ liệu học tập riêng. Không thu hồi
              file đã tải. Khôi phục cần bản hiện hành đủ quyền và PDF an toàn.
            </p>
            <div className="form-field">
              <label htmlFor="visibility-reason">Lý do đổi hiển thị</label>
              <textarea
                id="visibility-reason"
                maxLength={1000}
                value={visibilityReason}
                onChange={(e) => {
                  setVisibilityReason(e.target.value);
                  setConfirmation(null);
                }}
              />
            </div>
            {current.visibility === 'HIDDEN' && (
              <label className="checkbox-field">
                <input
                  type="checkbox"
                  checked={resolved}
                  onChange={(e) => {
                    setResolved(e.target.checked);
                    setConfirmation(null);
                  }}
                />
                Đã giải quyết lý do ẩn
              </label>
            )}
            <button
              type="button"
              className="secondary-button"
              disabled={!visibilityReason.trim() || (current.visibility === 'HIDDEN' && !resolved)}
              onClick={() => {
                returnFocus.remember();
                setConfirmation('visibility');
              }}
            >
              {current.visibility === 'VISIBLE' ? 'Ẩn toàn tài liệu' : 'Khôi phục hiển thị'}
            </button>
            {confirmation === 'visibility' && (
              <div className="form-confirmation">
                <p>
                  {current.visibility === 'VISIBLE'
                    ? 'Ẩn mọi phiên bản của tài liệu này?'
                    : 'Khôi phục tài liệu sau khi đã giải quyết lý do ẩn?'}
                </p>
                <div className="user-form-actions">
                  <button type="button" className="primary-button" onClick={() => void run()}>
                    Xác nhận đổi hiển thị
                  </button>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => {
                      setConfirmation(null);
                      returnFocus.restore();
                    }}
                  >
                    Chưa đổi
                  </button>
                </div>
              </div>
            )}
          </fieldset>
          <section className="draft-pdf" aria-label="Lịch sử quản lý tài liệu">
            <h3>Lịch sử quản lý</h3>
            {current.history.totalTransfers > 0 && (
              <>
                <h4>Bàn giao trước khi bỏ vai trò giảng viên</h4>
                <ol className="publication-history">
                  {current.history.transfers.map((t) => (
                    <li key={t.id}>
                      <p>
                        {t.fromName} → {t.toName} · {new Date(t.createdAt).toLocaleString('vi-VN')}
                      </p>
                      <p className="publication-reason">{t.reason}</p>
                    </li>
                  ))}
                </ol>
              </>
            )}
            <h4>Hiển thị</h4>
            {!current.history.totalVisibility ? (
              <p className="field-hint">Chưa có thay đổi hiển thị.</p>
            ) : (
              <ol className="publication-history">
                {current.history.visibility.map((t) => (
                  <li key={t.id}>
                    <p>
                      {t.toVisibility === 'HIDDEN' ? 'Ẩn tài liệu' : 'Khôi phục'} ·{' '}
                      {new Date(t.createdAt).toLocaleString('vi-VN')}
                    </p>
                    <p className="publication-reason">{t.reason}</p>
                  </li>
                ))}
              </ol>
            )}
            <div className="users-pagination lifecycle-history-pagination">
              <button
                type="button"
                className="secondary-button"
                disabled={pending || page <= 1}
                onClick={() => {
                  setConfirmation(null);
                  setPage((n) => n - 1);
                }}
              >
                Lịch sử trước
              </button>
              <span>Trang {current.history.page}</span>
              <button
                type="button"
                className="secondary-button"
                disabled={
                  pending ||
                  page * current.history.limit >=
                    Math.max(current.history.totalTransfers, current.history.totalVisibility)
                }
                onClick={() => {
                  setConfirmation(null);
                  setPage((n) => n + 1);
                }}
              >
                Lịch sử sau
              </button>
            </div>
          </section>
        </>
      )}
      <div className="user-form-actions">
        <button type="button" className="secondary-button" disabled={pending} onClick={refresh}>
          Tải trạng thái tài liệu
        </button>
        <button type="button" className="secondary-button" disabled={pending} onClick={close}>
          Đóng quản lý
        </button>
      </div>
    </section>
  );
}
