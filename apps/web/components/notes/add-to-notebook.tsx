'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  addQuotes,
  createNotebook,
  listNotebooks,
  notesError,
  notesPath,
  type Notebook,
} from '../../lib/notes';
import { Button } from '../ui/button';
import { NoteModal } from './note-dialogs';

/**
 * "Ghi vào vở" from the reader or the Sổ tay: the chosen notes become quote cards on a new page
 * at the end of a notebook (the most recently used one by default, or a new one).
 */
export function AddToNotebook({
  annotationIds,
  onClose,
}: {
  annotationIds: string[];
  onClose: () => void;
}) {
  const [notebooks, setNotebooks] = useState<Notebook[] | null>(null);
  const [target, setTarget] = useState<string>('');
  const [title, setTitle] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState<{ href: string; title: string } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    listNotebooks({}, controller.signal)
      .then((result) => {
        setNotebooks(result.items);
        setTarget(result.items[0]?.id ?? 'new');
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setNotebooks([]);
          setTarget('new');
          setError('Chưa tải được danh sách vở. Bạn vẫn có thể tạo vở mới.');
        }
      });
    return () => controller.abort();
  }, []);
  async function submit() {
    setPending(true);
    setError('');
    try {
      let notebookId = target;
      let name = notebooks?.find((n) => n.id === target)?.title ?? '';
      if (target === 'new') {
        name = title.trim() || 'Vở trích dẫn';
        const created = await createNotebook({
          title: name,
          cover: 'navy',
          courseId: null,
          defaultSize: 'A4_PORTRAIT',
          defaultPaper: 'RULED_NARROW',
          defaultColor: 'white',
        });
        notebookId = created.item.id;
      }
      const result = await addQuotes(notebookId, annotationIds);
      setDone({ href: notesPath(notebookId, result.page.id), title: name });
    } catch (error) {
      setError(notesError(error, 'Chưa ghi được vào vở.'));
    } finally {
      setPending(false);
    }
  }
  return (
    <NoteModal title="Ghi vào vở" onClose={onClose}>
      {done ? (
        <>
          <p role="status">
            Đã thêm {annotationIds.length} thẻ trích dẫn vào trang mới cuối vở “{done.title}”.
          </p>
          <div className="note-form-actions">
            <Button variant="quiet" onClick={onClose}>
              Đóng
            </Button>
            <Link className="primary-button control-default" href={done.href}>
              Mở vở
            </Link>
          </div>
        </>
      ) : (
        <>
          <p className="note-form-hint">
            {annotationIds.length} mục sẽ thành thẻ trích dẫn trên một trang mới ở cuối vở. Bấm vào
            thẻ để mở lại đúng tài liệu và trang.
          </p>
          {!notebooks ? (
            <p role="status">Đang tải danh sách vở…</p>
          ) : (
            <fieldset className="note-choice-group note-target-list">
              <legend>Chọn vở</legend>
              {notebooks.map((n) => (
                <label key={n.id} className="note-chip">
                  <input
                    type="radio"
                    name="target"
                    checked={target === n.id}
                    onChange={() => setTarget(n.id)}
                  />
                  {n.title}
                </label>
              ))}
              <label className="note-chip">
                <input
                  type="radio"
                  name="target"
                  checked={target === 'new'}
                  onChange={() => setTarget('new')}
                />
                Vở mới
              </label>
              {target === 'new' && (
                <label className="note-form-field">
                  <span>Tên vở mới</span>
                  <input
                    value={title}
                    maxLength={120}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Vở trích dẫn"
                  />
                </label>
              )}
            </fieldset>
          )}
          {error && (
            <p role="alert" className="note-error">
              {error}
            </p>
          )}
          <div className="note-form-actions">
            <Button variant="quiet" onClick={onClose}>
              Hủy
            </Button>
            <Button
              variant="primary"
              pending={pending}
              disabled={!notebooks}
              onClick={() => void submit()}
            >
              Ghi vào vở
            </Button>
          </div>
        </>
      )}
    </NoteModal>
  );
}

/** The "Ghi vào vở" button with its dialog; at most 20 notes go in one request. */
export function AddToNotebookButton({
  annotationIds,
  label = 'Ghi vào vở',
  disabled = false,
}: {
  annotationIds: string[];
  label?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="secondary-button"
        disabled={disabled || !annotationIds.length}
        onClick={() => setOpen(true)}
      >
        {label}
      </button>
      {open && (
        <AddToNotebook annotationIds={annotationIds.slice(0, 20)} onClose={() => setOpen(false)} />
      )}
    </>
  );
}
