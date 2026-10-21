'use client';

import { useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { resolveOutlinePage } from '../../lib/pdf-find';
type Entry = { title: string; destination: unknown; depth: number };
function entries(raw: unknown): Entry[] {
  if (!Array.isArray(raw)) return [];
  const pending = raw.slice(0, 250).map((item: unknown) => ({ item, depth: 0 })),
    result: Entry[] = [];
  while (pending.length && result.length < 250) {
    const { item, depth } = pending.shift()!;
    if (!item || typeof item !== 'object') continue;
    const value = item as Record<string, unknown>;
    result.push({
      title:
        typeof value.title === 'string'
          ? value.title.slice(0, 300) || 'Mục không tên'
          : 'Mục không tên',
      destination: value.url || value.unsafeUrl ? null : value.dest,
      depth,
    });
    if (depth < 8 && Array.isArray(value.items))
      pending.unshift(
        ...value.items.slice(0, 250).map((child: unknown) => ({ item: child, depth: depth + 1 })),
      );
  }
  return result;
}
export function ReaderOutline({
  pdf,
  open,
  onToggle,
  onNavigate,
}: {
  pdf: PDFDocumentProxy;
  open: boolean;
  onToggle: () => void;
  onNavigate: (page: number) => boolean;
}) {
  const [items, setItems] = useState<Entry[]>([]);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let alive = true;
    void pdf
      .getOutline()
      .then((raw) => {
        if (alive) {
          setItems(entries(raw));
          setError(false);
        }
      })
      .catch(() => {
        if (alive) setError(true);
      });
    return () => {
      alive = false;
    };
  }, [pdf, attempt]);
  if (error)
    return (
      <div role="alert">
        Chưa đọc được mục lục.{' '}
        <button className="quiet-button" onClick={() => setAttempt((value) => value + 1)}>
          Thử tải mục lục
        </button>
      </div>
    );
  if (!items.length) return null;
  return (
    <>
      <button
        id="reader-outline-toggle"
        className="secondary-button"
        aria-expanded={open}
        aria-controls="reader-outline-panel"
        onClick={onToggle}
      >
        Mục lục PDF
      </button>
      {open && <OutlineList pdf={pdf} items={items} onNavigate={onNavigate} />}
    </>
  );
}
function OutlineList({
  pdf,
  items,
  onNavigate,
}: {
  pdf: PDFDocumentProxy;
  items: Entry[];
  onNavigate: (page: number) => boolean;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  async function navigate(entry: Entry) {
    setBusy(true);
    setError('');
    try {
      const page = await resolveOutlinePage(pdf, entry.destination);
      if (!alive.current) return;
      if (page === null)
        setError('Mục này không có đích trang hợp lệ. Chọn mục khác hoặc dùng số trang.');
      else onNavigate(page);
    } catch {
      if (alive.current) setError('Chưa mở được mục này. Thử lại hoặc dùng số trang.');
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  return (
    <section id="reader-outline-panel" className="reader-outline" aria-label="Mục lục nội bộ PDF">
      <p className="field-hint">
        Chỉ mở trang trong PDF này. Tối đa 250 mục; liên kết ngoài không được mở ở đây.
      </p>
      {error && <p role="alert">{error}</p>}
      <ul>
        {items.map((item, index) => (
          <li key={index} style={{ paddingInlineStart: `${Math.min(item.depth, 3) * 12}px` }}>
            {item.destination !== null && item.destination !== undefined ? (
              <button className="quiet-button" disabled={busy} onClick={() => void navigate(item)}>
                {item.title}
              </button>
            ) : (
              <span>{item.title} · Không có đích trang nội bộ</span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
