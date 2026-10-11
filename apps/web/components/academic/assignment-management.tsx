'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ApiError } from '../../lib/auth';
import { academicError } from '../../lib/academic';
import {
  listAssignments,
  saveAssignment,
  type Assignment,
  type AssignmentList,
} from '../../lib/assignments';
import { CatalogPicker, type CatalogChoice } from './catalog-picker';
import { LecturerPicker } from './lecturer-picker';

const date = (value: string) => new Date(value).toLocaleString('vi-VN');
export function AssignmentManagement({ own = false }: { own?: boolean }) {
  const [query, setQuery] = useState({ search: '', status: '', page: 1 });
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [data, setData] = useState<AssignmentList | null>(null);
  const [error, setError] = useState('');
  const [editor, setEditor] = useState<{ assignment?: Assignment } | null>(null);
  const [notice, setNotice] = useState('');
  const createButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setData(null);
      setError('');
      const params = new URLSearchParams({ page: String(query.page), limit: '20' });
      if (query.search) params.set('search', query.search);
      if (query.status) params.set('status', query.status);
      try {
        const result = await listAssignments(own, params, controller.signal);
        if (!controller.signal.aborted) setData(result);
      } catch (error) {
        if (!controller.signal.aborted) setError(academicError(error));
      }
    }
    void load();
    return () => controller.abort();
  }, [own, query, attempt]);
  function close() {
    setEditor(null);
    setAttempt((v) => v + 1);
    requestAnimationFrame(() => createButton.current?.focus());
  }
  function saved() {
    setNotice(
      editor?.assignment ? 'Đã thu hồi phân công và lưu lịch sử.' : 'Đã phân công giảng viên.',
    );
    close();
  }
  return (
    <div className="users-management">
      <div className="users-toolbar">
        <p className="users-guidance">
          {own
            ? 'Các môn bạn được phân công và lịch sử thu hồi. Luồng biên soạn học liệu sẽ được bổ sung ở bước tiếp theo.'
            : 'Phân công giảng viên đã xác minh cho môn đang hoạt động. Thu hồi giữ lại lịch sử; phân công lại tạo một bản ghi mới.'}
        </p>
        {!own && (
          <button
            ref={createButton}
            className="primary-button"
            disabled={!!editor}
            onClick={() => {
              setEditor({});
              setNotice('');
            }}
          >
            Phân công giảng viên
          </button>
        )}
      </div>
      <p role="status" className={notice ? 'user-success' : 'sr-only'}>
        {notice}
      </p>
      {editor && (
        <AssignmentForm
          key={editor.assignment?.id ?? 'new'}
          assignment={editor.assignment}
          onClose={close}
          onSaved={saved}
        />
      )}
      <section className="users-directory" aria-labelledby="assignment-list-title">
        <h2 id="assignment-list-title">Danh sách phân công</h2>
        <form
          className="users-filters catalog-filters"
          onSubmit={(e) => {
            e.preventDefault();
            setQuery({ search: search.trim(), status, page: 1 });
          }}
        >
          <div className="form-field">
            <label htmlFor="assignment-search">Tìm phân công</label>
            <input
              id="assignment-search"
              type="search"
              maxLength={200}
              placeholder={own ? 'Mã hoặc tên môn' : 'Môn, giảng viên hoặc email'}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="form-field">
            <label htmlFor="assignment-status">Trạng thái phân công</label>
            <select
              id="assignment-status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="">Tất cả trạng thái</option>
              <option value="ACTIVE">Hiện hành</option>
              <option value="REVOKED">Đã thu hồi</option>
            </select>
          </div>
          <button className="secondary-button">Áp dụng</button>
          <button
            className="text-button"
            type="button"
            onClick={() => {
              setSearch('');
              setStatus('');
              setQuery({ search: '', status: '', page: 1 });
            }}
          >
            Xóa bộ lọc
          </button>
        </form>
        {error ? (
          <div className="users-list-message">
            <p role="alert">Chưa tải được phân công. {error}</p>
            <button className="secondary-button" onClick={() => setAttempt((v) => v + 1)}>
              Tải lại danh sách
            </button>
          </div>
        ) : !data ? (
          <p className="users-list-message" role="status">
            Đang tải phân công…
          </p>
        ) : (
          <>
            <p className="users-result-summary">
              {data.total} phân công · Trang {query.page}/
              {Math.max(1, Math.ceil(data.total / data.limit))}
            </p>
            {!data.items.length ? (
              <p className="users-list-message">
                Chưa có phân công phù hợp.
                {own
                  ? ' Liên hệ quản trị viên nếu bạn cần được phân công môn.'
                  : ' Tạo phân công hoặc thay đổi bộ lọc.'}
              </p>
            ) : (
              <table className="users-table assignment-table">
                <caption className="sr-only">Danh sách phân công giảng viên</caption>
                <thead>
                  <tr>
                    <th scope="col">Môn học</th>
                    {!own && <th scope="col">Giảng viên</th>}
                    <th scope="col">Trạng thái và thời điểm</th>
                    {!own && <th scope="col">Thao tác</th>}
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((item) => (
                    <tr key={item.id}>
                      <td className="user-identity">
                        <strong>{item.courseName}</strong>
                        <span>
                          {item.courseCode} · {item.facultyName}
                        </span>
                        {!item.courseActive && <span>Môn/khoa đã ngừng sử dụng</span>}
                      </td>
                      {!own && (
                        <td className="user-identity">
                          <strong>{item.lecturerName}</strong>
                          <span>{item.lecturerEmail}</span>
                          {!item.lecturerActive && <span>Tài khoản không còn hoạt động</span>}
                        </td>
                      )}
                      <td className="assignment-history">
                        <span
                          className={`user-status user-status-${item.revokedAt ? 'pending' : 'active'}`}
                        >
                          {item.revokedAt ? 'Đã thu hồi' : 'Hiện hành'}
                        </span>
                        <p>Cấp: {date(item.assignedAt)}</p>
                        {item.revokedAt && (
                          <>
                            <p>Thu hồi: {date(item.revokedAt)}</p>
                            <p>Lý do: {item.reason}</p>
                          </>
                        )}
                      </td>
                      {!own && (
                        <td className="user-row-actions">
                          {item.revokedAt ? (
                            'Đã lưu lịch sử'
                          ) : (
                            <button
                              className="text-button"
                              disabled={!!editor}
                              aria-label={`Thu hồi ${item.courseCode} của ${item.lecturerEmail}`}
                              onClick={() => {
                                setNotice('');
                                setEditor({ assignment: item });
                              }}
                            >
                              Thu hồi
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div className="users-pagination">
              <button
                className="secondary-button"
                disabled={query.page <= 1}
                onClick={() => setQuery({ ...query, page: query.page - 1 })}
              >
                Trang trước
              </button>
              <button
                className="secondary-button"
                disabled={query.page * data.limit >= data.total}
                onClick={() => setQuery({ ...query, page: query.page + 1 })}
              >
                Trang sau
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function AssignmentForm({
  assignment,
  onClose,
  onSaved,
}: {
  assignment?: Assignment;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [lecturer, setLecturer] = useState<CatalogChoice | null>(null);
  const [course, setCourse] = useState<CatalogChoice | null>(null);
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [stale, setStale] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const failure = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, []);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending || stale) return;
    setPending(true);
    setError('');
    try {
      await saveAssignment(
        assignment ? { reason } : { lecturerId: lecturer?.id, courseId: course?.id },
        assignment?.id,
      );
      onSaved();
    } catch (error) {
      setError(academicError(error));
      setStale(error instanceof ApiError && error.code === 'ALREADY_REVOKED');
      requestAnimationFrame(() => failure.current?.focus());
    } finally {
      setPending(false);
    }
  }
  return (
    <section className="user-editor" aria-labelledby="assignment-editor-title">
      <h2 id="assignment-editor-title" ref={heading} tabIndex={-1}>
        {assignment ? 'Thu hồi phân công' : 'Phân công mới'}
      </h2>
      {assignment && (
        <p className="field-hint">
          {assignment.lecturerName} ({assignment.lecturerEmail}) — {assignment.courseCode}:{' '}
          {assignment.courseName}. Thu hồi chặn sửa/gửi/duyệt học liệu mới khi luồng học liệu được
          triển khai; không tự chuyển chủ, xóa file hoặc gỡ bản đã công bố.
        </p>
      )}
      <form onSubmit={submit} aria-busy={pending}>
        {error && (
          <p ref={failure} role="alert" tabIndex={-1} className="form-error">
            {error}
          </p>
        )}
        <fieldset className="user-fields" disabled={pending}>
          <legend className="sr-only">Thông tin phân công</legend>
          {assignment ? (
            <div className="form-field">
              <label htmlFor="revoke-reason">Lý do thu hồi</label>
              <textarea
                id="revoke-reason"
                required
                maxLength={1000}
                rows={4}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
          ) : (
            <>
              <LecturerPicker value={lecturer} onChange={setLecturer} />
              <CatalogPicker
                kind="courses"
                label="Môn học được phân công"
                value={course}
                onChange={setCourse}
              />
            </>
          )}
        </fieldset>
        <div className="user-form-actions">
          <button
            className={assignment ? 'danger-button' : 'primary-button'}
            disabled={pending || stale}
          >
            {pending ? 'Đang lưu…' : assignment ? 'Xác nhận thu hồi' : 'Lưu phân công'}
          </button>
          <button type="button" className="secondary-button" disabled={pending} onClick={onClose}>
            {stale ? 'Đóng để tải lại danh sách' : 'Hủy'}
          </button>
        </div>
      </form>
    </section>
  );
}
