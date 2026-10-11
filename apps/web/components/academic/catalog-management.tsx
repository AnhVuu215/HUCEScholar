'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { ApiError } from '../../lib/auth';
import { CatalogPicker, type CatalogChoice } from './catalog-picker';
import {
  academicError,
  academicWrite,
  catalogLabels,
  catalogList,
  isCatalogItem,
  type CatalogItem,
  type CatalogKind,
  type CatalogList,
} from '../../lib/academic';

export function CatalogManagement({ kind }: { kind: CatalogKind }) {
  const [query, setQuery] = useState({ search: '', status: '', page: 1 });
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [data, setData] = useState<CatalogList | null>(null);
  const [loadError, setLoadError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [editor, setEditor] = useState<{ item?: CatalogItem } | null>(null);
  const [notice, setNotice] = useState('');
  const createButton = useRef<HTMLButtonElement>(null);
  const label = catalogLabels[kind].toLowerCase();
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setData(null);
      setLoadError('');
      try {
        const params = new URLSearchParams({ page: String(query.page), limit: '20' });
        if (query.search) params.set('search', query.search);
        if (query.status) params.set('status', query.status);
        const result = await catalogList(kind, params, controller.signal);
        if (!controller.signal.aborted) setData(result);
      } catch (error) {
        if (!controller.signal.aborted) setLoadError(academicError(error));
      }
    }
    void load();
    return () => controller.abort();
  }, [kind, query, attempt]);
  function close() {
    setEditor(null);
    requestAnimationFrame(() => createButton.current?.focus());
  }
  function reload() {
    close();
    setAttempt((v) => v + 1);
  }
  function apply(event: FormEvent) {
    event.preventDefault();
    setQuery({ search: search.trim(), status, page: 1 });
  }
  return (
    <div className="users-management">
      <nav className="catalog-tabs" aria-label="Danh mục đào tạo">
        {Object.entries(catalogLabels).map(([key, title]) => (
          <Link
            key={key}
            href={`/workspace/admin/catalog/${key}`}
            aria-current={key === kind ? 'page' : undefined}
          >
            {title}
          </Link>
        ))}
      </nav>
      <div className="users-toolbar">
        <p className="users-guidance">
          Quản lý mã, tên và trạng thái {label}. Ngừng sử dụng giữ lại lịch sử và các liên kết đã
          có.
        </p>
        <button
          ref={createButton}
          className="primary-button"
          disabled={!!editor}
          onClick={() => {
            setNotice('');
            setEditor({});
          }}
        >
          Thêm {label}
        </button>
      </div>
      <p role="status" className={notice ? 'user-success' : 'sr-only'}>
        {notice}
      </p>
      {editor && (
        <CatalogForm
          key={editor.item?.id ?? 'new'}
          kind={kind}
          item={editor.item}
          onClose={close}
          onReload={reload}
          onSaved={(item) => {
            setNotice(`Đã lưu ${label} ${item.name}.`);
            reload();
          }}
        />
      )}
      <section className="users-directory" aria-labelledby="catalog-list-title">
        <h2 id="catalog-list-title">Danh sách {label}</h2>
        <form className="users-filters catalog-filters" onSubmit={apply}>
          <div className="form-field">
            <label htmlFor="catalog-search">Tìm {label}</label>
            <input
              id="catalog-search"
              type="search"
              placeholder="Mã hoặc tên"
              maxLength={200}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="form-field">
            <label htmlFor="catalog-status">Trạng thái danh mục</label>
            <select id="catalog-status" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">Tất cả trạng thái</option>
              <option value="ACTIVE">Đang sử dụng</option>
              <option value="INACTIVE">Ngừng sử dụng</option>
            </select>
          </div>
          <button className="secondary-button">Áp dụng</button>
          <button
            type="button"
            className="text-button"
            onClick={() => {
              setSearch('');
              setStatus('');
              setQuery({ search: '', status: '', page: 1 });
            }}
          >
            Xóa bộ lọc
          </button>
        </form>
        {loadError ? (
          <div className="users-list-message">
            <p role="alert">Chưa tải được danh sách. {loadError}</p>
            <button className="secondary-button" onClick={() => setAttempt((v) => v + 1)}>
              Tải lại danh sách
            </button>
          </div>
        ) : !data ? (
          <p role="status" className="users-list-message">
            Đang tải danh mục…
          </p>
        ) : (
          <>
            <p className="users-result-summary">
              {data.total} {label} · Trang {data.page}/
              {Math.max(1, Math.ceil(data.total / data.limit))}
            </p>
            {!data.items.length ? (
              <p className="users-list-message">
                Không tìm thấy {label} phù hợp. Thêm danh mục hoặc thay đổi bộ lọc.
              </p>
            ) : (
              <table className="users-table">
                <caption className="sr-only">Danh sách {label}</caption>
                <thead>
                  <tr>
                    <th scope="col">Mã và tên</th>
                    <th scope="col">Trạng thái</th>
                    <th scope="col">Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((item) => (
                    <tr key={item.id}>
                      <td className="user-identity">
                        <strong>{item.name}</strong>
                        <span>{item.code}</span>
                        {item.facultyName && <span>Khoa: {item.facultyName}</span>}
                      </td>
                      <td>
                        <span
                          className={`user-status user-status-${item.active ? 'active' : 'pending'}`}
                        >
                          {item.active ? 'Đang sử dụng' : 'Ngừng sử dụng'}
                        </span>
                      </td>
                      <td className="user-row-actions">
                        <button
                          className="text-button"
                          disabled={!!editor}
                          aria-label={`Sửa ${item.code}`}
                          onClick={() => {
                            setNotice('');
                            setEditor({ item });
                          }}
                        >
                          Sửa
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

function CatalogForm({
  kind,
  item,
  onClose,
  onReload,
  onSaved,
}: {
  kind: CatalogKind;
  item?: CatalogItem;
  onClose: () => void;
  onReload: () => void;
  onSaved: (item: CatalogItem) => void;
}) {
  const [code, setCode] = useState(item?.code ?? '');
  const [name, setName] = useState(item?.name ?? '');
  const [active, setActive] = useState(item?.active ?? true);
  const [faculty, setFaculty] = useState<CatalogChoice | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [stale, setStale] = useState(false);
  const first = useRef<HTMLInputElement>(null);
  const failure = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    first.current?.focus();
  }, []);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending || stale) return;
    setPending(true);
    setError('');
    try {
      const response = await academicWrite(
        `/admin/catalog/${kind}${item ? `/${item.id}` : ''}`,
        {
          code,
          name,
          ...(item
            ? { active, revision: item.revision }
            : kind !== 'faculties'
              ? { facultyId: faculty?.id }
              : {}),
        },
        item ? 'PATCH' : 'POST',
      );
      const result: unknown = await response.json();
      if (
        !result ||
        typeof result !== 'object' ||
        !('item' in result) ||
        !isCatalogItem(result.item)
      )
        throw new Error('Invalid catalog item.');
      onSaved(result.item);
    } catch (error) {
      setError(academicError(error));
      setStale(error instanceof ApiError && error.code === 'STALE_REVISION');
      requestAnimationFrame(() => failure.current?.focus());
    } finally {
      setPending(false);
    }
  }
  const label = catalogLabels[kind].toLowerCase();
  return (
    <section className="user-editor" aria-labelledby="catalog-editor-title">
      <h2 id="catalog-editor-title">
        {item ? 'Sửa' : 'Thêm'} {label}
      </h2>
      <form onSubmit={submit}>
        {error && (
          <p ref={failure} tabIndex={-1} role="alert" className="form-error">
            {error}
          </p>
        )}
        <fieldset disabled={pending} className="user-fields">
          <legend className="sr-only">Thông tin danh mục</legend>
          {kind !== 'faculties' &&
            (item ? (
              <p className="field-hint">
                Khoa phụ trách: {item.facultyName}. Khoa được giữ cố định sau khi tạo.
              </p>
            ) : (
              <CatalogPicker
                kind="faculties"
                label="Khoa phụ trách"
                value={faculty}
                onChange={setFaculty}
              />
            ))}
          <div className="form-field">
            <label htmlFor="catalog-code">Mã {label}</label>
            <input
              ref={first}
              id="catalog-code"
              required
              maxLength={30}
              pattern="[A-Za-z0-9][A-Za-z0-9._\-]*"
              aria-describedby="catalog-code-help"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
            <p id="catalog-code-help" className="field-hint">
              Tối đa 30 ký tự: chữ không dấu, số, dấu chấm, gạch nối hoặc gạch dưới.
            </p>
          </div>
          <div className="form-field">
            <label htmlFor="catalog-name">Tên {label}</label>
            <input
              id="catalog-name"
              required
              maxLength={200}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          {item && (
            <div className="form-field">
              <label htmlFor="catalog-active">Sử dụng danh mục</label>
              <select
                id="catalog-active"
                value={String(active)}
                onChange={(e) => setActive(e.target.value === 'true')}
              >
                <option value="true">Đang sử dụng</option>
                <option value="false">Ngừng sử dụng</option>
              </select>
            </div>
          )}
        </fieldset>
        <div className="user-form-actions">
          <button className="primary-button" disabled={pending || stale}>
            {pending ? 'Đang lưu…' : 'Lưu danh mục'}
          </button>
          <button type="button" className="secondary-button" disabled={pending} onClick={onClose}>
            Hủy
          </button>
          {stale && (
            <button type="button" className="text-button" onClick={onReload}>
              Bỏ bản sửa và tải lại
            </button>
          )}
        </div>
      </form>
    </section>
  );
}
