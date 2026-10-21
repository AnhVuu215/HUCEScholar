# EXPORT-01 — Xuất ghi chú cá nhân

Ngày 21/10/2026. Nhánh `codex/export-01-personal-notes`, xây trên `main` sau PR #21 (NOTIFY-01).

## Hai điểm roadmap để mở, đã chốt

- **Trích dẫn:** có xuất đoạn chữ đã tô. Đó là chữ người dùng đã thấy trên trang và tự chọn. PDF cấm sao chép ([UPLOAD-03](2026-10-21-file-check-reasons.md)) không tạo được đoạn tô, nên không có trích dẫn từ những file này.
- **Tài liệu mất quyền:** không xuất được. API kiểm quyền đọc phiên bản hiện tại giống reader. Tài liệu bị ẩn, file không còn an toàn, hay người dùng mất quyền → 404/403. Ghi chú vẫn được giữ trong DB như trước, và xuất lại được khi có lại quyền.

Nếu chủ dự án muốn khác (ví dụ cho xuất ghi chú của tài liệu đã bị ẩn), cần đổi chính sách ở API, không chỉ ở giao diện.

## Hành vi

- Reader, panel "Toàn tài liệu", nhóm "Tải ghi chú của bạn" có hai nút: **Markdown (.md)** và **Văn bản (.txt)**.
- Nội dung file:
  - đầu file: tiêu đề, tác giả, số phiên bản, giờ xuất (giờ Việt Nam), câu "chỉ gồm ghi chú riêng, không kèm PDF"
  - các trang theo thứ tự; trong mỗi trang, mục theo thứ tự tạo
  - ghi chú trang và đoạn tô (màu, trích dẫn, ghi chú kèm)
  - không có PDF, tọa độ vùng tô, mã định danh hay ghi chú của người khác
- Markdown thoát cú pháp: `\ ` * _ [ ] < > # ! | ~ & ( )`, ký tự đầu dòng tạo danh sách/tiêu đề (`- + =`, `1.`), và URL trần (`://`, `www.`). Vì vậy ghi chú không thành link, ảnh, HTML, danh sách hay tiêu đề khi mở bằng trình xem Markdown. Dấu câu thường (`. , :`) giữ nguyên cho dễ đọc. Xuống dòng của người dùng giữ bằng hard break `\`. Bản `.txt` không thoát gì, chỉ bỏ ký tự điều khiển.
- Giới hạn 5.000 mục mỗi lần xuất; quá thì trả `400 EXPORT_TOO_LARGE`.
- Web tải file qua `fetch` rồi giao blob cho trình duyệt. Lỗi quyền hay mạng hiện thành câu trong panel, không lưu trang lỗi thành file.

## API

`GET /api/v1/library/versions/:id/annotations/export?format=markdown|text`

- Cần phiên đăng nhập; chỉ đọc ghi chú của người dùng phiên.
- `Content-Type: text/markdown` hoặc `text/plain` (`charset=utf-8`), `X-Content-Type-Options: nosniff`.
- `Content-Disposition: attachment; filename="ghi-chu-phien-ban-<id>.md|txt"`: tên ASCII, tiêu đề chỉ nằm trong file.
- `Cache-Control: no-store` (mặc định toàn API).
- Không đổi schema.

## Kiểm chứng

Local (Windows, Node 24.19.0, pnpm 11.25.0), database `_test` và Redis DB 15:

- Unit `annotation-export.spec.ts` (3 ca):
  - thoát link, ảnh, HTML, code, nhấn mạnh, tiêu đề, đầu dòng danh sách, URL trần; bỏ ký tự điều khiển; dấu câu thường giữ nguyên
  - thứ tự trang, trích dẫn trong blockquote, hard break
  - bản text không thoát; file rỗng có câu "chưa có ghi chú"
- Integration (`materials.integration.spec.ts`):
  - chỉ có ghi chú của chủ, đúng thứ tự trang
  - header loại file, tên file, `no-store`
  - Markdown đã thoát, bản text giữ nguyên
  - `format=pdf` → 400
  - tài liệu bị ẩn → 404
- Browser `reader-notebook.spec.ts`: tải `.md` (đúng tên file; có trang, ghi chú, trích dẫn đã thoát) và `.txt`; API trả 404 thì hiện câu "không còn khả dụng".
- Bộ đầy đủ sau khi gộp `main` (PR #21):
  - `pnpm format:check`, `pnpm check` (lint, typecheck, 104 unit, build): đạt.
  - `pnpm test:integration`: 199 passed, 1 skipped.
  - `pnpm test:e2e --workers=1`: 164 passed, 6 skipped (7,7 phút).
- Chưa thử mở file trên điện thoại hay bằng các trình xem Markdown khác nhau.

## Chưa làm

- Xuất nhiều tài liệu một lần, theo môn, hoặc ra PDF/DOCX.
- Chọn chỉ xuất ghi chú hoặc chỉ đoạn tô; ghi lịch sử xuất vào audit.
