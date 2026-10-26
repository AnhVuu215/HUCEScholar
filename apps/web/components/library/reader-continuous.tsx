'use client';
import { useEffect, useEffectEvent, useRef, useState, type RefObject } from 'react';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import type { PageViewport } from 'pdfjs-dist';
import { paintPage, readerViewport } from '../../lib/pdf-viewport';
import { pinBox, quadBounds } from '../../lib/highlight-geometry';
import { readHighlights, type TextHighlight } from '../../lib/highlights';
import { readNotes, type PageNote } from '../../lib/reading';

type Size = { width: number; height: number };
/** Fraction of the stage height, from its top, that decides which page is being read. */
const READING_LINE = 0.3;

/**
 * READ-05 "Cuộn liền các trang": every page in one vertical column. The page being read gets
 * the reader's interactive layers (text, highlights, sticky notes), appended into its slot by
 * the reader; the others show a plain picture, drawn only near the visible area and released
 * when far away to bound memory.
 */
export function ContinuousPages({
  pdf,
  page,
  zoom,
  rotation,
  width,
  stageRef,
  slotsRef,
  onScrollPage,
  versionId,
  showPins,
}: {
  pdf: PDFDocumentProxy;
  page: number;
  zoom: string;
  rotation: number;
  width: number;
  stageRef: RefObject<HTMLDivElement | null>;
  slotsRef: RefObject<Map<number, HTMLDivElement>>;
  onScrollPage: (page: number) => void;
  versionId: string;
  showPins: boolean;
}) {
  const count = pdf.numPages;
  const view = `${zoom}:${rotation}:${width}`;
  const [estimate, setEstimate] = useState<{ view: string; size: Size } | null>(null);
  const [sizes, setSizes] = useState<{ view: string; map: Map<number, Size> }>({
    view,
    map: new Map(),
  });
  const [near, setNear] = useState<Set<number>>(() => new Set([page]));
  /** The page the last scroll reported, so following it does not scroll back. */
  const scrolledTo = useRef<number | null>(null);
  useEffect(() => {
    let alive = true;
    void pdf.getPage(1).then((first) => {
      if (!alive || !width) return;
      const { viewport } = readerViewport(first, zoom, rotation, width);
      setEstimate({ view, size: { width: viewport.width, height: viewport.height } });
    });
    return () => {
      alive = false;
    };
  }, [pdf, zoom, rotation, width, view]);
  const sizeOf = (n: number): Size =>
    (sizes.view === view ? sizes.map.get(n) : undefined) ??
    (estimate?.view === view ? estimate.size : { width, height: Math.round(width * 1.414) });
  function measured(n: number, size: Size) {
    setSizes((old) => {
      const map = old.view === view ? new Map(old.map) : new Map<number, Size>();
      const known = map.get(n);
      if (known && known.width === size.width && known.height === size.height) return old;
      map.set(n, size);
      return { view, map };
    });
  }
  useEffect(() => {
    const root = stageRef.current;
    if (!root) return;
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
      // Draw a screen ahead and behind; release beyond that.
      { root, rootMargin: '100% 0px' },
    );
    for (const slot of slotsRef.current.values()) observer.observe(slot);
    return () => observer.disconnect();
  }, [stageRef, slotsRef, count]);
  const follow = useEffectEvent(() => {
    const root = stageRef.current;
    if (!root) return;
    const top = root.getBoundingClientRect().top,
      line = top + root.clientHeight * READING_LINE;
    for (let n = 1; n <= count; n++) {
      const slot = slotsRef.current.get(n);
      if (!slot) continue;
      const box = slot.getBoundingClientRect();
      // The gap below a page belongs to it, so the reading line is never between pages.
      if (box.top <= line && box.bottom + 16 > line) {
        if (n !== page) {
          scrolledTo.current = n;
          onScrollPage(n);
        }
        return;
      }
    }
  });
  useEffect(() => {
    const root = stageRef.current;
    if (!root) return;
    let frame = 0;
    const scrolled = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => follow());
    };
    root.addEventListener('scroll', scrolled, { passive: true });
    return () => {
      root.removeEventListener('scroll', scrolled);
      cancelAnimationFrame(frame);
    };
  }, [stageRef]);
  // Toolbar, outline, thumbnails and saved progress move the page: bring its slot into view.
  useEffect(() => {
    if (scrolledTo.current === page) return;
    scrolledTo.current = null;
    const root = stageRef.current,
      slot = slotsRef.current.get(page);
    if (!root || !slot) return;
    root.scrollTop += slot.getBoundingClientRect().top - root.getBoundingClientRect().top - 16;
  }, [page, stageRef, slotsRef, estimate]);
  return (
    <div className="reader-column">
      {Array.from({ length: count }, (_, i) => i + 1).map((n) => {
        const size = sizeOf(n);
        return (
          <div
            key={n}
            data-page={n}
            className={`reader-slot${n === page ? ' is-active' : ''}`}
            style={{ width: size.width, height: size.height }}
            aria-label={n === page ? undefined : `Trang PDF ${n}`}
            role={n === page ? undefined : 'img'}
            ref={(element) => {
              if (element) slotsRef.current.set(n, element);
              else slotsRef.current.delete(n);
            }}
          >
            {(near.has(n) || n === page) && width > 0 && (
              <PagePreview
                key={view}
                pdf={pdf}
                page={n}
                zoom={zoom}
                rotation={rotation}
                width={width}
                onSize={(value) => measured(n, value)}
                versionId={versionId}
                active={n === page}
                showPins={showPins}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function PagePreview({
  pdf,
  page,
  zoom,
  rotation,
  width,
  onSize,
  versionId,
  active,
  showPins,
}: {
  pdf: PDFDocumentProxy;
  page: number;
  zoom: string;
  rotation: number;
  width: number;
  onSize: (size: Size) => void;
  versionId: string;
  /** The page being read draws its own interactive layers on top; this one shows none. */
  active: boolean;
  showPins: boolean;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [viewport, setViewport] = useState<PageViewport | null>(null);
  const [marks, setMarks] = useState<{ highlights: TextHighlight[]; notes: PageNote[] } | null>(
    null,
  );
  // Reload each time the page stops being read, so edits made on it show up here.
  useEffect(() => {
    if (active) return;
    const controller = new AbortController();
    Promise.all([
      readHighlights(versionId, page, controller.signal),
      readNotes(versionId, page, null, controller.signal),
    ])
      .then(([highlights, notes]) => {
        if (!controller.signal.aborted) setMarks({ highlights, notes: notes.items });
      })
      .catch(() => {
        // Without them the page still reads; its own layers load once it is being read.
        if (!controller.signal.aborted) setMarks(null);
      });
    return () => controller.abort();
  }, [versionId, page, active]);
  const report = useEffectEvent(onSize);
  useEffect(() => {
    const target = canvas.current;
    if (!target) return;
    const controller = new AbortController();
    void (async () => {
      let pdfPage: PDFPageProxy | undefined;
      try {
        pdfPage = await pdf.getPage(page);
        if (controller.signal.aborted) return;
        const { viewport } = readerViewport(pdfPage, zoom, rotation, width);
        report({ width: viewport.width, height: viewport.height });
        setViewport(viewport);
        // Pictures of pages not being read can be a little softer than the page itself.
        await paintPage(pdfPage, viewport, target, controller.signal, 1.5);
      } catch {
        // A cancelled or failed picture leaves the blank slot; the page renders when read.
      } finally {
        pdfPage?.cleanup();
      }
    })();
    return () => {
      controller.abort();
      // Release the bitmap at once instead of waiting for garbage collection.
      target.width = 0;
      target.height = 0;
    };
  }, [pdf, page, zoom, rotation, width]);
  return (
    <>
      <canvas ref={canvas} className="reader-slot-preview" aria-hidden="true" />
      {!active && viewport && marks && (
        <div className="reader-slot-marks" aria-hidden="true">
          {marks.highlights.flatMap((item) =>
            item.anchor.quads.map((quad, i) => (
              <span
                key={`${item.id}:${i}`}
                className="pdf-highlight"
                style={{ ...quadBounds(quad, viewport), backgroundColor: item.color }}
              />
            )),
          )}
          {showPins &&
            marks.notes.map(
              (note) =>
                note.position && (
                  <div
                    key={note.id}
                    className="pdf-note-pin is-static"
                    style={pinBox(note.position, viewport)}
                  >
                    {note.content}
                  </div>
                ),
            )}
        </div>
      )}
    </>
  );
}
