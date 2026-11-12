'use client';
import { useRef, useState, type FormEvent } from 'react';
import {
  draftList,
  fileFailedLabel,
  materialError,
  materialTypes,
  publicationLabel,
} from '../../lib/materials';
import { useApiResource } from '../../lib/use-api-resource';
import { MaterialEditor } from './material-editor';
export function MaterialManagement({
  initialDraft,
}: {
  /** From a notification link; the editor loads it through the owner-checked API. */
  initialDraft?: string;
}) {
  const [query, setQuery] = useState({ search: '', page: 1, reviewStatus: '' });
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [editor, setEditor] = useState<{ id?: string } | null>(
    initialDraft ? { id: initialDraft } : null,
  );
  const [notice, setNotice] = useState('');
  const create = useRef<HTMLButtonElement>(null);
  const { data, error, reload, setData } = useApiResource(
    JSON.stringify(query),
    (signal) =>
      draftList(
        new URLSearchParams({
          search: query.search,
          page: String(query.page),
          limit: '20',
          ...(query.reviewStatus ? { reviewStatus: query.reviewStatus } : {}),
        }),
        signal,
      ),
    materialError,
  );
  function close() {
    setEditor(null);
    // Drop the notification's ?draft= so a reload does not reopen the editor.
    if (new URLSearchParams(window.location.search).has('draft'))
      window.history.replaceState(window.history.state, '', window.location.pathname);
    reload();
    requestAnimationFrame(() => create.current?.focus());
  }
  function filter(event: FormEvent) {
    event.preventDefault();
    setQuery({ search: search.trim(), page: 1, reviewStatus: status });
    // Searching again for the same thing still refreshes the list.
    reload();
  }
  return (
    <div className="users-management materials-management">
      <div className="users-toolbar">
        <p className="users-guidance">
          Tài liệu bạn đóng góp cho kho học liệu. Chọn PDF hoặc Word, nhập thông tin rồi lưu. Khi
          bản đọc đã qua kiểm tra, xem trước rồi gửi quản trị viên duyệt; bạn có thể rút về nháp để
          sửa.
        </p>
        <button
          ref={create}
          className="primary-button"
          disabled={!!editor}
          onClick={() => {
            setEditor({});
            setNotice('');
          }}
        >
          Tạo bản nháp
        </button>
      </div>
      {notice && (
        <p role="status" className="user-success">
          {notice}
        </p>
      )}
      {editor && (
        <MaterialEditor
          key={editor.id ?? 'new'}
          id={editor.id}
          close={close}
          updated={(item) =>
            setData((value) =>
              value
                ? { ...value, items: value.items.map((row) => (row.id === item.id ? item : row)) }
                : value,
            )
          }
          saved={() => {
            setNotice('Đã lưu bản nháp. Chưa công bố cho người học.');
            close();
          }}
        />
      )}
      <section className="users-directory" aria-labelledby="draft-list-title">
        <h2 id="draft-list-title">Học liệu và yêu cầu duyệt</h2>
        <form className="users-filters draft-filters" onSubmit={filter}>
          <div className="form-field">
            <label htmlFor="draft-search">Tìm bản nháp</label>
            <input
              id="draft-search"
              type="search"
              maxLength={200}
              placeholder="Tiêu đề học liệu"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="form-field">
            <label htmlFor="material-status">Trạng thái duyệt</label>
            <select
              id="material-status"
              value={status}
              onChange={(event) => setStatus(event.target.value)}
            >
              <option value="">Tất cả trạng thái</option>
              <option value="DRAFT">Bản nháp</option>
              <option value="SUBMITTED">Chờ duyệt</option>
              <option value="CHANGES_REQUIRED">Yêu cầu sửa</option>
              <option value="APPROVED">Đã duyệt</option>
              <option value="REJECTED">Từ chối</option>
            </select>
          </div>
          <div className="draft-filter-actions">
            <button className="secondary-button">Tìm kiếm</button>
            {/* Only when there is something to clear: typed, chosen or applied. */}
            {(search || status || query.search || query.reviewStatus) && (
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  setSearch('');
                  setStatus('');
                  setQuery({ search: '', page: 1, reviewStatus: '' });
                  reload();
                }}
              >
                Xóa tìm kiếm
              </button>
            )}
          </div>
        </form>
        {error ? (
          <div className="users-list-message">
            <p role="alert" className="form-error">
              {error}
            </p>
            <button className="secondary-button" onClick={reload}>
              Thử tải bản nháp
            </button>
          </div>
        ) : !data ? (
          <p className="users-list-message" role="status">
            Đang tải bản nháp…
          </p>
        ) : (
          <>
            <p className="field-hint">
              {data.total} học liệu · Trang {data.page}/
              {Math.max(1, Math.ceil(data.total / data.limit))}
            </p>
            {data.items.length === 0 ? (
              <p className="users-list-message">
                Chưa có bản nháp phù hợp. Tạo bản nháp hoặc thay đổi tìm kiếm.
              </p>
            ) : (
              <table className="users-table materials-table">
                <caption className="sr-only">Bản nháp học liệu của bạn</caption>
                <thead>
                  <tr>
                    <th scope="col">Học liệu</th>
                    <th scope="col">Môn liên quan</th>
                    <th scope="col">Trạng thái</th>
                    <th scope="col">Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((item) => (
                    <tr key={item.id}>
                      <td className="user-identity">
                        <strong>{item.title}</strong>
                        <span>{materialTypes[item.materialType]}</span>
                        <span>Cập nhật {new Date(item.updatedAt).toLocaleString('vi-VN')}</span>
                      </td>
                      <td>
                        <ul className="draft-course-summary">
                          {item.courses.map((c) => (
                            <li key={c.id}>
                              {c.code} · {c.name}
                              {c.active ? '' : ' (đã ngừng)'}
                            </li>
                          ))}
                        </ul>
                      </td>
                      <td>
                        <span className="user-status user-status-pending">
                          {publicationLabel(item)}
                        </span>
                        <p className="field-hint">
                          {item.source && item.source.conversionState !== 'READY'
                            ? {
                                QUEUED: 'Word đang chờ chuyển PDF',
                                RUNNING: 'Word đang tạo bản đọc PDF',
                                FAILED: 'Word chưa tạo được bản đọc',
                                CANCELLED: 'Nguồn Word đã dừng xử lý',
                              }[item.source.conversionState]
                            : item.fileState === 'MISSING'
                              ? 'Chưa có PDF'
                              : item.fileState === 'CHECKING'
                                ? 'PDF đang kiểm tra'
                                : item.fileState === 'FAILED'
                                  ? fileFailedLabel(item.fileError)
                                  : 'PDF đã kiểm tra'}
                        </p>
                      </td>
                      <td className="user-row-actions">
                        <button
                          className="text-button"
                          disabled={!!editor}
                          aria-label={`Mở bản nháp ${item.title}`}
                          onClick={() => {
                            setEditor({ id: item.id });
                            setNotice('');
                          }}
                        >
                          {item.editable ? 'Mở và sửa' : 'Xem thông tin'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div className="users-pagination">
              <button
                className="secondary-button"
                disabled={data.page <= 1}
                onClick={() => setQuery((q) => ({ ...q, page: q.page - 1 }))}
              >
                Trang trước
              </button>
              <button
                className="secondary-button"
                disabled={data.page * data.limit >= data.total}
                onClick={() => setQuery((q) => ({ ...q, page: q.page + 1 }))}
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
