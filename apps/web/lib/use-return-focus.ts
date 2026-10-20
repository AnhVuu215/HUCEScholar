import { useMemo, useRef } from 'react';

/**
 * Inline confirmations unmount the cancel button that has focus. Remember the control that
 * opened the confirmation and return focus to it on cancel, so keyboard users keep their place.
 */
export function useReturnFocus() {
  const origin = useRef<HTMLElement | null>(null);
  return useMemo(
    () => ({
      remember() {
        origin.current =
          document.activeElement instanceof HTMLElement ? document.activeElement : null;
      },
      restore() {
        const target = origin.current;
        origin.current = null;
        requestAnimationFrame(() => {
          if (target?.isConnected && !target.matches(':disabled')) target.focus();
        });
      },
    }),
    [],
  );
}
