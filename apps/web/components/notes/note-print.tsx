'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ApiError } from '../../lib/auth';
import { contentBounds, pageBox, type Rect } from '../../lib/note-model';
import {
  getNotebook,
  getPage,
  notesError,
  notesPath,
  type Notebook,
  type PageView,
} from '../../lib/notes';
import { Button } from '../ui/button';
import { NotePaper } from './note-paper';
import { NoteDefs, NoteItems, type RenderContext } from './note-render';

const EMPTY = new Map<string, string>();

function PrintPage({ view, index }: { view: PageView; index: number }) {
  const box = pageBox(view.page.size);
  const ctx = useMemo<RenderContext>(
    () => ({ quotes: view.quotes, assets: view.assets, localImages: EMPTY, links: true }),
    [view],
  );
  // An infinite page is printed around what is on it, on the sheet orientation that fits best.
  const area: Rect = box
    ? { x: 0, y: 0, w: box.w, h: box.h }
    : (() => {
        const b = contentBounds(view.page.content.items) ?? { x: 0, y: 0, w: 794, h: 1123 };
        return { x: b.x - 40, y: b.y - 40, w: b.w + 80, h: b.h + 80 };
      })();
  const landscape = view.page.size === 'A4_LANDSCAPE' || (!box && area.w > area.h);
  return (
    <section
      className="note-print-page"
      data-landscape={landscape || undefined}
      aria-label={`Trang ${index + 1}`}
    >
      <svg viewBox={`${area.x} ${area.y} ${area.w} ${area.h}`} preserveAspectRatio="xMidYMid meet">
        <NoteDefs />
        <NotePaper
          id={`print-${view.page.id}`}
          paper={view.page.paper}
          color={view.page.paperColor}
          page={area}
          bounded={!!box}
        />
        <NoteItems items={view.page.content.items} ctx={ctx} />
      </svg>
    </section>
  );
}

/**
 * Print view: every page (or the chosen ones) on its own A4 sheet, vector paper, strokes and
 * fonts kept, so the browser's "Save as PDF" makes a faithful PDF. Opens the print dialog once
 * fonts and images have loaded.
 */
export function NotePrint({
  notebookId,
  pageIds,
}: {
  notebookId: string;
  pageIds: string[] | null;
}) {
  const [notebook, setNotebook] = useState<Notebook | null>(null);
  const [views, setViews] = useState<PageView[]>([]);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [error, setError] = useState('');
  const printed = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const detail = await getNotebook(notebookId, controller.signal);
        setNotebook(detail.item);
        const pages = pageIds ? detail.pages.filter((p) => pageIds.includes(p.id)) : detail.pages;
        setProgress({ done: 0, total: pages.length });
        const loaded: PageView[] = [];
        for (const page of pages) {
          loaded.push(await getPage(notebookId, page.id, controller.signal));
          setProgress({ done: loaded.length, total: pages.length });
        }
        setViews(loaded);
      } catch (failure) {
        if (!controller.signal.aborted)
          setError(
            failure instanceof ApiError && failure.status === 401
              ? 'Phiên đăng nhập đã hết. Đăng nhập lại rồi thử.'
              : notesError(failure, 'Chưa tải được vở để in.'),
          );
      }
    })();
    return () => controller.abort();
  }, [notebookId, pageIds]);
  useEffect(() => {
    if (!views.length || printed.current) return;
    printed.current = true;
    document.title = `${notebook?.title ?? 'Vở ghi'} — HUCEScholar`;
    void (async () => {
      await document.fonts.ready;
      const images = [...document.querySelectorAll<SVGImageElement>('.note-print-page image')];
      await Promise.all(
        images.map(
          (image) =>
            new Promise<void>((resolve) => {
              const probe = new Image();
              probe.onload = probe.onerror = () => resolve();
              probe.src = image.getAttribute('href') ?? '';
            }),
        ),
      );
      if (!navigator.webdriver) window.print();
    })();
  }, [views, notebook]);
  return (
    <div className="note-print">
      <div className="note-print-bar">
        {notebook && <Link href={notesPath(notebookId)}>← Về vở “{notebook.title}”</Link>}
        {error ? (
          <p role="alert">{error}</p>
        ) : views.length ? (
          <>
            <span role="status">
              {views.length} trang sẵn sàng. Trong hộp thoại in, chọn “Lưu dưới dạng PDF” để có file
              PDF.
            </span>
            <Button variant="primary" onClick={() => window.print()}>
              In / Lưu PDF
            </Button>
          </>
        ) : (
          <span role="status">
            Đang chuẩn bị {progress.done}/{progress.total || '…'} trang…
          </span>
        )}
      </div>
      {views.map((view, index) => (
        <PrintPage key={view.page.id} view={view} index={index} />
      ))}
    </div>
  );
}
