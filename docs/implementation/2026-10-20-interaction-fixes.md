# UX-01 — Khép các lỗi thao tác nhỏ

Ngày 20/10/2026. Nhánh `codex/ux-01-interaction-fixes`, xây trên `main` sau PR #10. Phạm vi là UX-01 trong đợt B của [roadmap](../roadmap/2026-10-17-web-improvement-roadmap.md), lấy từ backlog ở [báo cáo 14/10](2026-10-14-project-status.md). Không đổi API, schema hoặc quyền.

## Thay đổi

- **Trả focus khi hủy xác nhận.** Hủy một xác nhận inline làm unmount nút đang focus, focus rơi về `body` (backlog P3 với **Bỏ lưu → Giữ tài liệu**). Hook `apps/web/lib/use-return-focus.ts` nhớ control đã mở xác nhận và trả focus về đó khi hủy, nếu control còn trong trang và không bị vô hiệu hóa. Áp cho chín xác nhận cùng mẫu: bỏ lưu tài liệu; xóa ghi chú trang; xóa vùng tô; tạo phiên bản kế tiếp và công bố/gửi duyệt; chuyển giao và đổi hiển thị trong vòng đời học liệu; quyết định kiểm duyệt và rời yêu cầu đang soạn.
- **Trang cuối bị trống** và **phản hồi trễ khi đổi tab** ở Thư viện của tôi: code đã xử lý (lùi trang, `AbortController`), báo cáo 14/10 ghi chỉ đọc code. Nay có assertion browser.
- **320px:** thêm kiểm tra không tràn ngang cho trang đầu, Thư viện của tôi và Cài đặt.

## Kiểm chứng

Local (Windows, Node 24.19.0, pnpm 11.25.0), database `_test` và Redis DB 15:

- `pnpm format:check`, `pnpm check` (lint, typecheck, 89 unit, build): đạt.
- `pnpm test:integration`: 183 passed, 1 skipped.
- `pnpm test:e2e --workers=1`: 153 passed, 1 skipped, 1 failed. Ca lỗi `materials.spec.ts:197` chờ PDF render quá 5 giây khi máy thiếu RAM; chạy lại đạt (10,9 giây). Tổng 154 passed, 1 skipped.
- Mới: `tests/ux-01.spec.ts` (4 ca): hủy bỏ lưu và hủy xóa ghi chú trả focus về nút đã mở; trang 2 trống lùi về trang 1, focus trạng thái, không kẹt; phản hồi trễ của tab Đã lưu không thay danh sách Đọc gần đây; ba trang không tràn ngang ở 320px.
- Kiểm chứng RED: dùng `save-material.tsx` của `main` thì ca focus lỗi (`Expected: focused, Received: inactive`); với bản sửa thì đạt.

## Còn lại

UPLOAD-01 và SEARCH-01 trong đợt B.
