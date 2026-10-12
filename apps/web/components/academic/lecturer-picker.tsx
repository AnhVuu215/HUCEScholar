'use client';
import { useEffect, useState } from 'react';
import { listUsers } from '../../lib/users';
import { academicError } from '../../lib/academic';
import type { CatalogChoice } from './catalog-picker';
export function LecturerPicker({
  value,
  onChange,
}: {
  value: CatalogChoice | null;
  onChange: (value: CatalogChoice | null) => void;
}) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [attempt, setAttempt] = useState(0);
  const [items, setItems] = useState<CatalogChoice[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  function reset() {
    setLoading(true);
    setError('');
    setItems([]);
  }
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void listUsers(
        { search: search.trim(), page, role: 'LECTURER', status: 'ACTIVE' },
        controller.signal,
      )
        .then((data) => {
          if (!controller.signal.aborted) {
            setItems(
              data.items
                .filter((user) => user.verifiedAt !== null)
                .map((user) => ({ id: user.id, label: `${user.displayName} · ${user.email}` })),
            );
            setTotal(data.total);
            setLoading(false);
          }
        })
        .catch((error) => {
          if (!controller.signal.aborted) {
            setError(academicError(error));
            setLoading(false);
          }
        });
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [search, page, attempt]);
  return (
    <div className="form-field catalog-picker">
      <label htmlFor="lecturer-search">Tìm giảng viên</label>
      <input
        id="lecturer-search"
        type="search"
        maxLength={200}
        placeholder="Họ tên hoặc email"
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setPage(1);
          reset();
        }}
      />
      <label htmlFor="assignment-lecturer">Giảng viên phụ trách</label>
      <select
        id="assignment-lecturer"
        required
        aria-describedby={value ? 'lecturer-selected' : undefined}
        value={value?.id ?? ''}
        onChange={(e) =>
          onChange(
            items.find((item) => item.id === e.target.value) ??
              (e.target.value === value?.id ? value : null),
          )
        }
      >
        <option value="">Chọn giảng viên</option>
        {value && !items.some((item) => item.id === value.id) && (
          <option value={value.id}>{value.label}</option>
        )}
        {items.map((item) => (
          <option key={item.id} value={item.id}>
            {item.label}
          </option>
        ))}
      </select>
      {value && (
        <p id="lecturer-selected" className="field-hint catalog-selected">
          Giảng viên đã chọn: {value.label}
        </p>
      )}
      {loading ? (
        <p role="status" className="field-hint">
          Đang tìm giảng viên…
        </p>
      ) : error ? (
        <>
          <p role="alert" className="form-error">
            {error}
          </p>
          <button
            className="text-button"
            type="button"
            onClick={() => {
              reset();
              setAttempt((v) => v + 1);
            }}
          >
            Thử tải giảng viên
          </button>
        </>
      ) : (
        <p className="field-hint">
          {total} kết quả · Trang {page}/{Math.max(1, Math.ceil(total / 20))}
        </p>
      )}
      <div className="user-form-actions">
        <button
          className="text-button"
          type="button"
          disabled={loading || page === 1}
          onClick={() => {
            reset();
            setPage((v) => v - 1);
          }}
        >
          Giảng viên trước
        </button>
        <button
          className="text-button"
          type="button"
          disabled={loading || page * 20 >= total}
          onClick={() => {
            reset();
            setPage((v) => v + 1);
          }}
        >
          Giảng viên sau
        </button>
      </div>
    </div>
  );
}
