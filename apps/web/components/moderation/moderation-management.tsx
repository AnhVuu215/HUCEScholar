'use client';
import { useState, type FormEvent } from 'react';
import { reviewList, reviewError, requestStatuses } from '../../lib/moderation';
import { useApiResource } from '../../lib/use-api-resource';
import { ModerationDetail } from './moderation-detail';
export function ModerationManagement() {
  const [query, setQuery] = useState({ search: '', status: 'PENDING', page: 1 });
  const [search, setSearch] = useState(''),
    [status, setStatus] = useState('PENDING');
  const [selected, setSelected] = useState<string | null>(null);
  const { data, error, reload } = useApiResource(
    JSON.stringify(query),
    (signal) =>
      reviewList(
        new URLSearchParams({
          search: query.search,
          status: query.status,
          page: String(query.page),
          limit: '20',
        }),
        signal,
      ),
    reviewError,
  );
  function filter(event: FormEvent) {
    event.preventDefault();
    setQuery({ search: search.trim(), status, page: 1 });
    // Searching again for the same thing still refreshes the list.
    reload();
  }
  return (
    <div className="users-management">
      <p className="users-guidance">
        Xem nội dung, nguồn và căn cứ quyền trước khi quyết định. PDF qua kiểm tra kỹ thuật chưa
        đồng nghĩa đủ quyền công bố. Duyệt không tự mở lại tài liệu đang ẩn.
      </p>
      {selected && (
        <ModerationDetail
          key={selected}
          id={selected}
          close={() => {
            setSelected(null);
            reload();
          }}
          changed={() => reload()}
        />
      )}
      <section className="users-directory" aria-labelledby="review-list-title">
        <h2 id="review-list-title">Yêu cầu công bố</h2>
        <form className="users-filters" onSubmit={filter}>
          <div className="form-field">
            <label htmlFor="review-search">Tìm yêu cầu</label>
            <input
              id="review-search"
              value={search}
              maxLength={200}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="form-field">
            <label htmlFor="review-status">Trạng thái yêu cầu</label>
            <select id="review-status" value={status} onChange={(e) => setStatus(e.target.value)}>
              {Object.entries(requestStatuses).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <button className="secondary-button">Tìm kiếm</button>
        </form>
        {error ? (
          <div className="users-list-message">
            <p role="alert" className="form-error">
              {error}
            </p>
            <button className="secondary-button" onClick={reload}>
              Thử tải yêu cầu
            </button>
          </div>
        ) : !data ? (
          <p className="users-list-message" role="status">
            Đang tải yêu cầu…
          </p>
        ) : (
          <>
            <p className="field-hint">
              {data.total} yêu cầu · Trang {data.page}/
              {Math.max(1, Math.ceil(data.total / data.limit))}
            </p>
            {!data.items.length ? (
              <p className="users-list-message">
                Chưa có yêu cầu phù hợp. Thay đổi bộ lọc hoặc chờ người biên soạn gửi duyệt.
              </p>
            ) : (
              <table className="users-table materials-table">
                <caption className="sr-only">Danh sách yêu cầu công bố học liệu</caption>
                <thead>
                  <tr>
                    <th scope="col">Học liệu và người gửi</th>
                    <th scope="col">Phiên bản</th>
                    <th scope="col">Trạng thái</th>
                    <th scope="col">Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((row) => (
                    <tr key={row.id}>
                      <td className="user-identity">
                        <strong>{row.title}</strong>
                        <span>{row.submitter.name}</span>
                        <span>Gửi {new Date(row.submittedAt).toLocaleString('vi-VN')}</span>
                      </td>
                      <td>
                        Bản {row.versionNo} · Lần lưu gửi {row.submittedRevision}
                      </td>
                      <td>
                        <span className="user-status user-status-pending">
                          {requestStatuses[row.status]}
                        </span>
                      </td>
                      <td className="user-row-actions">
                        <button
                          className="text-button"
                          disabled={!!selected}
                          aria-label={`Xem yêu cầu ${row.title}`}
                          onClick={() => setSelected(row.id)}
                        >
                          Xem yêu cầu
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
