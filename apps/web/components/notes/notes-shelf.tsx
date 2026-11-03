'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { libraryCourses } from '../../lib/library';
import { COVER_STYLES } from '../../lib/note-model';
import {
  createNotebook,
  duplicateNotebook,
  listNotebooks,
  notebooksUsage,
  notesError,
  notesPath,
  purgeNotebook,
  restoreNotebook,
  trashNotebook,
  type Notebook,
  type NotebookCourse,
  formatSize,
} from '../../lib/notes';
import { Button } from '../ui/button';
import { NotebookForm, NoteModal } from './note-dialogs';
import { NotebookSettings } from './note-editor';

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });

export function NotebookCover({
  notebook,
}: {
  notebook: Pick<Notebook, 'title' | 'cover' | 'course'>;
}) {
  const style = COVER_STYLES[notebook.cover];
  return (
    <span
      className="note-cover"
      style={{ background: style.fill, color: style.ink }}
      aria-hidden="true"
    >
      <span className="note-cover-spine" />
      <span className="note-cover-label">
        <span className="note-cover-title">{notebook.title}</span>
        {notebook.course && <span className="note-cover-course">{notebook.course.code}</span>}
      </span>
    </span>
  );
}

/** "Vở ghi": the shelf of the user's notebooks, its search, course filter and trash. */
export function NotesShelf() {
  const router = useRouter();
  const [trash, setTrash] = useState(false);
  const [query, setQuery] = useState('');
  const [courseId, setCourseId] = useState('');
  const [items, setItems] = useState<Notebook[]>([]);
  const [shelfCourses, setShelfCourses] = useState<NotebookCourse[]>([]);
  const [allCourses, setAllCourses] = useState<NotebookCourse[]>([]);
  const [trashDays, setTrashDays] = useState(30);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [usage, setUsage] = useState<{ imageBytes: number; imageLimit: number } | null>(null);
  const [dialog, setDialog] = useState<
    | { kind: 'create' }
    | { kind: 'edit'; notebook: Notebook }
    | { kind: 'purge'; notebook: Notebook }
    | null
  >(null);
  const [message, setMessage] = useState<{ text: string; tone: 'info' | 'error' } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [pending, setPending] = useState<string | null>(null);
  const [loadedAt, setLoadedAt] = useState(0);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(
      () => {
        setStatus('loading');
        listNotebooks({ q: query, courseId: courseId || undefined, trash }, controller.signal)
          .then((result) => {
            setItems(result.items);
            setShelfCourses(result.courses);
            setTrashDays(result.trashDays);
            setLoadedAt(Date.now());
            setStatus('ready');
          })
          .catch(() => !controller.signal.aborted && setStatus('error'));
      },
      query ? 300 : 0,
    );
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, courseId, trash, attempt]);
  useEffect(() => {
    const controller = new AbortController();
    notebooksUsage(controller.signal)
      .then(setUsage)
      .catch(() => undefined);
    return () => controller.abort();
  }, [attempt]);
  const loadCourses = useCallback(() => {
    if (allCourses.length) return;
    libraryCourses(new AbortController().signal)
      .then(setAllCourses)
      .catch(() => undefined);
  }, [allCourses.length]);

  async function act(id: string, work: () => Promise<void>, done: string) {
    setPending(id);
    setMessage(null);
    try {
      await work();
      setMessage({ text: done, tone: 'info' });
      reload();
    } catch (error) {
      setMessage({ text: notesError(error), tone: 'error' });
    } finally {
      setPending(null);
    }
  }
  const daysLeft = (deletedAt: string) =>
    Math.max(0, trashDays - Math.floor((loadedAt - new Date(deletedAt).getTime()) / 86_400_000));

  return (
    <section className="notes-shelf" aria-label="Kệ vở">
      <div className="notes-shelf-bar">
        <div className="notes-tabs" role="tablist" aria-label="Kệ vở">
          <button type="button" role="tab" aria-selected={!trash} onClick={() => setTrash(false)}>
            Vở của tôi
          </button>
          <button type="button" role="tab" aria-selected={trash} onClick={() => setTrash(true)}>
            Thùng rác
          </button>
        </div>
        <label className="note-form-field notes-search">
          <span>Tìm vở</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tên vở hoặc chữ đã gõ trong vở"
          />
        </label>
        <label className="note-form-field">
          <span>Môn học</span>
          <select value={courseId} onChange={(e) => setCourseId(e.target.value)}>
            <option value="">Tất cả môn</option>
            {shelfCourses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code} · {c.name}
              </option>
            ))}
          </select>
        </label>
        {!trash && (
          <Button
            variant="primary"
            onClick={() => {
              loadCourses();
              setDialog({ kind: 'create' });
            }}
          >
            + Vở mới
          </Button>
        )}
      </div>
      {usage && (
        <p className="note-form-hint">
          Ảnh trong vở: {formatSize(usage.imageBytes)} / {formatSize(usage.imageLimit)}. Vở chỉ mình
          bạn xem được. Chữ viết tay chưa tìm kiếm được; chữ gõ thì có.
        </p>
      )}
      {trash && (
        <p className="note-form-hint">Vở trong thùng rác tự xóa hẳn sau {trashDays} ngày.</p>
      )}
      {message && (
        <p
          className="note-notice"
          data-tone={message.tone}
          role={message.tone === 'error' ? 'alert' : 'status'}
        >
          {message.text}
        </p>
      )}
      {status === 'error' && (
        <p role="alert">
          Chưa tải được kệ vở.{' '}
          <Button variant="quiet" onClick={reload}>
            Thử lại
          </Button>
        </p>
      )}
      {status === 'loading' && !items.length && <p role="status">Đang tải kệ vở…</p>}
      {status === 'ready' && !items.length && (
        <div className="notes-empty">
          {trash ? (
            <p>Thùng rác trống.</p>
          ) : query || courseId ? (
            <p>Không có vở nào khớp.</p>
          ) : (
            <>
              <p>
                Chưa có vở nào. Tạo vở đầu tiên để viết tay, gõ chữ, dán ảnh và trích dẫn tài liệu.
              </p>
              <Button
                variant="primary"
                onClick={() => {
                  loadCourses();
                  setDialog({ kind: 'create' });
                }}
              >
                Tạo vở đầu tiên
              </Button>
            </>
          )}
        </div>
      )}
      <ul className="notes-grid" aria-busy={status === 'loading' || undefined}>
        {items.map((notebook) => (
          <li key={notebook.id} className="notes-card" data-notebook-id={notebook.id}>
            {trash ? (
              <span className="notes-card-cover">
                <NotebookCover notebook={notebook} />
              </span>
            ) : (
              <Link
                href={notesPath(notebook.id)}
                className="notes-card-cover"
                aria-label={`Mở vở ${notebook.title}`}
              >
                <NotebookCover notebook={notebook} />
              </Link>
            )}
            <div className="notes-card-body">
              <h2>
                {trash ? (
                  notebook.title
                ) : (
                  <Link href={notesPath(notebook.id)}>{notebook.title}</Link>
                )}
              </h2>
              <p>
                {notebook.course ? `${notebook.course.code} · ` : ''}
                {notebook.pageCount} trang · sửa {formatDate(notebook.updatedAt)}
              </p>
              {trash && notebook.deletedAt && (
                <p>Còn {daysLeft(notebook.deletedAt)} ngày trước khi xóa hẳn</p>
              )}
              <div className="notes-card-actions">
                {trash ? (
                  <>
                    <Button
                      variant="secondary"
                      pending={pending === notebook.id}
                      onClick={() =>
                        void act(
                          notebook.id,
                          () => restoreNotebook(notebook.id).then(() => undefined),
                          `Đã khôi phục “${notebook.title}”.`,
                        )
                      }
                    >
                      Khôi phục
                    </Button>
                    <Button variant="danger" onClick={() => setDialog({ kind: 'purge', notebook })}>
                      Xóa vĩnh viễn
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      variant="quiet"
                      onClick={() => {
                        loadCourses();
                        setDialog({ kind: 'edit', notebook });
                      }}
                    >
                      Sửa
                    </Button>
                    <Button
                      variant="quiet"
                      pending={pending === `d${notebook.id}`}
                      onClick={() =>
                        void act(
                          `d${notebook.id}`,
                          () => duplicateNotebook(notebook.id).then(() => undefined),
                          `Đã nhân bản “${notebook.title}”.`,
                        )
                      }
                    >
                      Nhân bản
                    </Button>
                    <Button
                      variant="quiet"
                      pending={pending === notebook.id}
                      onClick={() =>
                        void act(
                          notebook.id,
                          () => trashNotebook(notebook.id, notebook.revision),
                          `Đã chuyển “${notebook.title}” vào thùng rác.`,
                        )
                      }
                    >
                      Xóa
                    </Button>
                  </>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
      {dialog?.kind === 'create' && (
        <NoteModal title="Vở mới" onClose={() => setDialog(null)} wide>
          <NotebookForm
            initial={{
              title: '',
              cover: 'navy',
              courseId: courseId || null,
              defaultSize: 'A4_PORTRAIT',
              defaultPaper: 'RULED_NARROW',
              defaultColor: 'white',
            }}
            courses={allCourses.length ? allCourses : shelfCourses}
            submitLabel="Tạo vở"
            onCancel={() => setDialog(null)}
            onSubmit={async (fields) => {
              try {
                const result = await createNotebook(fields);
                setDialog(null);
                router.push(notesPath(result.item.id, result.pages[0]?.id));
                return null;
              } catch (error) {
                return notesError(error);
              }
            }}
          />
        </NoteModal>
      )}
      {dialog?.kind === 'edit' && (
        <NotebookSettings
          notebook={dialog.notebook}
          courses={allCourses}
          loadCourses={loadCourses}
          onClose={() => setDialog(null)}
          onSaved={() => {
            setDialog(null);
            reload();
          }}
        />
      )}
      {dialog?.kind === 'purge' && (
        <NoteModal
          title={`Xóa vĩnh viễn “${dialog.notebook.title}”?`}
          onClose={() => setDialog(null)}
        >
          <p>
            Mọi trang của vở sẽ bị xóa và không khôi phục được. Ảnh chỉ dùng trong vở này cũng bị
            xóa sau đó.
          </p>
          <div className="note-form-actions">
            <Button variant="quiet" onClick={() => setDialog(null)}>
              Hủy
            </Button>
            <Button
              variant="danger"
              pending={pending === dialog.notebook.id}
              onClick={() => {
                const target = dialog.notebook;
                setDialog(null);
                void act(
                  target.id,
                  () => purgeNotebook(target.id),
                  `Đã xóa vĩnh viễn “${target.title}”.`,
                );
              }}
            >
              Xóa vĩnh viễn
            </Button>
          </div>
        </NoteModal>
      )}
    </section>
  );
}
