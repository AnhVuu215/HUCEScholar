'use client';

import { useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { quadBounds } from '../../lib/highlight-geometry';
import type { ReaderSelection } from '../../lib/reader-selection';

export function ReaderSelectionToolbar({
  selection,
  disabled,
  onHighlight,
  onNote,
  onDismiss,
}: {
  selection: ReaderSelection;
  disabled: boolean;
  onHighlight: () => void;
  onNote: () => void;
  onDismiss: () => void;
}) {
  const toolbar = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const node = toolbar.current!;
    const { surface, anchor } = selection;
    function position() {
      if (!surface.element.isConnected) {
        node.style.visibility = 'hidden';
        return;
      }
      const bounds = anchor.quads.map((q) => quadBounds(q, surface.viewport));
      const page = surface.element.getBoundingClientRect();
      const sx = page.width / surface.viewport.width,
        sy = page.height / surface.viewport.height;
      const left = page.left + Math.min(...bounds.map((b) => b.left)) * sx;
      const right = page.left + Math.max(...bounds.map((b) => b.left + b.width)) * sx;
      const top = page.top + Math.min(...bounds.map((b) => b.top)) * sy;
      const bottom = page.top + Math.max(...bounds.map((b) => b.top + b.height)) * sy;
      const viewport = window.visualViewport;
      const vx = viewport?.offsetLeft ?? 0,
        vy = viewport?.offsetTop ?? 0;
      const width = viewport?.width ?? innerWidth,
        height = viewport?.height ?? innerHeight;
      const stage = surface.element.closest('.reader-stage')?.getBoundingClientRect();
      if (
        right < vx ||
        left > vx + width ||
        bottom < vy ||
        top > vy + height ||
        (stage &&
          (right < stage.left || left > stage.right || bottom < stage.top || top > stage.bottom))
      ) {
        node.style.visibility = 'hidden';
        return;
      }
      node.style.maxWidth = `${Math.max(0, width - 16)}px`;
      const box = node.getBoundingClientRect();
      node.style.left = `${Math.max(vx + 8, Math.min((left + right - box.width) / 2, vx + width - box.width - 8))}px`;
      node.style.top = `${Math.max(vy + 8, Math.min(top - box.height - 8 >= vy + 8 ? top - box.height - 8 : bottom + 8, vy + height - box.height - 8))}px`;
      node.style.visibility = 'visible';
    }
    position();
    const observer = new ResizeObserver(position);
    observer.observe(node);
    window.addEventListener('scroll', position, true);
    window.addEventListener('resize', position);
    window.visualViewport?.addEventListener('resize', position);
    window.visualViewport?.addEventListener('scroll', position);
    return () => {
      observer.disconnect();
      window.removeEventListener('scroll', position, true);
      window.removeEventListener('resize', position);
      window.visualViewport?.removeEventListener('resize', position);
      window.visualViewport?.removeEventListener('scroll', position);
    };
  }, [selection]);
  return createPortal(
    <div
      ref={toolbar}
      className="reader-selection-toolbar"
      role="toolbar"
      aria-label="Thao tác đoạn chọn"
      data-reader-selection-toolbar
      onMouseDown={(event) => event.preventDefault()}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          onDismiss();
          (selection.surface.element.closest('.reader-stage') as HTMLElement | null)?.focus();
        }
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
          event.preventDefault();
          const buttons = Array.from(
            toolbar.current!.querySelectorAll<HTMLButtonElement>('button'),
          );
          buttons[
            (buttons.indexOf(document.activeElement as HTMLButtonElement) + 1) % buttons.length
          ]?.focus();
        }
      }}
    >
      <button className="secondary-button" disabled={disabled} onClick={onHighlight}>
        Tô sáng
      </button>
      <button className="secondary-button" disabled={disabled} onClick={onNote}>
        Ghi chú đoạn chọn
      </button>
    </div>,
    document.body,
  );
}
