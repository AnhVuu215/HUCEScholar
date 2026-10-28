# EXPORT-02 — Xuất cả sổ tay theo bộ lọc

Ngày 28/10/2026. Nhánh `codex/export-02-notebook-export`, xây trên `main` sau PR #52 (CAL-04b).

[Mốc LEARN-03](2026-10-26-library-notebook.md) ghi "chưa xuất cả sổ tay". [EXPORT-01](2026-10-21-notes-export.md) chỉ xuất theo từng phiên bản trong reader. Lượt này cho trang **Sổ tay** tải một file gồm mọi mục khớp bộ lọc.

Đã chốt theo lựa chọn khuyến nghị (đổi được ở API):

- **Xuất đúng lượt tìm gần nhất**, không phải ô đang gõ dở. Bộ lọc gồm chữ, loại, màu, cần xem lại và môn, giống hệt lượt tìm. Lượt tìm chỉ tải 20 mục mỗi lần, còn file thì gồm **mọi** mục khớp.
- **Cùng chính sách quyền như sổ tay và EXPORT-01**: chỉ ghi chú của chính mình, chỉ tài liệu còn đọc được. Tài liệu bị ẩn hay mất quyền bị bỏ khỏi file, không lộ tiêu đề; hiện lại thì xuất lại được.
- **POST, không GET**: bộ lọc (có thể chứa chữ người dùng tìm) đi trong body như lượt tìm, không nằm trong URL hay log.
- Giới hạn 5.000 mục như EXPORT-01; quá thì `400 EXPORT_TOO_LARGE`.

## Hành vi

- Trang Sổ tay có nhóm **"Tải sổ tay theo bộ lọc đang xem"** với hai nút: **Markdown (.md)** và **Văn bản (.txt)**.
- Nội dung file:
  - đầu file: "Sổ tay ghi chú", giờ xuất (giờ Việt Nam), dòng "Bộ lọc: …" bằng chữ (ví dụ "môn X · chỉ đoạn tô · màu vàng · cần xem lại · có chữ “…”", hoặc "không lọc"), câu "không kèm file PDF"
  - mỗi tài liệu một phần (tiêu đề, phiên bản, tác giả), tài liệu mới nhất trước như trên trang; trong mỗi tài liệu theo trang
  - mục ghi chú và đoạn tô viết như EXPORT-01; Markdown thoát cú pháp theo cùng hàm
- Lỗi thành câu trong nhóm nút: quá nhiều mục → "Sổ tay có quá nhiều mục để xuất một lần. Thu hẹp bộ lọc rồi thử lại."; lỗi mạng hay quyền như EXPORT-01.
- Nút xuất của reader và của Sổ tay nay dùng chung một component (`NotesExport` trong `notebook-parts.tsx`); hành vi reader không đổi.

## API

`POST /api/v1/personal-library/notebook/export` (CSRF), body là bộ lọc của `notebook/search` cộng `format: "markdown" | "text"` (mặc định `markdown`). `cursor`/`limit` nếu có thì bị bỏ qua.

- `200`, `Content-Type: text/markdown` hoặc `text/plain` (`charset=utf-8`), `X-Content-Type-Options: nosniff`, `Cache-Control: no-store`.
- `Content-Disposition: attachment; filename="so-tay-ghi-chu.md|txt"`.
- Bộ lọc sai (như `kind=PAGE_NOTE` cùng `color`), field lạ, `format` khác → 400. Không phiên hoặc thiếu CSRF → 403.
- Không đổi schema.

## Kiểm chứng

Local (Windows, Node 24.19.0, pnpm 11.25.0), database `_test` và Redis DB 15:

- Unit `annotation-export.spec.ts`, 1 ca mới: mỗi tài liệu một phần đúng thứ tự, dòng bộ lọc đã thoát Markdown, trang theo thứ tự, bản text không thoát, sổ rỗng có câu "chưa có ghi chú".
- Integration, thêm vào ca LEARN-03: header, tên file, `no-store`; tài liệu mới trước, trang theo thứ tự; ký tự `_` được thoát; tài liệu ẩn và mục không khớp không có trong file; lọc loại/cần xem lại/môn ra đúng dòng "Bộ lọc"; người khác nhận file rỗng; body sai → 400; thiếu CSRF → 403; hiện lại tài liệu thì mục quay lại file.
- Browser, ca mới trong `tests/learn-03.spec.ts`: tải `.md` (đúng tên, đúng dòng bộ lọc của lượt tìm chứ không phải chữ gõ sau, tài liệu mới trước, link đã thoát) và `.txt`; lỗi `EXPORT_TOO_LARGE` thành câu; 320/1440px không tràn ngang. `reader-notebook.spec.ts` (nút xuất của reader dùng chung component) chạy lại đạt.
- Bộ đầy đủ: `pnpm format:check` và `pnpm check` (lint, typecheck, 127 unit, build) đạt; `pnpm test:integration` 223 đạt, 1 bỏ qua; `pnpm test:e2e --workers=1`: xem PR.
- Chưa thử mở file trên điện thoại hay bằng các trình xem Markdown khác nhau.

## Chưa làm

- Xuất ra PDF/DOCX; chọn gộp theo môn thay vì theo tài liệu.
- Tìm không dấu trong Sổ tay. Sửa/xóa ngay trên Sổ tay đã có ở [LEARN-03b](2026-10-28-notebook-edit.md).
