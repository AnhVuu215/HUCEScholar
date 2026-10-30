# COURSE-02b — Danh sách đọc đang theo dõi ở trang đầu

Ngày 29/10/2026. Nhánh `codex/home-reading-progress`, xây trên `main` sau PR #57 (CAL-04c).

[COURSE-02](2026-10-28-reading-marks.md) ghi "chưa có tiến độ của mọi môn ở một chỗ": muốn biết đã đọc bao nhiêu thì phải chọn từng môn ở trang Danh sách đọc. Lượt này thêm mục **Danh sách đọc đang theo dõi** vào trang đầu.

Đã chốt theo lựa chọn khuyến nghị (đổi được ở API):

- **"Theo dõi" là lựa chọn sẵn có của CAL-04b** ("Hiện hạn đọc của môn này trên Lịch học"). Không thêm công tắc mới; môn nào đã bật thì hiện ở trang đầu.
- **Tiến độ tính theo môn, không theo từng danh sách.** Một môn có thể có danh sách của nhiều giảng viên; một phiên bản nằm ở nhiều danh sách chỉ tính một lần, đúng như dấu COURSE-02 gắn với phiên bản.
- **Hạn gần nhất chưa đọc kể cả hạn đã qua.** Hạn đã qua mà chưa đọc vẫn là việc còn tồn, nên hiện "Quá hạn" màu cảnh báo thay vì bỏ qua. Ngày "hôm nay" là ngày theo giờ máy người xem.
- **Chỉ tính tài liệu còn mở được**, như COURSE-02: tài liệu bị ẩn không vào tổng số, không làm hạn gần nhất và không lộ tên.
- Hiện cho mọi vai trò, ngay dưới "Học tiếp"; ai chưa theo dõi môn nào thì thấy hướng dẫn bật.

## Hành vi

- Mỗi môn đã theo dõi là một dòng: tên môn (liên kết tới Danh sách đọc của môn) và **"Đã đọc X/Y tài liệu"**, **"Đã đọc hết Y tài liệu"** hoặc **"Chưa có danh sách đọc đã công bố"**.
- Còn tài liệu chưa đọc có hạn thì thêm dòng **"Hạn gần nhất dd/mm/yyyy: tên tài liệu"** (liên kết mở tài liệu), hay **"Quá hạn …"** nếu ngày đã qua.
- Tải lỗi thì chỉ mục này báo lỗi và có nút **Tải lại tiến độ đọc**; các mục khác của trang đầu không bị ảnh hưởng.
- Môn ngừng hoạt động không hiện. Bỏ theo dõi thì môn biến khỏi trang đầu.

## API

- `GET /api/v1/reading-lists/following` (cần phiên đăng nhập) trả `{ items: [{ course: { id, code, name }, total, read, next: { dueOn, versionId, title } | null }] }`, xếp theo mã môn (từ COURSE-02c xếp theo hạn gần nhất, xem [COURSE-02c](2026-10-30-home-reading-actions.md)). Chỉ dùng dấu và lựa chọn theo dõi của chính người xem. Không đổi schema.

## Kiểm chứng

Local (Windows, Node 24.19.0, pnpm 11.25.0), database `_test`:

- Integration, ca mới: chưa theo dõi thì không có môn; theo dõi thì 0/3 và hạn sớm nhất; đánh dấu tài liệu đó thì "next" chuyển sang hạn kế; ẩn tài liệu thì bớt khỏi tổng và "next"; giảng viên không theo dõi thì không thấy; danh sách về nháp thì 0/0; môn ngừng hoạt động thì biến mất; chưa đăng nhập `401`.
- Browser, ca mới trong `tests/course-01.spec.ts` (tài khoản e2e riêng `course3`): lỗi mạng rồi tải lại trong mục; bật theo dõi thì thấy 0/2 và "Quá hạn"; đánh dấu thì 1/2 và "Hạn gần nhất"; đọc hết thì "Đã đọc hết 2 tài liệu"; bỏ theo dõi thì môn biến mất; 320/1440px không tràn ngang.
- Bộ đầy đủ: `pnpm format:check` và `pnpm check` (lint, typecheck, 127 unit, build) đạt; `pnpm test:integration` 226 đạt, 1 bỏ qua; `pnpm test:e2e --workers=1` 181 đạt, 8 bỏ qua, 3 lỗi ở `citations.spec.ts` (2) và `reader-direct-annotations.spec.ts` (1), không liên quan tới thay đổi này; chạy lại riêng hai file đó thì 14/14 đạt.
- Chưa thử trên điện thoại thật hay trình đọc màn hình.

## Chưa làm

- Đánh dấu đã đọc ngay ở trang đầu; sắp các môn theo hạn gần nhất thay vì mã môn. Đã làm ở [COURSE-02c](2026-10-30-home-reading-actions.md).
