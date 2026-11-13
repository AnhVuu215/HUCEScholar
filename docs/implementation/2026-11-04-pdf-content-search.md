# SEARCH-04 — Tìm trong nội dung PDF

Ngày 04/11/2026. Nhánh `codex/pdf-content-search`, xây trên `main` `da387b8` (sau PR #75). Kho học liệu mới tìm được theo tiêu đề và tác giả. Mốc này tìm cả chữ trong PDF, chỉ ra trang chứa từ khóa và mở thẳng trang đó.

## Đã chốt

Theo lựa chọn khuyến nghị, đổi được ở API:

- **Chỉ lập chỉ mục tài liệu đã duyệt.** Chữ của bản nháp không vào chỉ mục. Tìm kiếm chỉ trả phiên bản hiện hành người đó đọc được.
- **Không lập chỉ mục PDF khóa quyền sao chép.** Chủ tài liệu không cho lấy chữ, và các PDF này vốn đã tắt tô, trích dẫn.
- **PDF scan không tìm được**, vì không có lớp chữ và OCR nằm ngoài MVP.
- **Mọi từ phải ở cùng một trang**, để kết quả chỉ được đúng trang. Từ nằm rải ở hai trang thì không khớp.
- **Khớp tiêu đề, tác giả vẫn đứng trước;** khớp nội dung xếp sau: có nguyên cụm trước, rồi nhiều trang khớp hơn, rồi mới cập nhật.
- **Chỉ kết quả khớp riêng nội dung mới hiện đoạn trích.** Tài liệu đã khớp tiêu đề thì không cần.
- **Dùng `pg_trgm`**, extension thuộc nhóm trusted của PostgreSQL. Chữ không tách từ theo ngôn ngữ, nên "thep" cũng khớp trong "thepx", giống cách tìm tiêu đề hiện có.
- **Giới hạn:** tối đa 8 MiB chữ mỗi PDF, 20.000 ký tự mỗi trang. Vượt thì giữ các trang đọc được và ghi `truncated`.

## Hành vi

- Tìm ở Kho học liệu như cũ. Kết quả khớp nội dung ghi "Trang N (và k trang khác): …đoạn trích…", từ khóa được tô.
- Nút của kết quả đó đổi thành **Mở trang N**. Reader mở đúng trang, mở sẵn ô tìm chữ, đã chạy tìm và chọn kết quả trên trang đó.
- Link truyền **đoạn chữ gốc đã khớp**, không truyền từ người dùng gõ, vì tìm chữ trong reader phân biệt dấu: "be tong" sẽ không thấy "Bê tông".
- PDF mới được duyệt có mặt trong kết quả sau khoảng một phút. Tiêu đề và tác giả vẫn tìm được ngay.

## Thiết kế

- **Một đường lập chỉ mục cho mọi file.** Worker quét mỗi phút, tìm file đã duyệt chưa có chữ. PDF mới, bản PDF chuyển từ Word và PDF có từ trước đều đi qua đường này, nên không cần lệnh backfill riêng. Sau migration, worker tự lập chỉ mục dần các file cũ.
- **Không đụng bước quét an toàn.** Lỗi trích chữ không ảnh hưởng trạng thái file. Mỗi file thử tối đa 3 lần rồi dừng.
- **Bảng phụ `file_text`, `file_pages`,** vì `tr_protect_file` bảo vệ `files`, và chữ là dữ liệu suy ra, dựng lại được từ file gốc. Xóa `file_text` của một file thì worker tự lập chỉ mục lại.
- **Đoạn trích là chữ thuần** (`before`, `match`, `after`), web tự dựng `<mark>`, nên chữ trong PDF không thể chèn HTML.
- Migration `202611040002_pdf_page_text` tạo hai bảng, extension `pg_trgm` và chỉ mục GIN `ix_file_page_folded`.
- `GET /api/v1/library?search=` thêm `contentMatch: { page, pages, before, match, after }` trên mỗi mục, `null` nếu không phải khớp nội dung. Quyền đọc, bộ lọc, phân trang không đổi.

## Lưu ý khi triển khai

- Role chạy migration cần quyền `CREATE` trên database để tạo `pg_trgm`.
- Phải build lại image worker, nếu không chữ sẽ không được lập chỉ mục.
- Chữ PDF giờ nằm trong database, nên bản backup database cũng chứa nội dung tài liệu đã duyệt.

## Đo

Chỉ đo phần lọc trang, trên 20.000 trang giả (38 MB chữ, chỉ mục 45 MB), PostgreSQL 18 trong Docker, trong transaction rồi rollback. Chưa đo cả truy vấn gồm phần gộp kết quả, chưa đo với kho thật.

| Truy vấn | Có chỉ mục | Quét toàn bộ |
| --- | --- | --- |
| Một từ hiếm | 6,7 ms | 138 ms |
| Từ không tồn tại | 0,17 ms | chưa đo |
| Hai từ có ở gần như mọi trang | 106 ms | 91 ms |
| Bốn từ có ở gần như mọi trang | 165 ms | chưa đo |
| Từ hai chữ cái | 50 ms (quét toàn bộ) | 50 ms |

Chỉ mục có ích với từ hiếm, không có ích với từ quá phổ biến.

## Kiểm chứng

Local (Windows, Node 24.19.0, pnpm 11.25.0), database `_test` sau `pnpm test:setup`, Chrome do Playwright điều khiển:

- **Unit `pdf-text.spec.ts`:** đánh số trang theo form feed và giữ chỗ trang trống; ghép dòng; bỏ NUL và ký tự điều khiển; giới hạn độ dài; đoạn trích giữ đúng chữ gốc có dấu kể cả dạng tách dấu và `đ`. Hai ca dùng công cụ giả chỉ chạy trên Linux, nên chạy ở CI.
- **Integration SEARCH-04, 3 ca:**
  - Tìm không dấu ra đúng trang và đoạn trích; từ ở khác trang không khớp; `%` là ký tự thường; bộ lọc và phân trang đúng; tiêu đề xếp trước.
  - Tài liệu bị ẩn không lộ với ai, kể cả admin; chữ bản nháp không lộ, kể cả với chủ.
  - Worker lập chỉ mục một lần; bỏ qua bản nháp và PDF khóa sao chép; lỗi thì dừng sau 3 lần.
- **Browser `tests/search-04.spec.ts`:** tìm từ trong PDF, thấy trang và từ được tô, bấm **Mở trang 2** thì reader mở đúng trang, ô tìm đã điền, chọn kết quả 1/1. `library-catalog`, `library-query` vẫn đạt.
- **PDF thật trong pilot corpus,** qua code đã build và `pdftotext`:
  - "cot thep" ra trang 3 của `vietnamese-text.pdf`, đoạn trích giữ đúng dấu.
  - `long-400-pages.pdf`: 400 trang, khoảng 1,07 triệu ký tự, 1,5 giây.
  - `scan-only.pdf`: 0 trang có chữ, đúng kỳ vọng.
  - Poppler 22.12 trong image worker cho đúng số form feed với hai PDF tiếng Việt và 400 trang.
- Luồng tự động trong browser ghi chữ thẳng vào bảng vì e2e không chạy worker. Chưa chạy trọn worker thật qua `pdf-worker.real` với bước này.

## Chưa làm

- OCR cho PDF scan.
- Tìm trong phiên bản cũ của tài liệu; chỉ tìm phiên bản hiện hành.
- Khớp nguyên từ, gợi ý chính tả, xếp hạng theo tần suất từ.
- ~~Cột thống kê cho admin về file lập chỉ mục lỗi~~: đã làm ở [mốc 13/11](2026-11-13-finish-open-gaps.md), gồm trạng thái từng tài liệu, bộ lọc, mục trên trang đầu admin và nút lập chỉ mục lại. Mốc đó cũng chạy trọn bước lập chỉ mục qua worker thật.
