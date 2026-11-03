'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { libraryCourses } from '../../lib/library';
import type { NotebookEntry } from '../../lib/notebook';
import {
  contentBounds,
  dataUrlToBlob,
  droppedImageSource,
  fitImage,
  newId,
  pageBox,
  recolorItem,
  round,
  translateItem,
  type ImageItem,
  type PageItem,
  type Point,
  type QuoteItem,
} from '../../lib/note-model';
import {
  assetStatuses,
  assetUrl,
  createPage,
  deletePage,
  getNotebook,
  getPage,
  imageFromUrl,
  notesError,
  notesPath,
  reorderPages,
  savePageContent,
  updateNotebook,
  updatePage,
  uploadImage,
  type AssetInfo,
  type Notebook,
  type NotebookCourse,
  type PageSummary,
} from '../../lib/notes';
import { useNotesLeaveGuard } from '../library/use-notes-leave-guard';
import { Button } from '../ui/button';
import {
  MAX_ZOOM,
  MIN_ZOOM,
  NoteCanvas,
  type Tool,
  type ToolSettings,
  type View,
} from './note-canvas';
import {
  CropDialog,
  NotebookForm,
  NoteModal,
  PaperChoices,
  quoteFromEntry,
  QuotePicker,
  ShortcutsHelp,
  StickerPicker,
} from './note-dialogs';
import { exportName, exportSvgToPng } from './note-export';
import { NotePages, type ThumbData } from './note-pages';
import { NotePaper } from './note-paper';
import { NoteDefs, NoteItems } from './note-render';
import type { Sticker } from './note-stickers';
import { NoteToolbar } from './note-toolbar';
import { useNotePage } from './use-note-page';

const SETTINGS_KEY = 'hucescholar.notes.tools';
const DEFAULT_SETTINGS: ToolSettings = {
  pen: 'ballpoint',
  penColor: '#172b45',
  penWidth: 2.5,
  hlColor: '#fff176',
  hlWidth: 24,
  eraserMode: 'stroke',
  eraserSize: 24,
  shape: 'rect',
  shapeColor: '#172b45',
  shapeWidth: 3,
  shapeFill: null,
  shapeDash: false,
  textFont: 'be-vietnam-pro',
  textSize: 18,
  textColor: '#172b45',
};
function readSettings(): ToolSettings {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? 'null');
    if (value && typeof value === 'object')
      return { ...DEFAULT_SETTINGS, ...(value as Partial<ToolSettings>) };
  } catch {
    /* Defaults when storage is unavailable. */
  }
  return DEFAULT_SETTINGS;
}

/** Items copied with Ctrl+C, kept for pasting into another page or notebook of this session. */
let clipboard: { token: string; items: PageItem[] } | null = null;

type Dialog =
  | { kind: 'stickers' }
  | { kind: 'quotes' }
  | { kind: 'crop'; item: ImageItem }
  | { kind: 'help' }
  | { kind: 'paper' }
  | { kind: 'notebook' }
  | { kind: 'deletePage' }
  | null;

export function NoteEditor({
  notebookId,
  initialPageId,
}: {
  notebookId: string;
  initialPageId: string | null;
}) {
  const [notebook, setNotebook] = useState<Notebook | null>(null);
  const [pages, setPages] = useState<PageSummary[]>([]);
  const [loadError, setLoadError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const page = useNotePage(notebookId, currentId);
  const [tool, setTool] = useState<Tool>('pen');
  // Rendered only in the browser (after the session check), so remembered settings are readable.
  const [settings, setSettingsState] = useState<ToolSettings>(readSettings);
  const [selection, setSelection] = useState<string[]>([]);
  const [editing, setEditing] = useState<Parameters<typeof NoteCanvas>[0]['editing']>(null);
  const [view, setView] = useState<View>({ zoom: 1, x: 24, y: 24 });
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [notice, setNotice] = useState<{ text: string; tone: 'info' | 'error' } | null>(null);
  const [busy, setBusy] = useState(false);
  const [localImages, setLocalImages] = useState<Map<string, string>>(new Map());
  const [cache, setCache] = useState<Map<string, ThumbData>>(new Map());
  const [heightsVersion, setHeightsVersion] = useState(0);
  const [courses, setCourses] = useState<NotebookCourse[]>([]);
  const heights = useRef(new Map<string, number>());
  const stage = useRef<HTMLDivElement>(null);
  const exportSvg = useRef<SVGSVGElement>(null);
  const fittedFor = useRef<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const setSettings = useCallback((next: ToolSettings) => {
    setSettingsState(next);
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
    } catch {
      /* Not remembered; still applied. */
    }
  }, []);

  // ---- Loading -----------------------------------------------------------------------------
  useEffect(() => {
    const controller = new AbortController();
    getNotebook(notebookId, controller.signal)
      .then((detail) => {
        setNotebook(detail.item);
        setPages(detail.pages);
        setCurrentId((id) => {
          if (id && detail.pages.some((p) => p.id === id)) return id;
          if (initialPageId && detail.pages.some((p) => p.id === initialPageId))
            return initialPageId;
          return detail.pages[0]?.id ?? null;
        });
      })
      .catch(
        (error) =>
          !controller.signal.aborted && setLoadError(notesError(error, 'Chưa mở được vở ghi.')),
      );
    return () => controller.abort();
  }, [notebookId, initialPageId, attempt]);

  const ready = page.state.status === 'ready' ? page.state : null;
  const items = useMemo(() => ready?.items ?? [], [ready]);
  const summary = ready?.summary ?? null;
  const box = summary ? pageBox(summary.size) : null;

  // Keep the URL on the open page, so reload and sharing the link with oneself land there.
  useEffect(() => {
    if (!currentId) return;
    const target = notesPath(notebookId, currentId);
    if (location.pathname + location.search !== target)
      history.replaceState(history.state, '', target);
  }, [notebookId, currentId]);

  // Fit the page into view once per opened page.
  const fit = useCallback(
    (mode: 'width' | 'page' = 'width') => {
      const node = stage.current;
      if (!node || !summary) return;
      const w = node.clientWidth,
        h = node.clientHeight;
      const b = pageBox(summary.size);
      if (!b) {
        setView({ zoom: 1, x: 24, y: 24 });
        return;
      }
      const zoom = Math.max(
        MIN_ZOOM,
        Math.min(
          mode === 'width' ? 1.25 : MAX_ZOOM,
          (w - 48) / b.w,
          mode === 'page' ? (h - 48) / b.h : Infinity,
        ),
      );
      setView({ zoom, x: Math.max(24, (w - b.w * zoom) / 2), y: 24 });
    },
    [summary],
  );
  useEffect(() => {
    if (summary && fittedFor.current !== summary.id) {
      fittedFor.current = summary.id;
      fit('width');
    }
  }, [summary, fit]);

  // The open page's thumbnail follows the edits.
  const thumbs = useMemo(() => {
    if (!ready) return cache;
    return new Map(cache).set(ready.summary.id, {
      items: ready.items,
      quotes: ready.quotes,
      assets: ready.assets,
    });
  }, [cache, ready]);
  const loadThumb = useCallback(
    (id: string) => {
      if (id === currentId) return;
      void getPage(notebookId, id)
        .then((view) =>
          setCache((c) =>
            new Map(c).set(id, {
              items: view.page.content.items,
              quotes: view.quotes,
              assets: view.assets,
            }),
          ),
        )
        .catch(() => undefined);
    },
    [notebookId, currentId],
  );

  // Images still being checked: ask again, further apart each time, only while the tab is shown.
  const checking = useMemo(
    () => [
      ...new Set(
        items.flatMap((i) =>
          i.type === 'image' &&
          (!ready?.assets[i.assetId] || ready.assets[i.assetId].status === 'CHECKING')
            ? [i.assetId]
            : [],
        ),
      ),
    ],
    [items, ready],
  );
  const mergeAssets = page.mergeAssets;
  useEffect(() => {
    if (!checking.length) return;
    let delay = 2000,
      stopped = false,
      timer: ReturnType<typeof setTimeout> | undefined;
    const started = Date.now();
    const tick = async () => {
      if (stopped || Date.now() - started > 10 * 60_000) return;
      if (document.hidden) {
        timer = setTimeout(tick, 2000);
        return;
      }
      try {
        const found = await assetStatuses(checking);
        if (stopped) return;
        mergeAssets(
          Object.fromEntries(
            found.map((a) => [a.id, { status: a.status, width: a.width, height: a.height }]),
          ),
        );
      } catch {
        /* Try again later. */
      }
      delay = Math.min(30_000, delay * 2);
      timer = setTimeout(tick, delay);
    };
    timer = setTimeout(tick, delay);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [checking, mergeAssets]);

  // ---- Leaving -----------------------------------------------------------------------------
  const unsaved = page.save.state !== 'saved';
  useNotesLeaveGuard(unsaved, false, 'Trang vở có thay đổi chưa lưu. Rời trang và bỏ thay đổi?');

  async function leaveCurrent() {
    setEditing(null);
    setSelection([]);
    const saved = await page.flush();
    if (!saved && page.save.state !== 'saved')
      return window.confirm(
        'Trang hiện tại chưa lưu được. Vẫn chuyển trang và bỏ thay đổi chưa lưu?',
      );
    return true;
  }
  async function openPage(id: string) {
    if (id === currentId) return;
    if (!(await leaveCurrent())) return;
    setCurrentId(id);
  }

  // ---- Commands ----------------------------------------------------------------------------
  const commit = page.commit;
  const itemsRef = page.itemsRef;
  const center = useCallback((): Point => {
    const node = stage.current;
    if (!node) return { x: 300, y: 300 };
    return {
      x: (node.clientWidth / 2 - view.x) / view.zoom,
      y: (node.clientHeight / 3 - view.y) / view.zoom,
    };
  }, [view]);
  const selected = useMemo(() => new Set(selection), [selection]);
  function deleteSelection() {
    if (!selection.length) return;
    commit(itemsRef.current.filter((i) => !selected.has(i.id)));
    setSelection([]);
  }
  function duplicateSelection(offset = 16) {
    const copies = itemsRef.current
      .filter((i) => selected.has(i.id))
      .map((i) => ({ ...translateItem(i, offset, offset), id: newId(i.type[0]) }) as PageItem);
    if (!copies.length) return;
    commit([...itemsRef.current, ...copies]);
    setSelection(copies.map((c) => c.id));
  }
  function nudge(dx: number, dy: number) {
    commit(itemsRef.current.map((i) => (selected.has(i.id) ? translateItem(i, dx, dy) : i)));
  }
  function arrange(front: boolean) {
    const chosen = itemsRef.current.filter((i) => selected.has(i.id));
    const rest = itemsRef.current.filter((i) => !selected.has(i.id));
    commit(front ? [...rest, ...chosen] : [...chosen, ...rest]);
  }
  function recolor(color: string) {
    commit(itemsRef.current.map((i) => (selected.has(i.id) ? recolorItem(i, color) : i)));
  }
  function addItems(added: PageItem[], select = true) {
    if (!added.length) return;
    if (itemsRef.current.length + added.length > 5000) {
      setNotice({
        text: 'Một trang có tối đa 5 000 đối tượng. Thêm trang mới để viết tiếp.',
        tone: 'error',
      });
      return;
    }
    commit([...itemsRef.current, ...added]);
    if (select) {
      setTool('select');
      setSelection(added.map((i) => i.id));
    }
  }

  // ---- Images ------------------------------------------------------------------------------
  function placeImage(
    asset: { id: string; width: number; height: number },
    at: Point,
    index = 0,
  ): ImageItem {
    const maxW = box ? box.w * 0.6 : 600,
      maxH = box ? box.h * 0.45 : 600;
    const place = fitImage(
      asset.width,
      asset.height,
      { x: at.x + index * 24, y: at.y + index * 24 },
      maxW,
      maxH,
    );
    return { id: newId('i'), type: 'image', assetId: asset.id, ...place, rot: 0, crop: null };
  }
  async function insertFiles(files: Blob[], at: Point = center()) {
    const list = files.filter((f) => f.type.startsWith('image/')).slice(0, 10);
    if (!list.length) return;
    const added: ImageItem[] = [];
    for (const [index, file] of list.entries()) {
      setNotice({ text: `Đang tải ảnh ${index + 1}/${list.length}…`, tone: 'info' });
      try {
        const asset = await uploadImage(file);
        const url = URL.createObjectURL(file);
        setLocalImages((m) => new Map(m).set(asset.id, url));
        page.mergeAssets({
          [asset.id]: { status: asset.status, width: asset.width, height: asset.height },
        });
        added.push(placeImage(asset, at, index));
      } catch (error) {
        setNotice({ text: notesError(error, 'Chưa tải được ảnh.'), tone: 'error' });
        addItems(added);
        return;
      }
    }
    addItems(added);
    setNotice({
      text: 'Đã thêm ảnh. Ảnh được kiểm tra an toàn trước khi lưu trữ lâu dài.',
      tone: 'info',
    });
  }
  async function insertFromData(data: DataTransfer, at: Point) {
    const source = droppedImageSource(
      data.getData('text/html'),
      data.getData('text/uri-list'),
      data.getData('text/plain'),
    );
    if (!source) {
      setNotice({
        text: 'Không thấy ảnh trong nội dung vừa thả. Hãy lưu ảnh về máy rồi kéo vào.',
        tone: 'error',
      });
      return;
    }
    if (source.kind === 'data') {
      const blob = dataUrlToBlob(source.value);
      if (blob) await insertFiles([blob], at);
      return;
    }
    setNotice({ text: 'Đang lấy ảnh từ trang web…', tone: 'info' });
    try {
      const asset = await imageFromUrl(source.value);
      page.mergeAssets({
        [asset.id]: { status: asset.status, width: asset.width, height: asset.height },
      });
      addItems([placeImage(asset, at)]);
      setNotice({
        text: `Đã thêm ảnh từ ${asset.sourceHost ?? 'trang web'}. Ảnh hiện ra sau khi kiểm tra an toàn.`,
        tone: 'info',
      });
    } catch (error) {
      setNotice({ text: notesError(error), tone: 'error' });
    }
  }
  const fileInput = useRef<HTMLInputElement>(null);

  function insertSticker(sticker: Sticker) {
    const at = center();
    addItems([
      {
        id: newId('k'),
        type: 'sticker',
        sticker: sticker.id,
        x: round(at.x - sticker.w / 2),
        y: round(at.y - sticker.h / 2),
        w: sticker.w,
        h: sticker.h,
        rot: 0,
      },
    ]);
    setDialog(null);
  }
  function insertQuotes(entries: NotebookEntry[]) {
    const at = center();
    const w = box ? Math.min(box.w - 112, 640) : 640;
    let y = at.y;
    const views: Record<string, ReturnType<typeof quoteFromEntry>> = {};
    const added: QuoteItem[] = entries.map((entry) => {
      const view = quoteFromEntry(entry);
      views[entry.id] = view;
      const text = view.available ? `${view.quote}\n${view.note}` : '';
      const lines = text
        .split('\n')
        .reduce((n, l) => n + Math.max(1, Math.ceil(l.length / Math.floor((w - 40) / 7.6))), 0);
      const h = Math.min(640, Math.max(120, 76 + lines * 22));
      const item: QuoteItem = {
        id: newId('q'),
        type: 'quote',
        annotationId: entry.id,
        x: round(at.x - w / 2),
        y: round(y),
        w,
        h,
      };
      y += h + 20;
      return item;
    });
    page.mergeQuotes(views);
    addItems(added);
    setDialog(null);
  }

  // ---- Pages -------------------------------------------------------------------------------
  async function pageAction(work: () => Promise<void>) {
    setBusy(true);
    try {
      await work();
    } catch (error) {
      setNotice({ text: notesError(error), tone: 'error' });
    } finally {
      setBusy(false);
    }
  }
  const addPage = (duplicate = false) =>
    pageAction(async () => {
      if (!(await leaveCurrent())) return;
      const result = await createPage(notebookId, {
        afterPageId: currentId,
        ...(duplicate && currentId ? { duplicateOf: currentId } : {}),
      });
      setNotebook(result.item);
      setPages(result.pages);
      setCurrentId(result.page.id);
    });
  const removePage = () =>
    pageAction(async () => {
      if (!currentId || !ready) return;
      await page.flush();
      const index = pages.findIndex((p) => p.id === currentId);
      const result = await deletePage(
        notebookId,
        currentId,
        page.state.status === 'ready' ? page.state.revision : ready.revision,
      );
      setNotebook(result.item);
      setPages(result.pages);
      setDialog(null);
      setCurrentId(result.pages[Math.max(0, index - 1)]?.id ?? null);
    });
  const reorder = (order: string[]) =>
    pageAction(async () => {
      const result = await reorderPages(notebookId, order);
      setPages(result.pages);
    });

  // ---- Keyboard and clipboard ----------------------------------------------------------------
  const typing = (target: EventTarget | null) =>
    target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName));
  const modalOpen = () => !!document.querySelector('dialog[open]');
  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (typing(event.target) || modalOpen() || editing) return;
      const mod = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      if (event.key === ' ' && !event.repeat) {
        if (event.target === document.body || stage.current?.contains(event.target as Node)) {
          event.preventDefault();
          setSpaceHeld(true);
        }
        return;
      }
      if (mod && key === 'z') {
        event.preventDefault();
        if (event.shiftKey) page.redo();
        else page.undo();
        return;
      }
      if (mod && key === 'y') {
        event.preventDefault();
        page.redo();
        return;
      }
      if (mod && key === 'a') {
        event.preventDefault();
        setTool('select');
        setSelection(itemsRef.current.map((i) => i.id));
        return;
      }
      if (mod && key === 'd') {
        event.preventDefault();
        duplicateSelection();
        return;
      }
      if (mod) return;
      if ((event.key === 'Delete' || event.key === 'Backspace') && selection.length) {
        event.preventDefault();
        deleteSelection();
        return;
      }
      if (event.key.startsWith('Arrow') && selection.length) {
        event.preventDefault();
        const step = event.shiftKey ? 10 : 1;
        nudge(
          event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0,
          event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0,
        );
        return;
      }
      if (event.key === 'Escape') {
        if (selection.length) setSelection([]);
        else if (fullscreen) setFullscreen(false);
        return;
      }
      if (event.key === 'PageDown' || event.key === 'PageUp') {
        const index =
          pages.findIndex((p) => p.id === currentId) + (event.key === 'PageDown' ? 1 : -1);
        if (pages[index]) {
          event.preventDefault();
          void openPage(pages[index].id);
        }
        return;
      }
      if (event.key === '?') {
        setDialog({ kind: 'help' });
        return;
      }
      if (event.key === '+' || event.key === '=') zoomBy(1.2);
      else if (event.key === '-') zoomBy(1 / 1.2);
      else if (event.key === '0') fit('page');
      const tools: Record<string, Tool> = {
        p: 'pen',
        h: 'highlighter',
        e: 'eraser',
        s: 'shape',
        t: 'text',
        v: 'select',
        l: 'lasso',
      };
      if (tools[key] && !event.altKey) {
        setTool(tools[key]);
        if (tools[key] !== 'select' && tools[key] !== 'lasso') setSelection([]);
      }
      if (key === 'i') fileInput.current?.click();
    };
    const up = (event: KeyboardEvent) => {
      if (event.key === ' ') setSpaceHeld(false);
    };
    const copy = (event: ClipboardEvent, cut: boolean) => {
      if (typing(event.target) || modalOpen() || editing || !selection.length) return;
      const chosen = itemsRef.current.filter((i) => selected.has(i.id));
      const token = `hucescholar-notes:${newId('c')}`;
      clipboard = { token, items: chosen };
      event.clipboardData?.setData('text/plain', token);
      event.preventDefault();
      if (cut) deleteSelection();
    };
    const onCopy = (event: ClipboardEvent) => copy(event, false);
    const onCut = (event: ClipboardEvent) => copy(event, true);
    const onPaste = (event: ClipboardEvent) => {
      if (typing(event.target) || modalOpen() || editing || !event.clipboardData) return;
      const files = [...event.clipboardData.files].filter((f) => f.type.startsWith('image/'));
      if (files.length) {
        event.preventDefault();
        void insertFiles(files);
        return;
      }
      const text = event.clipboardData.getData('text/plain');
      if (clipboard && text === clipboard.token) {
        event.preventDefault();
        const copies = clipboard.items.map(
          (i) => ({ ...translateItem(i, 16, 16), id: newId(i.type[0]) }) as PageItem,
        );
        clipboard = { ...clipboard, items: copies };
        addItems(copies);
        return;
      }
      if (droppedImageSource(event.clipboardData.getData('text/html'), '', '')) {
        event.preventDefault();
        void insertFromData(event.clipboardData, center());
      }
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    document.addEventListener('copy', onCopy);
    document.addEventListener('cut', onCut);
    document.addEventListener('paste', onPaste);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      document.removeEventListener('copy', onCopy);
      document.removeEventListener('cut', onCut);
      document.removeEventListener('paste', onPaste);
    };
  });

  function zoomBy(factor: number) {
    const node = stage.current;
    const cx = (node?.clientWidth ?? 800) / 2,
      cy = (node?.clientHeight ?? 600) / 2;
    setView((v) => {
      const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.zoom * factor));
      return { zoom, x: cx - ((cx - v.x) / v.zoom) * zoom, y: cy - ((cy - v.y) / v.zoom) * zoom };
    });
  }
  const onMeasure = useCallback((id: string, height: number) => {
    if (heights.current.get(id) !== height) {
      heights.current.set(id, height);
      setHeightsVersion((v) => v + 1);
    }
  }, []);
  const ctx = useMemo(
    () => ({ quotes: ready?.quotes ?? {}, assets: ready?.assets ?? {}, localImages }),
    [ready?.quotes, ready?.assets, localImages],
  );

  // ---- Export ------------------------------------------------------------------------------
  async function exportPng() {
    setExporting(true);
    setNotice({ text: 'Đang tạo ảnh PNG…', tone: 'info' });
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    try {
      await document.fonts.ready;
      const index = pages.findIndex((p) => p.id === currentId) + 1;
      await exportSvgToPng(exportSvg.current!, exportName(notebook?.title ?? 'vo-ghi', index));
      setNotice({ text: 'Đã tải ảnh PNG của trang.', tone: 'info' });
    } catch {
      setNotice({
        text: 'Trình duyệt chưa xuất được trang này thành PNG. Dùng “In / Lưu PDF” thay thế.',
        tone: 'error',
      });
    } finally {
      setExporting(false);
    }
  }
  const exportBox = useMemo(() => {
    if (box) return { x: 0, y: 0, w: box.w, h: box.h };
    const b = contentBounds(items, heights.current);
    return b
      ? { x: b.x - 40, y: b.y - 40, w: b.w + 80, h: b.h + 80 }
      : { x: 0, y: 0, w: 794, h: 1123 };
    // heightsVersion: measured text heights change the bounds.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [box, items, heightsVersion]);
  async function printView(scope: 'all' | 'page') {
    await page.flush();
    window.open(
      `/workspace/notes/${encodeURIComponent(notebookId)}/print${scope === 'page' && currentId ? `?pages=${currentId}` : ''}`,
      '_blank',
      'noopener',
    );
  }

  // ---- Conflict ----------------------------------------------------------------------------
  async function keepMineAsNewPage() {
    if (!summary) return;
    await pageAction(async () => {
      const mine = itemsRef.current;
      const result = await createPage(notebookId, {
        afterPageId: currentId,
        size: summary.size,
        paper: summary.paper,
        paperColor: summary.paperColor,
      });
      await savePageContent(notebookId, result.page.id, result.page.revision, {
        v: 1,
        items: mine,
      });
      setPages(result.pages);
      await page.discard();
      setCurrentId(result.page.id);
      setNotice({ text: 'Đã lưu bản của bạn thành trang mới ngay sau trang cũ.', tone: 'info' });
    });
  }

  if (loadError)
    return (
      <div className="note-editor-state">
        <p role="alert">{loadError}</p>
        <Button
          onClick={() => {
            setLoadError('');
            setAttempt((n) => n + 1);
          }}
        >
          Thử lại
        </Button>{' '}
        <Link href="/workspace/notes">Về kệ vở</Link>
      </div>
    );
  if (!notebook) return <p role="status">Đang mở vở ghi…</p>;

  const selectionItems = items.filter((i) => selected.has(i.id));
  const singleImage =
    selectionItems.length === 1 && selectionItems[0].type === 'image' ? selectionItems[0] : null;
  const pageIndex = pages.findIndex((p) => p.id === currentId);
  const saveLabel: Record<typeof page.save.state, string> = {
    saved: 'Đã lưu',
    pending: 'Chưa lưu…',
    saving: 'Đang lưu…',
    error: 'Lưu lỗi',
    conflict: 'Xung đột',
    tooLarge: 'Trang quá lớn',
  };

  return (
    <div className="note-editor" data-fullscreen={fullscreen || undefined}>
      <header className="note-editor-header">
        <Link href="/workspace/notes" className="note-back">
          ← Kệ vở
        </Link>
        <button
          type="button"
          className="note-title-button"
          onClick={() => setDialog({ kind: 'notebook' })}
          title="Đổi tên, bìa, môn"
        >
          <span className="note-cover-dot" data-cover={notebook.cover} aria-hidden="true" />
          <span className="note-title-text">{notebook.title}</span>
        </button>
        <span className="note-page-count">
          Trang {pageIndex + 1}/{pages.length}
        </span>
        <span className="note-save" data-state={page.save.state} role="status" aria-live="polite">
          {saveLabel[page.save.state]}
          {page.save.state === 'error' && (
            <button type="button" className="note-text-button" onClick={() => void page.flush()}>
              Thử lại
            </button>
          )}
        </span>
        <span className="note-header-actions">
          <button
            type="button"
            className="note-icon-button"
            onClick={page.undo}
            disabled={!page.history.undo}
            aria-label="Hoàn tác"
            title="Hoàn tác (Ctrl+Z)"
          >
            ↶
          </button>
          <button
            type="button"
            className="note-icon-button"
            onClick={page.redo}
            disabled={!page.history.redo}
            aria-label="Làm lại"
            title="Làm lại (Ctrl+Shift+Z)"
          >
            ↷
          </button>
          <span className="note-zoom" role="group" aria-label="Thu phóng">
            <button
              type="button"
              className="note-icon-button"
              onClick={() => zoomBy(1 / 1.2)}
              aria-label="Thu nhỏ"
            >
              −
            </button>
            <button
              type="button"
              className="note-text-button"
              onClick={() => fit('page')}
              title="Vừa trang (0)"
            >
              {Math.round(view.zoom * 100)}%
            </button>
            <button
              type="button"
              className="note-icon-button"
              onClick={() => zoomBy(1.2)}
              aria-label="Phóng to"
            >
              +
            </button>
          </span>
          <details className="note-menu">
            <summary>Chèn</summary>
            <div className="note-menu-panel">
              <button type="button" onClick={() => fileInput.current?.click()}>
                Ảnh từ máy…
              </button>
              <button type="button" onClick={() => setDialog({ kind: 'stickers' })}>
                Trang trí (sticker, washi, nhãn, khung)…
              </button>
              <button type="button" onClick={() => setDialog({ kind: 'quotes' })}>
                Trích dẫn từ Sổ tay…
              </button>
              <p className="note-menu-hint">
                Có thể kéo ảnh từ Google hoặc trang web khác thả thẳng vào trang, hoặc dán bằng
                Ctrl+V.
              </p>
            </div>
          </details>
          <button
            type="button"
            className="note-text-button"
            onClick={() => setDialog({ kind: 'paper' })}
          >
            Giấy
          </button>
          <details className="note-menu">
            <summary>Xuất</summary>
            <div className="note-menu-panel">
              <button type="button" onClick={() => void printView('all')}>
                In / Lưu PDF cả vở
              </button>
              <button type="button" onClick={() => void printView('page')}>
                In / Lưu PDF trang này
              </button>
              <button type="button" onClick={() => void exportPng()} disabled={exporting}>
                Tải ảnh PNG trang này
              </button>
            </div>
          </details>
          <button
            type="button"
            className="note-text-button"
            onClick={() => setFullscreen((f) => !f)}
            aria-pressed={fullscreen}
          >
            {fullscreen ? 'Thoát toàn màn hình' : 'Toàn màn hình'}
          </button>
          <button
            type="button"
            className="note-icon-button"
            onClick={() => setDialog({ kind: 'help' })}
            aria-label="Phím tắt"
            title="Phím tắt (?)"
          >
            ?
          </button>
        </span>
      </header>
      <NoteToolbar
        tool={tool}
        setTool={(t) => {
          setTool(t);
          if (t !== 'select' && t !== 'lasso') setSelection([]);
        }}
        settings={settings}
        setSettings={setSettings}
      />
      {selection.length > 0 && (tool === 'select' || tool === 'lasso') && (
        <div
          className="note-selection-bar"
          role="toolbar"
          aria-label={`Đã chọn ${selection.length} đối tượng`}
        >
          <span>Đã chọn {selection.length}</span>
          <button type="button" className="note-text-button" onClick={() => duplicateSelection()}>
            Nhân bản
          </button>
          <button type="button" className="note-text-button" onClick={() => arrange(true)}>
            Lên trên cùng
          </button>
          <button type="button" className="note-text-button" onClick={() => arrange(false)}>
            Xuống dưới cùng
          </button>
          {singleImage && (
            <button
              type="button"
              className="note-text-button"
              onClick={() => setDialog({ kind: 'crop', item: singleImage })}
            >
              Cắt ảnh
            </button>
          )}
          <span className="note-swatches" role="group" aria-label="Đổi màu">
            {['#172b45', '#1d4ed8', '#c62828', '#2e7d32', '#6a1b9a', '#ef6c00'].map((c) => (
              <button
                key={c}
                type="button"
                className="note-swatch"
                style={{ background: c }}
                onClick={() => recolor(c)}
                aria-label={`Đổi sang màu ${c}`}
              />
            ))}
          </span>
          <button type="button" className="note-text-button danger" onClick={deleteSelection}>
            Xóa
          </button>
        </div>
      )}
      {notice && (
        <p
          className="note-notice"
          data-tone={notice.tone}
          role={notice.tone === 'error' ? 'alert' : 'status'}
        >
          {notice.text}
          <button
            type="button"
            className="note-icon-button"
            onClick={() => setNotice(null)}
            aria-label="Đóng thông báo"
          >
            ✕
          </button>
        </p>
      )}
      {(page.save.state === 'tooLarge' || page.save.state === 'error') && page.save.message && (
        <p className="note-notice" data-tone="error" role="alert">
          {page.save.message}
        </p>
      )}
      <div className="note-workarea">
        <NotePages
          pages={pages}
          currentId={currentId}
          cache={thumbs}
          localImages={localImages}
          onOpen={(id) => void openPage(id)}
          onLoad={loadThumb}
          onReorder={(order) => void reorder(order)}
          onAdd={() => void addPage(false)}
          onDuplicate={() => void addPage(true)}
          onDelete={() => setDialog({ kind: 'deletePage' })}
          busy={busy}
        />
        <div className="note-stage" ref={stage}>
          {page.state.status === 'loading' && (
            <p role="status" className="note-stage-message">
              Đang mở trang…
            </p>
          )}
          {page.state.status === 'error' && (
            <div className="note-stage-message">
              <p role="alert">{page.state.message}</p>
              <Button onClick={() => void page.reload()}>Thử lại</Button>
            </div>
          )}
          {ready && summary && (
            <NoteCanvas
              key={summary.id}
              summary={summary}
              items={items}
              itemsRef={itemsRef}
              preview={page.preview}
              commit={commit}
              ctx={ctx}
              tool={tool}
              settings={settings}
              selection={selection}
              setSelection={setSelection}
              view={view}
              setView={setView}
              heights={heights.current}
              onMeasure={onMeasure}
              editing={editing}
              setEditing={setEditing}
              onDropFiles={(files, at) => void insertFiles(files, at)}
              onDropData={(data, at) => void insertFromData(data, at)}
              onImageEdit={(item) => setDialog({ kind: 'crop', item })}
              spaceHeld={spaceHeld}
            />
          )}
        </div>
      </div>
      <input
        ref={fileInput}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
        multiple
        hidden
        onChange={(event) => {
          const files = [...(event.target.files ?? [])];
          event.target.value = '';
          void insertFiles(files);
        }}
      />
      {exporting && summary && (
        <div className="note-export-host" aria-hidden="true">
          <svg
            ref={exportSvg}
            width={exportBox.w}
            height={exportBox.h}
            viewBox={`${exportBox.x} ${exportBox.y} ${exportBox.w} ${exportBox.h}`}
          >
            <NoteDefs />
            <NotePaper
              id="export-paper"
              paper={summary.paper}
              color={summary.paperColor}
              page={exportBox}
              bounded={!!box}
            />
            <NoteItems items={items} ctx={ctx} />
          </svg>
        </div>
      )}

      {dialog?.kind === 'stickers' && (
        <StickerPicker onPick={insertSticker} onClose={() => setDialog(null)} />
      )}
      {dialog?.kind === 'quotes' && (
        <QuotePicker onPick={insertQuotes} onClose={() => setDialog(null)} />
      )}
      {dialog?.kind === 'help' && <ShortcutsHelp onClose={() => setDialog(null)} />}
      {dialog?.kind === 'crop' && (
        <CropDialog
          item={dialog.item}
          src={
            localImages.get(dialog.item.assetId) ??
            (ready?.assets[dialog.item.assetId]?.status === 'SAFE'
              ? assetUrl(dialog.item.assetId)
              : null)
          }
          natural={{
            w: ready?.assets[dialog.item.assetId]?.width ?? dialog.item.w,
            h: ready?.assets[dialog.item.assetId]?.height ?? dialog.item.h,
          }}
          onClose={() => setDialog(null)}
          onApply={(crop) => {
            const target = dialog.item;
            const info: AssetInfo | undefined = ready?.assets[target.assetId];
            const natural = { w: info?.width ?? target.w, h: info?.height ?? target.h };
            const c = crop ?? { x: 0, y: 0, w: 1, h: 1 };
            // Keep the width; the height follows the cropped proportions.
            const h = round((target.w * (c.h * natural.h)) / (c.w * natural.w));
            commit(itemsRef.current.map((i) => (i.id === target.id ? { ...target, crop, h } : i)));
            setDialog(null);
          }}
        />
      )}
      {dialog?.kind === 'paper' && summary && (
        <PaperDialog
          summary={summary}
          notebook={notebook}
          onClose={() => setDialog(null)}
          onApply={async (value, asDefault) => {
            await page.flush();
            try {
              const updated = await updatePage(
                notebookId,
                summary.id,
                page.state.status === 'ready' ? page.state.revision : summary.revision,
                value,
              );
              page.setSummary(updated);
              setPages((list) => list.map((p) => (p.id === updated.id ? updated : p)));
              fittedFor.current = null;
              if (asDefault) {
                const result = await updateNotebook(notebookId, notebook.revision, {
                  title: notebook.title,
                  cover: notebook.cover,
                  courseId: notebook.course?.id ?? null,
                  defaultSize: value.size,
                  defaultPaper: value.paper,
                  defaultColor: value.paperColor,
                });
                setNotebook(result.item);
              }
              setDialog(null);
              return null;
            } catch (error) {
              return notesError(error);
            }
          }}
        />
      )}
      {dialog?.kind === 'notebook' && (
        <NotebookSettings
          notebook={notebook}
          courses={courses}
          loadCourses={() =>
            libraryCourses(new AbortController().signal)
              .then((list) => setCourses(list))
              .catch(() => undefined)
          }
          onClose={() => setDialog(null)}
          onSaved={(item) => {
            setNotebook(item);
            setDialog(null);
          }}
        />
      )}
      {dialog?.kind === 'deletePage' && (
        <NoteModal title={`Xóa trang ${pageIndex + 1}?`} onClose={() => setDialog(null)}>
          <p>Mọi nét vẽ, chữ và ảnh trên trang này sẽ bị xóa. Không hoàn tác được.</p>
          <div className="note-form-actions">
            <Button variant="quiet" onClick={() => setDialog(null)}>
              Hủy
            </Button>
            <Button variant="danger" pending={busy} onClick={() => void removePage()}>
              Xóa trang
            </Button>
          </div>
        </NoteModal>
      )}
      {page.save.state === 'conflict' && (
        <NoteModal title="Trang đã được sửa ở nơi khác" onClose={() => undefined}>
          <p>
            Trang này vừa được lưu từ một tab hoặc thiết bị khác, sau khi bạn mở nó. Để không ghi
            đè, hãy chọn giữ bản nào.
          </p>
          <div className="note-form-actions">
            <Button variant="quiet" onClick={() => void page.discard()}>
              Tải bản mới nhất (bỏ thay đổi của tôi)
            </Button>
            <Button variant="primary" pending={busy} onClick={() => void keepMineAsNewPage()}>
              Lưu bản của tôi thành trang mới
            </Button>
          </div>
        </NoteModal>
      )}
    </div>
  );
}

function PaperDialog({
  summary,
  notebook,
  onApply,
  onClose,
}: {
  summary: PageSummary;
  notebook: Notebook;
  onApply: (
    value: Pick<PageSummary, 'size' | 'paper' | 'paperColor'>,
    asDefault: boolean,
  ) => Promise<string | null>;
  onClose: () => void;
}) {
  const [value, setValue] = useState({
    size: summary.size,
    paper: summary.paper,
    color: summary.paperColor,
  });
  const [asDefault, setAsDefault] = useState(false);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  return (
    <NoteModal title="Giấy của trang này" onClose={onClose} wide>
      <PaperChoices
        name="page"
        paper={value.paper}
        color={value.color}
        size={value.size}
        onChange={setValue}
      />
      <label className="note-check">
        <input
          type="checkbox"
          checked={asDefault}
          onChange={(e) => setAsDefault(e.target.checked)}
        />
        Dùng làm mặc định cho trang mới của “{notebook.title}”
      </label>
      {value.size !== summary.size && summary.size === 'INFINITE' && (
        <p className="note-form-hint">
          Nội dung nằm ngoài khổ A4 vẫn được giữ nhưng sẽ bị cắt khi hiển thị.
        </p>
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
          onClick={async () => {
            setPending(true);
            const failure = await onApply(
              { size: value.size, paper: value.paper, paperColor: value.color },
              asDefault,
            );
            setPending(false);
            if (failure) setError(failure);
          }}
        >
          Áp dụng
        </Button>
      </div>
    </NoteModal>
  );
}

export function NotebookSettings({
  notebook,
  courses,
  loadCourses,
  onSaved,
  onClose,
}: {
  notebook: Notebook;
  courses: NotebookCourse[];
  loadCourses: () => void;
  onSaved: (item: Notebook) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!courses.length) loadCourses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const known =
    notebook.course && !courses.some((c) => c.id === notebook.course!.id)
      ? [notebook.course, ...courses]
      : courses;
  return (
    <NoteModal title="Thông tin vở" onClose={onClose} wide>
      <NotebookForm
        initial={{
          title: notebook.title,
          cover: notebook.cover,
          courseId: notebook.course?.id ?? null,
          defaultSize: notebook.defaultSize,
          defaultPaper: notebook.defaultPaper,
          defaultColor: notebook.defaultColor,
        }}
        courses={known}
        submitLabel="Lưu"
        onCancel={onClose}
        onSubmit={async (fields) => {
          try {
            onSaved((await updateNotebook(notebook.id, notebook.revision, fields)).item);
            return null;
          } catch (error) {
            return notesError(error);
          }
        }}
      />
    </NoteModal>
  );
}
