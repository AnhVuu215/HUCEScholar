import type { HighlightAnchor } from './highlights';
import { selectedAnchor, type HighlightSurface } from './highlight-geometry';

export interface ReaderSelection {
  versionId: string;
  pageNumber: number;
  anchor: HighlightAnchor;
  viewportRect: { left: number; top: number; right: number; bottom: number };
  surface: HighlightSurface;
}

export function captureReaderSelection(
  versionId: string,
  surface: HighlightSurface,
): { selection: ReaderSelection | null; reason: string } {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || !selection.rangeCount || !surface.layer.isConnected)
    return { selection: null, reason: '' };
  const range = selection.getRangeAt(0);
  if (!range.intersectsNode(surface.layer)) return { selection: null, reason: '' };
  if (
    selection.rangeCount !== 1 ||
    !surface.layer.contains(range.startContainer) ||
    !surface.layer.contains(range.endContainer)
  )
    return {
      selection: null,
      reason: 'Chỉ chọn văn bản trong một trang PDF để tô sáng hoặc ghi chú.',
    };
  if (selection.toString().trim().length > 2000)
    return {
      selection: null,
      reason: 'Đoạn chọn vượt quá 2000 ký tự. Hãy chọn một đoạn ngắn hơn.',
    };
  const anchor = selectedAnchor(surface);
  if (!anchor)
    return {
      selection: null,
      reason: 'Chưa xác định được vùng chọn. Hãy chọn lại một đoạn ngắn trong trang PDF.',
    };
  const rect = range.getBoundingClientRect();
  return {
    selection: {
      versionId,
      pageNumber: surface.page,
      anchor,
      viewportRect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom },
      surface,
    },
    reason: '',
  };
}
