'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { libraryError, libraryVersion } from '../../lib/library';
import {
  pdfTextLayout,
  searchPdfText,
  type PdfFindResult,
  type PdfTextMatch,
} from '../../lib/pdf-find';
import type { HighlightSurface } from '../../lib/highlight-geometry';

export function ReaderFind({
  pdf,
  versionId,
  hasText,
  surface,
  onNavigate,
  onClose,
}: {
  pdf: PDFDocumentProxy;
  versionId: string;
  hasText: boolean;
  surface: HighlightSurface | null;
  onNavigate: (page: number) => boolean;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [run, setRun] = useState<{ query: string } | null>(null);
  const [result, setResult] = useState<PdfFindResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(-1);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    input.current?.focus();
  }, []);
  useEffect(() => {
    if (!run) return;
    const controller = new AbortController();
    void searchPdfText(
      pdf,
      run.query,
      controller.signal,
      (batch) => {
        if (!controller.signal.aborted) setResult(batch);
      },
      () => libraryVersion(versionId, controller.signal),
    )
      .then((value) => {
        if (!controller.signal.aborted) setResult(value);
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          setResult(null);
          setError(libraryError(cause));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
    return () => controller.abort();
  }, [pdf, versionId, run]);
  function move(direction: number) {
    const matches = result?.matches ?? [];
    if (!matches.length) return;
    const index =
      selected < 0
        ? direction > 0
          ? 0
          : matches.length - 1
        : (selected + direction + matches.length) % matches.length;
    if (onNavigate(matches[index].pageNumber)) setSelected(index);
  }
  const current = result?.matches[selected];
  return (
    <section className="reader-find" aria-label="Tìm chữ trong PDF">
      <div className="notes-heading">
        <h3>Tìm chữ trong PDF</h3>
        <button className="quiet-button" onClick={onClose}>
          Đóng tìm kiếm
        </button>
      </div>
      <p className="field-hint">
        Tìm cụm chữ có dấu, không phân biệt hoa thường. Không tìm không dấu hoặc OCR.
      </p>
      {!hasText && (
        <p className="field-hint">
          Tài liệu scan không có lớp chữ. OCR chưa được hỗ trợ; bạn vẫn có thể ghi chú theo trang.
        </p>
      )}
      <form
        method="post"
        onSubmit={(event) => {
          event.preventDefault();
          if (!hasText || !query.trim()) return;
          setBusy(true);
          setError('');
          setResult(null);
          setSelected(-1);
          setRun({ query: query.trim() });
        }}
      >
        <label htmlFor="reader-find-query">Chữ cần tìm trong PDF</label>
        <input
          id="reader-find-query"
          type="search"
          ref={input}
          value={query}
          maxLength={100}
          autoComplete="off"
          disabled={!hasText}
          onChange={(event) => setQuery(event.target.value)}
        />
        <button className="secondary-button" disabled={!hasText || !query.trim()}>
          Tìm chữ
        </button>
      </form>
      {busy && (
        <p role="status">
          Đang tìm… {result?.scanned ?? 0} / {pdf.numPages} trang. Có thể tìm cụm khác hoặc đóng để
          dừng.
        </p>
      )}
      {error && <p role="alert">{error} Bấm Tìm chữ để thử lại.</p>}
      {result && (
        <>
          <p role="status">
            {result.matches.length} kết quả · Đã tìm {result.scanned} / {pdf.numPages} trang
            {result.truncated ? ' · Dừng ở 2000 kết quả; hãy tìm cụ thể hơn.' : ''}
          </p>
          {!busy && result.matches.length === 0 && (
            <p className="field-hint">
              Không tìm thấy chữ. PDF scan hoặc chữ ở dạng ảnh cần OCR chưa được hỗ trợ.
            </p>
          )}
          <div className="note-actions">
            <button
              className="secondary-button"
              disabled={!result.matches.length}
              onClick={() => move(-1)}
            >
              Kết quả trước
            </button>
            <button
              className="secondary-button"
              disabled={!result.matches.length}
              onClick={() => move(1)}
            >
              Kết quả tiếp
            </button>
          </div>
          {current && (
            <p role="status">
              Kết quả {selected + 1} / {result.matches.length} · Trang {current.pageNumber}
            </p>
          )}
          <FindMarks surface={surface} matches={result.matches} current={current} />
        </>
      )}
    </section>
  );
}
function FindMarks({
  surface,
  matches,
  current,
}: {
  surface: HighlightSurface | null;
  matches: PdfTextMatch[];
  current?: PdfTextMatch;
}) {
  useLayoutEffect(() => {
    if (!surface?.text) return;
    const layer = document.createElement('div');
    layer.className = 'pdf-find-layer';
    layer.setAttribute('aria-hidden', 'true');
    surface.element.append(layer);
    const origin = surface.element.getBoundingClientRect();
    const segments = pdfTextLayout(surface.text.parts).segments.map((segment) => ({
      ...segment,
      node: surface.text!.elements[segment.index]?.firstChild,
    }));
    let active: HTMLDivElement | undefined;
    for (const match of matches.filter((value) => value.pageNumber === surface.page)) {
      for (const segment of segments) {
        if (
          !segment.node ||
          segment.node.nodeType !== Node.TEXT_NODE ||
          match.end <= segment.start ||
          match.start >= segment.end
        )
          continue;
        const range = document.createRange();
        range.setStart(segment.node, Math.max(0, match.start - segment.start));
        range.setEnd(segment.node, Math.min(segment.end, match.end) - segment.start);
        for (const rect of Array.from(range.getClientRects())) {
          if (!rect.width || !rect.height) continue;
          const mark = document.createElement('div');
          mark.className = 'pdf-find-mark';
          mark.dataset.current = String(match === current);
          Object.assign(mark.style, {
            left: `${rect.left - origin.left}px`,
            top: `${rect.top - origin.top}px`,
            width: `${rect.width}px`,
            height: `${rect.height}px`,
          });
          layer.append(mark);
          if (match === current) active ??= mark;
        }
      }
    }
    active?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    return () => layer.remove();
  }, [surface, matches, current]);
  return null;
}
