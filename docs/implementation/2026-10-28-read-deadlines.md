# CAL-04c — Hạn đọc đã đọc trên Lịch học

Ngày 28/10/2026. Nhánh `codex/cal-04c-read-deadlines`, xây trên `main` sau PR #56 (COURSE-02).

[COURSE-02](2026-10-28-reading-marks.md) ghi "chưa hiện tài liệu đã đọc khác đi trên Lịch học". Lượt này nối dấu "Đã đọc" với hạn đọc của [CAL-04b](2026-10-28-reading-list-deadlines.md).

Đã chốt theo lựa chọn khuyến nghị:

- **Vẫn hiện hạn đã đọc, chỉ đánh dấu xong.** Không ẩn: người đọc vẫn thấy lịch đọc của môn, và bỏ dấu thì hạn trở lại như cũ. Giống việc cần làm đã xong trên lịch.
- **Chỉ dùng dấu của chính người xem**, như COURSE-02. Đánh dấu ở trang Danh sách đọc; lịch chỉ hiển thị, không có ô đánh dấu.

## Hành vi

- Hạn của tài liệu đã đánh dấu có tên **"Hạn đọc: … · Đã đọc"** và bị gạch ngang, mờ hơn. Áp dụng cho tuần, tháng và lịch biểu.
- Hạn chưa đọc giữ nguyên như CAL-04b.

## API

- `GET /api/v1/calendar/reading-deadlines` thêm `read` cho mỗi mục: dấu COURSE-02 của người xem trên phiên bản đó. Không đổi schema.

## Kiểm chứng

Local (Windows, Node 24.19.0, pnpm 11.25.0), database `_test`:

- Integration, ca CAL-04b: mục có `read: false`; đánh dấu thì hạn đó `read: true`, hạn còn lại vẫn `false`; bỏ dấu thì trở lại.
- Browser, ca CAL-04b trong `tests/course-01.spec.ts`: đánh dấu ở trang Danh sách đọc (1/1), lịch biểu hiện "Hạn đọc: … · Đã đọc" gạch ngang, không còn tên chưa đọc.
- Bộ đầy đủ: `pnpm format:check` và `pnpm check` (lint, typecheck, 127 unit, build) đạt; `pnpm test:integration` 225 đạt, 1 bỏ qua; `pnpm test:e2e --workers=1` 187 đạt, 8 bỏ qua.

## Chưa làm

- Lọc ẩn hạn đã đọc và đánh dấu ngay trên lịch đã có ở [CAL-07](2026-10-31-calendar-complete.md).
