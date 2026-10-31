'use client';
import { useEffect, useId, useState } from 'react';
import { libraryList, type LibraryItem } from '../../lib/library';

/**
 * Finds a readable document in the library by title or author for a calendar item. The API
 * checks the link again on save, so the list only helps choose.
 */
export function MaterialPicker({
  pick,
  cancel,
}: {
  pick: (item: LibraryItem) => void;
  cancel: () => void;
}) {
  const id = useId();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<LibraryItem[] | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    const text = query.trim();
    if (!text) return;
    const controller = new AbortController();
    // Wait for a pause in typing before asking the library.
    const timer = window.setTimeout(() => {
      libraryList(new URLSearchParams({ search: text, limit: '6' }), controller.signal)
        .then((list) => {
          if (!controller.signal.aborted) {
            setResults(list.items);
            setError(false);
          }
        })
        .catch(() => {
          if (!controller.signal.aborted) setError(true);
        });
    }, 300);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query]);
  const shown = query.trim() ? results : null;
  return (
    <div className="calendar-picker" role="group" aria-labelledby={`${id}-label`}>
      <div className="form-field">
        <label id={`${id}-label`} htmlFor={`${id}-search`}>
          Tìm tài liệu để gắn
        </label>
        <input
          id={`${id}-search`}
          type="search"
          autoFocus
          maxLength={200}
          placeholder="Tên tài liệu hoặc tác giả"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            // Escape closes the picker, not the whole form.
            if (e.key === 'Escape') {
              e.stopPropagation();
              cancel();
            }
          }}
        />
      </div>
      {error && (
        <p role="alert" className="form-error">
          Chưa tìm được trong kho học liệu. Thử lại.
        </p>
      )}
      {shown && !error && (
        <ul className="calendar-picker-results" aria-label="Kết quả tìm tài liệu">
          {shown.length === 0 ? (
            <li className="field-hint">Không có tài liệu phù hợp.</li>
          ) : (
            shown.map((item) => (
              <li key={item.versionId}>
                <button type="button" className="text-button" onClick={() => pick(item)}>
                  {item.title}
                </button>
                <span className="field-hint">
                  {item.authors} · {item.pageCount} trang
                </span>
              </li>
            ))
          )}
        </ul>
      )}
      <button type="button" className="text-button" onClick={cancel}>
        Thôi gắn tài liệu
      </button>
    </div>
  );
}
