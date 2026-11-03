'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  FONTS,
  normalizeCols,
  TABLE_BORDERS,
  TABLE_LIMITS,
  tableInsertCol,
  tableInsertRow,
  tableRemoveCol,
  tableRemoveRow,
  type FontId,
  type TableItem,
} from '../../lib/note-model';
import { tableStyles } from './note-render';

const SIZES = [10, 12, 14, 16, 18, 20, 24, 28, 32];
type View = { zoom: number; x: number; y: number };
type Drag =
  | { kind: 'col'; index: number; startX: number; startCols: number[] }
  | { kind: 'width'; startX: number; startW: number };

/**
 * CANVAS-03: editing a table on the page. Each cell is a textarea that grows with its text
 * (so Telex/VNI input works as anywhere else); Tab and Shift+Tab move between cells and Tab in
 * the last cell adds a row. Column borders and the right edge can be dragged.
 */
export function NoteTableEditor({
  item,
  view,
  onChange,
  onDone,
}: {
  item: TableItem;
  view: View;
  onChange: (item: TableItem) => void;
  onDone: (item: TableItem) => void;
}) {
  const shell = useRef<HTMLDivElement>(null);
  const table = useRef<HTMLTableElement>(null);
  const latest = useRef(item);
  useLayoutEffect(() => {
    latest.current = item;
  }, [item]);
  const finished = useRef(false);
  const [active, setActive] = useState({ r: 0, c: 0 });
  const [drag, setDrag] = useState<Drag | null>(null);
  const focusCell = useRef<{ r: number; c: number } | null>({ r: 0, c: 0 });

  // Focus follows structural edits (a new row, a removed column) once React has rendered them.
  useLayoutEffect(() => {
    const target = focusCell.current;
    if (!target) return;
    focusCell.current = null;
    const cell = table.current?.querySelector<HTMLTextAreaElement>(
      `textarea[data-cell="${target.r}-${target.c}"]`,
    );
    cell?.focus({ preventScroll: true });
  });

  function finish() {
    if (finished.current) return;
    finished.current = true;
    onDone(latest.current);
  }
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
    if (!drag) return;
    const move = (event: PointerEvent) => {
      const dx = (event.clientX - drag.startX) / view.zoom;
      const current = latest.current;
      if (drag.kind === 'width') {
        onChange({ ...current, w: Math.max(60, Math.min(4000, Math.round(drag.startW + dx))) });
        return;
      }
      // Moving a border trades width between the two columns beside it.
      const cols = [...drag.startCols];
      const pair = cols[drag.index] + cols[drag.index + 1];
      const left = Math.min(pair - 0.04, Math.max(0.04, cols[drag.index] + dx / current.w));
      cols[drag.index] = left;
      cols[drag.index + 1] = pair - left;
      onChange({ ...current, cols: normalizeCols(cols) });
    };
    const up = () => setDrag(null);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, [drag, onChange, view.zoom]);

  const set = (patch: Partial<TableItem>) => onChange({ ...latest.current, ...patch });
  const edit = (r: number, c: number, text: string) =>
    set({
      cells: latest.current.cells.map((row, i) =>
        i === r ? row.map((cell, j) => (j === c ? text.slice(0, 2000) : cell)) : row,
      ),
    });
  const structural = (next: TableItem, focus: { r: number; c: number }) => {
    focusCell.current = {
      r: Math.min(focus.r, next.cells.length - 1),
      c: Math.min(focus.c, next.cols.length - 1),
    };
    setActive(focusCell.current);
    onChange(next);
  };
  const keep = (event: React.MouseEvent | React.PointerEvent) => event.preventDefault();
  const styles = tableStyles(item);
  const left = view.x + item.x * view.zoom,
    top = view.y + item.y * view.zoom;
  const edges = item.cols.slice(0, -1).reduce<number[]>((acc, c) => {
    acc.push((acc.at(-1) ?? 0) + c);
    return acc;
  }, []);
  const rows = item.cells.length,
    cols = item.cols.length;

  return (
    <div ref={shell} className="note-text-shell note-table-shell" style={{ left, top }}>
      <div className="note-format-bar" role="toolbar" aria-label="Định dạng bảng">
        <button
          type="button"
          className="note-text-button"
          onMouseDown={keep}
          disabled={rows >= TABLE_LIMITS.rows}
          onClick={() =>
            structural(tableInsertRow(latest.current, active.r + 1), {
              r: active.r + 1,
              c: active.c,
            })
          }
        >
          + Hàng
        </button>
        <button
          type="button"
          className="note-text-button"
          onMouseDown={keep}
          disabled={cols >= TABLE_LIMITS.cols}
          onClick={() =>
            structural(tableInsertCol(latest.current, active.c + 1), {
              r: active.r,
              c: active.c + 1,
            })
          }
        >
          + Cột
        </button>
        <button
          type="button"
          className="note-text-button"
          onMouseDown={keep}
          disabled={rows <= 1}
          onClick={() => structural(tableRemoveRow(latest.current, active.r), active)}
        >
          Xóa hàng
        </button>
        <button
          type="button"
          className="note-text-button"
          onMouseDown={keep}
          disabled={cols <= 1}
          onClick={() => structural(tableRemoveCol(latest.current, active.c), active)}
        >
          Xóa cột
        </button>
        <label className="note-check">
          <input
            type="checkbox"
            checked={item.header}
            onChange={(e) => set({ header: e.target.checked })}
          />
          Hàng tiêu đề
        </label>
        <label className="note-field">
          <span className="sr-only">Font chữ của bảng</span>
          <select
            value={item.font}
            aria-label="Font chữ của bảng"
            onChange={(e) => set({ font: e.target.value as FontId })}
          >
            {FONTS.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
        </label>
        <label className="note-field">
          <span className="sr-only">Cỡ chữ của bảng</span>
          <select
            value={item.size}
            aria-label="Cỡ chữ của bảng"
            onChange={(e) => set({ size: Number(e.target.value) })}
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
        <label className="note-field">
          <span className="sr-only">Màu chữ của bảng</span>
          <input
            type="color"
            value={item.color}
            aria-label="Màu chữ của bảng"
            onChange={(e) => set({ color: e.target.value })}
          />
        </label>
        <span className="note-swatches" role="group" aria-label="Màu viền">
          {TABLE_BORDERS.map((c) => (
            <button
              key={c}
              type="button"
              className="note-swatch"
              style={{ background: c }}
              aria-pressed={item.border === c}
              onMouseDown={keep}
              onClick={() => set({ border: c })}
              aria-label={`Viền ${c}`}
            />
          ))}
        </span>
        <button type="button" className="note-done" onMouseDown={keep} onClick={finish}>
          Xong
        </button>
      </div>
      <div
        className="note-text-frame note-table-frame"
        style={{ transform: `scale(${view.zoom})` }}
      >
        <table ref={table} style={styles.table} aria-label="Bảng đang sửa">
          <colgroup>
            {item.cols.map((c, i) => (
              <col key={i} style={{ width: `${c * 100}%` }} />
            ))}
          </colgroup>
          <tbody>
            {item.cells.map((row, r) => (
              <tr key={r}>
                {row.map((text, c) => (
                  <td key={c} style={{ ...styles.cell(r), padding: 0 }}>
                    <textarea
                      className="note-table-cell"
                      data-cell={`${r}-${c}`}
                      value={text}
                      rows={1}
                      spellCheck
                      lang="vi"
                      aria-label={`Hàng ${r + 1}, cột ${c + 1}`}
                      style={{
                        font: 'inherit',
                        fontWeight: styles.cell(r).fontWeight,
                        color: 'inherit',
                      }}
                      onFocus={() => setActive({ r, c })}
                      onChange={(e) => edit(r, c, e.target.value)}
                      onKeyDown={(event) => {
                        event.stopPropagation();
                        if (event.nativeEvent.isComposing) return;
                        if (event.key === 'Escape') {
                          event.preventDefault();
                          finish();
                        } else if (
                          event.key === 'Tab' &&
                          !event.shiftKey &&
                          r === rows - 1 &&
                          c === cols - 1 &&
                          rows < TABLE_LIMITS.rows
                        ) {
                          event.preventDefault();
                          structural(tableInsertRow(latest.current, rows), { r: rows, c: 0 });
                        }
                      }}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {edges.map((edge, i) => (
          <span
            key={i}
            className="note-table-col-handle"
            role="separator"
            aria-orientation="vertical"
            aria-label={`Đổi độ rộng cột ${i + 1}`}
            style={{ left: `${edge * item.w}px` }}
            onPointerDown={(event) => {
              event.preventDefault();
              setDrag({ kind: 'col', index: i, startX: event.clientX, startCols: [...item.cols] });
            }}
          />
        ))}
        <span
          className="note-text-resize"
          role="presentation"
          onPointerDown={(event) => {
            event.preventDefault();
            setDrag({ kind: 'width', startX: event.clientX, startW: item.w });
          }}
        />
      </div>
    </div>
  );
}
