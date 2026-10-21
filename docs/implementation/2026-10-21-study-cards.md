# STUDY-01 — Thẻ ôn tập từ đoạn tô

Ngày 21/10/2026. Nhánh `codex/study-01-review-cards`, xây trên `main` sau PR #24 (COURSE-01). Ý tưởng lấy từ roadmap: "Tô một định nghĩa → tự viết câu hỏi → lật xem đáp án", làm bằng form thủ công, **không gọi AI**.

## Cách làm đã chốt

Theo cách các mục trước đã làm, lượt này chốt các điểm dưới đây; đổi được ở API:

- Thẻ chỉ tạo được **từ đoạn tô của chính mình** trên phiên bản đang đọc được. Thẻ giữ phiên bản, số trang và **bản sao đoạn chữ đã tô**. Nhờ vậy, nếu đoạn tô sau đó bị xóa, thẻ vẫn còn nguồn (`highlightId` chuyển `null`).
- Quyền theo đúng quy tắc ghi chú: chỉ chủ thẻ xem, sửa, xóa được, và chỉ khi còn đọc được phiên bản nguồn. Tài liệu bị ẩn hay không còn an toàn thì thẻ được **giữ nhưng không hiện và không sửa được**; trang thẻ chỉ báo số thẻ đang tạm ẩn. PDF cấm sao chép không có đoạn tô, nên cũng không có thẻ.
- Lượt này chưa có lịch ôn lặp lại (spaced repetition) hay chấm điểm. Chỉ có danh sách thẻ, lật xem đáp án, sửa và xóa.

## Hành vi

- Reader, tab "Đoạn tô": mỗi đoạn tô có nút **Tạo thẻ ôn tập**, mở form câu hỏi (≤ 500 ký tự) và đáp án (≤ 2000 ký tự). `requestId` cố định trong lúc form mở, nên bấm lại sau khi mất phản hồi không tạo thẻ trùng.
- Trang **Thẻ ôn tập** (`/workspace/study`, mục mới trong nhóm Học tập):
  - thẻ mới nhất trước, phân trang 20
  - nút "Hiện đáp án / Ẩn đáp án" (`aria-expanded`) hiện đáp án và đoạn trích
  - nguồn: tiêu đề và trang, link "Mở trang nguồn" tới `?page=N` của đúng phiên bản
  - sửa có kiểm `revision`; xóa có bước xác nhận và không động tới đoạn tô
- Mỗi thẻ là dữ liệu riêng, không vào audit (như ghi chú).

## API

Tất cả cần phiên đăng nhập; ghi qua CSRF.

- `POST /api/v1/library/versions/:id/study-cards` `{ annotationId, question, answer, requestId }` → 201
- `GET /api/v1/study-cards?page=&limit=(≤50)&versionId=` → `{ items, total, unavailable, page, limit }`
- `PATCH /api/v1/study-cards/:id` `{ question, answer, revision }`
- `DELETE /api/v1/study-cards/:id` `{ revision }` → 204
- Thẻ của người khác hoặc phiên bản không đọc được → 404; sửa bằng revision cũ → `409 STUDY_CARD_CONFLICT`; dùng lại `requestId` cho nội dung khác → `409 STUDY_CARD_REQUEST_REUSED`.

## Schema

Migration `202610210004_study_cards` (SQL thuần), bảng `study_cards`:

- CHECK: trang > 0, đoạn trích 1–2000 ký tự, câu hỏi và đáp án không rỗng, miền `revision`
- `UNIQUE (user_id, request_id)`
- FK phiên bản RESTRICT; FK đoạn tô `ON DELETE SET NULL`; FK người dùng CASCADE
- index theo chủ + thời gian, chủ + phiên bản, và theo đoạn tô

Test schema: 30 bảng, 63 FK, 90 CHECK.

## Kiểm chứng

Local (Windows, Node 24.19.0, pnpm 11.25.0), database `_test` và Redis DB 15:

- Integration, 1 ca mới:
  - tạo thẻ từ đoạn tô, đúng trang và đoạn trích
  - gửi lại cùng request trả cùng thẻ; dùng lại request cho nội dung khác → 409
  - người khác không tạo được từ đoạn tô không phải của mình, không thấy, không sửa được thẻ
  - sửa tăng revision; sửa bằng revision cũ → 409
  - xóa đoạn tô thì thẻ còn, `highlightId: null`, giữ đoạn trích
  - ẩn tài liệu: `total 0, unavailable 1`, xóa thẻ → 404; hiện lại thì xóa được
- Browser `tests/study-01.spec.ts`: tạo thẻ từ đoạn tô trong reader → trang thẻ ôn tập; đáp án ẩn cho tới khi bấm, có `aria-expanded`; link về đúng trang; sửa, xóa; 320px không tràn ngang.
- `workspace-ui.spec.ts`: số link điều hướng nay là admin 10, giảng viên 7, sinh viên 5.
- Bộ đầy đủ sau khi gộp `main` (PR #24):
  - `pnpm format:check`, `pnpm check` (lint, typecheck, 104 unit, build): đạt.
  - `pnpm test:integration`: lượt đầu có 1 ca không liên quan (màu đoạn tô) lỗi `connect ETIMEDOUT 127.0.0.1`, tức kết nối loopback, không phải lỗi so sánh kết quả. Chạy lại cả bộ: 201 passed, 1 skipped.
  - `pnpm test:e2e --workers=1`: 166 passed, 8 skipped (7,4 phút).

## Chưa làm

- Ôn theo lịch (spaced repetition), xáo thẻ, đánh dấu nhớ/chưa nhớ.
- Lọc thẻ theo tài liệu hay môn trên trang thẻ (API đã có `versionId`); xuất thẻ cùng EXPORT-01.
- Form tạo thẻ chưa được bảo vệ bởi bước hỏi trước khi rời trang như ghi chú; rời reader khi form đang mở thì nội dung form mất.
