# COURSE-02 — Đánh dấu đã đọc trong danh sách đọc

Ngày 28/10/2026. Nhánh `codex/course-02-reading-progress`, xây trên `main` sau PR #55 (LEARN-03c).

[COURSE-01](2026-10-21-reading-lists.md) và [CAL-04b](2026-10-28-reading-list-deadlines.md) ghi "chưa đánh dấu đã đọc từng mục". Lượt này cho người đọc tự đánh dấu từng tài liệu trong danh sách đọc và thấy tiến độ của mỗi danh sách.

Đã chốt theo lựa chọn khuyến nghị (đổi được ở API):

- **Dấu gắn với phiên bản tài liệu, không với vị trí trong danh sách.** Giảng viên sắp lại hay sửa danh sách thì dấu vẫn đúng tài liệu. Một phiên bản nằm trong nhiều danh sách thì đánh dấu một lần là đủ.
- **Dấu riêng tư.** Chỉ người đánh dấu thấy; giảng viên không xem được ai đã đọc gì. Theo dõi lớp cần mô hình lớp/đăng ký môn, hiện chưa có.
- **Chỉ đánh dấu được tài liệu đang nằm trong danh sách đã công bố của môn và còn đọc được.** Tài liệu bị ẩn hay mất quyền thì hiện là chưa đọc và không đổi được dấu; hiện lại thì dấu cũ quay về. Mọi trường hợp không hợp lệ cùng trả `404`, không lộ lý do.
- **Tự đánh dấu, không tự suy ra từ việc mở PDF.** Mở tài liệu chưa có nghĩa là đã đọc xong.

## Hành vi

- Trang **Danh sách đọc**: mỗi tài liệu còn mở được có ô **Đã đọc**. Tên truy cập của ô là "Đã đọc: tên tài liệu".
- Dưới tiêu đề mỗi danh sách có dòng **"Đã đọc X/Y tài liệu"**, chỉ tính các tài liệu còn mở được.
- Ô đổi ngay khi bấm; lưu lỗi thì ô trở lại như cũ và có câu báo lỗi. Lưu xong có câu "Đã đánh dấu đã đọc: …" hoặc "Đã bỏ dấu đã đọc: …".
- Đánh dấu một phiên bản thì mọi danh sách của môn có phiên bản đó đổi theo.

## API và dữ liệu

- `PUT /api/v1/courses/:courseId/reading-lists/read/:versionId` (CSRF), body `{ "read": true | false }`, trả `{ versionId, read }`. Gọi lại cùng giá trị vẫn `200`.
  - `404` khi môn không hoạt động, phiên bản không nằm trong danh sách đã công bố (của giảng viên còn được phân công) của môn, hoặc người đọc không mở được phiên bản.
  - `400` khi id hay `read` sai kiểu; `403` khi thiếu CSRF.
- `GET …/reading-lists` (và `mine`, `PUT mine`) thêm `read` cho mỗi mục: dấu của chính người xem, luôn `false` khi `material` là `null`.
- Migration `202610280002_reading_marks`: bảng `reading_marks(user_id, version_id, read_at, PK(user_id, version_id))`, khóa ngoại `CASCADE` tới `users` và `document_versions`. Schema nay 35 bảng, 71 khóa ngoại.

## Kiểm chứng

Local (Windows, Node 24.19.0, pnpm 11.25.0), database `_test`:

- Integration, ca mới COURSE-02:
  - đánh dấu và gọi lại cùng giá trị đều `200`; người khác và giảng viên không thấy dấu
  - giảng viên đảo thứ tự thì dấu đi theo phiên bản
  - tài liệu ẩn hiện là chưa đọc và không đổi được (`404`); hiện lại thì dấu quay về
  - phiên bản ngoài danh sách, id không tồn tại, môn không tồn tại → `404`; id sai và `read` sai kiểu → `400`; thiếu CSRF → `403`
  - danh sách chuyển về nháp thì không đánh dấu được nữa.
- Ca reading list cũ có thêm `read: false` cho mục bị ẩn. Ca schema đếm 35 bảng, 71 khóa ngoại.
- Browser, ca mới trong `tests/course-01.spec.ts` (tài khoản e2e riêng `course2`):
  - đánh dấu thì tiến độ 0/2 → 1/2, tải lại trang vẫn giữ
  - lỗi mạng thì ô trở lại và có câu báo
  - bỏ dấu thì tiến độ giảm
  - giảng viên mở cùng danh sách thấy 0/2
  - 320/1440px không tràn ngang.
- Bộ đầy đủ: `pnpm format:check` và `pnpm check` (lint, typecheck, 127 unit, build) đạt; `pnpm test:integration` 225 đạt, 1 bỏ qua; `pnpm test:e2e --workers=1` 187 đạt, 8 bỏ qua.
- Chưa thử trên điện thoại thật hay trình đọc màn hình.

## Chưa làm

- Hiện tài liệu đã đọc khác đi trên Lịch học (hạn đọc của CAL-04b vẫn hiện như cũ).
- Nối với "Học tiếp" ở trang đầu; tiến độ của mọi môn ở một chỗ.
- Giảng viên xem tiến độ tổng hợp của lớp: cần mô hình lớp và đồng ý của người học.
