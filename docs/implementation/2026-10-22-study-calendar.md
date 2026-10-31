# CAL-01 — Lịch học và việc cần làm riêng

Ngày 22/10/2026. Nhánh `codex/cal-01-personal-calendar`, xây trên `main` sau PR #26 (AUTH-03). Thiết kế, ý tưởng lấy từ Google Calendar/Notion Calendar và lộ trình CAL-02…05 ở [đặc tả](../superpowers/specs/2026-10-22-study-calendar.md).

## Cách làm đã chốt

Các quyết định mặc định ghi trong đặc tả: lịch riêng từng người (admin không xem), không đồng bộ lịch ngoài, lưu UTC và hiển thị theo giờ máy, tuần bắt đầu thứ Hai. Lượt triển khai chốt thêm:

- **Liên kết đã ẩn vẫn sửa được mục lịch.** Khi tài liệu mất quyền đọc, trình duyệt không nhận `versionId`. PATCH có thêm `keepSource: true` (gửi `versionId`/`pageNumber` là `null`) để giữ liên kết đang lưu mà không lộ id. Gửi `keepSource` kèm tài liệu mới → 400.
- **Gắn tài liệu chỉ từ reader.** Trang lịch chưa có ô chọn tài liệu; form sửa cho đổi số trang hoặc "Bỏ liên kết tài liệu".
- **Việc có hạn nằm ở dải "Cả ngày"** trong chế độ Tuần, kèm giờ hạn, thay vì một khối trên lưới giờ. Lưới giờ chỉ dành cho lịch học có giờ.
- **Việc thêm nhanh chưa có ngày**; mở việc để đặt hạn. Việc có ngày hạn nhưng không chọn giờ lấy 23:59.

## Hành vi

Trang **Lịch học** (`/workspace/calendar`, mục mới trong nhóm Học tập của cả ba vai trò):

- thanh công cụ: Hôm nay, ‹ ›, tiêu đề khoảng đang xem, Tuần / Tháng / Lịch biểu (`aria-pressed`), Thêm lịch học
- **Tuần:** cột thứ Hai–CN, dải "Cả ngày" (lịch cả ngày, việc cần làm), lưới 24 giờ cuộn sẵn tới 7:00, lịch trùng giờ chia cột, vạch giờ hiện tại, bấm ô trống tạo lịch học ở mốc 30 phút; lịch qua đêm cắt theo từng ngày
- **Tháng:** 6 tuần, tối đa 3 mục mỗi ô và nút "+N mục nữa" sang Lịch biểu; bấm số ngày sang tuần đó
- **Lịch biểu:** 30 ngày từ ngày đang chọn, nhóm theo ngày, có link "Mở <tài liệu> · trang N" hoặc "Tài liệu không còn khả dụng"
- **Panel Việc cần làm:** thêm nhanh, tick hoàn thành, nhãn "Quá hạn"; việc quá hạn và có hạn trước, việc chưa có ngày sau cùng
- **Form tạo/sửa** (inline, không phải hộp thoại): loại, tiêu đề, ngày/giờ hoặc cả ngày, 6 màu, ghi chú, tài liệu và trang; Esc để hủy; xóa có bước xác nhận. `requestId` cố định trong lúc form mở.
- **Reader:** nút **Lên lịch đọc** mở form ngày (mặc định ngày mai), giờ (19:00), thời lượng 30–120 phút; tạo lịch học màu xanh lá "Đọc: <tiêu đề>" gắn trang đang đọc, rồi hiện link "Xem lịch học".

Sau mỗi thao tác ghi, trang tải lại khoảng đang xem và danh sách việc; chưa có cập nhật lạc quan. Lịch không được cache trong service worker.

## API và schema

Hợp đồng ở đặc tả. Migration `202610220001_calendar_items` (SQL thuần), bảng `calendar_items`:

- 8 CHECK: loại, tiêu đề không rỗng, màu, miền `revision`, hình dạng EVENT (có giờ, kết thúc sau bắt đầu, ≤ 14 ngày), hình dạng TASK, chỉ TASK có `done_at`, tài liệu và trang đi cùng nhau
- `UNIQUE (user_id, request_id)`; FK người dùng CASCADE, FK phiên bản RESTRICT
- index chủ + thời gian, partial index việc chưa xong, index theo phiên bản

Test schema: 31 bảng, 65 FK, 98 CHECK, 11 partial index.

## Kiểm chứng

Máy local lượt này (Windows) **không có Node 24 và Docker** (Node trên PATH là 22.21.0, pnpm không cài, không có PostgreSQL/Redis đang chạy). Vì vậy:

Đã chạy, đạt (gọi trực tiếp binary trong `node_modules` bằng Node 22, bỏ qua kiểm tra `engines`):

- Prisma generate; typecheck API và web (`next typegen` + `tsc`); ESLint API, web và `tests/cal-01.spec.ts`; Prettier
- 107 unit test API (17 suite)
- `nest build` và `next build` (có route `/workspace/calendar`)

**Chưa chạy:**

- Integration (`materials.integration.spec.ts`: 4 ca CAL-01 mới; `schema.integration.spec.ts` với số đếm mới). Ca CAL-01 phủ: tạo idempotent, giao khoảng, riêng tư với người khác và admin, CSRF, giới hạn khoảng; kiểm DTO và CHECK; việc chưa có ngày, đặt hoàn thành không tăng revision, thứ tự quá hạn, xung đột revision; gắn tài liệu theo trang, ẩn tài liệu thì giấu tiêu đề, giữ liên kết khi sửa trường khác và qua `keepSource`.
- Browser `tests/cal-01.spec.ts`: lên lịch đọc từ reader → Lịch biểu có link đúng trang; thêm nhanh và tick việc; tạo, đổi tên, xóa lịch học trong chế độ Tuần; chế độ Tháng; không tràn ngang ở 1440/390/320px. `workspace-ui.spec.ts` nay đếm admin 11, giảng viên 8, sinh viên 6.
- Chưa xem giao diện trên trình duyệt thật.

Cần chạy `pnpm test:setup`, `pnpm test:integration` và `pnpm test:e2e` trên máy có Node 24.19 và Docker trước khi gộp.

## Chưa làm

- CAL-03…05 theo đặc tả: nhắc giờ học, hạn danh sách đọc và mục "Cần xem lại" trong lịch, xuất `.ics`. Lặp lại, kéo thả và phím tắt đã làm ở [CAL-02](2026-10-22-calendar-repeat-drag.md).
- Ô chọn tài liệu trong form lịch; danh sách việc đã xong trên giao diện (API có `status=done`).
- Hỏi trước khi rời trang hoặc mở mục khác khi form còn thay đổi chưa lưu: đã có ở [UX-02](2026-10-31-form-leave-guards.md).
- Sự kiện cả ngày lệch ngày nếu đổi múi giờ máy (giới hạn đã ghi trong đặc tả).
