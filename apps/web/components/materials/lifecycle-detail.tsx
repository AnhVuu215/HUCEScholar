'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { CatalogPicker, type CatalogChoice } from '../academic/catalog-picker';
import {
  changeMaterial,
  lifecycleError,
  materialLifecycle,
  transferRecipients,
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
  const [recipient, setRecipient] = useState<CatalogChoice | null>(null),
    [transferReason, setTransferReason] = useState(''),
    [visibilityReason, setVisibilityReason] = useState(''),
    [resolved, setResolved] = useState(false);
  const [confirmation, setConfirmation] = useState<'transfer' | 'visibility' | null>(null);
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
  const loadRecipients = useCallback(
    (params: URLSearchParams, signal: AbortSignal) => transferRecipients(id, params, signal),
    [id],
  );
  function refresh() {
    setUncertain(true);
    setConfirmation(null);
    setResolved(false);
    setNotice('');
    setError('');
    setAttempt((n) => n + 1);
  }
  async function run(action: 'transfer' | 'visibility') {
    if (!current || pending || uncertain) return;
    setPending(true);
    setError('');
    setNotice('');
    try {
      const item = await changeMaterial(
        current,
        action,
        action === 'transfer'
          ? { recipientId: recipient?.id, reason: transferReason.trim() }
          : {
              visibility: current.visibility === 'VISIBLE' ? 'HIDDEN' : 'VISIBLE',
              reason: visibilityReason.trim(),
              resolved,
            },
      );
      if (!alive.current) return;
      setCurrent(item);
      setConfirmation(null);
      setResolved(false);
      setRecipient(null);
      if (action === 'transfer') setTransferReason('');
      else setVisibilityReason('');
      setNotice(
        action === 'transfer'
          ? 'Đã bàn giao. Người nhận có thể rà soát và tiếp tục biên soạn.'
          : item.visibility === 'HIDDEN'
            ? 'Đã ẩn toàn tài liệu.'
            : 'Đã khôi phục hiển thị.',
      );
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
          {current.kind === 'LECTURER_MATERIAL' && (
            <fieldset className="draft-fields" disabled={locked}>
              <legend>Bàn giao giảng viên</legend>
              <p className="field-hint">
                Người nhận phải hoạt động, đã xác minh và được phân công mọi môn của tài liệu. Bản
                đang chờ duyệt sẽ được rút về nháp; PDF, tác giả, ghi chú và bản công bố giữ nguyên.
              </p>
              <CatalogPicker
                key={current.manager.id}
                kind="courses"
                label="Giảng viên nhận"
                value={recipient}
                onChange={(v) => {
                  setRecipient(v);
                  setConfirmation(null);
                }}
                loadItems={loadRecipients}
              />
              <div className="form-field">
                <label htmlFor="transfer-reason">Lý do bàn giao</label>
                <textarea
                  id="transfer-reason"
                  maxLength={1000}
                  value={transferReason}
                  onChange={(e) => {
                    setTransferReason(e.target.value);
                    setConfirmation(null);
                  }}
                />
              </div>
              <button
                type="button"
                className="secondary-button"
                disabled={!recipient || !transferReason.trim()}
                onClick={() => {
                  returnFocus.remember();
                  setConfirmation('transfer');
                }}
              >
                Bàn giao
              </button>
              {confirmation === 'transfer' && (
                <div className="form-confirmation">
                  <p>
                    Bàn giao từ {current.manager.name} cho {recipient?.label}?{' '}
                    {current.latest.reviewStatus === 'SUBMITTED'
                      ? 'Yêu cầu chờ của phiên bản mới nhất sẽ bị rút.'
                      : 'Bản công bố và lịch sử tiếp tục được giữ.'}
                  </p>
                  <div className="user-form-actions">
                    <button
                      type="button"
                      className="primary-button"
                      onClick={() => void run('transfer')}
                    >
                      Xác nhận bàn giao
                    </button>
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => {
                        setConfirmation(null);
                        returnFocus.restore();
                      }}
                    >
                      Chưa bàn giao
                    </button>
                  </div>
                </div>
              )}
            </fieldset>
          )}
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
                  <button
                    type="button"
                    className="primary-button"
                    onClick={() => void run('visibility')}
                  >
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
            <h4>Bàn giao</h4>
            {!current.history.totalTransfers ? (
              <p className="field-hint">Chưa có bàn giao.</p>
            ) : (
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
