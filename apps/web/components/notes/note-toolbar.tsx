'use client';

import { useState } from 'react';
import {
  FONTS,
  HIGHLIGHTER_COLORS,
  INK_COLORS,
  SHAPE_LABELS,
  SHAPES,
  type FontId,
  type ShapeKind,
} from '../../lib/note-model';
import { TOOL_LABELS, type Tool, type ToolSettings } from './note-canvas';

const RECENT_KEY = 'hucescholar.notes.colors';
/** Up to eight colors the user picked recently; a per-browser convenience only. */
export function readRecentColors(): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
    return Array.isArray(value)
      ? value.filter((c) => typeof c === 'string' && /^#[0-9a-f]{6}$/.test(c)).slice(0, 8)
      : [];
  } catch {
    return [];
  }
}
export function rememberColor(color: string) {
  try {
    const next = [color, ...readRecentColors().filter((c) => c !== color)].slice(0, 8);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* Storage may be unavailable; colors still work. */
  }
}

const TOOL_ICONS: Record<Tool, string> = {
  select: '⬚',
  lasso: '◌',
  pen: '✎',
  highlighter: '▮',
  eraser: '⌫',
  shape: '△',
  text: 'T',
  hand: '✋',
};
const TOOL_KEYS: Partial<Record<Tool, string>> = {
  select: 'V',
  lasso: 'L',
  pen: 'P',
  highlighter: 'H',
  eraser: 'E',
  shape: 'S',
  text: 'T',
};
export const TOOLS: Tool[] = [
  'select',
  'lasso',
  'pen',
  'highlighter',
  'eraser',
  'shape',
  'text',
  'hand',
];

export function ColorRow({
  value,
  colors,
  onPick,
  label,
}: {
  value: string;
  colors: readonly string[];
  onPick: (color: string) => void;
  label: string;
}) {
  // The toolbar renders only in the browser (after the session check), so storage is readable.
  const [recent, setRecent] = useState<string[]>(readRecentColors);
  const all = [...new Set([...colors, ...recent])].slice(0, 14);
  return (
    <span className="note-swatches" role="group" aria-label={label}>
      {all.map((c) => (
        <button
          key={c}
          type="button"
          className="note-swatch"
          style={{ background: c }}
          aria-pressed={value === c}
          aria-label={`Màu ${c}`}
          onClick={() => onPick(c)}
        />
      ))}
      <label className="note-swatch note-swatch-custom" title="Màu khác">
        <span className="sr-only">Chọn màu khác</span>
        <input
          type="color"
          value={value}
          onChange={(e) => {
            rememberColor(e.target.value);
            setRecent(readRecentColors());
            onPick(e.target.value);
          }}
        />
      </label>
    </span>
  );
}

function Choice<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <span className="note-segment" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          className="note-chip-button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </span>
  );
}

/** The tool row and the options of the chosen tool. */
export function NoteToolbar({
  tool,
  setTool,
  settings,
  setSettings,
}: {
  tool: Tool;
  setTool: (tool: Tool) => void;
  settings: ToolSettings;
  setSettings: (settings: ToolSettings) => void;
}) {
  const set = (patch: Partial<ToolSettings>) => setSettings({ ...settings, ...patch });
  return (
    <>
      <div className="note-tools" role="toolbar" aria-label="Công cụ">
        {TOOLS.map((t) => (
          <button
            key={t}
            type="button"
            className="note-tool"
            aria-pressed={tool === t}
            onClick={() => setTool(t)}
            title={`${TOOL_LABELS[t]}${TOOL_KEYS[t] ? ` (${TOOL_KEYS[t]})` : ''}`}
            data-tool={t}
          >
            <span aria-hidden="true">{TOOL_ICONS[t]}</span>
            <span className="note-tool-label">{TOOL_LABELS[t]}</span>
          </button>
        ))}
      </div>
      <div
        className="note-tool-options"
        role="group"
        aria-label={`Tùy chọn ${TOOL_LABELS[tool].toLowerCase()}`}
      >
        {tool === 'pen' && (
          <>
            <Choice
              label="Loại bút"
              value={settings.pen}
              options={[
                { value: 'ballpoint', label: 'Bút bi' },
                { value: 'fountain', label: 'Bút máy' },
                { value: 'pencil', label: 'Bút chì' },
              ]}
              onChange={(pen) => set({ pen })}
            />
            <Choice
              label="Độ dày"
              value={settings.penWidth}
              options={[
                { value: 1.5, label: 'Mảnh' },
                { value: 2.5, label: 'Vừa' },
                { value: 4.5, label: 'Đậm' },
              ]}
              onChange={(penWidth) => set({ penWidth })}
            />
            <ColorRow
              label="Màu bút"
              value={settings.penColor}
              colors={INK_COLORS}
              onPick={(penColor) => set({ penColor })}
            />
          </>
        )}
        {tool === 'highlighter' && (
          <>
            <Choice
              label="Độ rộng"
              value={settings.hlWidth}
              options={[
                { value: 14, label: 'Hẹp' },
                { value: 24, label: 'Rộng' },
              ]}
              onChange={(hlWidth) => set({ hlWidth })}
            />
            <ColorRow
              label="Màu bút dạ"
              value={settings.hlColor}
              colors={HIGHLIGHTER_COLORS}
              onPick={(hlColor) => set({ hlColor })}
            />
            <span className="note-tip">Giữ Shift để kẻ thẳng.</span>
          </>
        )}
        {tool === 'eraser' && (
          <>
            <Choice
              label="Cách tẩy"
              value={settings.eraserMode}
              options={[
                { value: 'stroke', label: 'Cả nét' },
                { value: 'partial', label: 'Từng phần' },
              ]}
              onChange={(eraserMode) => set({ eraserMode })}
            />
            <Choice
              label="Cỡ tẩy"
              value={settings.eraserSize}
              options={[
                { value: 12, label: 'Nhỏ' },
                { value: 24, label: 'Vừa' },
                { value: 48, label: 'Lớn' },
              ]}
              onChange={(eraserSize) => set({ eraserSize })}
            />
          </>
        )}
        {tool === 'shape' && (
          <>
            <Choice
              label="Hình"
              value={settings.shape}
              options={SHAPES.map((s) => ({ value: s as ShapeKind, label: SHAPE_LABELS[s] }))}
              onChange={(shape) => set({ shape })}
            />
            <Choice
              label="Độ dày"
              value={settings.shapeWidth}
              options={[
                { value: 1.5, label: 'Mảnh' },
                { value: 3, label: 'Vừa' },
                { value: 6, label: 'Đậm' },
              ]}
              onChange={(shapeWidth) => set({ shapeWidth })}
            />
            <ColorRow
              label="Màu viền"
              value={settings.shapeColor}
              colors={INK_COLORS}
              onPick={(shapeColor) => set({ shapeColor })}
            />
            <label className="note-check">
              <input
                type="checkbox"
                checked={settings.shapeFill !== null}
                onChange={(e) => set({ shapeFill: e.target.checked ? '#e3f2fd' : null })}
              />
              Tô nền
            </label>
            {settings.shapeFill !== null && (
              <label className="note-field">
                <span className="sr-only">Màu nền hình</span>
                <input
                  type="color"
                  value={settings.shapeFill}
                  onChange={(e) => set({ shapeFill: e.target.value })}
                  aria-label="Màu nền hình"
                />
              </label>
            )}
            <label className="note-check">
              <input
                type="checkbox"
                checked={settings.shapeDash}
                onChange={(e) => set({ shapeDash: e.target.checked })}
              />
              Nét đứt
            </label>
          </>
        )}
        {tool === 'text' && (
          <>
            <label className="note-field">
              <span>Font</span>
              <select
                value={settings.textFont}
                onChange={(e) => set({ textFont: e.target.value as FontId })}
              >
                {FONTS.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="note-field">
              <span>Cỡ</span>
              <select
                value={settings.textSize}
                onChange={(e) => set({ textSize: Number(e.target.value) })}
              >
                {[12, 14, 16, 18, 20, 24, 28, 32, 40, 48].map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <ColorRow
              label="Màu chữ"
              value={settings.textColor}
              colors={INK_COLORS}
              onPick={(textColor) => set({ textColor })}
            />
            <span className="note-tip">Bấm vào trang để gõ; bấm vào hộp chữ có sẵn để sửa.</span>
          </>
        )}
        {tool === 'lasso' && (
          <span className="note-tip">Khoanh vùng để chọn; giữ Shift để chọn thêm.</span>
        )}
        {tool === 'hand' && (
          <span className="note-tip">Kéo để di chuyển trang. Ctrl + lăn chuột để phóng to.</span>
        )}
      </div>
    </>
  );
}
