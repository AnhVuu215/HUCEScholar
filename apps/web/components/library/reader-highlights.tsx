'use client';
import { useCallback, useEffect, useEffectEvent, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ApiError } from '../../lib/auth';
import { personalError } from '../../lib/reading';
import {
  highlightColors,
  readHighlights,
  removeHighlight,
  writeHighlight,
  type HighlightAnchor,
  type HighlightColor,
  type TextHighlight,
} from '../../lib/highlights';
import { quadBounds, selectedAnchor, type HighlightSurface } from '../../lib/highlight-geometry';
import { useNotesLeaveGuard } from './use-notes-leave-guard';

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
}: {
  versionId: string;
  page: number;
  surface: HighlightSurface | null;
  tools: HTMLDivElement | null;
  available: boolean;
}) {
  const [data, setData] = useState<{ page: number; items: TextHighlight[] } | null>(null);
  const [loading, setLoading] = useState(true),
    [listError, setListError] = useState('');
  const [selection, setSelection] = useState<{
    element: HTMLDivElement;
    anchor: HighlightAnchor;
  } | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null),
    [content, setContent] = useState('');
  const [color, setColor] = useState<HighlightColor>('#FFF59D');
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
    if (dirty || locked || deleting) return;
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
    if (!surface || locked || dirty) return;
    const anchor = selectedAnchor(surface);
    setSelection(anchor ? { element: surface.element, anchor } : null);
  });
  const hit = useEffectEvent((event: MouseEvent) => {
    if (!surface || dirty || locked || deleting || !window.getSelection()?.isCollapsed) return;
    const rect = surface.element.getBoundingClientRect();
    const x = ((event.clientX - rect.left) * surface.viewport.width) / rect.width;
    const y = ((event.clientY - rect.top) * surface.viewport.height) / rect.height;
    const item = items.find((item) =>
      item.anchor.quads.some((q) => {
        const b = quadBounds(q, surface.viewport);
        return x >= b.left && x <= b.left + b.width && y >= b.top && y <= b.top + b.height;
      }),
    );
    if (item) open(item);
  });
  useEffect(() => {
    if (!surface) return;
    const selectionChanged = () => capture();
    const clicked = (event: MouseEvent) => hit(event);
    document.addEventListener('selectionchange', selectionChanged);
    surface.layer.addEventListener('pointerup', selectionChanged);
    surface.layer.addEventListener('click', clicked);
    return () => {
      document.removeEventListener('selectionchange', selectionChanged);
      surface.layer.removeEventListener('pointerup', selectionChanged);
      surface.layer.removeEventListener('click', clicked);
    };
  }, [surface]);
  function discard() {
    setDraft(null);
    setContent('');
    setUncertain(false);
    setError('');
    setNotice('');
  }
  async function save() {
    if (!draft || busy) return;
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
  const candidate = surface && selection?.element === surface.element ? selection.anchor : null;
  return (
    <>
      {tools &&
        createPortal(
          <div className="highlight-toolbar">
            <button
              className="secondary-button"
              disabled={!candidate || dirty || locked || !!deleting || !available}
              onClick={() => {
                if (!candidate) return;
                setDraft({
                  page,
                  anchor: candidate,
                  original: null,
                  requestId: crypto.randomUUID(),
                });
                setContent('');
                setColor('#FFF59D');
                setError('');
                setNotice('');
                setSelection(null);
                window.getSelection()?.removeAllRanges();
              }}
            >
              Tô sáng đoạn chọn
            </button>
            <span className="field-hint">
              Chọn tối đa 2000 ký tự trong một trang PDF để tô sáng.
            </span>
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
            <label htmlFor="highlight-color">Màu tô sáng</label>
            <select
              id="highlight-color"
              value={color}
              disabled={locked}
              onChange={(e) => setColor(e.target.value as HighlightColor)}
            >
              {Object.entries(highlightColors).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
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
              <button className="primary-button" disabled={busy}>
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
                {highlightColors[item.color]} · Trang {item.pageNumber}
              </p>
              <div className="note-actions">
                <button
                  className="secondary-button"
                  disabled={dirty || locked || !!deleting}
                  onClick={() => open(item)}
                >
                  Sửa vùng tô
                </button>
                <button
                  className="secondary-button"
                  disabled={dirty || locked || !!draft}
                  onClick={() => setDeleting(item)}
                >
                  Xóa vùng tô
                </button>
              </div>
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
                      onClick={() => setDeleting(null)}
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
