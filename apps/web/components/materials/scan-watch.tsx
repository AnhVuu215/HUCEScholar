'use client';
import { useEffect, useRef, useState } from 'react';
import { ApiError } from '../../lib/auth';
import { currentDraft, materialError, type MaterialDraft } from '../../lib/materials';

export type StopReason = 'manual' | 'timeout' | 'offline' | 'denied';
const firstDelay = 2000,
  maxDelay = 15_000,
  watchBudget = 180_000,
  maxFailures = 3;

/**
 * Watches a draft while its file is being checked or converted. Polls with backoff only while
 * the tab is visible, stops after three minutes of visible waiting, and tells connection
 * problems apart from file results. Updates go through `changed`, which must not overwrite the
 * form being edited.
 */
export function useScanWatch(
  current: MaterialDraft,
  waiting: boolean,
  changed: (item: MaterialDraft) => void,
) {
  const [stopped, setStopped] = useState<StopReason | null>(null),
    [failures, setFailures] = useState(0),
    [checkedAt, setCheckedAt] = useState<Date | null>(null),
    [error, setError] = useState('');
  const callback = useRef(changed);
  useEffect(() => {
    callback.current = changed;
  }, [changed]);
  useEffect(() => {
    if (!waiting || stopped) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let delay = firstDelay,
      watched = 0,
      failed = 0,
      running = false;
    const controller = new AbortController();
    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = undefined;
      // A hidden tab neither sends requests nor spends the watch budget.
      if (controller.signal.aborted || document.visibilityState !== 'visible') return;
      timer = setTimeout(() => {
        timer = undefined;
        watched += delay;
        delay = Math.min(delay * 1.5, maxDelay);
        void poll();
      }, delay);
    };
    const poll = async () => {
      if (controller.signal.aborted) return;
      if (watched >= watchBudget) return setStopped('timeout');
      running = true;
      try {
        const item = await currentDraft(current.id, controller.signal);
        if (controller.signal.aborted) return;
        failed = 0;
        setFailures(0);
        setCheckedAt(new Date());
        if (item.versionId === current.versionId) callback.current(item);
      } catch (failure) {
        if (controller.signal.aborted) return;
        // Session or access problems will not fix themselves; stop and say why.
        if (failure instanceof ApiError && [401, 403, 404].includes(failure.status)) {
          setError(materialError(failure));
          return setStopped('denied');
        }
        failed += 1;
        setFailures(failed);
        if (failed >= maxFailures) return setStopped('offline');
      } finally {
        running = false;
      }
      schedule();
    };
    const visible = () => {
      if (document.visibilityState !== 'visible') {
        if (timer) clearTimeout(timer);
        timer = undefined;
      } else if (!timer && !running) {
        delay = firstDelay;
        void poll();
      }
    };
    document.addEventListener('visibilitychange', visible);
    schedule();
    return () => {
      controller.abort();
      document.removeEventListener('visibilitychange', visible);
      if (timer) clearTimeout(timer);
    };
  }, [current.id, current.versionId, current.source?.id, waiting, stopped]);
  return {
    stopped,
    failures,
    checkedAt,
    error,
    stop: () => setStopped('manual'),
    /** A manual refresh succeeded: resume automatic watching if still waiting. */
    refreshed: () => {
      setStopped(null);
      setFailures(0);
      setError('');
      setCheckedAt(new Date());
    },
  };
}

function waitingMessage(stopped: StopReason | null, failures: number) {
  if (stopped === 'manual') return 'Đã dừng chờ tự động; bấm cập nhật để kiểm tra.';
  if (stopped === 'timeout')
    return 'Sau ba phút file vẫn đang được xử lý. Bấm cập nhật trạng thái để xem kết quả.';
  if (stopped === 'offline')
    return 'Mất kết nối khi chờ kết quả. Đây không phải lỗi của file; bấm cập nhật trạng thái khi có mạng.';
  if (stopped === 'denied') return 'Đã dừng chờ tự động.';
  if (failures)
    return 'Chưa kết nối được để cập nhật trạng thái; đang thử lại. File đã lưu không bị ảnh hưởng.';
  return 'Trạng thái tự cập nhật trong ba phút khi trang đang mở; tạm dừng khi bạn chuyển tab.';
}

export function ScanWatchHint({ watch }: { watch: ReturnType<typeof useScanWatch> }) {
  return (
    <>
      <p className="field-hint scan-watch" role="status">
        File đã lưu riêng tư, chưa công bố; không cần tải lên lại.{' '}
        {waitingMessage(watch.stopped, watch.failures)}
        {watch.checkedAt &&
          ` Kiểm tra lần cuối lúc ${watch.checkedAt.toLocaleTimeString('vi-VN')}.`}
      </p>
      {watch.error && (
        <p role="alert" className="form-error">
          {watch.error}
        </p>
      )}
    </>
  );
}
