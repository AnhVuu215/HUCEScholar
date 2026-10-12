'use client';
import { useEffect } from 'react';
export function useNotesLeaveGuard(dirty: boolean, busy: boolean) {
  useEffect(() => {
    if (!dirty && !busy) return;
    const leave = (event: BeforeUnloadEvent) => {
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
          link.pathname !== location.pathname &&
          !link.pathname.endsWith('/download'));
      if (!leaving) return;
      if (busy || !window.confirm('Bạn có ghi chú chưa lưu. Rời trang và bỏ thay đổi?')) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener('beforeunload', leave);
    document.addEventListener('click', navigate, true);
    return () => {
      window.removeEventListener('beforeunload', leave);
      document.removeEventListener('click', navigate, true);
    };
  }, [dirty, busy]);
}
