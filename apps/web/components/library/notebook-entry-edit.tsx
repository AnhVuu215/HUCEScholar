'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ApiError } from '../../lib/auth';
import { deleteAnnotation, editAnnotation, type AnnotationItem } from '../../lib/annotations';
import { highlightColors, isHighlightColor } from '../../lib/highlights';
import { personalError } from '../../lib/reading';
import { SelectField } from '../ui/select-field';

/**
 * LEARN-03b: edit or delete one notebook entry in place, at the revision the search returned.
 * A change made elsewhere since (409) keeps the draft and asks for a new search; the API checks
 * ownership and access on every write. Pins and highlight anchors stay as they were.
 */
export function NotebookEntryEdit({
  item,
  onSaved,
  onDeleted,
}: {
  item: AnnotationItem;
  onSaved: (saved: AnnotationItem) => void;
  onDeleted: (item: AnnotationItem) => void;
}) {
  const [mode, setMode] = useState<'edit' | 'delete' | null>(null);
  const [content, setContent] = useState('');
  const [color, setColor] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const editButton = useRef<HTMLButtonElement>(null);
  const deleteButton = useRef<HTMLButtonElement>(null);
  // Focus goes back to the opening button once it is enabled again, after an async save too.
  const refocus = useRef<'edit' | 'delete' | null>(null);
  useEffect(() => {
    if (mode || !refocus.current) return;
    (refocus.current === 'edit' ? editButton : deleteButton).current?.focus();
    refocus.current = null;
  }, [mode]);
  const highlight = item.kind === 'TEXT_HIGHLIGHT';
  const id = `notebook-edit-${item.id}`;
  const changed = content.trim() !== item.content || (highlight && color !== item.color);
  function open(next: 'edit' | 'delete') {
    setMode(next);
    setContent(item.content);
    setColor(highlight ? item.color : '');
    setError('');
    setNotice('');
  }
  function close() {
    refocus.current = mode;
    setMode(null);
    setError('');
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy || !changed || (!highlight && !content.trim())) return;
    setBusy(true);
    setError('');
    try {
      const saved = await editAnnotation(
        item,
        content.trim(),
        highlight && isHighlightColor(color) ? color : null,
      );
      onSaved(saved);
      setNotice(`Đã lưu ${highlight ? 'vùng tô' : 'ghi chú'} · Trang ${saved.pageNumber}.`);
      close();
    } catch (failure) {
      setError(
        failure instanceof ApiError && failure.status === 409
          ? 'Mục này đã được sửa ở nơi khác. Bản soạn vẫn được giữ; tìm lại để lấy bản mới rồi sửa.'
          : personalError(failure),
      );
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await deleteAnnotation(item);
      onDeleted(item);
    } catch (failure) {
      setError(
        failure instanceof ApiError && failure.status === 409
          ? 'Mục này đã thay đổi ở nơi khác. Tìm lại để lấy bản mới trước khi xóa.'
          : personalError(failure),
      );
      setBusy(false);
    }
  }
  return (
    <>
      {/* Kept mounted, so focus returns to the button that opened the form. */}
      <div className="note-actions notebook-entry-actions">
        <button
          ref={editButton}
          className="text-button"
          disabled={!!mode}
          onClick={() => open('edit')}
        >
          Sửa
        </button>
        <button
          ref={deleteButton}
          className="text-button"
          disabled={!!mode}
          onClick={() => open('delete')}
        >
          Xóa
        </button>
      </div>
      {mode === 'edit' && (
        <form className="note-editor notebook-entry-editor" onSubmit={(event) => void save(event)}>
          <label htmlFor={`${id}-content`}>
            {highlight ? 'Ghi chú kèm đoạn tô (không bắt buộc)' : 'Nội dung ghi chú'}
          </label>
          <textarea
            id={`${id}-content`}
            autoFocus
            maxLength={4000}
            value={content}
            onChange={(event) => setContent(event.target.value)}
          />
          {highlight && (
            <SelectField
              id={`${id}-color`}
              label="Màu tô"
              value={color}
              options={Object.entries(highlightColors).map(([value, label]) => ({
                value,
                label,
              }))}
              onChange={setColor}
            />
          )}
          <p className="field-hint">
            Mục đã sửa vẫn ở đây đến lần tìm sau, kể cả khi không còn khớp bộ lọc.
          </p>
          <div className="note-actions">
            <button
              type="submit"
              className="primary-button"
              disabled={busy || !changed || (!highlight && !content.trim())}
            >
              {busy ? 'Đang lưu…' : 'Lưu thay đổi'}
            </button>
            <button type="button" className="secondary-button" disabled={busy} onClick={close}>
              Hủy
            </button>
          </div>
        </form>
      )}
      {mode === 'delete' && (
        <div className="note-delete">
          <p>
            {highlight
              ? 'Xóa vùng tô và ghi chú kèm theo? Thao tác không thể hoàn tác.'
              : 'Xóa ghi chú này? Thao tác không thể hoàn tác.'}
          </p>
          <div className="note-actions">
            <button className="primary-button" disabled={busy} onClick={() => void remove()}>
              {busy ? 'Đang xóa…' : 'Xác nhận xóa'}
            </button>
            <button className="secondary-button" autoFocus disabled={busy} onClick={close}>
              Giữ lại
            </button>
          </div>
        </div>
      )}
      {error && <p role="alert">{error}</p>}
      {notice && (
        <p role="status" className="field-hint">
          {notice}
        </p>
      )}
    </>
  );
}
