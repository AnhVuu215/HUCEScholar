'use client';
import { useEffect, useState } from 'react';
import { academicError, catalogList, type CatalogKind } from '../../lib/academic';

export type CatalogChoice = { id: string; label: string };
export function CatalogPicker({
  kind,
  label,
  value,
  onChange,
}: {
  kind: CatalogKind;
  label: string;
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
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void catalogList(
        kind,
        new URLSearchParams({
          status: 'ACTIVE',
          search: search.trim(),
          page: String(page),
          limit: '20',
        }),
        controller.signal,
      )
        .then((result) => {
          if (!controller.signal.aborted) {
            setItems(
              result.items.map((item) => ({ id: item.id, label: `${item.code} · ${item.name}` })),
            );
            setTotal(result.total);
            setLoading(false);
          }
        })
        .catch((failure) => {
          if (!controller.signal.aborted) {
            setError(academicError(failure));
            setLoading(false);
          }
        });
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [kind, search, page, attempt]);
  const id = `picker-${kind}`;
  function resetResults() {
    setLoading(true);
    setError('');
    setItems([]);
  }
  return (
    <div className="form-field catalog-picker">
      <label htmlFor={`${id}-search`}>Tìm {label.toLowerCase()}</label>
      <input
        id={`${id}-search`}
        type="search"
        maxLength={200}
        placeholder="Mã hoặc tên"
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setPage(1);
          resetResults();
        }}
      />
      <label htmlFor={id}>{label}</label>
      <select
        id={id}
        required
        value={value?.id ?? ''}
        onChange={(e) =>
          onChange(
            items.find((item) => item.id === e.target.value) ??
              (e.target.value === value?.id ? value : null),
          )
        }
      >
        <option value="">Chọn {label.toLowerCase()}</option>
        {value && !items.some((item) => item.id === value.id) && (
          <option value={value.id}>{value.label}</option>
        )}
        {items.map((item) => (
          <option key={item.id} value={item.id}>
            {item.label}
          </option>
        ))}
      </select>
      {loading ? (
        <p role="status" className="field-hint">
          Đang tìm danh mục…
        </p>
      ) : error ? (
        <>
          <p role="alert" className="form-error">
            {error}
          </p>
          <button
            type="button"
            className="text-button"
            onClick={() => {
              resetResults();
              setAttempt((v) => v + 1);
            }}
          >
            Thử tải lựa chọn
          </button>
        </>
      ) : (
        <p className="field-hint">
          {total} kết quả · Trang {page}/{Math.max(1, Math.ceil(total / 20))}
        </p>
      )}
      <div className="user-form-actions">
        <button
          type="button"
          className="text-button"
          disabled={loading || page === 1}
          onClick={() => {
            resetResults();
            setPage((v) => v - 1);
          }}
        >
          Lựa chọn trước
        </button>
        <button
          type="button"
          className="text-button"
          disabled={loading || page * 20 >= total}
          onClick={() => {
            resetResults();
            setPage((v) => v + 1);
          }}
        >
          Lựa chọn sau
        </button>
      </div>
    </div>
  );
}
