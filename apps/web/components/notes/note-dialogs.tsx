'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { searchNotebook, type NotebookEntry } from '../../lib/notebook';
import {
  COVER_STYLES,
  COVERS,
  PAGE_SIZES,
  PAPER_COLOR_LABELS,
  PAPER_COLORS,
  PAPER_LABELS,
  PAPERS,
  SIZE_LABELS,
  type Crop,
  type ImageItem,
  type PageSize,
  type Paper,
  type PaperColor,
} from '../../lib/note-model';
import type { NotebookCourse, NotebookFields, QuoteView } from '../../lib/notes';
import { Button } from '../ui/button';
import { NotePaper } from './note-paper';
import { STICKER_GROUPS, STICKERS, type Sticker } from './note-stickers';

/** A modal built on <dialog>: focus stays inside, Escape closes, focus returns afterwards. */
export function NoteModal({
  title,
  onClose,
  children,
  wide = false,
  label,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
  label?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    const origin = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (dialog && !dialog.open) dialog.showModal();
    return () => {
      if (origin?.isConnected) requestAnimationFrame(() => origin.focus({ preventScroll: true }));
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="note-modal"
      data-wide={wide || undefined}
      aria-label={label ?? title}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
    >
      <div className="note-modal-body">
        <header>
          <h2>{title}</h2>
          <button type="button" className="note-icon-button" onClick={onClose} aria-label="Đóng">
            ✕
          </button>
        </header>
        {children}
      </div>
    </dialog>
  );
}

// ---- Notebook form (shelf and editor) -------------------------------------------------------

export function PaperPreview({
  paper,
  color,
  size = 'A4_PORTRAIT',
}: {
  paper: Paper;
  color: PaperColor;
  size?: PageSize;
}) {
  const landscape = size === 'A4_LANDSCAPE';
  const w = landscape ? 1123 : 794,
    h = landscape ? 794 : 1123;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="note-paper-preview" aria-hidden="true">
      <NotePaper
        id={`preview-${paper}-${color}-${size}`}
        paper={paper}
        color={color}
        page={{ x: 0, y: 0, w, h }}
        bounded
      />
    </svg>
  );
}
export function PaperChoices({
  paper,
  color,
  size,
  onChange,
  name,
}: {
  paper: Paper;
  color: PaperColor;
  size: PageSize;
  onChange: (value: { paper: Paper; color: PaperColor; size: PageSize }) => void;
  name: string;
}) {
  return (
    <>
      <fieldset className="note-choice-group">
        <legend>Khổ trang</legend>
        {PAGE_SIZES.map((s) => (
          <label key={s} className="note-chip">
            <input
              type="radio"
              name={`${name}-size`}
              checked={size === s}
              onChange={() => onChange({ paper, color, size: s })}
            />
            {SIZE_LABELS[s]}
          </label>
        ))}
      </fieldset>
      <fieldset className="note-choice-group note-paper-grid">
        <legend>Kiểu giấy</legend>
        {PAPERS.map((p) => (
          <label key={p} className="note-paper-choice" data-checked={paper === p || undefined}>
            <input
              type="radio"
              name={`${name}-paper`}
              checked={paper === p}
              onChange={() => onChange({ paper: p, color, size })}
            />
            <PaperPreview paper={p} color={color} />
            <span>{PAPER_LABELS[p]}</span>
          </label>
        ))}
      </fieldset>
      <fieldset className="note-choice-group">
        <legend>Màu giấy</legend>
        {PAPER_COLORS.map((c) => (
          <label key={c} className="note-chip">
            <input
              type="radio"
              name={`${name}-color`}
              checked={color === c}
              onChange={() => onChange({ paper, color: c, size })}
            />
            {PAPER_COLOR_LABELS[c]}
          </label>
        ))}
      </fieldset>
    </>
  );
}

export function NotebookForm({
  initial,
  courses,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial: NotebookFields;
  courses: NotebookCourse[];
  submitLabel: string;
  onSubmit: (fields: NotebookFields) => Promise<string | null>;
  onCancel: () => void;
}) {
  const [fields, setFields] = useState(initial);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  return (
    <form
      className="note-form"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!fields.title.trim()) {
          setError('Nhập tên vở.');
          return;
        }
        setPending(true);
        setError('');
        const failure = await onSubmit({ ...fields, title: fields.title.trim() });
        setPending(false);
        if (failure) setError(failure);
      }}
    >
      <label className="note-form-field">
        <span>Tên vở</span>
        <input
          value={fields.title}
          maxLength={120}
          autoFocus
          required
          onChange={(e) => setFields({ ...fields, title: e.target.value })}
        />
      </label>
      <fieldset className="note-choice-group">
        <legend>Bìa vở</legend>
        {COVERS.map((c) => (
          <label key={c} className="note-cover-choice" title={COVER_STYLES[c].label}>
            <input
              type="radio"
              name="cover"
              checked={fields.cover === c}
              onChange={() => setFields({ ...fields, cover: c })}
            />
            <span style={{ background: COVER_STYLES[c].fill }} aria-hidden="true" />
            <span className="sr-only">{COVER_STYLES[c].label}</span>
          </label>
        ))}
      </fieldset>
      <label className="note-form-field">
        <span>Môn học (không bắt buộc)</span>
        <select
          value={fields.courseId ?? ''}
          onChange={(e) => setFields({ ...fields, courseId: e.target.value || null })}
        >
          <option value="">Không gắn môn</option>
          {courses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.code} · {c.name}
            </option>
          ))}
        </select>
      </label>
      <p className="note-form-hint">
        Trang mới trong vở dùng mặc định dưới đây; mỗi trang vẫn đổi riêng được.
      </p>
      <PaperChoices
        name="defaults"
        paper={fields.defaultPaper}
        color={fields.defaultColor}
        size={fields.defaultSize}
        onChange={(v) =>
          setFields({
            ...fields,
            defaultPaper: v.paper,
            defaultColor: v.color,
            defaultSize: v.size,
          })
        }
      />
      {error && (
        <p role="alert" className="note-error">
          {error}
        </p>
      )}
      <div className="note-form-actions">
        <Button variant="quiet" onClick={onCancel}>
          Hủy
        </Button>
        <Button type="submit" variant="primary" pending={pending}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

// ---- Stickers ---------------------------------------------------------------------------------

// ---- Tables (CANVAS-03) ------------------------------------------------------------------------

/** Rows × columns, picked on a grid like a word processor or typed in. */
export function TablePicker({
  onPick,
  onClose,
}: {
  onPick: (rows: number, cols: number) => void;
  onClose: () => void;
}) {
  const [hover, setHover] = useState({ r: 3, c: 3 });
  const [rows, setRows] = useState('3'),
    [cols, setCols] = useState('3');
  const GRID_R = 8,
    GRID_C = 10;
  const clamp = (v: string, max: number) => Math.min(max, Math.max(1, Math.round(Number(v)) || 1));
  return (
    <NoteModal title="Chèn bảng" onClose={onClose}>
      <p className="note-form-hint">
        Rê chuột trên lưới rồi bấm, hoặc nhập số hàng và cột (tối đa 60 × 12).
      </p>
      <div
        className="note-table-grid"
        role="grid"
        aria-label="Chọn kích thước bảng"
        onMouseLeave={() => setHover({ r: Number(rows) || 1, c: Number(cols) || 1 })}
      >
        {Array.from({ length: GRID_R }, (_, r) => (
          <div key={r} role="row" className="note-table-grid-row">
            {Array.from({ length: GRID_C }, (_, c) => (
              <button
                key={c}
                type="button"
                role="gridcell"
                aria-label={`${r + 1} hàng × ${c + 1} cột`}
                data-on={(r < hover.r && c < hover.c) || undefined}
                onMouseEnter={() => {
                  setHover({ r: r + 1, c: c + 1 });
                  setRows(String(r + 1));
                  setCols(String(c + 1));
                }}
                onFocus={() => {
                  setHover({ r: r + 1, c: c + 1 });
                  setRows(String(r + 1));
                  setCols(String(c + 1));
                }}
                onClick={() => onPick(r + 1, c + 1)}
              />
            ))}
          </div>
        ))}
      </div>
      <form
        className="note-form note-table-size"
        onSubmit={(event) => {
          event.preventDefault();
          onPick(clamp(rows, 60), clamp(cols, 12));
        }}
      >
        <label className="note-form-field">
          <span>Số hàng</span>
          <input
            type="number"
            min={1}
            max={60}
            value={rows}
            onChange={(e) => {
              setRows(e.target.value);
              setHover((h) => ({ ...h, r: Number(e.target.value) || 1 }));
            }}
          />
        </label>
        <label className="note-form-field">
          <span>Số cột</span>
          <input
            type="number"
            min={1}
            max={12}
            value={cols}
            onChange={(e) => {
              setCols(e.target.value);
              setHover((h) => ({ ...h, c: Number(e.target.value) || 1 }));
            }}
          />
        </label>
        <div className="note-form-actions">
          <Button variant="quiet" onClick={onClose}>
            Hủy
          </Button>
          <Button type="submit" variant="primary">
            Chèn bảng {clamp(rows, 60)} × {clamp(cols, 12)}
          </Button>
        </div>
      </form>
    </NoteModal>
  );
}

export function StickerPicker({
  onPick,
  onClose,
}: {
  onPick: (sticker: Sticker) => void;
  onClose: () => void;
}) {
  return (
    <NoteModal title="Trang trí" onClose={onClose} wide>
      {(Object.keys(STICKER_GROUPS) as Sticker['group'][]).map((group) => (
        <section key={group} className="note-sticker-group">
          <h3>{STICKER_GROUPS[group]}</h3>
          <div className="note-sticker-grid">
            {STICKERS.filter((s) => s.group === group).map((s) => (
              <button
                key={s.id}
                type="button"
                className="note-sticker-button"
                onClick={() => onPick(s)}
                aria-label={`Thêm ${s.label}`}
                title={s.label}
              >
                <svg viewBox={s.viewBox} aria-hidden="true">
                  {s.art}
                </svg>
              </button>
            ))}
          </div>
        </section>
      ))}
    </NoteModal>
  );
}

// ---- Quotes from the Sổ tay --------------------------------------------------------------------

export function quoteFromEntry(entry: NotebookEntry): QuoteView {
  const highlight = entry.kind === 'TEXT_HIGHLIGHT';
  return entry.material
    ? {
        available: true,
        kind: entry.kind,
        quote: highlight ? entry.anchor.quote : '',
        note: entry.content,
        color: highlight ? entry.color : '#9fb3ca',
        versionId: entry.versionId,
        pageNumber: entry.pageNumber,
        title: entry.material.title,
      }
    : { available: false };
}
export function QuotePicker({
  onPick,
  onClose,
}: {
  onPick: (entries: NotebookEntry[]) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<NotebookEntry[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [chosen, setChosen] = useState<Map<string, NotebookEntry>>(new Map());
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [more, setMore] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setStatus('loading');
      searchNotebook(query.trim() ? { query: query.trim() } : {}, null, controller.signal)
        .then((result) => {
          setItems(result.items.filter((i) => i.material));
          setCursor(result.nextCursor);
          setStatus('ready');
        })
        .catch(() => !controller.signal.aborted && setStatus('error'));
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);
  async function loadMore() {
    if (!cursor) return;
    setMore(true);
    try {
      const result = await searchNotebook(
        query.trim() ? { query: query.trim() } : {},
        cursor,
        new AbortController().signal,
      );
      setItems((list) => [...list, ...result.items.filter((i) => i.material)]);
      setCursor(result.nextCursor);
    } catch {
      setStatus('error');
    } finally {
      setMore(false);
    }
  }
  return (
    <NoteModal title="Chèn trích dẫn từ Sổ tay" onClose={onClose} wide>
      <p className="note-form-hint">
        Chọn đoạn tô hoặc ghi chú của bạn. Thẻ trích dẫn mở lại đúng tài liệu và trang; nếu sau này
        bạn không còn quyền đọc tài liệu, thẻ chỉ hiện “Tài liệu không còn khả dụng”.
      </p>
      <label className="note-form-field">
        <span>Tìm trong Sổ tay</span>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Ví dụ: định luật"
        />
      </label>
      {status === 'error' && (
        <p role="alert" className="note-error">
          Chưa tải được Sổ tay. Kiểm tra kết nối rồi thử lại.
        </p>
      )}
      {status === 'loading' && <p role="status">Đang tải…</p>}
      {status === 'ready' && !items.length && <p>Chưa có đoạn tô hoặc ghi chú phù hợp.</p>}
      <ul className="note-quote-list">
        {items.map((entry) => {
          const view = quoteFromEntry(entry);
          return (
            <li key={entry.id}>
              <label>
                <input
                  type="checkbox"
                  checked={chosen.has(entry.id)}
                  disabled={!chosen.has(entry.id) && chosen.size >= 20}
                  onChange={(e) => {
                    const next = new Map(chosen);
                    if (e.target.checked) next.set(entry.id, entry);
                    else next.delete(entry.id);
                    setChosen(next);
                  }}
                />
                <span>
                  {view.available && view.quote && <q>{view.quote}</q>}
                  {view.available && view.note && (
                    <span className="note-quote-note">{view.note}</span>
                  )}
                  <small>
                    {entry.material?.title} · tr. {entry.pageNumber}
                  </small>
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      {cursor && (
        <Button variant="quiet" pending={more} onClick={() => void loadMore()}>
          Xem thêm
        </Button>
      )}
      <div className="note-form-actions">
        <span className="note-form-hint">Đã chọn {chosen.size}/20</span>
        <Button variant="quiet" onClick={onClose}>
          Hủy
        </Button>
        <Button
          variant="primary"
          disabled={!chosen.size}
          onClick={() => onPick([...chosen.values()])}
        >
          Chèn vào trang
        </Button>
      </div>
    </NoteModal>
  );
}

// ---- Crop ---------------------------------------------------------------------------------------

export function CropDialog({
  item,
  src,
  natural,
  onApply,
  onClose,
}: {
  item: ImageItem;
  src: string | null;
  natural: { w: number; h: number };
  onApply: (crop: Crop | null) => void;
  onClose: () => void;
}) {
  const [crop, setCrop] = useState<Crop>(item.crop ?? { x: 0, y: 0, w: 1, h: 1 });
  const frame = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    mode: 'move' | 'nw' | 'ne' | 'se' | 'sw';
    start: { x: number; y: number };
    crop: Crop;
  } | null>(null);
  const ratio = natural.w / natural.h || 1;
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  function move(event: React.PointerEvent) {
    const d = drag.current;
    const rect = frame.current?.getBoundingClientRect();
    if (!d || !rect) return;
    const dx = (event.clientX - d.start.x) / rect.width,
      dy = (event.clientY - d.start.y) / rect.height;
    const c = d.crop;
    if (d.mode === 'move') {
      setCrop({ ...c, x: clamp(c.x + dx, 0, 1 - c.w), y: clamp(c.y + dy, 0, 1 - c.h) });
      return;
    }
    let x1 = c.x,
      y1 = c.y,
      x2 = c.x + c.w,
      y2 = c.y + c.h;
    if (d.mode.includes('w')) x1 = clamp(x1 + dx, 0, x2 - 0.05);
    if (d.mode.includes('e')) x2 = clamp(x2 + dx, x1 + 0.05, 1);
    if (d.mode.includes('n')) y1 = clamp(y1 + dy, 0, y2 - 0.05);
    if (d.mode.includes('s')) y2 = clamp(y2 + dy, y1 + 0.05, 1);
    setCrop({ x: x1, y: y1, w: x2 - x1, h: y2 - y1 });
  }
  function start(mode: 'move' | 'nw' | 'ne' | 'se' | 'sw', event: React.PointerEvent) {
    event.preventDefault();
    event.stopPropagation();
    (event.currentTarget as Element).setPointerCapture(event.pointerId);
    drag.current = { mode, start: { x: event.clientX, y: event.clientY }, crop };
  }
  const nudge = (key: 'x' | 'y' | 'w' | 'h', delta: number) =>
    setCrop((c) => {
      const next = { ...c, [key]: clamp(c[key] + delta, key === 'w' || key === 'h' ? 0.05 : 0, 1) };
      next.x = clamp(next.x, 0, 1 - next.w);
      next.y = clamp(next.y, 0, 1 - next.h);
      return next;
    });
  return (
    <NoteModal title="Cắt ảnh" onClose={onClose}>
      {!src ? (
        <p>Ảnh chưa kiểm tra xong nên chưa cắt được. Thử lại sau ít phút.</p>
      ) : (
        <>
          <div
            ref={frame}
            className="note-crop-frame"
            style={{ aspectRatio: String(ratio) }}
            onPointerMove={move}
            onPointerUp={() => (drag.current = null)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt="" draggable={false} />
            <div
              className="note-crop-box"
              style={{
                left: `${crop.x * 100}%`,
                top: `${crop.y * 100}%`,
                width: `${crop.w * 100}%`,
                height: `${crop.h * 100}%`,
              }}
              onPointerDown={(event) => start('move', event)}
            >
              {(['nw', 'ne', 'se', 'sw'] as const).map((h) => (
                <span
                  key={h}
                  className="note-crop-handle"
                  data-handle={h}
                  onPointerDown={(event) => start(h, event)}
                />
              ))}
            </div>
          </div>
          <div className="note-crop-keys" role="group" aria-label="Chỉnh vùng cắt bằng bàn phím">
            <Button variant="quiet" onClick={() => nudge('x', -0.02)}>
              ← Sang trái
            </Button>
            <Button variant="quiet" onClick={() => nudge('x', 0.02)}>
              Sang phải →
            </Button>
            <Button variant="quiet" onClick={() => nudge('w', -0.04)}>
              Hẹp lại
            </Button>
            <Button variant="quiet" onClick={() => nudge('h', -0.04)}>
              Thấp lại
            </Button>
          </div>
        </>
      )}
      <div className="note-form-actions">
        <Button variant="quiet" onClick={() => onApply(null)} disabled={!item.crop}>
          Bỏ cắt
        </Button>
        <Button variant="quiet" onClick={onClose}>
          Hủy
        </Button>
        <Button
          variant="primary"
          disabled={!src}
          onClick={() => onApply(crop.w > 0.999 && crop.h > 0.999 ? null : crop)}
        >
          Áp dụng
        </Button>
      </div>
    </NoteModal>
  );
}

// ---- Shortcuts ----------------------------------------------------------------------------------

export const SHORTCUTS: [string, string][] = [
  ['P', 'Bút'],
  ['H', 'Bút dạ'],
  ['E', 'Tẩy'],
  ['S', 'Hình'],
  ['T', 'Chữ'],
  ['V', 'Chọn'],
  ['L', 'Chọn tự do (lasso)'],
  ['I', 'Chèn ảnh từ máy'],
  ['R', 'Hiện / ẩn thước kẻ (bút đặt sát mép thước sẽ kẻ thẳng theo mép)'],
  ['Kéo núm tròn của thước (Shift: bước 15°)', 'Xoay thước'],
  ['Nhấp đúp vào bảng', 'Sửa bảng; Tab / Shift + Tab chuyển ô, Tab ở ô cuối thêm hàng'],
  ['Giữ Space + kéo', 'Kéo trang'],
  ['Ctrl + lăn chuột', 'Phóng to / thu nhỏ'],
  ['+ / − / 0', 'Phóng to / thu nhỏ / vừa trang'],
  ['Ctrl + Z', 'Hoàn tác'],
  ['Ctrl + Shift + Z hoặc Ctrl + Y', 'Làm lại'],
  ['Ctrl + A', 'Chọn tất cả'],
  ['Ctrl + C / X / V', 'Sao chép / cắt / dán đối tượng hoặc ảnh'],
  ['Ctrl + D', 'Nhân bản phần đã chọn'],
  ['Delete', 'Xóa phần đã chọn'],
  ['Mũi tên (Shift: 10 px)', 'Dịch phần đã chọn'],
  ['Page Up / Page Down', 'Trang trước / trang sau'],
  ['Vẽ rồi giữ yên', 'Nắn thành đường thẳng, hình chữ nhật, tam giác, elip'],
  ['Giữ Shift khi vẽ hình hoặc bút dạ', 'Kẻ thẳng, hình vuông, hình tròn'],
  ['Esc', 'Bỏ chọn, xong hộp chữ, thoát toàn màn hình'],
  ['?', 'Mở bảng này'],
];
export function ShortcutsHelp({ onClose }: { onClose: () => void }) {
  return (
    <NoteModal title="Phím tắt của Vở ghi" onClose={onClose}>
      <dl className="note-shortcuts">
        {SHORTCUTS.map(([key, label]) => (
          <div key={key}>
            <dt>
              <kbd>{key}</kbd>
            </dt>
            <dd>{label}</dd>
          </div>
        ))}
      </dl>
      <p className="note-form-hint">
        Trên máy tính bảng có bút, ngón tay dùng để kéo trang sau khi bạn đã viết bằng bút. Việc
        kiểm thử trên iPad và màn hình cảm ứng chưa thực hiện.
      </p>
    </NoteModal>
  );
}
