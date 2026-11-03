'use client';

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import {
  emptyText,
  erasedIds,
  eraseCircle,
  itemBounds,
  itemsInLasso,
  itemsInRect,
  newId,
  normalizeRect,
  pageBox,
  recognizeShape,
  round,
  scaleItem,
  simplifyStroke,
  splitLongStroke,
  strokePoints,
  topItemAt,
  translateItem,
  unionRect,
  type ImageItem,
  type PageItem,
  type PenTool,
  type Point,
  type Rect,
  type ShapeItem,
  type ShapeKind,
  type StickerItem,
  type StrokeItem,
  type TextItem,
} from '../../lib/note-model';
import type { PageSummary } from '../../lib/notes';
import { NotePaper } from './note-paper';
import {
  NoteDefs,
  NoteItems,
  ShapeNode,
  StrokeShape,
  strokeOutline,
  type RenderContext,
} from './note-render';
import { NoteTextEditor } from './note-text-editor';

export type Tool =
  'pen' | 'highlighter' | 'eraser' | 'shape' | 'text' | 'select' | 'lasso' | 'hand';
export type ToolSettings = {
  pen: Exclude<PenTool, 'highlighter'>;
  penColor: string;
  penWidth: number;
  hlColor: string;
  hlWidth: number;
  eraserMode: 'stroke' | 'partial';
  eraserSize: number;
  shape: ShapeKind;
  shapeColor: string;
  shapeWidth: number;
  shapeFill: string | null;
  shapeDash: boolean;
  textFont: TextItem['font'];
  textSize: number;
  textColor: string;
};
export type View = { zoom: number; x: number; y: number };
export const MIN_ZOOM = 0.2;
export const MAX_ZOOM = 5;
const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';
type Gesture =
  | {
      kind: 'draw';
      pointerId: number;
      tool: PenTool;
      color: string;
      width: number;
      points: number[];
      anchor: Point;
      timer?: ReturnType<typeof setTimeout>;
      shape?: Omit<ShapeItem, 'id' | 'type'>;
      straight: boolean;
    }
  | { kind: 'erase'; pointerId: number; base: PageItem[]; last: Point }
  | { kind: 'shape'; pointerId: number; start: Point; current: Point; constrain: boolean }
  | {
      kind: 'move';
      pointerId: number;
      base: PageItem[];
      ids: Set<string>;
      start: Point;
      moved: boolean;
    }
  | {
      kind: 'resize';
      pointerId: number;
      base: PageItem[];
      ids: Set<string>;
      from: Rect;
      handle: Handle;
      ratio: boolean;
    }
  | { kind: 'rotate'; pointerId: number; base: PageItem[]; id: string; center: Point }
  | { kind: 'marquee'; pointerId: number; start: Point; current: Point; add: boolean }
  | { kind: 'lasso'; pointerId: number; points: Point[]; add: boolean }
  | { kind: 'pan'; pointerId: number; startX: number; startY: number; view: View }
  | { kind: 'pinch'; ids: [number, number]; startDistance: number; startMid: Point; view: View };

type Live =
  | { kind: 'stroke'; tool: PenTool; color: string; width: number; points: number[] }
  | { kind: 'shape'; shape: Omit<ShapeItem, 'id' | 'type'> }
  | { kind: 'marquee'; rect: Rect }
  | { kind: 'lasso'; points: Point[] }
  | null;

const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
function handlePoint(rect: Rect, handle: Handle): Point {
  const x = handle.includes('w')
    ? rect.x
    : handle.includes('e')
      ? rect.x + rect.w
      : rect.x + rect.w / 2;
  const y = handle.includes('n')
    ? rect.y
    : handle.includes('s')
      ? rect.y + rect.h
      : rect.y + rect.h / 2;
  return { x, y };
}
function resized(from: Rect, handle: Handle, p: Point, keepRatio: boolean): Rect {
  let x1 = from.x,
    y1 = from.y,
    x2 = from.x + from.w,
    y2 = from.y + from.h;
  if (handle.includes('w')) x1 = Math.min(p.x, x2 - 4);
  if (handle.includes('e')) x2 = Math.max(p.x, x1 + 4);
  if (handle.includes('n')) y1 = Math.min(p.y, y2 - 4);
  if (handle.includes('s')) y2 = Math.max(p.y, y1 + 4);
  if (keepRatio && handle.length === 2 && from.w && from.h) {
    const ratio = from.w / from.h;
    const w = x2 - x1,
      h = y2 - y1;
    if (w / h > ratio) {
      const nw = h * ratio;
      if (handle.includes('w')) x1 = x2 - nw;
      else x2 = x1 + nw;
    } else {
      const nh = w / ratio;
      if (handle.includes('n')) y1 = y2 - nh;
      else y2 = y1 + nh;
    }
  }
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}
function constrainShape(kind: ShapeKind, start: Point, p: Point): Point {
  const dx = p.x - start.x,
    dy = p.y - start.y;
  if (kind === 'line' || kind === 'arrow') {
    const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
    const length = Math.hypot(dx, dy);
    return { x: start.x + Math.cos(angle) * length, y: start.y + Math.sin(angle) * length };
  }
  const size = Math.max(Math.abs(dx), Math.abs(dy));
  return { x: start.x + Math.sign(dx || 1) * size, y: start.y + Math.sign(dy || 1) * size };
}

export function NoteCanvas({
  summary,
  items,
  itemsRef,
  preview,
  commit,
  ctx,
  tool,
  settings,
  selection,
  setSelection,
  view,
  setView,
  heights,
  onMeasure,
  editing,
  setEditing,
  onDropFiles,
  onDropData,
  onImageEdit,
  spaceHeld,
  onSelectionChange,
}: {
  summary: PageSummary;
  items: PageItem[];
  itemsRef: React.RefObject<PageItem[]>;
  preview: (items: PageItem[]) => void;
  commit: (items: PageItem[], base?: PageItem[]) => void;
  ctx: Omit<RenderContext, 'onMeasure' | 'hidden'>;
  tool: Tool;
  settings: ToolSettings;
  selection: string[];
  setSelection: (ids: string[]) => void;
  view: View;
  setView: (view: View | ((view: View) => View)) => void;
  heights: Map<string, number>;
  onMeasure: (id: string, height: number) => void;
  editing: { item: TextItem; isNew: boolean } | null;
  setEditing: (editing: { item: TextItem; isNew: boolean } | null) => void;
  onDropFiles: (files: File[], at: Point) => void;
  onDropData: (data: DataTransfer, at: Point) => void;
  onImageEdit: (item: ImageItem) => void;
  spaceHeld: boolean;
  onSelectionChange?: () => void;
}) {
  const svg = useRef<SVGSVGElement>(null);
  const container = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const touches = useRef(new Map<number, Point>());
  const penSeen = useRef(false);
  const frame = useRef(0);
  const [live, setLive] = useState<Live>(null);
  const [hover, setHover] = useState<Point | null>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [dragOver, setDragOver] = useState(false);
  const clip = useId().replace(/:/g, '');
  const paperId = useId().replace(/:/g, '');
  const box = pageBox(summary.size);
  const selected = useMemo(() => new Set(selection), [selection]);

  useLayoutEffect(() => {
    const node = container.current;
    if (!node) return;
    const measure = () => setSize({ w: node.clientWidth, h: node.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const toPage = useCallback(
    (clientX: number, clientY: number): Point => {
      const rect = svg.current!.getBoundingClientRect();
      return {
        x: (clientX - rect.left - view.x) / view.zoom,
        y: (clientY - rect.top - view.y) / view.zoom,
      };
    },
    [view],
  );
  const schedule = (next: Live) => {
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => setLive(next));
  };

  // Wheel: scroll pans, Ctrl/⌘ + wheel (and trackpad pinch) zooms around the pointer.
  useEffect(() => {
    const node = svg.current;
    if (!node) return;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = node.getBoundingClientRect();
      if (event.ctrlKey || event.metaKey) {
        const px = event.clientX - rect.left,
          py = event.clientY - rect.top;
        setView((v) => {
          const zoom = clampZoom(v.zoom * Math.exp(-event.deltaY * 0.0022));
          return {
            zoom,
            x: px - ((px - v.x) / v.zoom) * zoom,
            y: py - ((py - v.y) / v.zoom) * zoom,
          };
        });
      } else {
        const dx = event.shiftKey && !event.deltaX ? event.deltaY : event.deltaX;
        const dy = event.shiftKey && !event.deltaX ? 0 : event.deltaY;
        setView((v) => ({ ...v, x: v.x - dx, y: v.y - dy }));
      }
    };
    node.addEventListener('wheel', wheel, { passive: false });
    return () => node.removeEventListener('wheel', wheel);
  }, [setView]);

  const selectionRect = useMemo(() => {
    const chosen = items.filter((i) => selected.has(i.id));
    return unionRect(chosen.map((i) => itemBounds(i, heights.get(i.id))));
  }, [items, selected, heights]);
  const single = useMemo(() => {
    if (selection.length !== 1) return null;
    const item = items.find((i) => i.id === selection[0]);
    return item && (item.type === 'image' || item.type === 'sticker') ? item : null;
  }, [items, selection]);

  function endGesture() {
    const g = gesture.current;
    if (g?.kind === 'draw' && g.timer) clearTimeout(g.timer);
    gesture.current = null;
    cancelAnimationFrame(frame.current);
    setLive(null);
  }

  function startPan(event: ReactPointerEvent) {
    gesture.current = {
      kind: 'pan',
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      view,
    };
  }

  function onPointerDown(event: ReactPointerEvent<SVGSVGElement>) {
    if (editing) return;
    // Links in quote cards stay clickable with the select tool.
    if (
      tool === 'select' &&
      event.target instanceof Element &&
      event.target.closest('[data-note-link]')
    )
      return;
    const node = svg.current!;
    const p = toPage(event.clientX, event.clientY);
    if (event.pointerType === 'pen') penSeen.current = true;
    if (event.pointerType === 'touch') {
      touches.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (touches.current.size === 2) {
        // Two fingers: undo whatever the first finger started and pinch instead.
        const g = gesture.current;
        if (g && 'base' in g) preview(g.base);
        endGesture();
        const [a, b] = [...touches.current.entries()];
        gesture.current = {
          kind: 'pinch',
          ids: [a[0], b[0]],
          startDistance: Math.hypot(a[1].x - b[1].x, a[1].y - b[1].y) || 1,
          startMid: { x: (a[1].x + b[1].x) / 2, y: (a[1].y + b[1].y) / 2 },
          view,
        };
        node.setPointerCapture(event.pointerId);
        return;
      }
    }
    if (gesture.current) return;
    if (event.button !== 0 && event.button !== 1) return;
    event.preventDefault();
    node.focus({ preventScroll: true });
    node.setPointerCapture(event.pointerId);
    // Middle button, Space, the hand tool, or a finger once a pen was used (palm rejection) pan.
    if (
      event.button === 1 ||
      spaceHeld ||
      tool === 'hand' ||
      (event.pointerType === 'touch' && penSeen.current)
    ) {
      startPan(event);
      return;
    }
    switch (tool) {
      case 'pen':
      case 'highlighter': {
        const pressure = event.pointerType === 'pen' ? event.pressure || 0.5 : 0.5;
        const highlighter = tool === 'highlighter';
        gesture.current = {
          kind: 'draw',
          pointerId: event.pointerId,
          tool: highlighter ? 'highlighter' : settings.pen,
          color: highlighter ? settings.hlColor : settings.penColor,
          width: highlighter ? settings.hlWidth : settings.penWidth,
          points: [round(p.x), round(p.y), pressure],
          anchor: p,
          straight: highlighter && event.shiftKey,
        };
        armHold();
        schedule(liveStroke());
        return;
      }
      case 'eraser': {
        gesture.current = {
          kind: 'erase',
          pointerId: event.pointerId,
          base: itemsRef.current,
          last: p,
        };
        erase(p);
        return;
      }
      case 'shape':
        gesture.current = {
          kind: 'shape',
          pointerId: event.pointerId,
          start: p,
          current: p,
          constrain: event.shiftKey,
        };
        schedule({ kind: 'shape', shape: shapeFrom(p, p) });
        return;
      case 'text': {
        const hit = topItemAt(itemsRef.current, p, 4 / view.zoom, heights);
        if (hit?.type === 'text') setEditing({ item: hit, isNew: false });
        else
          setEditing({
            item: emptyText(p.x - 6, p.y - settings.textSize * 0.75, {
              font: settings.textFont,
              size: settings.textSize,
              color: settings.textColor,
            }),
            isNew: true,
          });
        node.releasePointerCapture(event.pointerId);
        return;
      }
      case 'select':
      case 'lasso': {
        const tolerance = 6 / view.zoom;
        // Handles of the current selection come first.
        if (selectionRect && tool === 'select') {
          if (single) {
            const rotate = {
              x: selectionRect.x + selectionRect.w / 2,
              y: selectionRect.y - 28 / view.zoom,
            };
            if (Math.hypot(p.x - rotate.x, p.y - rotate.y) <= 9 / view.zoom) {
              gesture.current = {
                kind: 'rotate',
                pointerId: event.pointerId,
                base: itemsRef.current,
                id: single.id,
                center: { x: single.x + single.w / 2, y: single.y + single.h / 2 },
              };
              return;
            }
          }
          for (const handle of HANDLES) {
            const h = handlePoint(selectionRect, handle);
            if (Math.abs(p.x - h.x) <= 8 / view.zoom && Math.abs(p.y - h.y) <= 8 / view.zoom) {
              const chosen = itemsRef.current.filter((i) => selected.has(i.id));
              gesture.current = {
                kind: 'resize',
                pointerId: event.pointerId,
                base: itemsRef.current,
                ids: new Set(selection),
                from: selectionRect,
                handle,
                ratio: chosen.every((i) => i.type === 'image' || i.type === 'sticker'),
              };
              return;
            }
          }
        }
        const hit = topItemAt(itemsRef.current, p, tolerance, heights);
        const insideSelection =
          selectionRect &&
          p.x >= selectionRect.x &&
          p.x <= selectionRect.x + selectionRect.w &&
          p.y >= selectionRect.y &&
          p.y <= selectionRect.y + selectionRect.h;
        if (hit || (insideSelection && selection.length)) {
          let ids = selection;
          if (hit && !selected.has(hit.id))
            ids = event.shiftKey ? [...selection, hit.id] : [hit.id];
          else if (hit && event.shiftKey) {
            setSelection(selection.filter((id) => id !== hit.id));
            return;
          }
          setSelection(ids);
          gesture.current = {
            kind: 'move',
            pointerId: event.pointerId,
            base: itemsRef.current,
            ids: new Set(ids),
            start: p,
            moved: false,
          };
          return;
        }
        if (!event.shiftKey) setSelection([]);
        gesture.current =
          tool === 'lasso'
            ? { kind: 'lasso', pointerId: event.pointerId, points: [p], add: event.shiftKey }
            : {
                kind: 'marquee',
                pointerId: event.pointerId,
                start: p,
                current: p,
                add: event.shiftKey,
              };
        return;
      }
    }
  }

  function liveStroke(): Live {
    const g = gesture.current;
    if (g?.kind !== 'draw') return null;
    if (g.shape) return { kind: 'shape', shape: g.shape };
    return { kind: 'stroke', tool: g.tool, color: g.color, width: g.width, points: g.points };
  }
  /** "Vẽ rồi giữ yên": after half a second without moving, the stroke becomes a clean shape. */
  function armHold() {
    const g = gesture.current;
    if (g?.kind !== 'draw' || g.tool === 'highlighter') return;
    if (g.timer) clearTimeout(g.timer);
    g.timer = setTimeout(() => {
      const current = gesture.current;
      if (current !== g || current.shape) return;
      const found = recognizeShape(strokePoints({ points: g.points } as StrokeItem));
      if (!found) return;
      g.shape = {
        shape: found.shape,
        x1: round(found.x1),
        y1: round(found.y1),
        x2: round(found.x2),
        y2: round(found.y2),
        color: g.color,
        width: Math.max(1, g.width),
        fill: null,
        dash: false,
      };
      setLive({ kind: 'shape', shape: g.shape });
    }, 550);
  }
  function shapeFrom(a: Point, b: Point): Omit<ShapeItem, 'id' | 'type'> {
    return {
      shape: settings.shape,
      x1: round(a.x),
      y1: round(a.y),
      x2: round(b.x),
      y2: round(b.y),
      color: settings.shapeColor,
      width: settings.shapeWidth,
      fill: settings.shape === 'line' || settings.shape === 'arrow' ? null : settings.shapeFill,
      dash: settings.shapeDash,
    };
  }
  function erase(p: Point) {
    const g = gesture.current;
    if (g?.kind !== 'erase') return;
    const radius = settings.eraserSize / 2 / Math.max(0.5, Math.min(2, view.zoom));
    // Sample between the last and current points so a fast swipe does not skip strokes.
    const steps = Math.max(1, Math.ceil(Math.hypot(p.x - g.last.x, p.y - g.last.y) / (radius / 2)));
    let next = itemsRef.current;
    for (let k = 1; k <= steps; k++) {
      const at = {
        x: g.last.x + ((p.x - g.last.x) * k) / steps,
        y: g.last.y + ((p.y - g.last.y) * k) / steps,
      };
      if (settings.eraserMode === 'partial') next = eraseCircle(next, at, radius);
      else {
        const gone = new Set(erasedIds(next, at, radius));
        if (gone.size) next = next.filter((i) => !gone.has(i.id));
      }
    }
    g.last = p;
    if (next !== itemsRef.current) preview(next);
  }

  function onPointerMove(event: ReactPointerEvent<SVGSVGElement>) {
    const p = toPage(event.clientX, event.clientY);
    if (tool === 'eraser' && event.pointerType !== 'touch') setHover(p);
    if (event.pointerType === 'touch' && touches.current.has(event.pointerId))
      touches.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const g = gesture.current;
    if (!g) return;
    if (g.kind === 'pinch') {
      const a = touches.current.get(g.ids[0]),
        b = touches.current.get(g.ids[1]);
      if (!a || !b) return;
      const rect = svg.current!.getBoundingClientRect();
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      const mid = { x: (a.x + b.x) / 2 - rect.left, y: (a.y + b.y) / 2 - rect.top };
      const startMid = { x: g.startMid.x - rect.left, y: g.startMid.y - rect.top };
      const zoom = clampZoom((g.view.zoom * distance) / g.startDistance);
      setView({
        zoom,
        x: mid.x - ((startMid.x - g.view.x) / g.view.zoom) * zoom,
        y: mid.y - ((startMid.y - g.view.y) / g.view.zoom) * zoom,
      });
      return;
    }
    if ('pointerId' in g && g.pointerId !== event.pointerId) return;
    switch (g.kind) {
      case 'pan':
        setView({
          ...g.view,
          x: g.view.x + event.clientX - g.startX,
          y: g.view.y + event.clientY - g.startY,
        });
        return;
      case 'draw': {
        if (g.shape) {
          // A recognized line keeps following the pointer; other shapes stay as recognized.
          if (g.shape.shape === 'line') {
            g.shape = { ...g.shape, x2: round(p.x), y2: round(p.y) };
            setLive({ kind: 'shape', shape: g.shape });
          }
          return;
        }
        const events = event.nativeEvent.getCoalescedEvents?.() ?? [event.nativeEvent];
        for (const e of events.length ? events : [event.nativeEvent]) {
          const q = toPage(e.clientX, e.clientY);
          const pressure = e.pointerType === 'pen' ? e.pressure || 0.5 : 0.5;
          if (g.straight)
            g.points = [g.points[0], g.points[1], g.points[2], round(q.x), round(q.y), pressure];
          else g.points.push(round(q.x), round(q.y), pressure);
        }
        if (Math.hypot(p.x - g.anchor.x, p.y - g.anchor.y) > 3 / view.zoom) {
          g.anchor = p;
          armHold();
        }
        schedule(liveStroke());
        return;
      }
      case 'erase':
        erase(p);
        return;
      case 'shape': {
        const end = event.shiftKey ? constrainShape(settings.shape, g.start, p) : p;
        g.current = end;
        schedule({ kind: 'shape', shape: shapeFrom(g.start, end) });
        return;
      }
      case 'move': {
        const dx = round(p.x - g.start.x),
          dy = round(p.y - g.start.y);
        if (!g.moved && Math.hypot(dx, dy) < 2 / view.zoom) return;
        g.moved = true;
        preview(g.base.map((i) => (g.ids.has(i.id) ? translateItem(i, dx, dy) : i)));
        return;
      }
      case 'resize': {
        // Images keep their proportions on corners; Shift toggles that.
        const to = resized(g.from, g.handle, p, g.ratio !== event.shiftKey);
        preview(g.base.map((i) => (g.ids.has(i.id) ? scaleItem(i, g.from, to) : i)));
        return;
      }
      case 'rotate': {
        let angle = (Math.atan2(p.y - g.center.y, p.x - g.center.x) * 180) / Math.PI + 90;
        if (angle > 180) angle -= 360;
        if (event.shiftKey) angle = Math.round(angle / 15) * 15;
        preview(
          g.base.map((i) =>
            i.id === g.id && (i.type === 'image' || i.type === 'sticker')
              ? { ...i, rot: round(angle) }
              : i,
          ),
        );
        return;
      }
      case 'marquee':
        g.current = p;
        schedule({ kind: 'marquee', rect: normalizeRect(g.start, p) });
        return;
      case 'lasso':
        g.points.push(p);
        schedule({ kind: 'lasso', points: [...g.points] });
        return;
    }
  }

  function onPointerUp(event: ReactPointerEvent<SVGSVGElement>) {
    if (event.pointerType === 'touch') touches.current.delete(event.pointerId);
    const g = gesture.current;
    if (!g) return;
    if (g.kind === 'pinch') {
      if (touches.current.size < 2) endGesture();
      return;
    }
    if (g.pointerId !== event.pointerId) return;
    const cancelled = event.type === 'pointercancel';
    switch (g.kind) {
      case 'draw': {
        if (g.timer) clearTimeout(g.timer);
        if (cancelled) break;
        if (g.shape) {
          commit([...itemsRef.current, { id: newId('h'), type: 'shape', ...g.shape }]);
          break;
        }
        const stroke: StrokeItem = {
          id: newId('s'),
          type: 'stroke',
          tool: g.tool,
          color: g.color,
          width: g.width,
          points: simplifyStroke(g.points, g.tool === 'highlighter' ? 0.8 : 0.3),
        };
        commit([...itemsRef.current, ...splitLongStroke(stroke)]);
        break;
      }
      case 'erase':
        if (cancelled) preview(g.base);
        else commit(itemsRef.current, g.base);
        break;
      case 'shape': {
        if (cancelled) break;
        const shape = shapeFrom(g.start, g.current);
        if (Math.hypot(shape.x2 - shape.x1, shape.y2 - shape.y1) >= 4)
          commit([...itemsRef.current, { id: newId('h'), type: 'shape', ...shape }]);
        break;
      }
      case 'move':
      case 'resize':
      case 'rotate':
        if (cancelled) preview(g.base);
        else if (g.kind !== 'move' || g.moved) commit(itemsRef.current, g.base);
        break;
      case 'marquee': {
        const rect = normalizeRect(g.start, g.current);
        if (rect.w > 2 || rect.h > 2) {
          const found = itemsInRect(itemsRef.current, rect, heights).map((i) => i.id);
          setSelection(g.add ? [...new Set([...selection, ...found])] : found);
        }
        break;
      }
      case 'lasso': {
        const found = itemsInLasso(itemsRef.current, g.points, heights).map((i) => i.id);
        setSelection(g.add ? [...new Set([...selection, ...found])] : found);
        break;
      }
    }
    endGesture();
    onSelectionChange?.();
  }

  function onDoubleClick(event: React.MouseEvent<SVGSVGElement>) {
    if (tool !== 'select' && tool !== 'lasso') return;
    const p = toPage(event.clientX, event.clientY);
    const hit = topItemAt(itemsRef.current, p, 6 / view.zoom, heights);
    if (hit?.type === 'text') setEditing({ item: hit, isNew: false });
    if (hit?.type === 'image') onImageEdit(hit);
  }

  const hidden = useMemo(() => (editing ? new Set([editing.item.id]) : undefined), [editing]);
  // PERF-01: strokes are painted into cached tiles at the screen's density. The scale follows
  // the zoom once it settles, so a pinch or Ctrl+wheel does not repaint every step.
  const targetScale = Math.round(view.zoom * (globalThis.devicePixelRatio || 1) * 100) / 100;
  const [rasterScale, setRasterScale] = useState(targetScale);
  useEffect(() => {
    if (targetScale === rasterScale) return;
    const timer = setTimeout(() => setRasterScale(targetScale), 180);
    return () => clearTimeout(timer);
  }, [targetScale, rasterScale]);
  // The visible part of the page plus a margin, snapped so small pans keep the same object.
  const margin = 256 / view.zoom;
  const areaX = Math.floor((-view.x / view.zoom - margin) / 64) * 64,
    areaY = Math.floor((-view.y / view.zoom - margin) / 64) * 64,
    areaW = Math.ceil((size.w / view.zoom + 2 * margin) / 64 + 1) * 64,
    areaH = Math.ceil((size.h / view.zoom + 2 * margin) / 64 + 1) * 64;
  // Mid-zoom the tiles keep their scale and area; they repaint once the zoom settles.
  const zooming = targetScale !== rasterScale;
  const settledArea = useRef<Rect>({ x: areaX, y: areaY, w: areaW, h: areaH });
  if (!zooming) settledArea.current = { x: areaX, y: areaY, w: areaW, h: areaH };
  const area = settledArea.current;
  const raster = useMemo(
    () => ({ scale: rasterScale, area: { x: area.x, y: area.y, w: area.w, h: area.h } }),
    [rasterScale, area.x, area.y, area.w, area.h],
  );
  const renderCtx = useMemo<RenderContext>(
    () => ({ ...ctx, onMeasure, hidden, links: tool === 'select', raster, vector: selected }),
    [ctx, onMeasure, hidden, tool, raster, selected],
  );
  // The paper of an infinite page covers the visible area.
  const visible: Rect = box
    ? { x: 0, y: 0, w: box.w, h: box.h }
    : {
        x: -view.x / view.zoom - 2,
        y: -view.y / view.zoom - 2,
        w: size.w / view.zoom + 4,
        h: size.h / view.zoom + 4,
      };
  const handleSize = 9 / view.zoom;
  const cursor =
    spaceHeld || tool === 'hand'
      ? gesture.current?.kind === 'pan'
        ? 'grabbing'
        : 'grab'
      : tool === 'text'
        ? 'text'
        : tool === 'select' || tool === 'lasso'
          ? 'default'
          : tool === 'eraser'
            ? 'none'
            : 'crosshair';

  return (
    <div
      ref={container}
      className="note-canvas"
      data-drag-over={dragOver || undefined}
      onDragOver={(event) => {
        if (
          ![...event.dataTransfer.types].some(
            (t) => t === 'Files' || t === 'text/uri-list' || t === 'text/html',
          )
        )
          return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
        setDragOver(true);
      }}
      onDragLeave={(event) => {
        if (!container.current?.contains(event.relatedTarget as Node)) setDragOver(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setDragOver(false);
        const at = toPage(event.clientX, event.clientY);
        const files = [...event.dataTransfer.files].filter((f) => f.type.startsWith('image/'));
        if (files.length) onDropFiles(files, at);
        else onDropData(event.dataTransfer, at);
      }}
    >
      <svg
        ref={svg}
        className="note-surface"
        tabIndex={0}
        role="application"
        aria-label={`Trang vở. Công cụ đang chọn: ${TOOL_LABELS[tool]}.`}
        aria-roledescription="trang vẽ"
        data-tool={tool}
        style={{ cursor, touchAction: 'none' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={() => setHover(null)}
        onDoubleClick={onDoubleClick}
        onContextMenu={(event) => event.preventDefault()}
      >
        <NoteDefs />
        <defs>
          {box && (
            <clipPath id={clip}>
              <rect x="0" y="0" width={box.w} height={box.h} />
            </clipPath>
          )}
        </defs>
        <g transform={`translate(${view.x} ${view.y}) scale(${view.zoom})`}>
          {box && (
            <rect x="3" y="5" width={box.w} height={box.h} fill="rgba(0,30,66,0.14)" rx="2" />
          )}
          <NotePaper
            id={paperId}
            paper={summary.paper}
            color={summary.paperColor}
            page={visible}
            bounded={!!box}
          />
          <g clipPath={box ? `url(#${clip})` : undefined}>
            <NoteItems items={items} ctx={renderCtx} />
            {live?.kind === 'stroke' && (
              <StrokeShape
                item={live}
                d={strokeOutline(
                  { tool: live.tool, width: live.width, points: live.points },
                  false,
                )}
              />
            )}
            {live?.kind === 'shape' && <ShapeNode item={live.shape} />}
          </g>
          {live?.kind === 'marquee' && (
            <rect
              x={live.rect.x}
              y={live.rect.y}
              width={live.rect.w}
              height={live.rect.h}
              fill="rgba(0,86,166,0.08)"
              stroke="#0056a6"
              strokeWidth={1 / view.zoom}
              strokeDasharray={`${4 / view.zoom} ${3 / view.zoom}`}
            />
          )}
          {live?.kind === 'lasso' && (
            <polyline
              points={live.points.map((p) => `${p.x},${p.y}`).join(' ')}
              fill="rgba(0,86,166,0.06)"
              stroke="#0056a6"
              strokeWidth={1.2 / view.zoom}
              strokeDasharray={`${4 / view.zoom} ${3 / view.zoom}`}
            />
          )}
          {selectionRect && !editing && (tool === 'select' || tool === 'lasso') && (
            <g className="note-selection" data-note-selection={selection.length}>
              <rect
                x={selectionRect.x}
                y={selectionRect.y}
                width={selectionRect.w}
                height={selectionRect.h}
                fill="none"
                stroke="#0056a6"
                strokeWidth={1.2 / view.zoom}
                strokeDasharray={`${5 / view.zoom} ${3 / view.zoom}`}
              />
              {tool === 'select' &&
                HANDLES.map((handle) => {
                  const h = handlePoint(selectionRect, handle);
                  return (
                    <rect
                      key={handle}
                      data-handle={handle}
                      x={h.x - handleSize / 2}
                      y={h.y - handleSize / 2}
                      width={handleSize}
                      height={handleSize}
                      fill="#ffffff"
                      stroke="#0056a6"
                      strokeWidth={1.4 / view.zoom}
                      rx={2 / view.zoom}
                    />
                  );
                })}
              {tool === 'select' && single && (
                <g data-handle="rotate">
                  <line
                    x1={selectionRect.x + selectionRect.w / 2}
                    x2={selectionRect.x + selectionRect.w / 2}
                    y1={selectionRect.y}
                    y2={selectionRect.y - 28 / view.zoom}
                    stroke="#0056a6"
                    strokeWidth={1.2 / view.zoom}
                  />
                  <circle
                    cx={selectionRect.x + selectionRect.w / 2}
                    cy={selectionRect.y - 28 / view.zoom}
                    r={6 / view.zoom}
                    fill="#ffffff"
                    stroke="#0056a6"
                    strokeWidth={1.4 / view.zoom}
                  />
                </g>
              )}
            </g>
          )}
          {tool === 'eraser' && hover && (
            <circle
              cx={hover.x}
              cy={hover.y}
              r={settings.eraserSize / 2 / Math.max(0.5, Math.min(2, view.zoom))}
              fill="rgba(255,255,255,0.4)"
              stroke="#52647a"
              strokeWidth={1 / view.zoom}
              pointerEvents="none"
            />
          )}
        </g>
      </svg>
      {editing && (
        <NoteTextEditor
          key={editing.item.id}
          item={editing.item}
          view={view}
          onChange={(item) => setEditing({ ...editing, item })}
          onDone={(item) => finishText(item)}
        />
      )}
      {dragOver && <div className="note-drop-hint">Thả ảnh vào trang</div>}
    </div>
  );

  function finishText(item: TextItem) {
    const draft = editing;
    setEditing(null);
    if (!draft) return;
    const empty = !item.blocks.some((b) => b.runs.some((r) => r.t.trim()));
    const current = itemsRef.current;
    if (draft.isNew) {
      if (!empty) commit([...current, item]);
    } else if (empty) commit(current.filter((i) => i.id !== item.id));
    else {
      const before = current.find((i) => i.id === item.id);
      if (before && JSON.stringify(before) !== JSON.stringify(item))
        commit(current.map((i) => (i.id === item.id ? item : i)));
    }
    svg.current?.focus({ preventScroll: true });
  }
}

export const TOOL_LABELS: Record<Tool, string> = {
  pen: 'Bút',
  highlighter: 'Bút dạ',
  eraser: 'Tẩy',
  shape: 'Hình',
  text: 'Chữ',
  select: 'Chọn',
  lasso: 'Chọn tự do (lasso)',
  hand: 'Kéo trang',
};
export type { StickerItem };
