'use client';
import { useEffect, useRef, useState } from 'react';
import {
  currentReview,
  decideReview,
  reviewError,
  requestStatuses,
  type ReviewItem,
  type Outcome,
} from '../../lib/moderation';
import { materialTypes } from '../../lib/materials';
import { apiRequest, readProfile } from '../../lib/auth';
// One ephemeral decision per tab, bound to the authenticated actor and snapshot.
// Survives Next.js history navigation; never written to browser storage or the API.
let retainedDecision: {
  ownerId: string;
  requestId: string;
  revision: number;
  reason: string;
  outcome: Outcome | '';
} | null = null;
export function ModerationDetail({
  id,
  close,
  changed,
}: {
  id: string;
  close: () => void;
  changed: () => void;
}) {
  const [row, setRow] = useState<ReviewItem | null>(null),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  const [reason, setReason] = useState(''),
    [outcome, setOutcome] = useState<Outcome | ''>(''),
    [rights, setRights] = useState(false),
    [confirm, setConfirm] = useState(false),
    [pending, setPending] = useState(false),
    [uncertain, setUncertain] = useState(false);
  const [leaving, setLeaving] = useState<{ destination: string | HTMLButtonElement | null } | null>(
    null,
  );
  const [attempt, setAttempt] = useState(0);
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const heading = useRef<HTMLHeadingElement>(null),
    feedback = useRef<HTMLParagraphElement>(null),
    confirmation = useRef<HTMLDivElement>(null),
    leaveAllowed = useRef(false);
  const dirty = !!reason || !!outcome || rights;
  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([
      currentReview(id, controller.signal),
      apiRequest('/auth/me', { signal: controller.signal }).then(readProfile),
    ])
      .then(([item, actor]) => {
        if (!controller.signal.aborted) {
          setRow(item);
          setOwnerId(actor.id);
          if (
            retainedDecision?.ownerId === actor.id &&
            retainedDecision.requestId === id &&
            retainedDecision.revision === item.revision &&
            item.status === 'PENDING' &&
            item.snapshotMatches
          ) {
            setReason(retainedDecision.reason);
            setOutcome(retainedDecision.outcome);
            setNotice(
              'Đã khôi phục quyết định chưa lưu trong tab này. Kiểm tra trước khi tiếp tục.',
            );
          } else retainedDecision = null;
          requestAnimationFrame(() => heading.current?.focus());
        }
      })
      .catch((failure) => {
        if (!controller.signal.aborted) setError(reviewError(failure));
      });
    return () => controller.abort();
  }, [id, attempt]);
  useEffect(() => {
    if (!ownerId || !row) return;
    retainedDecision =
      row.status === 'PENDING' && row.snapshotMatches && (reason || outcome)
        ? { ownerId, requestId: id, revision: row.revision, reason, outcome }
        : null;
  }, [ownerId, row, id, reason, outcome]);
  useEffect(() => {
    function before(event: BeforeUnloadEvent) {
      if ((dirty || pending) && !leaveAllowed.current) event.preventDefault();
    }
    function navigate(event: MouseEvent) {
      if ((!dirty && !pending) || leaveAllowed.current || !(event.target instanceof Element))
        return;
      const link = event.target.closest<HTMLAnchorElement>('a[href]'),
        logout = event.target.closest<HTMLButtonElement>('button[data-workspace-logout]');
      if (
        !logout &&
        (!link || link.target === '_blank' || link.getAttribute('href')?.startsWith('#'))
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      if (!pending) setLeaving({ destination: logout ?? link!.href });
    }
    window.addEventListener('beforeunload', before);
    document.addEventListener('click', navigate, true);
    return () => {
      window.removeEventListener('beforeunload', before);
      document.removeEventListener('click', navigate, true);
    };
  }, [dirty, pending]);
  async function refresh() {
    if (pending) return;
    setPending(true);
    setError('');
    try {
      const item = await currentReview(id);
      setRow(item);
      setUncertain(false);
      setConfirm(false);
      if (item.status !== 'PENDING') {
        setReason('');
        setOutcome('');
        setRights(false);
      }
      setNotice('Đã tải trạng thái yêu cầu. Kiểm tra trước khi tiếp tục.');
      changed();
    } catch (failure) {
      setError(reviewError(failure));
    } finally {
      setPending(false);
      requestAnimationFrame(() => feedback.current?.focus());
    }
  }
  async function save() {
    if (
      !row ||
      !outcome ||
      pending ||
      uncertain ||
      !reason.trim() ||
      (outcome === 'APPROVED' && !rights)
    )
      return;
    setPending(true);
    setError('');
    setNotice('');
    try {
      const item = await decideReview(row, outcome, reason.trim(), rights);
      setRow(item);
      setConfirm(false);
      setReason('');
      setOutcome('');
      setRights(false);
      setNotice('Đã lưu quyết định.');
      changed();
    } catch (failure) {
      setUncertain(true);
      setError(reviewError(failure));
    } finally {
      setPending(false);
      requestAnimationFrame(() => feedback.current?.focus());
    }
  }
  const canDecide = !!row && row.status === 'PENDING' && row.snapshotMatches;
  return (
    <section className="user-editor moderation-detail" aria-labelledby="review-detail-title">
      <h2 id="review-detail-title" ref={heading} tabIndex={-1}>
        Chi tiết yêu cầu
      </h2>
      {(error || uncertain) && (
        <p className="form-error" role="alert" tabIndex={-1} ref={feedback}>
          {error}{' '}
          {uncertain &&
            'Chưa rõ kết quả. Bấm Tải trạng thái yêu cầu trước khi thử lại; nội dung nhập được giữ.'}
        </p>
      )}
      {notice && (
        <p className="user-success" role="status" tabIndex={-1} ref={feedback}>
          {notice}
        </p>
      )}
      {!row && !error && <p role="status">Đang tải chi tiết…</p>}
      {!row && error && (
        <button
          className="secondary-button"
          onClick={() => {
            setError('');
            setAttempt((v) => v + 1);
          }}
        >
          Thử mở yêu cầu
        </button>
      )}
      {row && (
        <>
          <h3>{row.title}</h3>
          <p className="field-hint">
            {row.kind === 'LECTURER_MATERIAL' ? 'Học liệu giảng viên' : 'Sinh viên bổ sung'} ·{' '}
            {materialTypes[row.materialType]} · Người gửi: {row.submitter.name}
          </p>
          <p>
            Phiên bản {row.versionNo} · Lần lưu gửi {row.submittedRevision} · Hiện tại{' '}
            {row.versionRevision}
          </p>
          <p>
            <strong>{requestStatuses[row.status]}</strong> · PDF:{' '}
            {row.fileState === 'SAFE'
              ? 'Đã qua kiểm tra kỹ thuật'
              : row.fileState === 'FAILED'
                ? 'Không đạt kiểm tra'
                : row.fileState === 'CHECKING'
                  ? 'Đang kiểm tra'
                  : 'Chưa có'}{' '}
            · {row.visibility === 'HIDDEN' ? 'Đang ẩn' : 'Hiển thị khi đủ quyền đọc'}
          </p>
          <p className="field-hint">
            Gửi {new Date(row.submittedAt).toLocaleString('vi-VN')}
            {row.resolvedAt
              ? ` · Kết thúc ${new Date(row.resolvedAt).toLocaleString('vi-VN')} · ${row.resolvedBy ?? ''}`
              : ''}
          </p>
          {row.currentVersionId === row.versionId && (
            <p className="user-success">
              Bản hiện hành.{' '}
              {row.visibility === 'HIDDEN'
                ? 'Tài liệu vẫn đang ẩn.'
                : 'Kho học liệu và trình đọc sẽ được mở ở bước tiếp theo.'}
            </p>
          )}
          {!row.snapshotMatches && (
            <p className="form-error">
              Phiên bản đã thay đổi sau lần gửi này. Thông tin dưới đây là hiện tại; không dùng như
              snapshot đã gửi. Không mở PDF hoặc quyết định trên lượt cũ.
            </p>
          )}
          <dl className="moderation-metadata">
            <dt>Tác giả</dt>
            <dd>{row.authors || 'Chưa ghi'}</dd>
            <dt>Mô tả</dt>
            <dd>{row.description || 'Chưa ghi'}</dd>
            <dt>Nguồn tài liệu</dt>
            <dd>{row.sourceReference}</dd>
            <dt>Căn cứ quyền sử dụng</dt>
            <dd>{row.rightsBasis}</dd>
            <dt>Hạn căn cứ quyền</dt>
            <dd>
              {row.rightsValidUntil
                ? new Date(row.rightsValidUntil).toLocaleString('vi-VN')
                : 'Chưa ghi hạn; cần đối chiếu căn cứ, không tự chứng minh quyền vô thời hạn.'}
            </dd>
            <dt>Đề nghị tải file gốc</dt>
            <dd>{row.downloadAllowed ? 'Có; chỉ áp dụng khi đủ quyền đọc' : 'Không'}</dd>
            <dt>Môn liên quan</dt>
            <dd>
              <ul className="draft-course-summary">
                {row.courses.map((c) => (
                  <li key={c.id}>
                    {c.code} · {c.name}
                    {c.active ? '' : ' (đã ngừng)'}
                  </li>
                ))}
              </ul>
            </dd>
            <dt>PDF</dt>
            <dd>
              {row.pdf
                ? `${row.pdf.name} · ${(row.pdf.byteSize / 1024 / 1024).toFixed(2)} MiB · ${row.pdf.pageCount ?? '?'} trang`
                : 'Chưa có'}
            </dd>
          </dl>
          {row.snapshotMatches && row.fileState === 'SAFE' && (
            <a
              className="secondary-button"
              target="_blank"
              rel="noopener noreferrer"
              href={`/api/v1/admin/publication-requests/${row.id}/pdf`}
            >
              Mở PDF để kiểm duyệt<span className="sr-only"> (tab mới)</span>
            </a>
          )}
          {row.reason && <p className="publication-reason">Lý do quyết định: {row.reason}</p>}
          {canDecide && (
            <div className="draft-pdf">
              <h3>Ghi quyết định</h3>
              <p className="field-hint">
                Duyệt sẽ khóa phiên bản và đặt làm bản hiện hành. Không thay quyền tải hoặc mở lại
                tài liệu đang ẩn. Reader chưa được mở ở mốc này.
              </p>
              <fieldset className="draft-fields" disabled={pending || uncertain}>
                <legend className="sr-only">Quyết định kiểm duyệt</legend>
                <div className="form-field">
                  <label htmlFor="decision-outcome">Quyết định</label>
                  <select
                    id="decision-outcome"
                    value={outcome}
                    onChange={(e) => {
                      setOutcome(e.target.value as Outcome | '');
                      setConfirm(false);
                      setRights(false);
                    }}
                  >
                    <option value="">Chọn quyết định</option>
                    <option value="CHANGES_REQUIRED">Yêu cầu sửa</option>
                    <option value="REJECTED">Từ chối</option>
                    <option value="APPROVED">Duyệt và đặt bản hiện hành</option>
                  </select>
                </div>
                <div className="form-field">
                  <label htmlFor="decision-reason">Lý do quyết định</label>
                  <textarea
                    id="decision-reason"
                    value={reason}
                    maxLength={1000}
                    onChange={(e) => {
                      setReason(e.target.value);
                      setConfirm(false);
                    }}
                    aria-describedby="decision-reason-hint"
                  />
                  <p id="decision-reason-hint" className="field-hint">
                    Bắt buộc, tối đa 1.000 ký tự. Người gửi sẽ thấy lý do trong lịch sử.
                  </p>
                </div>
                {outcome === 'APPROVED' && (
                  <label className="moderation-confirm-rights">
                    <input
                      type="checkbox"
                      checked={rights}
                      onChange={(e) => {
                        setRights(e.target.checked);
                        setConfirm(false);
                      }}
                    />
                    Đã kiểm tra nội dung và căn cứ quyền sử dụng
                  </label>
                )}
              </fieldset>
              <button
                type="button"
                className="primary-button"
                disabled={
                  pending ||
                  uncertain ||
                  !reason.trim() ||
                  !outcome ||
                  (outcome === 'APPROVED' && !rights)
                }
                onClick={() => {
                  setConfirm(true);
                  requestAnimationFrame(() => confirmation.current?.focus());
                }}
              >
                Xác nhận quyết định
              </button>
              {confirm && (
                <div
                  role="group"
                  aria-label="Xác nhận quyết định kiểm duyệt"
                  className="draft-discard"
                  ref={confirmation}
                  tabIndex={-1}
                >
                  <p>
                    {outcome === 'APPROVED'
                      ? 'Duyệt và đặt bản hiện hành'
                      : outcome
                        ? requestStatuses[outcome]
                        : ''}{' '}
                    phiên bản {row.versionNo}, lần lưu gửi {row.submittedRevision}? Quyết định sẽ
                    được lưu vào lịch sử.
                  </p>
                  <div className="user-form-actions">
                    <button
                      className="primary-button"
                      disabled={pending || uncertain}
                      onClick={() => void save()}
                    >
                      Lưu quyết định
                    </button>
                    <button
                      className="secondary-button"
                      disabled={pending}
                      onClick={() => setConfirm(false)}
                    >
                      Quay lại
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
          {pending && <p role="status">Đang xử lý yêu cầu…</p>}
          <div className="user-form-actions">
            <button className="text-button" disabled={pending} onClick={() => void refresh()}>
              Tải trạng thái yêu cầu
            </button>
          </div>
        </>
      )}
      {leaving && (
        <div className="draft-discard" role="group" aria-label="Xác nhận bỏ quyết định chưa lưu">
          <p>
            Lý do và lựa chọn chưa lưu sẽ bị bỏ. Nếu vừa mất kết nối, hãy tải trạng thái để kiểm tra
            kết quả.
          </p>
          <div className="user-form-actions">
            <button className="secondary-button" onClick={() => setLeaving(null)}>
              Tiếp tục kiểm duyệt
            </button>
            <button
              className="secondary-button"
              onClick={() => {
                leaveAllowed.current = true;
                retainedDecision = null;
                if (typeof leaving.destination === 'string')
                  window.location.assign(leaving.destination);
                else if (leaving.destination) leaving.destination.click();
                else close();
              }}
            >
              Bỏ thay đổi
            </button>
          </div>
        </div>
      )}
      <div className="user-form-actions">
        <button
          className="secondary-button"
          disabled={pending}
          onClick={() => (dirty ? setLeaving({ destination: null }) : close())}
        >
          Đóng yêu cầu
        </button>
      </div>
    </section>
  );
}
