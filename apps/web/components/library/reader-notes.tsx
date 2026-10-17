'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '../../lib/auth';
import {
  createNote,
  personalError,
  readNotes,
  removeNote,
  updateNote,
  type PageNote,
} from '../../lib/reading';
import { useNotesLeaveGuard } from './use-notes-leave-guard';
import { useAnnotationEditor, useAnnotationPanel } from './reader-annotation-panel';
export function ReaderNotes({ versionId, page }: { versionId: string; page: number }) {
  const panel = useAnnotationPanel();
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
  const requestId = useRef<string | null>(null),
    request = useRef<AbortController | null>(null);
  const textarea = useRef<HTMLTextAreaElement>(null),
    alive = useRef(true);
  const dirty = content !== (editing?.content ?? '');
  const effectiveDraftPage = content || editing || busy ? draftPage : page;
  const fetching = loading || loadedPage !== page;
  useNotesLeaveGuard(dirty || uncertain, busy);
  useAnnotationEditor('page', { dirty, busy, uncertain }, () => discard(false));
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
    panel.begin('page', () => {
      setContent(note.content);
      setEditing(note);
      setDraftPage(note.pageNumber);
      requestId.current = null;
      setError('');
      setNotice('');
      setUncertain(false);
      textarea.current?.focus();
    });
  }
  async function save() {
    if (busy || !content.trim()) return;
    setBusy(true);
    setError('');
    setNotice('');
    requestId.current ??= crypto.randomUUID();
    try {
      const result = editing
        ? await updateNote(versionId, editing, content.trim())
        : await createNote(versionId, {
            pageNumber: effectiveDraftPage,
            content: content.trim(),
            requestId: requestId.current,
          });
      if (!alive.current) return;
      setContent('');
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
  return (
    <section className="reader-notes" aria-label="Ghi chú riêng theo trang">
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
        {uncertain && (
          <p className="field-hint">
            Tạm giữ nguyên bản soạn để thử lại đúng lần lưu. Có thể tải lại danh sách để kiểm tra.
          </p>
        )}
        <div className="note-actions">
          <button type="submit" className="primary-button" disabled={busy || !content.trim()}>
            {busy ? 'Đang lưu…' : 'Lưu ghi chú'}
          </button>
          {(content || editing) && (
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
      {listError && loadedPage === page && <p role="alert">{listError}</p>}
      {fetching && <p role="status">Đang tải ghi chú…</p>}
      {!fetching && !listError && items.length === 0 && (
        <p className="field-hint">Chưa có ghi chú ở trang này. Viết điều cần nhớ khi đọc.</p>
      )}
      <div className="note-list">
        {(loadedPage === page ? items : []).map((note) => (
          <article key={note.id} aria-label={`Ghi chú ${note.id}`}>
            <p className="note-content">{note.content}</p>
            <p className="field-hint">
              Trang {note.pageNumber} · Sửa lúc {new Date(note.updatedAt).toLocaleString('vi-VN')}
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
                onClick={() => setDeleting(note)}
              >
                Xóa
              </button>
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
                    onClick={() => setDeleting(null)}
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
