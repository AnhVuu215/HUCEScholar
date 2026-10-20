# REPORT-01 — Báo cáo tài liệu và xử lý

Ngày 20/10/2026. Nhánh `codex/report-01-material-reports`, xây trên `main` sau PR #13. Phạm vi là REPORT-01 (đợt C) trong [roadmap](../roadmap/2026-10-17-web-improvement-roadmap.md), dùng bảng `reports`/`report_actions` có sẵn từ baseline. Không thêm migration.

## Quyết định của chủ dự án

- Admin xử lý ở **trang riêng** “Báo cáo tài liệu” trong nhóm Quản trị: sidebar admin từ 7 lên **8** mục. Trang đầu admin thêm “Báo cáo đang mở”.
- Khi đánh dấu đã xử lý, admin **có thể ẩn tài liệu** ngay trong luồng báo cáo.
- Người báo cáo **xem trạng thái và phản hồi trong reader** của phiên bản đó.

## Hành vi

- `POST /library/versions/{id}/reports` `{ category, description }`: mọi vai trò có quyền đọc phiên bản (bản hiện hành đã duyệt, file an toàn, tài liệu hiển thị, còn quyền). Bản nháp/ẩn → 404. Một người chỉ có một báo cáo đang mở cho mỗi phiên bản + loại (`DUPLICATE_REPORT` 409; advisory lock theo người + phiên bản nên gửi đôi đồng thời chỉ tạo một). Chỉ nhận đúng hai trường; không đính ghi chú, highlight hay nội dung riêng. Không đổi visibility.
- `GET /library/versions/{id}/reports/mine`: chỉ báo cáo của chính người gọi, kèm kết quả xử lý gần nhất.
- Admin: `GET /admin/reports?status&search&page&limit` (cũ nhất trước, tìm theo tiêu đề), `GET /admin/reports/{id}` (chi tiết, lịch sử, trạng thái tài liệu), `POST /admin/reports/{id}/actions` `{ action, revision, result?, hide?, documentRevision?, hideReason? }`.
  - `TAKE_REVIEW`: OPEN → IN_REVIEW, kết quả chuẩn “Quản trị viên đang xem xét báo cáo.”
  - `RESOLVE` / `DISMISS`: OPEN|IN_REVIEW → RESOLVED|DISMISSED, bắt buộc `result` hiển thị cho người báo cáo.
  - `hide` chỉ với `RESOLVE`: `LifecycleService.hideWithin` dùng chung khóa advisory, khóa tài liệu và CAS `documentRevision` với luồng ẩn ở Quản lý học liệu, ghi `visibility_events` + audit `MATERIAL_HIDDEN`; `report_actions.visibility_event_id` liên kết quyết định ẩn. Lỗi ẩn (sai revision) rollback cả hành động báo cáo.
  - CAS `revision` của báo cáo (409 `STALE_REVISION`), báo cáo đã đóng 409 `REPORT_CLOSED`, admin không còn hoạt động 403. Audit `REPORT_CREATED` / `REPORT_<ACTION>` với `entity_type='REPORT'`.
- `LifecycleService.visibility` tách phần ghi thay đổi thành `applyVisibility` để hai luồng dùng chung; hành vi cũ không đổi.
- `REQUEST_INFO` trong schema chưa dùng vì chưa có kênh trao đổi với người báo cáo. Báo cáo sách (`book_id`) chưa có UI.

## Kiểm chứng

Local (Windows, Node 24.19.0, pnpm 11.25.0), database `_test` và Redis DB 15:

- `pnpm format:check`, `pnpm check` (lint, typecheck, 91 unit, build): đạt.
- `pnpm test:integration`: 186 passed, 1 skipped. Hai ca mới: gửi đôi đồng thời → 201 + 409 `DUPLICATE_REPORT`; khác loại hoặc người khác vẫn gửi được; trường thừa (`status`, `noteId`), loại sai, mô tả rỗng/quá dài → 400; thiếu CSRF 403, ẩn danh 401; bản nháp và tài liệu ẩn → 404; `mine` không lộ báo cáo người khác; sinh viên gọi API admin → 403. Admin: CAS 409, TAKE_REVIEW → IN_REVIEW và người báo cáo thấy kết quả; RESOLVE thiếu kết quả 400; DISMISS kèm hide 400; ẩn với `documentRevision` sai → 409 và báo cáo giữ IN_REVIEW (rollback); RESOLVE + hide → tài liệu HIDDEN, lịch sử có lý do ẩn, reader 404; báo cáo đã đóng → 409.
- `pnpm test:e2e --workers=1`: 158 passed, 1 skipped. Mới `tests/reports.spec.ts` qua UI thật: gửi trống báo lỗi và focus thông báo; hủy trả focus về nút mở; gửi, gửi trùng, gửi loại khác; báo cáo không ẩn tài liệu; admin tìm theo tiêu đề, không cần xử lý → người đọc thấy phản hồi trong reader; nhận xem xét → thiếu lý do ẩn báo lỗi → xử lý và ẩn → lịch sử ghi lý do, tài liệu 404 với người đọc; trang admin không tràn ngang ở 320px. `workspace-ui.spec.ts` cập nhật sidebar admin 8 mục.
- Lỗi bắt được trong lúc làm: nút mở form báo cáo bị unmount khi form mở nên hook trả focus giữ phần tử đã rời DOM; chuyển sang ref của nút hiện tại.

## Còn lại

- Người báo cáo không xem được phản hồi khi tài liệu đã bị ẩn (reader 404); API `mine` vẫn trả kết quả. Cần trang “Báo cáo của tôi” nếu muốn hiển thị ngoài reader.
- Chưa có thông báo trong ứng dụng (NOTIFY-01) khi báo cáo được xử lý.
- OPS-01 và QA-01 tiếp theo trong đợt C.
