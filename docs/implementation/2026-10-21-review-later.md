# LEARN-02 — Nhãn riêng "Cần xem lại"

Ngày 21/10/2026. Nhánh `codex/learn-02-review-later`, xây trên `main` sau PR #26; ngày 23/10 gộp lại với `main` sau CAL-03 (PR #34–#35), migration đổi tên để xếp sau các migration CAL. Đây là ý tưởng "Điều chưa hiểu" ở mục 6 của [roadmap](../roadmap/2026-10-17-web-improvement-roadmap.md); roadmap chưa đặt mã nên lượt này đặt LEARN-02.

## Hành vi

- Trong sổ ghi chú của reader (tab **Toàn tài liệu**), mỗi ghi chú trang hoặc đoạn tô có nút **Đánh dấu cần xem lại** / **Bỏ dấu cần xem lại**. Mục đã đánh dấu hiện chữ **Cần xem lại** cạnh số trang.
- Bộ lọc **Chỉ mục cần xem lại** kết hợp được với tìm chữ, loại và màu. Bỏ dấu một mục khi đang lọc thì mục vẫn ở chỗ cũ tới lần tìm tiếp theo, để focus không nhảy.
- Nhãn là **riêng tư** như ghi chú: chỉ chủ thấy và đổi được, không gửi giảng viên, admin cũng không đổi được. Tài liệu bị ẩn thì nhãn vẫn được giữ nhưng không đổi được (404), như các thao tác ghi chú khác.
- Nút giữ focus bàn phím trong lúc lưu (không `disabled`, dùng `aria-busy`). Lỗi mạng giữ nguyên trạng thái cũ và báo "Chưa lưu được dấu cần xem lại".

## API và schema

- Migration `202610230003_annotation_review_later`: cột `annotations.review_later boolean NOT NULL DEFAULT false` và partial index `ix_annotation_review_later (user_id, version_id, page_number, id) WHERE review_later`. Prisma khai báo cùng index bằng `where: raw(...)`; bài kiểm schema nay đếm 15 partial index (sau khi gộp với `main`).
- `PUT /library/versions/:id/annotations/:noteId/review-later`, body `{ "reviewLater": true|false }`:
  - **đặt** giá trị chứ không đảo, nên gửi lại an toàn
  - **không tăng `revision`**: đánh dấu từ sổ ghi chú không làm bản soạn đang mở bị xung đột
  - không thuộc người gọi, sai phiên bản hoặc mất quyền đọc → 404; thiếu CSRF → 403
- `POST …/annotations/search` nhận thêm `reviewLater: true`. Giá trị lọc nằm trong fingerprint của cursor, nên cursor của danh sách đã lọc không dùng được cho bộ lọc khác.
- Mọi phản hồi ghi chú/đoạn tô có thêm `reviewLater`. Web kiểm trường này trong type guard.

## Kiểm chứng

Sau khi gộp với `main` ngày 23/10 (CAL-01..03, AUTH-04, Next 16.4.1), chạy lại ở máy local: `pnpm check` (119 unit, build) đạt; `pnpm test:integration` 217 đạt, 1 bỏ qua; `pnpm test:e2e` 173 đạt, 8 bỏ qua. Các số bên dưới là của lần chạy đầu ngày 21/10.

Local (Windows, Node 24.19.0, pnpm 11.25.0), database `_test` và Redis DB 15:

- Integration, 1 ca mới trong `materials.integration.spec.ts`:
  - đánh dấu ghi chú và đoạn tô; `revision` giữ nguyên; gửi lại vẫn đúng; bản sửa dùng revision cũ vẫn lưu được
  - lọc `reviewLater` đúng thứ tự trang; kết hợp với `kind`; `reviewLater: false` như không lọc; cursor không dùng chéo bộ lọc
  - body sai kiểu → 400; người khác, admin, phiên bản khác → 404; thiếu CSRF → 403
  - tài liệu bị ẩn → 404; hiện lại thì nhãn còn nguyên
- Browser `tests/learn-02.spec.ts` (tài khoản riêng `review-later` để không chạm giới hạn đăng nhập của `reader-notebook`):
  - đánh dấu từ sổ ghi chú, focus ở lại nút; bộ lọc chỉ còn mục đã đánh dấu; 320px và 1440px không tràn ngang
  - bản soạn ở tab **Trang này** còn nguyên
  - lỗi mạng giữ trạng thái và báo lỗi; tải lại trang thì nhãn vẫn còn; bỏ dấu rồi tìm lại → 0 mục
- Bộ đầy đủ:
  - `pnpm format:check`, `pnpm check` (lint, typecheck, 107 unit, build): đạt.
  - `pnpm test:integration`: 205 passed, 1 skipped.
  - `pnpm test:e2e --workers=1`: 168 passed, 8 skipped (6,6 phút). Lượt đầy đủ có 1 ca không liên quan (`materials.spec.ts`, giảng viên rút yêu cầu duyệt) lỗi `net::ERR_NO_BUFFER_SPACE` khi mở `/login`, tức Windows hết bộ đệm socket, không phải lỗi so sánh kết quả. Chạy lại riêng ca đó: đạt.

## Chưa làm

- Chưa có nút đánh dấu ngay trong danh sách ghi chú của trang đang đọc; hiện chỉ đánh dấu được từ sổ ghi chú.
- Chưa lọc "cần xem lại" xuyên nhiều tài liệu; thuộc ý tưởng "Sổ tay theo môn" và "Buổi ôn tập" ở mục 6.
- File xuất Markdown/văn bản (EXPORT-01) chưa ghi nhãn này.
