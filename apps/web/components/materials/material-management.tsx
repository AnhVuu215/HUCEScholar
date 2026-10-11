'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { draftList, materialError, materialTypes, type DraftList } from '../../lib/materials';
import { MaterialEditor } from './material-editor';
export function MaterialManagement({ role }: { role: 'LECTURER' | 'STUDENT' }) {
  const [query, setQuery] = useState({ search: '', page: 1 });
  const [search, setSearch] = useState('');
  const [data, setData] = useState<DraftList | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [editor, setEditor] = useState<{ id?: string } | null>(null);
  const [notice, setNotice] = useState('');
  const create = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const controller = new AbortController();
    void draftList(
      new URLSearchParams({ search: query.search, page: String(query.page), limit: '20' }),
      controller.signal,
    )
      .then((result) => {
        if (!controller.signal.aborted) setData(result);
      })
      .catch((failure) => {
        if (!controller.signal.aborted) setError(materialError(failure));
      });
    return () => controller.abort();
  }, [query, attempt]);
  function reload() {
    setError('');
    setData(null);
    setAttempt((v) => v + 1);
  }
  function close() {
    setEditor(null);
    reload();
    requestAnimationFrame(() => create.current?.focus());
  }
  function filter(event: FormEvent) {
    event.preventDefault();
    setError('');
    setData(null);
    setQuery({ search: search.trim(), page: 1 });
  }
  return (
    <div className="users-management materials-management">
      <div className="users-toolbar">
        <p className="users-guidance">
          {role === 'LECTURER'
            ? 'Bản nháp học liệu cho các môn bạn phụ trách.'
            : 'Tài liệu bổ sung của bạn, tách biệt với giáo trình giảng viên.'}{' '}
          Lưu thông tin, mở lại bản nháp rồi đính kèm PDF để kiểm tra. Gửi duyệt chưa được mở.
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
        <h2 id="draft-list-title">Bản nháp của tôi</h2>
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
          <button className="secondary-button">Tìm kiếm</button>
          <button
            type="button"
            className="text-button"
            onClick={() => {
              setSearch('');
              setQuery({ search: '', page: 1 });
              setError('');
              setData(null);
            }}
          >
            Xóa tìm kiếm
          </button>
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
              {data.total} bản nháp · Trang {data.page}/
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
                        <span>
                          {item.kind === 'LECTURER_MATERIAL'
                            ? 'Học liệu giảng viên'
                            : 'Sinh viên bổ sung'}{' '}
                          · {materialTypes[item.materialType]}
                        </span>
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
                        <span className="user-status user-status-pending">Bản nháp</span>
                        <p className="field-hint">
                          {item.fileState === 'MISSING'
                            ? 'Chưa có PDF'
                            : item.fileState === 'CHECKING'
                              ? 'PDF đang kiểm tra'
                              : item.fileState === 'FAILED'
                                ? 'PDF không đạt kiểm tra'
                                : 'PDF đã kiểm tra'}
                        </p>
                        {!item.editable && <p className="field-hint">Cần kiểm tra phân công</p>}
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
                onClick={() => {
                  setData(null);
                  setQuery((v) => ({ ...v, page: v.page - 1 }));
                }}
              >
                Trang trước
              </button>
              <button
                className="secondary-button"
                disabled={data.page * data.limit >= data.total}
                onClick={() => {
                  setData(null);
                  setQuery((v) => ({ ...v, page: v.page + 1 }));
                }}
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
