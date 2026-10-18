'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '../../lib/auth';
import { readProgress, saveProgress } from '../../lib/reading';
type Status =
  | 'loading'
  | 'loaded'
  | 'queued'
  | 'saving'
  | 'saved'
  | 'save-error'
  | 'conflict'
  | 'load-error'
  | 'skipped';
type Session = {
  live: boolean;
  enabled: boolean;
  blocked: boolean;
  busy: boolean;
  revision: number;
  saved: number;
  wanted: number;
  timer?: ReturnType<typeof setTimeout>;
};
const fresh = (): Session => ({
  live: true,
  enabled: false,
  blocked: false,
  busy: false,
  revision: 0,
  saved: 0,
  wanted: 0,
});
export function useReadingProgress(versionId: string, initialPage?: number | null) {
  const [page, setPage] = useState(1),
    [ready, setReady] = useState(false);
  const [status, setStatus] = useState<Status>('loading'),
    [savedPage, setSavedPage] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [previousPage, setPreviousPage] = useState(0);
  const session = useRef<Session>(fresh());
  const linkedTargetApplied = useRef<string | null>(null);
  useEffect(() => {
    const current = fresh(),
      controller = new AbortController();
    session.current = current;
    void readProgress(versionId, controller.signal)
      .then((item) => {
        if (!current.live) return;
        if (item && item.versionId !== versionId) throw new Error('Invalid progress version');
        current.enabled = true;
        current.revision = item?.revision ?? 0;
        current.saved = item?.pageNumber ?? 0;
        // Reload after a conflict reconciles with the server, including after
        // recovery from an invalid link. Apply the link only on the first load.
        setPage(
          (linkedTargetApplied.current !== versionId ? initialPage : undefined) ??
            item?.pageNumber ??
            1,
        );
        linkedTargetApplied.current = versionId;
        setPreviousPage(current.saved);
        setSavedPage(current.saved);
        setStatus(item ? 'saved' : 'loaded');
        setReady(true);
      })
      .catch(() => {
        if (current.live) setStatus('load-error');
      });
    return () => {
      current.live = false;
      controller.abort();
      clearTimeout(current.timer);
    };
  }, [versionId, attempt, initialPage]);
  const flush = useCallback(async () => {
    const current = session.current;
    if (!current.live || !current.enabled || current.blocked || current.busy) return;
    current.busy = true;
    try {
      while (
        current.live &&
        current.enabled &&
        !current.blocked &&
        current.wanted > 0 &&
        current.wanted !== current.saved
      ) {
        const target = current.wanted;
        setStatus('saving');
        try {
          const item = await saveProgress(versionId, target, current.revision);
          if (!current.live) return;
          if (
            item.versionId !== versionId ||
            item.pageNumber !== target ||
            item.revision !== current.revision + 1
          )
            throw new Error('Invalid progress acknowledgement');
          current.saved = target;
          current.revision = item.revision;
          setSavedPage(target);
          setStatus('saved');
        } catch (e) {
          if (!current.live) return;
          current.blocked = true;
          setStatus(e instanceof ApiError && e.status === 409 ? 'conflict' : 'save-error');
        }
      }
    } finally {
      current.busy = false;
    }
  }, [versionId]);
  const reportRendered = useCallback(
    (renderedPage: number) => {
      const current = session.current;
      current.wanted = renderedPage;
      clearTimeout(current.timer);
      if (!current.enabled || current.blocked || current.busy) return;
      if (current.saved === renderedPage) {
        setStatus('saved');
        return;
      }
      setStatus('queued');
      current.timer = setTimeout(() => void flush(), 400);
    },
    [flush],
  );
  function retrySave() {
    session.current.blocked = false;
    void flush();
  }
  function reload() {
    setReady(false);
    setStatus('loading');
    setAttempt((n) => n + 1);
  }
  function skip() {
    session.current.enabled = false;
    linkedTargetApplied.current = versionId;
    setPage(1);
    setReady(true);
    setStatus('skipped');
  }
  const notice: Record<Status, string> = {
    loading: 'Đang tải tiến độ đọc…',
    loaded: 'Chưa có tiến độ; sẽ lưu sau khi trang hiển thị.',
    queued: 'Đang chờ lưu trang vừa đọc…',
    saving: 'Đang lưu tiến độ…',
    saved: `Đã lưu tiến độ · Trang ${savedPage}`,
    'save-error':
      'Chưa xác nhận được tiến độ. Thử lưu lại; nếu lần trước đã lưu, hệ thống sẽ yêu cầu tải lại thay vì ghi đè.',
    conflict:
      'Tiến độ đã thay đổi ở tab khác. Tải lại tiến độ để tiếp tục; chưa ghi đè dữ liệu trên máy chủ.',
    'load-error': 'Chưa tải được tiến độ. Thử lại hoặc đọc từ trang 1 mà không lưu tiến độ.',
    skipped: 'Đang đọc mà chưa lưu tiến độ. Tải lại tiến độ để bật lưu và tránh ghi đè trang cũ.',
  };
  return {
    page,
    previousPage,
    setPage,
    ready,
    status,
    notice: notice[status],
    reportRendered,
    retrySave,
    reload,
    skip,
  };
}
