'use client';
import { useEffect, useRef, useState, type RefObject } from 'react';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import { paintPage, readerViewport } from '../../lib/pdf-viewport';

const THUMB_WIDTH = 88;

/**
 * READ-05 "Các trang": a grid of small page pictures to see the whole document and jump to a
 * page. Pictures are drawn one at a time, only while scrolled into the panel.
 */
export function ReaderThumbnails({
  pdf,
  page,
  rotation,
  open,
  onToggle,
  onNavigate,
}: {
  pdf: PDFDocumentProxy;
  page: number;
  rotation: number;
  open: boolean;
  onToggle: () => void;
  onNavigate: (page: number) => boolean;
}) {
  const panel = useRef<HTMLOListElement>(null);
  const [near, setNear] = useState<Set<number>>(() => new Set());
  /** One picture at a time keeps a long document from filling memory with render work. */
  const queue = useRef<Promise<void>>(Promise.resolve());
  useEffect(() => {
    const root = panel.current;
    if (!open || !root) return;
    const observer = new IntersectionObserver(
      (entries) =>
        setNear((old) => {
          const next = new Set(old);
          for (const entry of entries) {
            const n = Number((entry.target as HTMLElement).dataset.page);
            if (entry.isIntersecting) next.add(n);
            else next.delete(n);
          }
          return next;
        }),
      { root, rootMargin: '50% 0px' },
    );
    for (const item of root.querySelectorAll('[data-page]')) observer.observe(item);
    root.querySelector('[aria-current="page"]')?.scrollIntoView({ block: 'nearest' });
    return () => observer.disconnect();
  }, [open, pdf]);
  return (
    <>
      <button
        id="reader-pages-toggle"
        className="secondary-button"
        aria-expanded={open}
        aria-controls="reader-pages-panel"
        onClick={onToggle}
      >
        Các trang
      </button>
      {open && (
        <div id="reader-pages-panel" className="reader-tool-panel">
          <p className="field-hint">
            {pdf.numPages} trang. Chọn một trang để mở; trang đang đọc có viền đậm.
          </p>
          <ol ref={panel} className="reader-thumbnails" aria-label="Các trang của tài liệu">
            {Array.from({ length: pdf.numPages }, (_, i) => i + 1).map((n) => (
              <li key={n} data-page={n}>
                <button
                  type="button"
                  aria-label={`Trang ${n}`}
                  aria-current={n === page ? 'page' : undefined}
                  onClick={() => onNavigate(n)}
                >
                  {near.has(n) ? (
                    <Thumbnail pdf={pdf} page={n} rotation={rotation} queueRef={queue} />
                  ) : (
                    <span className="reader-thumbnail-blank" aria-hidden="true" />
                  )}
                  <span aria-hidden="true">{n}</span>
                </button>
              </li>
            ))}
          </ol>
        </div>
      )}
    </>
  );
}

function Thumbnail({
  pdf,
  page,
  rotation,
  queueRef,
}: {
  pdf: PDFDocumentProxy;
  page: number;
  rotation: number;
  queueRef: RefObject<Promise<void>>;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const target = canvas.current;
    if (!target) return;
    const controller = new AbortController();
    queueRef.current = queueRef.current.then(async () => {
      if (controller.signal.aborted) return;
      let pdfPage: PDFPageProxy | undefined;
      try {
        pdfPage = await pdf.getPage(page);
        const { viewport } = readerViewport(pdfPage, 'fit', rotation, THUMB_WIDTH);
        await paintPage(pdfPage, viewport, target, controller.signal, 1);
      } catch {
        // A cancelled or failed thumbnail keeps its blank frame and page number.
      } finally {
        pdfPage?.cleanup();
      }
    });
    return () => {
      controller.abort();
      target.width = 0;
      target.height = 0;
    };
  }, [pdf, page, rotation, queueRef]);
  return <canvas ref={canvas} aria-hidden="true" />;
}
