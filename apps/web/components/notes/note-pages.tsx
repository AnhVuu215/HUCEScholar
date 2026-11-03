'use client';

import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { pageBox, SIZE_LABELS, type PageItem } from '../../lib/note-model';
import type { AssetInfo, PageSummary, QuoteView } from '../../lib/notes';
import { NotePaper } from './note-paper';
import { NoteDefs, NoteItems, type RenderContext } from './note-render';

export type ThumbData = {
  items: PageItem[];
  quotes: Record<string, QuoteView>;
  assets: Record<string, AssetInfo>;
};

const Thumb = memo(function Thumb({
  page,
  data,
  localImages,
}: {
  page: PageSummary;
  data: ThumbData | undefined;
  localImages: ReadonlyMap<string, string>;
}) {
  const box = pageBox(page.size);
  // An infinite page previews its top-left area at portrait proportions.
  const view = box ?? { w: 794, h: 1123 };
  const ctx = useMemo<RenderContext>(
    () => ({ quotes: data?.quotes ?? {}, assets: data?.assets ?? {}, localImages, thumb: true }),
    [data, localImages],
  );
  return (
    <svg viewBox={`0 0 ${view.w} ${view.h}`} className="note-thumb-svg" aria-hidden="true">
      <NoteDefs />
      <NotePaper
        id={`thumb-${page.id}`}
        paper={page.paper}
        color={page.paperColor}
        page={{ x: 0, y: 0, w: view.w, h: view.h }}
        bounded={!!box}
      />
      {data && <NoteItems items={data.items} ctx={ctx} />}
    </svg>
  );
});

/**
 * The page strip: thumbnails load as they scroll into view; pages are reordered by dragging or
 * with the "Lên"/"Xuống" buttons, which keyboard and screen-reader users can reach.
 */
export function NotePages({
  pages,
  currentId,
  cache,
  localImages,
  onOpen,
  onLoad,
  onReorder,
  onAdd,
  onDuplicate,
  onDelete,
  busy,
}: {
  pages: PageSummary[];
  currentId: string | null;
  cache: ReadonlyMap<string, ThumbData>;
  localImages: ReadonlyMap<string, string>;
  onOpen: (id: string) => void;
  onLoad: (id: string) => void;
  onReorder: (order: string[]) => void;
  onAdd: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  busy: boolean;
}) {
  const list = useRef<HTMLOListElement>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const requested = useRef(new Set<string>());

  useEffect(() => {
    const root = list.current;
    if (!root) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = (entry.target as HTMLElement).dataset.pageId;
          if (entry.isIntersecting && id && !requested.current.has(id)) {
            requested.current.add(id);
            onLoad(id);
          }
        }
      },
      { root, rootMargin: '200px 0px' },
    );
    root.querySelectorAll('[data-page-id]').forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [pages, onLoad]);
  // Cached thumbnails of pages that changed elsewhere are fetched again when shown.
  useEffect(() => {
    for (const id of [...requested.current]) if (!cache.has(id)) requested.current.delete(id);
  }, [cache]);

  const move = (id: string, delta: number) => {
    const order = pages.map((p) => p.id);
    const index = order.indexOf(id);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= order.length) return;
    order.splice(index, 1);
    order.splice(target, 0, id);
    onReorder(order);
  };

  return (
    <nav className="note-pages" aria-label="Các trang trong vở">
      <div className="note-pages-actions">
        <button type="button" className="note-text-button" onClick={onAdd} disabled={busy}>
          + Trang mới
        </button>
        <button
          type="button"
          className="note-text-button"
          onClick={onDuplicate}
          disabled={busy || !currentId}
        >
          Nhân bản
        </button>
        <button
          type="button"
          className="note-text-button danger"
          onClick={onDelete}
          disabled={busy || pages.length <= 1}
        >
          Xóa trang
        </button>
      </div>
      <ol ref={list} className="note-page-list">
        {pages.map((page, index) => (
          <li
            key={page.id}
            data-page-id={page.id}
            data-current={page.id === currentId || undefined}
            data-over={over === page.id || undefined}
            draggable={!busy}
            onDragStart={(event) => {
              setDragging(page.id);
              event.dataTransfer.effectAllowed = 'move';
              event.dataTransfer.setData('application/x-hucescholar-page', page.id);
            }}
            onDragEnd={() => {
              setDragging(null);
              setOver(null);
            }}
            onDragOver={(event) => {
              if (!dragging) return;
              event.preventDefault();
              setOver(page.id);
            }}
            onDrop={(event) => {
              event.preventDefault();
              if (!dragging || dragging === page.id) return;
              const order = pages.map((p) => p.id).filter((id) => id !== dragging);
              order.splice(
                order.indexOf(page.id) +
                  (pages.findIndex((p) => p.id === dragging) < index ? 1 : 0),
                0,
                dragging,
              );
              onReorder(order);
              setDragging(null);
              setOver(null);
            }}
          >
            <button
              type="button"
              className="note-thumb"
              aria-current={page.id === currentId ? 'page' : undefined}
              aria-label={`Trang ${index + 1}, ${SIZE_LABELS[page.size].toLowerCase()}`}
              onClick={() => onOpen(page.id)}
            >
              <Thumb page={page} data={cache.get(page.id)} localImages={localImages} />
            </button>
            <span className="note-thumb-meta">
              <span>{index + 1}</span>
              <span className="note-thumb-move">
                <button
                  type="button"
                  className="note-icon-button"
                  onClick={() => move(page.id, -1)}
                  disabled={busy || index === 0}
                  aria-label={`Chuyển trang ${index + 1} lên`}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="note-icon-button"
                  onClick={() => move(page.id, 1)}
                  disabled={busy || index === pages.length - 1}
                  aria-label={`Chuyển trang ${index + 1} xuống`}
                >
                  ↓
                </button>
              </span>
            </span>
          </li>
        ))}
      </ol>
    </nav>
  );
}
