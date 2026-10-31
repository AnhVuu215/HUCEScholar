'use client';
import { useCallback, useEffect, useEffectEvent, useRef, useState, type PointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { ApiError } from '../../lib/auth';
import { useReturnFocus } from '../../lib/use-return-focus';
import {
  createNote,
  personalError,
  readNotes,
  removeNote,
  updateNote,
  type NotePosition,
  type PageNote,
} from '../../lib/reading';
import { pagePointToPosition, pinBox, type HighlightSurface } from '../../lib/highlight-geometry';
import { useNotesLeaveGuard } from './use-notes-leave-guard';
import { useAnnotationEditor, useAnnotationPanel } from './reader-annotation-panel';
import { ReviewMarkButton, useReviewMark } from './notebook-parts';
const samePosition = (a: NotePosition | null, b: NotePosition | null) =>
  a === b || (!!a && !!b && a.x === b.x && a.y === b.y);
/** Pointer travel (CSS px) before a press on a sticky note counts as dragging, not a click. */
const DRAG_THRESHOLD = 4;
type Drag = {
  id: string;
  startX: number;
  startY: number;
  offsetX: number;
  offsetY: number;
  moved: boolean;
};
export function ReaderNotes({
  versionId,
  page,
  surface = null,
  tools = null,
  onEdit,
  showPins: shownPins,
  onShowPins,
}: {
  versionId: string;
  page: number;
  /** The rendered page, when ready: READ-04 sticky notes are drawn and placed on it. */
  surface?: HighlightSurface | null;
  tools?: HTMLDivElement | null;
  onEdit?: () => void;
  /** Shared with the continuous-scroll column (READ-05), which draws other pages' notes. */
  showPins?: boolean;
  onShowPins?: (value: boolean) => void;
}) {
  const panel = useAnnotationPanel();
  const returnFocus = useReturnFocus();
  const [items, setItems] = useState<PageNote[]>([]),
    [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true),
    [listError, setListError] = useState('');
  const [loadedPage, setLoadedPage] = useState<number | null>(null);
  const [content, setContent] = useState(''),
    [draftPage, setDraftPage] = useState(page);
  const [editing, setEditing] = useState<PageNote | null>(null),
    [deleting, setDeleting] = useState<PageNote | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  const [uncertain, setUncertain] = useState(false);
  const [position, setPosition] = useState<NotePosition | null>(null),
    [picking, setPicking] = useState(false),
    [ownShowPins, setOwnShowPins] = useState(true);
  const showPins = shownPins ?? ownShowPins,
    setShowPins = onShowPins ?? setOwnShowPins;
  const [dragged, setDragged] = useState<{ id: string; position: NotePosition } | null>(null);
  const drag = useRef<Drag | null>(null);
  const requestId = useRef<string | null>(null),
    request = useRef<AbortController | null>(null);
  const textarea = useRef<HTMLTextAreaElement>(null),
    alive = useRef(true);
  const dirty =
    content !== (editing?.content ?? '') || !samePosition(position, editing?.position ?? null);
  const effectiveDraftPage = content || editing || busy || position ? draftPage : page;
  const fetching = loading || loadedPage !== page;
  useNotesLeaveGuard(dirty || uncertain, busy);
  useAnnotationEditor(
    'page',
    { dirty, busy, uncertain },
    () => discard(false),
    (item) => {
      if (item.kind === 'PAGE_NOTE') restore(item);
    },
  );
  const load = useCallback(
    (after: string | null = null) => {
      request.current?.abort();
      const controller = new AbortController();
      request.current = controller;
      return readNotes(versionId, page, after, controller.signal)
        .then((result) => {
          if (!controller.signal.aborted) {
            setItems((old) => (after ? [...old, ...result.items] : result.items));
            setCursor(result.nextCursor);
            setLoadedPage(page);
            setListError('');
          }
        })
        .catch((e: unknown) => {
          if (!controller.signal.aborted) {
            setListError(personalError(e));
            setItems([]);
            setLoadedPage(page);
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    },
    [versionId, page],
  );
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
  function discard(focus = true) {
    setContent('');
    setPosition(null);
    setPicking(false);
    setEditing(null);
    setDraftPage(page);
    requestId.current = null;
    setError('');
    setNotice('');
    setUncertain(false);
    setDeleting(null);
    if (focus) textarea.current?.focus();
  }
  function edit(note: PageNote) {
    if (panel.begin('page', () => restore(note))) onEdit?.();
  }
  function restore(note: PageNote) {
    setContent(note.content);
    setPosition(note.position);
    setPicking(false);
    setEditing(note);
    setDraftPage(note.pageNumber);
    requestId.current = null;
    setError('');
    setNotice('');
    setUncertain(false);
    textarea.current?.focus();
  }
  async function save() {
    if (busy || !content.trim()) return;
    setBusy(true);
    setError('');
    setNotice('');
    requestId.current ??= crypto.randomUUID();
    try {
      const result = editing
        ? await updateNote(versionId, editing, content.trim(), position)
        : await createNote(versionId, {
            pageNumber: effectiveDraftPage,
            content: content.trim(),
            requestId: requestId.current,
            ...(position ? { position } : {}),
          });
      if (!alive.current) return;
      setContent('');
      setPosition(null);
      setPicking(false);
      setEditing(null);
      requestId.current = null;
      setUncertain(false);
      setNotice(`Đã lưu ghi chú · Trang ${result.pageNumber}.`);
      await latestLoad.current();
    } catch (e) {
      if (!alive.current) return;
      setUncertain((previous) => previous || !(e instanceof ApiError));
      setError(
        e instanceof ApiError && e.status === 409
          ? 'Ghi chú đã thay đổi hoặc yêu cầu đã được dùng. Bản soạn vẫn được giữ; tải lại danh sách, rồi bỏ thay đổi và mở bản mới để sửa.'
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
    setNotice('');
    try {
      await removeNote(versionId, deleting);
      if (!alive.current) return;
      setDeleting(null);
      setNotice('Đã xóa ghi chú.');
      await latestLoad.current();
    } catch (e) {
      if (alive.current)
        setError(
          e instanceof ApiError && e.status === 409
            ? 'Ghi chú đã thay đổi. Tải lại danh sách trước khi xóa.'
            : personalError(e),
        );
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  /** Starts placing: the next click on the page sets where the draft note sits. */
  function startPicking() {
    if (busy || uncertain) return;
    if (!content && !editing && !position) setDraftPage(page);
    setPicking(true);
    setError('');
    setNotice('');
  }
  const place = useEffectEvent((event: MouseEvent) => {
    if (!surface || !picking) return;
    event.preventDefault();
    event.stopPropagation();
    setPosition(pagePointToPosition(event.clientX, event.clientY, surface));
    setPicking(false);
    setNotice(`Đã chọn vị trí trên trang ${surface.page}. Lưu ghi chú để ghim.`);
    textarea.current?.focus({ preventScroll: true });
  });
  const cancelPicking = useEffectEvent((event: KeyboardEvent) => {
    if (event.key !== 'Escape' || !picking) return;
    event.preventDefault();
    setPicking(false);
  });
  useEffect(() => {
    if (!picking || !surface) return;
    const element = surface.element;
    const clicked = (event: MouseEvent) => place(event);
    const key = (event: KeyboardEvent) => cancelPicking(event);
    // Capture, so a click on a highlight under the pointer does not also open it.
    element.addEventListener('click', clicked, true);
    document.addEventListener('keydown', key);
    element.classList.add('is-placing-note');
    return () => {
      element.removeEventListener('click', clicked, true);
      document.removeEventListener('keydown', key);
      element.classList.remove('is-placing-note');
    };
  }, [picking, surface]);
  async function move(note: PageNote, to: NotePosition) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await updateNote(versionId, note, note.content, to);
      if (!alive.current) return;
      setNotice(`Đã chuyển ghi chú · Trang ${note.pageNumber}.`);
    } catch (e) {
      if (!alive.current) return;
      setError(
        e instanceof ApiError && e.status === 409
          ? 'Ghi chú đã thay đổi ở lượt khác nên chưa chuyển được. Danh sách đã được tải lại.'
          : personalError(e),
      );
    } finally {
      if (alive.current) {
        await latestLoad.current();
        setDragged(null);
        setBusy(false);
      }
    }
  }
  function pressPin(event: PointerEvent<HTMLElement>, note: PageNote) {
    if (event.button !== 0 || busy || uncertain || !surface) return;
    const box = event.currentTarget.getBoundingClientRect();
    drag.current = {
      id: note.id,
      startX: event.clientX,
      startY: event.clientY,
      offsetX: event.clientX - box.left,
      offsetY: event.clientY - box.top,
      moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function dragPin(event: PointerEvent<HTMLElement>) {
    const state = drag.current;
    if (!state || !surface) return;
    if (
      !state.moved &&
      Math.hypot(event.clientX - state.startX, event.clientY - state.startY) < DRAG_THRESHOLD
    )
      return;
    state.moved = true;
    setDragged({
      id: state.id,
      position: pagePointToPosition(
        event.clientX - state.offsetX,
        event.clientY - state.offsetY,
        surface,
      ),
    });
  }
  function dropPin(note: PageNote) {
    const state = drag.current;
    if (!state?.moved || !dragged || dragged.id !== note.id) return;
    // The note open in the editor moves its draft; any other note is saved at once.
    if (editing?.id === note.id) {
      setPosition(dragged.position);
      setDragged(null);
    } else void move(note, dragged.position);
  }
  function clickPin(note: PageNote) {
    const moved = drag.current?.moved;
    drag.current = null;
    if (!moved) edit(note);
  }
  const pageItems = loadedPage === page ? items : [];
  // LEARN-02: the private mark, also from this list; it does not change the note's revision.
  const review = useReviewMark(setItems);
  const draftOnPage =
    !!surface && !!position && surface.page === effectiveDraftPage && surface.page === page;
  const pinStyle = (at: NotePosition) => pinBox(at, surface!.viewport);
  return (
    <section className="reader-notes" aria-label="Ghi chú riêng theo trang">
      {tools &&
        createPortal(
          <button
            type="button"
            className="secondary-button"
            disabled={!surface || busy || uncertain}
            onClick={() => {
              if (
                panel.begin('page', () => {
                  setDraftPage(page);
                  setPicking(true);
                })
              )
                onEdit?.();
            }}
          >
            Ghim ghi chú lên trang
          </button>,
          tools,
        )}
      {surface &&
        surface.page === page &&
        createPortal(
          <>
            {showPins &&
              pageItems.map((note) => {
                if (!note.position || editing?.id === note.id) return null;
                const at = dragged?.id === note.id ? dragged.position : note.position;
                return (
                  <button
                    key={note.id}
                    type="button"
                    className={`pdf-note-pin${dragged?.id === note.id ? ' is-dragging' : ''}`}
                    style={pinStyle(at)}
                    title={note.content}
                    aria-label={`Ghi chú trên trang: ${note.content.slice(0, 80)}. Bấm để sửa, kéo để di chuyển.`}
                    onPointerDown={(event) => pressPin(event, note)}
                    onPointerMove={dragPin}
                    onPointerUp={() => dropPin(note)}
                    onPointerCancel={() => {
                      drag.current = null;
                      setDragged(null);
                    }}
                    onClick={() => clickPin(note)}
                  >
                    {note.content}
                  </button>
                );
              })}
            {draftOnPage && (
              <div className="pdf-note-pin is-draft" aria-hidden="true" style={pinStyle(position)}>
                {content.trim() || 'Ghi chú mới'}
              </div>
            )}
          </>,
          surface.pins,
        )}
      <div className="notes-heading">
        <h3>Ghi chú riêng · Trang {page}</h3>
        <button
          className="secondary-button"
          disabled={fetching || busy}
          onClick={() => {
            setLoading(true);
            setListError('');
            setDeleting(null);
            void load();
          }}
        >
          Tải lại ghi chú
        </button>
      </div>
      <p className="field-hint">
        Chỉ bạn xem được ghi chú. Gắn với phiên bản này; đổi bản PDF không tự chuyển ghi chú.
      </p>
      <p className="field-hint">
        Hãy lưu để giữ ghi chú. Khi rời trang, bạn sẽ được hỏi trước khi bỏ bản soạn chưa lưu.
      </p>
      <form
        className="note-editor"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <h4>Ghi chú đang soạn · Trang {effectiveDraftPage}</h4>
        <label htmlFor="page-note-content">Nội dung ghi chú</label>
        <textarea
          id="page-note-content"
          ref={textarea}
          value={content}
          maxLength={4000}
          rows={4}
          readOnly={busy || uncertain}
          onChange={(e) => {
            if (!content && !editing) setDraftPage(page);
            setContent(e.target.value);
            setNotice('');
          }}
          aria-describedby="note-limit"
        />
        <p className="field-hint" id="note-limit">
          {content.length}/4000 ký tự · {editing ? 'Đang sửa ghi chú' : 'Ghi chú mới'}
        </p>
        <div className="note-pin-controls">
          {picking ? (
            <>
              <p role="status" className="field-hint">
                Bấm vào chỗ cần ghim trên trang PDF. Nhấn Esc để hủy.
              </p>
              <button type="button" className="text-button" onClick={() => setPicking(false)}>
                Hủy chọn vị trí
              </button>
            </>
          ) : (
            <>
              <p className="field-hint">
                {position
                  ? `Ghim trên trang ${effectiveDraftPage}. Kéo giấy nhớ để đổi chỗ.`
                  : 'Chưa ghim lên trang; ghi chú chỉ hiện ở khung này.'}
              </p>
              <button
                type="button"
                className="secondary-button"
                disabled={busy || uncertain || !surface || effectiveDraftPage !== page}
                onClick={startPicking}
              >
                {position ? 'Chọn lại vị trí' : 'Ghim lên trang'}
              </button>
              {position && (
                <button
                  type="button"
                  className="text-button"
                  disabled={busy || uncertain}
                  onClick={() => setPosition(null)}
                >
                  Bỏ ghim
                </button>
              )}
            </>
          )}
        </div>
        {uncertain && (
          <p className="field-hint">
            Tạm giữ nguyên bản soạn để thử lại đúng lần lưu. Có thể tải lại danh sách để kiểm tra.
          </p>
        )}
        <div className="note-actions">
          <button type="submit" className="primary-button" disabled={busy || !content.trim()}>
            {busy ? 'Đang lưu…' : 'Lưu ghi chú'}
          </button>
          {(content || editing || position) && (
            <button
              type="button"
              className="secondary-button"
              disabled={busy}
              onClick={() => discard()}
            >
              Bỏ thay đổi
            </button>
          )}
        </div>
      </form>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {review.message && (
        <p role="status" className="field-hint">
          {review.message}
        </p>
      )}
      {listError && loadedPage === page && <p role="alert">{listError}</p>}
      {fetching && <p role="status">Đang tải ghi chú…</p>}
      {!fetching && !listError && items.length === 0 && (
        <p className="field-hint">Chưa có ghi chú ở trang này. Viết điều cần nhớ khi đọc.</p>
      )}
      <label className="note-pin-toggle">
        <input type="checkbox" checked={showPins} onChange={(e) => setShowPins(e.target.checked)} />
        Hiện giấy nhớ trên trang
      </label>
      <div className="note-list">
        {pageItems.map((note) => (
          <article key={note.id} aria-label={`Ghi chú ${note.id}`}>
            <p className="note-content">{note.content}</p>
            <p className="field-hint">
              Trang {note.pageNumber}
              {note.position ? ' · Ghim trên trang' : ''} · Sửa lúc{' '}
              {new Date(note.updatedAt).toLocaleString('vi-VN')}
              {note.reviewLater && <strong className="review-later-tag"> · Cần xem lại</strong>}
            </p>
            <div className="note-actions">
              <button
                className="secondary-button"
                disabled={busy || uncertain}
                onClick={() => edit(note)}
              >
                Sửa
              </button>
              <button
                className="secondary-button"
                disabled={busy || dirty || uncertain || !!editing}
                onClick={() => {
                  returnFocus.remember();
                  setDeleting(note);
                }}
              >
                Xóa
              </button>
              <ReviewMarkButton
                item={note}
                busy={review.marking === note.id}
                onClick={() => void review.mark(note)}
              />
            </div>
            {deleting?.id === note.id && (
              <div className="note-delete">
                <p>Xóa ghi chú này? Thao tác không thể hoàn tác.</p>
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
                    Giữ lại
                  </button>
                </div>
              </div>
            )}
          </article>
        ))}
      </div>
      {cursor && loadedPage === page && (
        <button
          className="secondary-button"
          disabled={fetching || busy}
          onClick={() => {
            setLoading(true);
            void load(cursor);
          }}
        >
          Xem thêm ghi chú
        </button>
      )}
    </section>
  );
}
