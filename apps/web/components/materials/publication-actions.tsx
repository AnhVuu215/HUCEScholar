'use client';
import { useEffect, useRef, useState } from 'react';
import { ApiError } from '../../lib/auth';
import {
  changePublication,
  currentDraft,
  materialError,
  publicationHistory,
  reviewStatuses,
  type MaterialDraft,
  type PublicationHistory,
} from '../../lib/materials';

export function PublicationActions({
  current,
  blocked,
  changed,
  busy,
  reasonChanged,
  recoveryRequired,
}: {
  current: MaterialDraft;
  blocked: boolean;
  changed: (item: MaterialDraft) => void;
  busy: (value: boolean) => void;
  reasonChanged: (value: boolean) => void;
  recoveryRequired: (value: boolean) => void;
}) {
  const [reason, setReason] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [pending, setPending] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [page, setPage] = useState(1);
  const [attempt, setAttempt] = useState(0);
  const [history, setHistory] = useState<PublicationHistory | null>(null);
  const [historyError, setHistoryError] = useState('');
  const feedback = useRef<HTMLParagraphElement>(null);
  const confirmation = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const controller = new AbortController();
    void publicationHistory(current.id, page, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setHistory(result);
      })
      .catch((failure) => {
        if (!controller.signal.aborted) setHistoryError(materialError(failure));
      });
    return () => controller.abort();
  }, [current.id, current.revision, page, attempt]);
  const locked = blocked || pending;
  const canSubmit =
    current.reviewStatus === 'DRAFT' &&
    current.editable &&
    current.fileState === 'SAFE' &&
    current.courses.every((c) => c.active);
  async function run(action: 'submit' | 'withdraw' | 'reopen' | 'refresh') {
    if (locked || (action !== 'refresh' && uncertain)) return;
    setPending(true);
    busy(true);
    setError('');
    setNotice('');
    try {
      const item =
        action === 'refresh'
          ? await currentDraft(current.id)
          : await changePublication(current, action, reason.trim());
      changed(item);
      setConfirm(false);
      setUncertain(false);
      recoveryRequired(false);
      // Keep the withdrawal explanation on refresh while the request is still pending.
      if (action !== 'refresh' || item.reviewStatus !== 'SUBMITTED') {
        setReason('');
        reasonChanged(false);
      }
      setHistory(null);
      setHistoryError('');
      setPage(1);
      setAttempt((v) => v + 1);
      setNotice(
        action === 'submit'
          ? 'Đã gửi yêu cầu duyệt. Học liệu chưa được công bố.'
          : action === 'withdraw'
            ? 'Đã rút về bản nháp. Bạn có thể chỉnh sửa khi còn quyền biên soạn.'
            : action === 'reopen'
              ? 'Đã mở lại bản nháp để chỉnh sửa.'
              : 'Đã tải trạng thái hiện hành. Kiểm tra trước khi tiếp tục.',
      );
      requestAnimationFrame(() => feedback.current?.focus());
    } catch (failure) {
      if (action !== 'refresh') {
        setUncertain(true);
        recoveryRequired(true);
      }
      const codes: Record<string, string> = {
        FILE_NOT_SAFE: 'PDF chưa qua kiểm tra kỹ thuật. Cập nhật trạng thái trước khi gửi.',
        METADATA_REQUIRED: 'Cần bổ sung thông tin, môn, nguồn và căn cứ quyền trước khi gửi.',
        RIGHTS_EXPIRED: 'Căn cứ quyền đã hết hạn. Kiểm tra lại trước khi gửi.',
        NOT_SUBMITTED: 'Yêu cầu không còn chờ duyệt. Tải trạng thái mới để kiểm tra.',
        REQUEST_CHANGED: 'Yêu cầu duyệt đã thay đổi. Tải trạng thái mới để kiểm tra.',
        STALE_REVISION:
          'Học liệu đã thay đổi ở một lượt thao tác khác. Tải trạng thái mới trước khi gửi hoặc rút.',
      };
      setError(
        failure instanceof ApiError && failure.code && codes[failure.code]
          ? codes[failure.code]
          : materialError(failure),
      );
      requestAnimationFrame(() => feedback.current?.focus());
    } finally {
      setPending(false);
      busy(false);
    }
  }
  return (
    <section className="draft-pdf publication-actions" aria-labelledby="publication-title">
      <h3 id="publication-title">Yêu cầu duyệt</h3>
      <p>
        <strong>
          {reviewStatuses[current.reviewStatus as keyof typeof reviewStatuses] ??
            current.reviewStatus}
        </strong>
      </p>
      <p className="field-hint">
        Gửi duyệt khóa thông tin và PDF của phiên bản này. Rút về nháp trước khi sửa. Chức năng kiểm
        duyệt do admin quyết định; duyệt không tự mở tài liệu đang ẩn. Kho học liệu và reader sẽ
        được bổ sung sau.
      </p>
      {(error || uncertain) && (
        <p role="alert" className="form-error" ref={feedback} tabIndex={-1}>
          {error}{' '}
          {uncertain &&
            'Chưa thể tiếp tục thao tác. Bấm Tải trạng thái duyệt để đối chiếu kết quả trước khi thử lại.'}
        </p>
      )}
      {notice && (
        <p role="status" className="user-success" ref={feedback} tabIndex={-1}>
          {notice}
        </p>
      )}
      {blocked && (
        <p className="field-hint">
          Lưu thay đổi thông tin và tải hoặc bỏ PDF đã chọn trước khi thao tác duyệt.
        </p>
      )}
      {current.reviewStatus === 'CHANGES_REQUIRED' && (
        <>
          <p className="field-hint">
            Xem lý do trong lịch sử. Mở lại bản nháp trước khi sửa rồi gửi duyệt lại.
          </p>
          <button
            type="button"
            className="secondary-button"
            disabled={locked || uncertain}
            onClick={() => void run('reopen')}
          >
            Mở lại để chỉnh sửa
          </button>
        </>
      )}
      {['APPROVED', 'REJECTED'].includes(current.reviewStatus) && (
        <p className="field-hint">
          Phiên bản đã kết thúc và được giữ nguyên. Tạo phiên bản kế tiếp sẽ được bổ sung sau.
        </p>
      )}
      {current.reviewStatus === 'DRAFT' && (
        <>
          {!canSubmit && (
            <p className="field-hint">
              Cần PDF đã qua kiểm tra, môn đang hoạt động và quyền biên soạn hợp lệ để gửi.
            </p>
          )}
          <button
            type="button"
            className="primary-button"
            disabled={locked || uncertain || !canSubmit}
            onClick={() => {
              setConfirm(true);
              requestAnimationFrame(() => confirmation.current?.focus());
            }}
          >
            Gửi duyệt
          </button>
          {confirm && (
            <div
              className="draft-discard"
              role="group"
              aria-label="Xác nhận gửi duyệt"
              tabIndex={-1}
              ref={confirmation}
            >
              <p>
                Gửi phiên bản {current.versionNo}, lần lưu {current.revision} để kiểm duyệt? Thông
                tin và PDF sẽ được giữ nguyên khi chờ duyệt.
              </p>
              <div className="user-form-actions">
                <button
                  type="button"
                  className="primary-button"
                  disabled={locked || uncertain || !canSubmit}
                  onClick={() => void run('submit')}
                >
                  Xác nhận gửi duyệt
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  disabled={pending}
                  onClick={() => setConfirm(false)}
                >
                  Chưa gửi
                </button>
              </div>
            </div>
          )}
        </>
      )}
      {current.reviewStatus === 'SUBMITTED' && (
        <div className="form-field">
          <label htmlFor="withdraw-reason">Lý do rút yêu cầu</label>
          <textarea
            id="withdraw-reason"
            maxLength={1000}
            value={reason}
            disabled={locked}
            onChange={(event) => {
              setReason(event.target.value);
              reasonChanged(!!event.target.value);
            }}
            aria-describedby="withdraw-hint"
          />
          <p id="withdraw-hint" className="field-hint">
            Bắt buộc, tối đa 1.000 ký tự. Rút sẽ kết thúc lần gửi này và giữ lý do trong lịch sử;
            PDF vẫn được lưu riêng tư.
          </p>
          <button
            type="button"
            className="secondary-button"
            disabled={locked || uncertain || !reason.trim()}
            onClick={() => void run('withdraw')}
          >
            Rút về nháp
          </button>
        </div>
      )}
      <div className="user-form-actions">
        <button
          type="button"
          className="text-button"
          disabled={locked}
          onClick={() => void run('refresh')}
        >
          Tải trạng thái duyệt
        </button>
      </div>
      {pending && <p role="status">Đang xử lý yêu cầu duyệt…</p>}
      <h4>Lịch sử gửi và rút</h4>
      {historyError ? (
        <div>
          <p role="alert" className="form-error">
            {historyError}
          </p>
          <button
            type="button"
            className="secondary-button"
            onClick={() => {
              setHistoryError('');
              setAttempt((v) => v + 1);
            }}
          >
            Thử tải lịch sử
          </button>
        </div>
      ) : !history ? (
        <p role="status">Đang tải lịch sử…</p>
      ) : (
        <>
          {!history.items.length ? (
            <p className="field-hint">Chưa có lần gửi duyệt nào.</p>
          ) : (
            <ol className="publication-history">
              {history.items.map((item) => (
                <li key={item.id}>
                  <strong>
                    {item.status === 'PENDING'
                      ? 'Chờ duyệt'
                      : item.status === 'WITHDRAWN'
                        ? 'Đã rút'
                        : (reviewStatuses[item.status as keyof typeof reviewStatuses] ??
                          item.status)}
                  </strong>
                  <p className="field-hint">
                    Gửi {new Date(item.submittedAt).toLocaleString('vi-VN')} · Lần lưu{' '}
                    {item.submittedRevision}
                    {item.resolvedAt
                      ? ` · Kết thúc ${new Date(item.resolvedAt).toLocaleString('vi-VN')}`
                      : ''}
                  </p>
                  {item.reason && <p className="publication-reason">Lý do: {item.reason}</p>}
                </li>
              ))}
            </ol>
          )}
          {history.total > history.limit && (
            <div className="users-pagination">
              <button
                type="button"
                className="secondary-button"
                disabled={page <= 1}
                onClick={() => {
                  setHistory(null);
                  setPage((v) => v - 1);
                }}
              >
                Lịch sử trước
              </button>
              <span>
                Trang {page}/{Math.ceil(history.total / history.limit)}
              </span>
              <button
                type="button"
                className="secondary-button"
                disabled={page * history.limit >= history.total}
                onClick={() => {
                  setHistory(null);
                  setPage((v) => v + 1);
                }}
              >
                Lịch sử sau
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
