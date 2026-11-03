'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { FONTS, INK_COLORS, type FontId, type TextItem } from '../../lib/note-model';
import { textBoxStyle } from './note-render';
import { blocksToDom, domToBlocks } from './note-text';

const SIZES = [12, 14, 16, 18, 20, 24, 28, 32, 40, 48, 64, 80];
const BACKGROUNDS = [
  null,
  '#fff59d',
  '#c8e6c9',
  '#bbdefb',
  '#f8bbd0',
  '#ffe0b2',
  '#eceff1',
] as const;

type View = { zoom: number; x: number; y: number };

/**
 * Typing on the page: a contenteditable box laid over the canvas at the page's zoom, with a
 * floating format bar. Formatting uses the browser's editing commands (which keep the selection
 * and IME input such as Telex/VNI working); what is kept is read back by `domToBlocks`.
 */
export function NoteTextEditor({
  item,
  view,
  onChange,
  onDone,
}: {
  item: TextItem;
  view: View;
  onChange: (item: TextItem) => void;
  onDone: (item: TextItem) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const shell = useRef<HTMLDivElement>(null);
  const latest = useRef(item);
  useLayoutEffect(() => {
    latest.current = item;
  }, [item]);
  const finished = useRef(false);
  const [resizing, setResizing] = useState<{ startX: number; startW: number } | null>(null);

  useLayoutEffect(() => {
    const node = box.current;
    if (!node) return;
    node.replaceChildren(blocksToDom(item.blocks, document));
    node.focus({ preventScroll: true });
    const range = document.createRange();
    range.selectNodeContents(node);
    range.collapse(false);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    try {
      document.execCommand('styleWithCSS', false, 'false');
    } catch {
      /* Older engines ignore it. */
    }
    // Only on mount: later prop changes are format changes applied to this same DOM.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function finish() {
    if (finished.current || !box.current) return;
    finished.current = true;
    onDone({ ...latest.current, blocks: domToBlocks(box.current) });
  }
  // Leaving both the box and its format bar ends editing.
  useEffect(() => {
    const out = (event: PointerEvent) => {
      if (shell.current && event.target instanceof Node && !shell.current.contains(event.target))
        finish();
    };
    document.addEventListener('pointerdown', out, true);
    return () => document.removeEventListener('pointerdown', out, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!resizing) return;
    const move = (event: PointerEvent) =>
      onChange({
        ...latest.current,
        w: Math.max(
          40,
          Math.min(
            4000,
            Math.round(resizing.startW + (event.clientX - resizing.startX) / view.zoom),
          ),
        ),
      });
    const up = () => setResizing(null);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, [resizing, onChange, view.zoom]);

  const command = (name: string, value?: string) => {
    box.current?.focus({ preventScroll: true });
    document.execCommand(name, false, value);
  };
  const keep = (event: React.MouseEvent | React.PointerEvent) => event.preventDefault();
  const left = view.x + item.x * view.zoom,
    top = view.y + item.y * view.zoom;

  return (
    <div ref={shell} className="note-text-shell" style={{ left, top }}>
      <div className="note-format-bar" role="toolbar" aria-label="Định dạng chữ">
        <label className="note-field">
          <span className="sr-only">Font chữ</span>
          <select
            value={item.font}
            onChange={(e) => onChange({ ...latest.current, font: e.target.value as FontId })}
            aria-label="Font chữ"
          >
            {FONTS.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
        </label>
        <label className="note-field">
          <span className="sr-only">Cỡ chữ</span>
          <select
            value={item.size}
            onChange={(e) => onChange({ ...latest.current, size: Number(e.target.value) })}
            aria-label="Cỡ chữ"
          >
            {[...new Set([...SIZES, item.size])]
              .sort((a, b) => a - b)
              .map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
          </select>
        </label>
        <button
          type="button"
          className="note-icon-button"
          onMouseDown={keep}
          onClick={() => command('bold')}
          aria-label="Đậm"
          title="Đậm (Ctrl+B)"
        >
          <b>B</b>
        </button>
        <button
          type="button"
          className="note-icon-button"
          onMouseDown={keep}
          onClick={() => command('italic')}
          aria-label="Nghiêng"
          title="Nghiêng (Ctrl+I)"
        >
          <i>I</i>
        </button>
        <button
          type="button"
          className="note-icon-button"
          onMouseDown={keep}
          onClick={() => command('underline')}
          aria-label="Gạch chân"
          title="Gạch chân (Ctrl+U)"
        >
          <u>U</u>
        </button>
        <button
          type="button"
          className="note-icon-button"
          onMouseDown={keep}
          onClick={() => command('strikeThrough')}
          aria-label="Gạch ngang"
        >
          <s>S</s>
        </button>
        <button
          type="button"
          className="note-icon-button"
          onMouseDown={keep}
          onClick={() => command('insertUnorderedList')}
          aria-label="Gạch đầu dòng"
        >
          •≡
        </button>
        <button
          type="button"
          className="note-icon-button"
          onMouseDown={keep}
          onClick={() => command('insertOrderedList')}
          aria-label="Danh sách số"
        >
          1.
        </button>
        <span className="note-swatches" aria-label="Màu chữ đã chọn">
          {INK_COLORS.slice(0, 6).map((c) => (
            <button
              key={c}
              type="button"
              className="note-swatch"
              style={{ background: c }}
              onMouseDown={keep}
              onClick={() => command('foreColor', c)}
              aria-label={`Tô màu chữ đã chọn ${c}`}
            />
          ))}
        </span>
        <label className="note-field">
          <span className="sr-only">Màu cả hộp chữ</span>
          <input
            type="color"
            value={item.color}
            onChange={(e) => onChange({ ...latest.current, color: e.target.value })}
            aria-label="Màu cả hộp chữ"
          />
        </label>
        <span className="note-segment" role="group" aria-label="Căn lề">
          {(['left', 'center', 'right'] as const).map((a) => (
            <button
              key={a}
              type="button"
              className="note-icon-button"
              aria-pressed={item.align === a}
              onMouseDown={keep}
              onClick={() => onChange({ ...latest.current, align: a })}
              aria-label={a === 'left' ? 'Căn trái' : a === 'center' ? 'Căn giữa' : 'Căn phải'}
            >
              {a === 'left' ? '⇤' : a === 'center' ? '↔' : '⇥'}
            </button>
          ))}
        </span>
        <span className="note-swatches" role="group" aria-label="Nền hộp chữ">
          {BACKGROUNDS.map((c) => (
            <button
              key={c ?? 'none'}
              type="button"
              className="note-swatch"
              data-empty={c === null || undefined}
              style={{ background: c ?? '#ffffff' }}
              aria-pressed={item.bg === c}
              onMouseDown={keep}
              onClick={() => onChange({ ...latest.current, bg: c })}
              aria-label={c ? `Nền ${c}` : 'Không nền'}
            />
          ))}
        </span>
        <button type="button" className="note-done" onMouseDown={keep} onClick={finish}>
          Xong
        </button>
      </div>
      <div className="note-text-frame" style={{ transform: `scale(${view.zoom})`, width: item.w }}>
        <div
          ref={box}
          className="note-text-input"
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          aria-multiline="true"
          aria-label="Nội dung hộp chữ"
          spellCheck
          lang="vi"
          style={{ ...textBoxStyle(item), minHeight: `${item.size * 1.45 + 8}px` }}
          onKeyDown={(event) => {
            event.stopPropagation();
            // Escape inside a Telex/VNI composition cancels the composition, not the box.
            if (event.key === 'Escape' && !event.nativeEvent.isComposing) {
              event.preventDefault();
              finish();
            }
          }}
          onPaste={(event) => {
            // Pasted text arrives as plain text; formatting from other pages is not kept.
            event.preventDefault();
            const text = event.clipboardData.getData('text/plain');
            if (text) document.execCommand('insertText', false, text);
          }}
          onDrop={(event) => event.preventDefault()}
        />
        <span
          className="note-text-resize"
          role="presentation"
          onPointerDown={(event) => {
            event.preventDefault();
            setResizing({ startX: event.clientX, startW: item.w });
          }}
        />
      </div>
    </div>
  );
}
