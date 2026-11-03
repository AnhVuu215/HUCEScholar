'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ApiError } from '../../lib/auth';
import {
  contentBytes,
  MAX_ITEMS,
  MAX_PAGE_BYTES,
  type PageContent,
  type PageItem,
} from '../../lib/note-model';
import {
  getPage,
  notesError,
  savePageContent,
  type AssetInfo,
  type PageSummary,
  type QuoteView,
} from '../../lib/notes';

export type SaveState = 'saved' | 'pending' | 'saving' | 'error' | 'conflict' | 'tooLarge';
type Loaded =
  | { pageId: string; status: 'error'; message: string; missing: boolean }
  | {
      pageId: string;
      status: 'ready';
      summary: PageSummary;
      items: PageItem[];
      revision: number;
      quotes: Record<string, QuoteView>;
      assets: Record<string, AssetInfo>;
    };
export type PageState = { status: 'loading' } | Loaded;

const HISTORY = 100;
const SAVE_DELAY = 1000;
const RETRY = [2000, 5000, 10000, 20000];

/**
 * One page of the editor: loading, undo/redo (100 steps) and autosave one second after the last
 * change. A save sends the revision the page was loaded at; 409 means another tab or device
 * changed the page, which the editor resolves with the user instead of overwriting.
 */
export function useNotePage(notebookId: string, pageId: string | null) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [save, setSave] = useState<{ state: SaveState; message: string }>({
    state: 'saved',
    message: '',
  });
  const [history, setHistory] = useState({ undo: 0, redo: 0 });
  const past = useRef<PageItem[][]>([]);
  const future = useRef<PageItem[][]>([]);
  const items = useRef<PageItem[]>([]);
  const revision = useRef(1);
  const dirty = useRef(false);
  const inFlight = useRef<Promise<void> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const retries = useRef(0);
  const target = useRef({ notebookId, pageId });
  const saveState = useRef<SaveState>('saved');
  const kick = useRef<() => void>(() => undefined);
  useLayoutEffect(() => {
    target.current = { notebookId, pageId };
  }, [notebookId, pageId]);

  const report = useCallback((next: SaveState, message = '') => {
    saveState.current = next;
    setSave({ state: next, message });
  }, []);

  const apply = useCallback(
    (id: string, view: Awaited<ReturnType<typeof getPage>>) => {
      items.current = view.page.content.items;
      revision.current = view.page.revision;
      past.current = [];
      future.current = [];
      dirty.current = false;
      retries.current = 0;
      setHistory({ undo: 0, redo: 0 });
      report('saved');
      const summary: PageSummary = {
        id: view.page.id,
        position: view.page.position,
        size: view.page.size,
        paper: view.page.paper,
        paperColor: view.page.paperColor,
        revision: view.page.revision,
        updatedAt: view.page.updatedAt,
      };
      setLoaded({
        pageId: id,
        status: 'ready',
        summary,
        items: view.page.content.items,
        revision: view.page.revision,
        quotes: view.quotes,
        assets: view.assets,
      });
    },
    [report],
  );
  const failed = useCallback((id: string, error: unknown) => {
    setLoaded({
      pageId: id,
      status: 'error',
      message: notesError(error, 'Chưa mở được trang vở.'),
      missing: error instanceof ApiError && error.status === 404,
    });
  }, []);
  useEffect(() => {
    if (!pageId) return;
    const controller = new AbortController();
    getPage(notebookId, pageId, controller.signal)
      .then((view) => !controller.signal.aborted && apply(pageId, view))
      .catch((error) => !controller.signal.aborted && failed(pageId, error));
    return () => controller.abort();
  }, [notebookId, pageId, apply, failed]);
  // A page other than the one loaded is still loading.
  const state: PageState = loaded && loaded.pageId === pageId ? loaded : { status: 'loading' };

  const saveOnce = useCallback(async () => {
    const at = target.current;
    if (!dirty.current || !at.pageId) return;
    const content: PageContent = { v: 1, items: items.current };
    if (content.items.length > MAX_ITEMS || contentBytes(content) > MAX_PAGE_BYTES) {
      report(
        'tooLarge',
        'Trang quá lớn để lưu (tối đa 2 MB hoặc 5 000 đối tượng). Chuyển bớt sang trang mới.',
      );
      return;
    }
    dirty.current = false;
    report('saving');
    try {
      const next = await savePageContent(at.notebookId, at.pageId, revision.current, content);
      revision.current = next;
      retries.current = 0;
      setLoaded((s) =>
        s?.status === 'ready' && s.pageId === at.pageId ? { ...s, revision: next } : s,
      );
      report(dirty.current ? 'pending' : 'saved');
    } catch (error) {
      dirty.current = true;
      if (error instanceof ApiError && error.code === 'NOTEBOOK_PAGE_CONFLICT')
        report('conflict', notesError(error));
      else if (
        error instanceof ApiError &&
        (error.status === 413 || error.code === 'NOTEBOOK_PAGE_TOO_LARGE')
      )
        report('tooLarge', notesError(error));
      else {
        report('error', notesError(error, 'Chưa lưu được trang.'));
        // Network or server trouble: try again a few times, further apart each time.
        if (!(error instanceof ApiError) || error.status >= 500) {
          clearTimeout(timer.current);
          timer.current = setTimeout(
            () => kick.current(),
            RETRY[Math.min(retries.current, RETRY.length - 1)],
          );
          retries.current++;
        }
      }
    }
  }, [report]);

  /** Saves what is pending, waiting for a save already running; changes made meanwhile follow. */
  const runSave = useCallback(async () => {
    for (let round = 0; round < 3; round++) {
      while (inFlight.current) await inFlight.current;
      if (!dirty.current) return;
      const work = saveOnce();
      inFlight.current = work;
      try {
        await work;
      } finally {
        inFlight.current = null;
      }
      // A conflict, an oversized page or a failed save waits for the user or the retry timer.
      if (saveState.current !== 'pending' && saveState.current !== 'saved') return;
    }
  }, [saveOnce]);
  useEffect(() => {
    kick.current = () => void runSave();
  }, [runSave]);

  const schedule = useCallback(() => {
    dirty.current = true;
    if (saveState.current === 'conflict') return;
    report('pending');
    clearTimeout(timer.current);
    timer.current = setTimeout(() => kick.current(), SAVE_DELAY);
  }, [report]);

  /** Shows items without recording history (during a gesture). */
  const preview = useCallback((next: PageItem[]) => {
    items.current = next;
    setLoaded((s) => (s?.status === 'ready' ? { ...s, items: next } : s));
  }, []);
  /** Records a change: `base` is what undo returns to (the items before the gesture). */
  const commit = useCallback(
    (next: PageItem[], base: PageItem[] = items.current) => {
      if (next === base) {
        preview(next);
        return;
      }
      past.current.push(base);
      if (past.current.length > HISTORY) past.current.shift();
      future.current = [];
      setHistory({ undo: past.current.length, redo: 0 });
      preview(next);
      schedule();
    },
    [preview, schedule],
  );
  const undo = useCallback(() => {
    const previous = past.current.pop();
    if (!previous) return;
    future.current.push(items.current);
    setHistory({ undo: past.current.length, redo: future.current.length });
    preview(previous);
    schedule();
  }, [preview, schedule]);
  const redo = useCallback(() => {
    const next = future.current.pop();
    if (!next) return;
    past.current.push(items.current);
    setHistory({ undo: past.current.length, redo: future.current.length });
    preview(next);
    schedule();
  }, [preview, schedule]);

  /** Saves now; true once nothing is left unsaved. */
  const flush = useCallback(async () => {
    clearTimeout(timer.current);
    if (saveState.current !== 'conflict') await runSave();
    return !dirty.current;
  }, [runSave]);
  /** Loads the page again (a retry after an error), showing "loading" meanwhile. */
  const reload = useCallback(async () => {
    if (!pageId) return;
    setLoaded(null);
    try {
      apply(pageId, await getPage(notebookId, pageId));
    } catch (error) {
      failed(pageId, error);
    }
  }, [notebookId, pageId, apply, failed]);
  /** "Bỏ thay đổi của tôi": a conflict is resolved by loading the newer page. */
  const discard = useCallback(async () => {
    clearTimeout(timer.current);
    dirty.current = false;
    report('saved');
    await reload();
  }, [reload, report]);

  const mergeQuotes = useCallback((quotes: Record<string, QuoteView>) => {
    setLoaded((s) => (s?.status === 'ready' ? { ...s, quotes: { ...s.quotes, ...quotes } } : s));
  }, []);
  const mergeAssets = useCallback((assets: Record<string, AssetInfo>) => {
    setLoaded((s) => (s?.status === 'ready' ? { ...s, assets: { ...s.assets, ...assets } } : s));
  }, []);
  /** After a page setting change, the server's newer revision becomes the save base. */
  const setSummary = useCallback((summary: PageSummary) => {
    revision.current = summary.revision;
    setLoaded((s) => (s?.status === 'ready' ? { ...s, summary, revision: summary.revision } : s));
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);

  return {
    state,
    save,
    history,
    itemsRef: items,
    preview,
    commit,
    undo,
    redo,
    flush,
    reload,
    discard,
    mergeQuotes,
    mergeAssets,
    setSummary,
  };
}
