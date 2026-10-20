'use client';
import { useEffect, useRef, useState } from 'react';
import { ApiError } from '../../lib/auth';
import {
  actOnReport,
  adminReport,
  adminReports,
  reportCategories,
  reportError,
  reportStatuses,
  type AdminReportDetail,
  type AdminReportList,
  type ReportStatus,
} from '../../lib/reports';
import { useReturnFocus } from '../../lib/use-return-focus';
import { useNotesLeaveGuard } from '../library/use-notes-leave-guard';

const actionLabels = {
  TAKE_REVIEW: 'Nhận xem xét',
  RESOLVE: 'Đã xử lý',
  DISMISS: 'Không cần xử lý',
} as const;

export function ReportManagement() {
  const [status, setStatus] = useState<ReportStatus | ''>('OPEN'),
    [search, setSearch] = useState(''),
    [applied, setApplied] = useState(''),
    [page, setPage] = useState(1),
    [attempt, setAttempt] = useState(0);
  const [list, setList] = useState<AdminReportList | null>(null),
    [listError, setListError] = useState('');
  const [selected, setSelected] = useState<AdminReportDetail | null>(null);
  const returnFocus = useReturnFocus();
  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ page: String(page), limit: '20' });
    if (status) params.set('status', status);
    if (applied) params.set('search', applied);
    adminReports(params, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) {
          setList(result);
          setListError('');
        }
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        if (error instanceof ApiError && error.status === 401) window.location.replace('/login');
        else setListError(reportError(error));
      });
    return () => controller.abort();
  }, [status, applied, page, attempt]);
  async function open(id: string) {
    returnFocus.remember();
    try {
      setSelected(await adminReport(id));
    } catch (error) {
      setListError(reportError(error));
    }
  }
  function close() {
    setSelected(null);
    returnFocus.restore();
  }
  const pages = list ? Math.max(1, Math.ceil(list.total / list.limit)) : 1;
  return (
    <div className="users-management">
      <section className="users-directory" aria-labelledby="reports-title">
        <h2 id="reports-title">Báo cáo từ người đọc</h2>
        <p className="field-hint">
          Báo cáo không tự ẩn tài liệu. Kết quả bạn ghi sẽ hiện cho người báo cáo trong trình đọc.
        </p>
        <form
          className="users-filters"
          onSubmit={(event) => {
            event.preventDefault();
            setList(null);
            setPage(1);
            setApplied(search.trim());
          }}
        >
          <div className="form-field">
            <label htmlFor="report-search">Tìm theo tiêu đề tài liệu</label>
            <input
              id="report-search"
              type="search"
              maxLength={200}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="form-field">
            <label htmlFor="report-status">Trạng thái</label>
            <select
              id="report-status"
              value={status}
              onChange={(e) => {
                setList(null);
                setPage(1);
                setStatus(e.target.value as ReportStatus | '');
              }}
            >
              <option value="">Tất cả trạng thái</option>
              {Object.entries(reportStatuses).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <button className="secondary-button" type="submit">
            Áp dụng
          </button>
        </form>
        {listError && (
          <div role="alert" className="users-list-message">
            <p>{listError}</p>
            <button
              className="secondary-button"
              type="button"
              onClick={() => {
                setListError('');
                setAttempt((n) => n + 1);
              }}
            >
              Tải lại báo cáo
            </button>
          </div>
        )}
        {!list && !listError && (
          <p role="status" className="users-list-message">
            Đang tải báo cáo…
          </p>
        )}
        {list && (
          <>
            <p className="users-result-summary">
              {list.total} báo cáo · Trang {list.page}/{pages} · Cũ nhất ở trên
            </p>
            {!list.items.length ? (
              <p className="users-list-message">Không có báo cáo ở trạng thái này.</p>
            ) : (
              <table className="users-table">
                <caption className="sr-only">Báo cáo theo trạng thái đang lọc</caption>
                <thead>
                  <tr>
                    <th scope="col">Tài liệu</th>
                    <th scope="col">Vấn đề</th>
                    <th scope="col">Trạng thái</th>
                    <th scope="col">Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {list.items.map((report) => (
                    <tr key={report.id}>
                      <td className="user-identity">
                        <strong>{report.title}</strong>
                        <span>
                          Phiên bản {report.versionNo} · {report.reporter.displayName}
                        </span>
                      </td>
                      <td>{reportCategories[report.category]}</td>
                      <td>{reportStatuses[report.status]}</td>
                      <td>
                        <button
                          type="button"
                          className="text-button"
                          aria-label={`Xem báo cáo ${report.id}`}
                          onClick={() => void open(report.id)}
                        >
                          Xem
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <nav className="users-pagination" aria-label="Phân trang báo cáo">
              <button
                className="secondary-button"
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((n) => n - 1)}
              >
                Trang trước
              </button>
              <button
                className="secondary-button"
                type="button"
                disabled={page >= pages}
                onClick={() => setPage((n) => n + 1)}
              >
                Trang sau
              </button>
            </nav>
          </>
        )}
      </section>
      {selected && (
        <ReportDetail
          key={selected.id}
          report={selected}
          onChanged={(next) => {
            setSelected(next);
            setAttempt((n) => n + 1);
          }}
          onClose={close}
        />
      )}
    </div>
  );
}

function ReportDetail({
  report,
  onChanged,
  onClose,
}: {
  report: AdminReportDetail;
  onChanged: (report: AdminReportDetail) => void;
  onClose: () => void;
}) {
  const [result, setResult] = useState(''),
    [hide, setHide] = useState(false),
    [hideReason, setHideReason] = useState('');
  const [pending, setPending] = useState(false),
    [error, setError] = useState('');
  const heading = useRef<HTMLHeadingElement>(null);
  const closed = report.status === 'RESOLVED' || report.status === 'DISMISSED';
  useNotesLeaveGuard(
    Boolean(result.trim() || hideReason.trim()),
    pending,
    'Bạn có kết quả xử lý chưa lưu. Rời trang và bỏ nội dung này?',
  );
  useEffect(() => {
    heading.current?.focus();
  }, []);
  async function run(action: 'TAKE_REVIEW' | 'RESOLVE' | 'DISMISS') {
    if (pending) return;
    if (action !== 'TAKE_REVIEW' && !result.trim())
      return setError('Ghi kết quả gửi người báo cáo trước khi đóng báo cáo.');
    if (action === 'RESOLVE' && hide && !hideReason.trim())
      return setError('Ghi lý do ẩn tài liệu.');
    setPending(true);
    setError('');
    try {
      const next = await actOnReport(report.id, {
        action,
        revision: report.revision,
        ...(action === 'TAKE_REVIEW' ? {} : { result: result.trim() }),
        ...(action === 'RESOLVE' && hide
          ? {
              hide: true,
              hideReason: hideReason.trim(),
              documentRevision: report.document.revision,
            }
          : {}),
      });
      setResult('');
      setHide(false);
      setHideReason('');
      onChanged(next);
    } catch (failure) {
      setError(reportError(failure));
    } finally {
      setPending(false);
    }
  }
  return (
    <section className="user-editor" aria-labelledby="report-detail-title">
      <h2 id="report-detail-title" tabIndex={-1} ref={heading}>
        Báo cáo · {report.title}
      </h2>
      <p className="confirmation-identity">
        Phiên bản {report.versionNo} · {reportCategories[report.category]} ·{' '}
        {reportStatuses[report.status]}
        <br />
        {report.reporter.displayName} ({report.reporter.email}) ·{' '}
        {new Date(report.createdAt).toLocaleString('vi-VN')}
      </p>
      <p className="note-content">{report.description}</p>
      <p className="field-hint">
        Tài liệu đang {report.document.visibility === 'HIDDEN' ? 'bị ẩn' : 'hiển thị'}.{' '}
        <a href={`/workspace/library/versions/${report.versionId}`}>Mở phiên bản được báo cáo</a>
      </p>
      {!!report.actions.length && (
        <ol className="report-list" aria-label="Lịch sử xử lý">
          {report.actions.map((a) => (
            <li key={a.id}>
              <strong>{actionLabels[a.action]}</strong> · {a.performedBy} ·{' '}
              {new Date(a.createdAt).toLocaleString('vi-VN')}
              <p className="field-hint">{a.result}</p>
              {a.hiddenReason && <p className="field-hint">Đã ẩn tài liệu: {a.hiddenReason}</p>}
            </li>
          ))}
        </ol>
      )}
      {!closed && (
        <div className="user-fields">
          <label htmlFor="report-result">Kết quả gửi người báo cáo</label>
          <textarea
            id="report-result"
            rows={3}
            maxLength={2000}
            value={result}
            readOnly={pending}
            onChange={(e) => setResult(e.target.value)}
          />
          {report.document.visibility === 'VISIBLE' && (
            <label className="eligibility-check">
              <input
                type="checkbox"
                checked={hide}
                disabled={pending}
                onChange={(e) => setHide(e.target.checked)}
              />{' '}
              <span>Ẩn toàn bộ tài liệu khi đánh dấu đã xử lý</span>
            </label>
          )}
          {hide && (
            <>
              <label htmlFor="report-hide-reason">Lý do ẩn tài liệu</label>
              <input
                id="report-hide-reason"
                maxLength={1000}
                value={hideReason}
                readOnly={pending}
                onChange={(e) => setHideReason(e.target.value)}
              />
            </>
          )}
        </div>
      )}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <div className="user-form-actions">
        {report.status === 'OPEN' && (
          <button
            type="button"
            className="secondary-button"
            disabled={pending}
            onClick={() => void run('TAKE_REVIEW')}
          >
            Nhận xem xét
          </button>
        )}
        {!closed && (
          <>
            <button
              type="button"
              className="primary-button"
              disabled={pending}
              onClick={() => void run('RESOLVE')}
            >
              {hide ? 'Đã xử lý và ẩn tài liệu' : 'Đánh dấu đã xử lý'}
            </button>
            <button
              type="button"
              className="secondary-button"
              disabled={pending || hide}
              onClick={() => void run('DISMISS')}
            >
              Không cần xử lý
            </button>
          </>
        )}
        <button type="button" className="secondary-button" disabled={pending} onClick={onClose}>
          Đóng báo cáo
        </button>
      </div>
    </section>
  );
}
