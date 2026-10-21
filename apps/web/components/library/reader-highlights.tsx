'use client';
import { useCallback, useEffect, useEffectEvent, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ApiError } from '../../lib/auth';
import { personalError } from '../../lib/reading';
import {
  highlightColorLabel,
  isHighlightColor,
  readHighlights,
  removeHighlight,
  writeHighlight,
  type HighlightAnchor,
  type TextHighlight,
} from '../../lib/highlights';
import { quadBounds, type HighlightSurface } from '../../lib/highlight-geometry';
import { captureReaderSelection, type ReaderSelection } from '../../lib/reader-selection';
import { useNotesLeaveGuard } from './use-notes-leave-guard';
import { HighlightPalette } from './highlight-palette';
import { ReaderSelectionToolbar } from './reader-selection-toolbar';
import { useAnnotationEditor, useAnnotationPanel } from './reader-annotation-panel';
import type { LibraryItem } from '../../lib/library';
import { formatCitation } from '../../lib/citations';
import { useReturnFocus } from '../../lib/use-return-focus';
import { ReaderCitation, type CitationStatus } from './reader-citation';
import { StudyCardMaker } from '../study/study-card-maker';

type Draft = {
  page: number;
  anchor: HighlightAnchor;
  original: TextHighlight | null;
  requestId: string;
};
export function ReaderHighlights({
  versionId,
  page,
  surface,
  tools,
  available,
  source,
  onEdit,
  defaultColor = '#FFF59D',
}: {
  versionId: string;
  page: number;
  surface: HighlightSurface | null;
  tools: HTMLDivElement | null;
  available: boolean;
  source: LibraryItem;
  onEdit?: () => void;
  defaultColor?: string;
}) {
  const panel = useAnnotationPanel();
  const returnFocus = useReturnFocus();
  const [data, setData] = useState<{ page: number; items: TextHighlight[] } | null>(null);
  const [loading, setLoading] = useState(true),
    [listError, setListError] = useState('');
  const [selection, setSelection] = useState<ReaderSelection | null>(null);
  const [selectionError, setSelectionError] = useState('');
  const [citation, setCitation] = useState<{ selection: ReaderSelection; text: string } | null>(
    null,
  );
  const [citationStatus, setCitationStatus] = useState<CitationStatus>('copying');
  const copyRequest = useRef(0);
  const [overlaps, setOverlaps] = useState<TextHighlight[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null),
    [content, setContent] = useState('');
  const [color, setColor] = useState('#FFF59D');
  const [deleting, setDeleting] = useState<TextHighlight | null>(null);
  const [busy, setBusy] = useState(false),
    [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  const request = useRef<AbortController | null>(null),
    alive = useRef(true);
  const input = useRef<HTMLTextAreaElement>(null);
  const dirty =
    !!draft &&
    (!draft.original || content !== draft.original.content || color !== draft.original.color);
  const locked = busy || uncertain;
  const items = !listError && data?.page === page && available ? data.items : [];
  const fetching = loading || data?.page !== page;
  useNotesLeaveGuard(dirty || uncertain, busy);
  useAnnotationEditor('highlight', { dirty, busy, uncertain }, discard, (item) => {
    if (item.kind === 'TEXT_HIGHLIGHT') restore(item);
  });
  const load = useCallback(() => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    return readHighlights(versionId, page, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) {
          setData({ page, items: result });
          setListError('');
        }
      })
      .catch((e: unknown) => {
        if (!controller.signal.aborted) {
          setData({ page, items: [] });
          setListError(
            e instanceof ApiError && [401, 403, 404].includes(e.status)
              ? personalError(e)
              : 'Chưa tải được vùng tô. Thử tải lại; bản soạn hiện tại vẫn được giữ.',
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
  }, [versionId, page]);
  const latestLoad = useRef(load);
  useEffect(() => {
    latestLoad.current = load;
  }, [load]);
  useEffect(() => {
    void load();
    return () => request.current?.abort();
  }, [load]);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      request.current?.abort();
    };
  }, []);
  useEffect(() => {
    if (draft) input.current?.focus();
  }, [draft]);
  function open(note: TextHighlight) {
    if (locked) return;
    beginEdit(() => restore(note));
  }
  function beginEdit(action: () => void) {
    if (panel.begin('highlight', action)) onEdit?.();
  }
  function restore(note: TextHighlight) {
    setDraft({
      page: note.pageNumber,
      anchor: note.anchor,
      original: note,
      requestId: crypto.randomUUID(),
    });
    setContent(note.content);
    setColor(note.color);
    setError('');
    setNotice('');
    input.current?.focus();
  }
  const capture = useEffectEvent(() => {
    if (!surface || locked) return;
    const focused = document.activeElement;
    if (
      focused instanceof Element &&
      (focused.closest('[data-reader-selection-toolbar]') || tools?.contains(focused))
    )
      return;
    const result = captureReaderSelection(versionId, surface);
    setSelection(result.selection);
    setSelectionError(result.reason);
  });
  const hit = useEffectEvent((event: MouseEvent) => {
    if (!surface || locked || !window.getSelection()?.isCollapsed) return;
    const rect = surface.element.getBoundingClientRect();
    const x = ((event.clientX - rect.left) * surface.viewport.width) / rect.width;
    const y = ((event.clientY - rect.top) * surface.viewport.height) / rect.height;
    const matches = items.filter((item) =>
      item.anchor.quads.some((q) => {
        const b = quadBounds(q, surface.viewport);
        return x >= b.left && x <= b.left + b.width && y >= b.top && y <= b.top + b.height;
      }),
    );
    if (matches.length === 1) open(matches[0]);
    else if (matches.length > 1) beginEdit(() => setOverlaps(matches));
  });
  const dismissOnStage = useEffectEvent((event: KeyboardEvent) => {
    if (event.key !== 'Escape' || event.defaultPrevented || (!candidate && !citation)) return;
    event.preventDefault();
    event.stopPropagation();
    if (citation) closeCitation();
    else {
      setSelection(null);
      window.getSelection()?.removeAllRanges();
    }
  });
  useEffect(() => {
    if (!surface) return;
    const selectionChanged = () => capture();
    const clicked = (event: MouseEvent) => hit(event);
    const stage = surface.element.closest('.reader-stage');
    const keyDown = (event: Event) => dismissOnStage(event as KeyboardEvent);
    stage?.addEventListener('keydown', keyDown);
    document.addEventListener('selectionchange', selectionChanged);
    surface.layer.addEventListener('pointerup', selectionChanged);
    surface.layer.addEventListener('click', clicked);
    return () => {
      document.removeEventListener('selectionchange', selectionChanged);
      surface.layer.removeEventListener('pointerup', selectionChanged);
      surface.layer.removeEventListener('click', clicked);
      stage?.removeEventListener('keydown', keyDown);
    };
  }, [surface]);
  function discard() {
    setDraft(null);
    setContent('');
    setUncertain(false);
    setError('');
    setNotice('');
    setDeleting(null);
    setOverlaps([]);
  }
  async function save() {
    if (!draft || busy || !isHighlightColor(color)) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await writeHighlight(versionId, draft.original, {
        pageNumber: draft.page,
        anchor: draft.anchor,
        content: content.trim(),
        color,
        requestId: draft.requestId,
      });
      if (!alive.current) return;
      setDraft(null);
      setContent('');
      setUncertain(false);
      setNotice(`Đã lưu vùng tô · Trang ${draft.page}.`);
      await latestLoad.current();
    } catch (e) {
      if (!alive.current) return;
      setUncertain((previous) => previous || !(e instanceof ApiError));
      setError(
        e instanceof ApiError && e.status === 409
          ? 'Vùng tô đã thay đổi. Bản soạn vẫn được giữ; tải lại danh sách, hủy bản soạn rồi mở bản mới để sửa.'
          : personalError(e),
      );
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  async function confirmDelete() {
    if (!deleting || busy) return;
    setBusy(true);
    setError('');
    try {
      await removeHighlight(versionId, deleting);
      if (!alive.current) return;
      setDeleting(null);
      setNotice('Đã xóa vùng tô.');
      await latestLoad.current();
    } catch (e) {
      if (alive.current)
        setError(
          e instanceof ApiError && e.status === 409
            ? 'Vùng tô đã thay đổi. Tải lại danh sách trước khi xóa.'
            : personalError(e),
        );
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  // A copy-restricted PDF never offers its selection for highlighting or citation.
  const candidate =
    !source.copyRestricted &&
    surface &&
    selection?.surface.element === surface.element &&
    selection.versionId === versionId &&
    selection.pageNumber === surface.page
      ? selection
      : null;
  function startDraft(snapshot: ReaderSelection | null) {
    if (!snapshot || locked || !available) return;
    beginEdit(() => {
      setDraft({
        page: snapshot.pageNumber,
        anchor: snapshot.anchor,
        original: null,
        requestId: crypto.randomUUID(),
      });
      setContent('');
      setColor(defaultColor);
      setError('');
      setNotice('');
      setSelection(null);
      setSelectionError('');
      window.getSelection()?.removeAllRanges();
    });
  }
  async function copyCitation(snapshot: ReaderSelection, text: string) {
    const requestId = ++copyRequest.current;
    setCitation({ selection: snapshot, text });
    setCitationStatus('copying');
    setSelection(null);
    window.getSelection()?.removeAllRanges();
    try {
      await navigator.clipboard.writeText(text);
      if (alive.current && requestId === copyRequest.current) setCitationStatus('copied');
    } catch {
      if (alive.current && requestId === copyRequest.current) setCitationStatus('manual');
    }
  }
  function cite() {
    if (!candidate || !available) return;
    void copyCitation(
      candidate,
      formatCitation({
        quote: candidate.anchor.quote,
        title: source.title,
        authors: source.authors,
        versionId,
        versionNo: source.versionNo,
        pageNumber: candidate.pageNumber,
        origin: window.location.origin,
      }),
    );
  }
  function closeCitation() {
    ++copyRequest.current;
    setCitation(null);
    tools
      ?.closest('.reader-highlight-region')
      ?.querySelector<HTMLElement>('.reader-stage')
      ?.focus();
  }
  return (
    <>
      {candidate && available && (
        <ReaderSelectionToolbar
          selection={candidate}
          disabled={locked}
          onHighlight={() => startDraft(candidate)}
          onNote={() => startDraft(candidate)}
          onCite={cite}
          onDismiss={() => {
            setSelection(null);
            window.getSelection()?.removeAllRanges();
          }}
        />
      )}
      {tools &&
        createPortal(
          <div className="highlight-toolbar">
            <button
              className="secondary-button"
              disabled={!candidate || locked || !available}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => startDraft(candidate)}
            >
              Tô sáng đoạn chọn
            </button>
            <button
              className="secondary-button"
              disabled={!candidate || locked || !available}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => startDraft(candidate)}
            >
              Ghi chú đoạn chọn
            </button>
            <button
              className="secondary-button"
              disabled={!candidate || !available}
              onMouseDown={(event) => event.preventDefault()}
              onClick={cite}
            >
              Trích dẫn đoạn chọn
            </button>
            {!panel.open && (
              <button
                className="secondary-button"
                data-reader-reopen
                onClick={() => {
                  if (panel.activate(panel.active))
                    requestAnimationFrame(() => {
                      document.getElementById(`annotation-tab-${panel.active}`)?.focus();
                    });
                }}
              >
                Hiện ghi chú
              </button>
            )}
            <span className="field-hint">
              {source.copyRestricted
                ? 'PDF này cấm sao chép nội dung nên không tô sáng hay trích dẫn được. Bạn vẫn ghi chú theo trang.'
                : 'Chọn tối đa 2000 ký tự trong một trang PDF để tô sáng.'}
            </span>
            {selectionError && (
              <span role="status" className="field-hint">
                {selectionError}
              </span>
            )}
            {citation && (
              <ReaderCitation
                text={citation.text}
                status={citationStatus}
                onCopy={() => void copyCitation(citation.selection, citation.text)}
                onSave={() => startDraft(citation.selection)}
                saveDisabled={locked || !available}
                onClose={closeCitation}
              />
            )}
          </div>,
          tools,
        )}
      {surface &&
        createPortal(
          <>
            {items.flatMap((item) =>
              item.anchor.quads.map((quad, i) => (
                <span
                  aria-hidden="true"
                  className="pdf-highlight"
                  key={`${item.id}:${i}`}
                  data-highlight-id={item.id}
                  style={{ ...quadBounds(quad, surface.viewport), backgroundColor: item.color }}
                />
              )),
            )}
          </>,
          surface.overlay,
        )}
      <section className="reader-highlights reader-notes" aria-label="Vùng tô riêng theo trang">
        <div className="notes-heading">
          <h3>Vùng tô riêng · Trang {page}</h3>
          <button
            className="secondary-button"
            disabled={loading || busy}
            onClick={() => {
              setLoading(true);
              setDeleting(null);
              void load();
            }}
          >
            Tải lại vùng tô
          </button>
        </div>
        <p className="field-hint">
          Chỉ bạn xem được vùng tô và ghi chú kèm theo. Giữ đúng phiên bản PDF gốc.
        </p>
        {overlaps.length > 1 && (
          <div role="group" aria-label="Vùng tô chồng nhau" className="annotation-overlaps">
            <p>Có {overlaps.length} vùng tô chồng nhau. Chọn vùng cần sửa:</p>
            {overlaps.map((note) => (
              <button key={note.id} className="secondary-button" onClick={() => open(note)}>
                {highlightColorLabel(note.color)} · {note.content || note.anchor.quote}
              </button>
            ))}
          </div>
        )}
        {draft && (
          <form
            className="note-editor"
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <h4>
              {draft.original ? 'Sửa vùng tô' : 'Vùng tô đang soạn'} · Trang {draft.page}
            </h4>
            <blockquote className="highlight-quote">{draft.anchor.quote}</blockquote>
            <HighlightPalette value={color} disabled={locked} onChange={setColor} />
            {!isHighlightColor(color) && (
              <p role="alert" className="form-error">
                {highlightColorLabel(color)}. Chọn một màu trong bảng trước khi lưu thay đổi.
              </p>
            )}
            <label htmlFor="highlight-content">Ghi chú cho đoạn tô</label>
            <textarea
              ref={input}
              id="highlight-content"
              rows={3}
              maxLength={4000}
              value={content}
              readOnly={locked}
              onChange={(e) => setContent(e.target.value)}
              aria-describedby="highlight-limit"
            />
            <p id="highlight-limit" className="field-hint">
              Tùy chọn · {content.length}/4000 ký tự
            </p>
            {uncertain && (
              <p className="field-hint">Giữ nguyên bản soạn để thử lại đúng lần lưu.</p>
            )}
            <div className="note-actions">
              <button className="primary-button" disabled={busy || !isHighlightColor(color)}>
                {busy ? 'Đang lưu vùng tô…' : 'Lưu vùng tô'}
              </button>
              <button type="button" className="secondary-button" disabled={busy} onClick={discard}>
                Hủy vùng tô
              </button>
            </div>
          </form>
        )}
        {error && <p role="alert">{error}</p>}
        {notice && <p role="status">{notice}</p>}
        {listError && <p role="alert">{listError}</p>}
        {fetching && <p role="status">Đang tải vùng tô…</p>}
        {!fetching && !listError && !items.length && (
          <p className="field-hint">
            Chưa có vùng tô ở trang này. PDF scan vẫn có thể ghi chú theo trang.
          </p>
        )}
        <div className="note-list">
          {items.map((item) => (
            <article key={item.id} aria-label={`Vùng tô ${item.id}`}>
              <blockquote className="highlight-quote">{item.anchor.quote}</blockquote>
              <p className="note-content">{item.content || 'Chưa thêm ghi chú.'}</p>
              <p className="field-hint">
                {highlightColorLabel(item.color)} · Trang {item.pageNumber}
              </p>
              <div className="note-actions">
                <button className="secondary-button" disabled={locked} onClick={() => open(item)}>
                  Sửa vùng tô
                </button>
                <button
                  className="secondary-button"
                  disabled={dirty || locked || !!draft}
                  onClick={() => {
                    returnFocus.remember();
                    setDeleting(item);
                  }}
                >
                  Xóa vùng tô
                </button>
              </div>
              <StudyCardMaker versionId={versionId} highlightId={item.id} disabled={locked} />
              {deleting?.id === item.id && (
                <div className="note-delete">
                  <p>Xóa vùng tô và ghi chú kèm theo? Thao tác không thể hoàn tác.</p>
                  <div className="note-actions">
                    <button
                      className="primary-button"
                      disabled={busy}
                      onClick={() => void confirmDelete()}
                    >
                      Xác nhận xóa
                    </button>
                    <button
                      className="secondary-button"
                      disabled={busy}
                      onClick={() => {
                        setDeleting(null);
                        returnFocus.restore();
                      }}
                    >
                      Giữ vùng tô
                    </button>
                  </div>
                </div>
              )}
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
