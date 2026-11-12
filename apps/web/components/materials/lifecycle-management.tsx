'use client';
import { useState } from 'react';
import { lifecycleError, managedMaterials } from '../../lib/lifecycle';
import { useApiResource } from '../../lib/use-api-resource';
import { publicationLabel } from '../../lib/materials';
import { LifecycleDetail } from './lifecycle-detail';
export function LifecycleManagement() {
  const [search, setSearch] = useState(''),
    [visibility, setVisibility] = useState('');
  const [query, setQuery] = useState({ search: '', visibility: '', page: 1 }),
    [selected, setSelected] = useState<string | null>(null);
  const { data, error, reload } = useApiResource(
    JSON.stringify(query),
    (signal) =>
      managedMaterials(
        new URLSearchParams({ ...query, page: String(query.page), limit: '20' }),
        signal,
      ),
    lifecycleError,
  );
  return (
    <div className="users-management materials-management">
      <p className="users-guidance">
        Quản lý hiển thị toàn tài liệu. Kiểm duyệt từng phiên bản nằm ở Kiểm duyệt học liệu; admin
        không biên soạn thay người đóng góp.
      </p>
      {selected && (
        <LifecycleDetail
          key={selected}
          id={selected}
          close={() => setSelected(null)}
          changed={reload}
        />
      )}
      <section className="users-directory" aria-labelledby="managed-title">
        <h2 id="managed-title">Tài liệu đang quản lý</h2>
        <form
          className="users-filters"
          onSubmit={(e) => {
            e.preventDefault();
            setQuery({ search: search.trim(), visibility, page: 1 });
            // Searching again for the same thing still refreshes the list.
            reload();
          }}
        >
          <div className="form-field">
            <label htmlFor="managed-search">Tìm tài liệu quản lý</label>
            <input
              id="managed-search"
              type="search"
              maxLength={200}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="form-field">
            <label htmlFor="managed-visibility">Hiển thị</label>
            <select
              id="managed-visibility"
              value={visibility}
              onChange={(e) => setVisibility(e.target.value)}
            >
              <option value="">Tất cả</option>
              <option value="VISIBLE">Hiển thị</option>
              <option value="HIDDEN">Đang ẩn</option>
            </select>
          </div>
          <button className="secondary-button">Tìm kiếm</button>
        </form>
        {error ? (
          <div className="users-list-message">
            <p role="alert">{error}</p>
            <button className="secondary-button" onClick={reload}>
              Thử tải tài liệu
            </button>
          </div>
        ) : !data ? (
          <p role="status">Đang tải danh sách…</p>
        ) : (
          <>
            <p className="field-hint">
              {data.total} tài liệu · Trang {data.page}/
              {Math.max(1, Math.ceil(data.total / data.limit))}
            </p>
            {!data.items.length ? (
              <p className="users-list-message">Chưa có tài liệu phù hợp.</p>
            ) : (
              <table className="users-table materials-table">
                <caption className="sr-only">Quản lý học liệu</caption>
                <thead>
                  <tr>
                    <th>Học liệu</th>
                    <th>Người quản lý</th>
                    <th>Hiển thị</th>
                    <th>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((item) => (
                    <tr key={item.id}>
                      <td className="user-identity">
                        <strong>{item.latest.title}</strong>
                        <span>
                          Phiên bản {item.latest.versionNo} · {publicationLabel(item.latest)}
                        </span>
                      </td>
                      <td>{item.manager.name}</td>
                      <td>{item.visibility === 'VISIBLE' ? 'Hiển thị' : 'Đang ẩn'}</td>
                      <td className="user-row-actions">
                        <button
                          className="text-button"
                          disabled={!!selected}
                          aria-label={`Quản lý ${item.latest.title}`}
                          onClick={() => setSelected(item.id)}
                        >
                          Mở quản lý
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
                disabled={query.page <= 1}
                onClick={() => setQuery((q) => ({ ...q, page: q.page - 1 }))}
              >
                Trang trước
              </button>
              <button
                className="secondary-button"
                disabled={query.page * data.limit >= data.total}
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
