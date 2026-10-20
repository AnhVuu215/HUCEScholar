'use client';
import { useEffect, useEffectEvent } from 'react';
import { registerHistoryLeaveGuard } from '../../lib/history-leave-guard';
type DraftState = { dirty: boolean; busy: boolean; message?: string };
const drafts = new Set<() => DraftState>();
function guarded() {
  return [...drafts].map((read) => read());
}
function canLeave() {
  const states = guarded();
  if (states.some((state) => state.busy)) return false;
  return (
    !states.some((state) => state.dirty) ||
    window.confirm(
      states.find((state) => state.dirty)?.message ??
        'Bạn có ghi chú chưa lưu. Rời trang và bỏ thay đổi?',
    )
  );
}
let detach: (() => void) | undefined;
function attach() {
  const unregisterHistory = registerHistoryLeaveGuard(canLeave);
  const leave = (event: BeforeUnloadEvent) => {
    if (!guarded().some((state) => state.dirty || state.busy)) return;
    event.preventDefault();
    event.returnValue = '';
  };
  const navigate = (event: MouseEvent) => {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.altKey ||
      event.shiftKey ||
      !(event.target instanceof Element)
    )
      return;
    const link = event.target.closest<HTMLAnchorElement>('a[href]');
    const logout = event.target.closest('button[data-workspace-logout]');
    const leaving =
      logout ||
      (link &&
        link.target !== '_blank' &&
        !link.hasAttribute('download') &&
        link.origin === location.origin &&
        (link.pathname !== location.pathname || link.search !== location.search) &&
        !link.pathname.endsWith('/download'));
    if (leaving && !canLeave()) {
      event.preventDefault();
      event.stopPropagation();
    }
  };
  window.addEventListener('beforeunload', leave);
  document.addEventListener('click', navigate, true);
  return () => {
    unregisterHistory();
    window.removeEventListener('beforeunload', leave);
    document.removeEventListener('click', navigate, true);
  };
}
export function useNotesLeaveGuard(dirty: boolean, busy: boolean, message?: string) {
  const state = useEffectEvent(() => ({ dirty, busy, message }));
  useEffect(() => {
    if (!dirty && !busy) return;
    const read = () => state();
    drafts.add(read);
    if (drafts.size === 1) detach = attach();
    return () => {
      drafts.delete(read);
      if (!drafts.size) {
        detach?.();
        detach = undefined;
      }
    };
  }, [dirty, busy]);
}
