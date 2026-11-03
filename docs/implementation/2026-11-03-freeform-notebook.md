# CANVAS-01 — Vở ghi tự do

Ngày 03/11/2026. Nhánh `codex/freeform-notebook`, xây trên `main` `6585946` (sau PR #67). Thiết kế: [2026-11-02-freeform-notebook.md](../superpowers/specs/2026-11-02-freeform-notebook.md).

Làm trong một PR, hai commit theo lớp: API (`318e657`) rồi web.

## Đã làm

### API (commit `318e657`)

- Ba bảng `notebooks`, `notebook_pages`, `notebook_assets` tạo bằng migration SQL, có `CHECK`, ràng buộc vị trí trang hoãn tới cuối giao dịch và index GIN cho việc dọn ảnh mồ côi.
- Vở chỉ chủ sở hữu xem được. Người khác, kể cả admin, nhận 404. Thùng rác 30 ngày, khôi phục, nhân bản (ảnh dùng chung asset), gắn môn, tìm không dấu theo tên vở, chữ gõ và đoạn trích dẫn.
- Lưu trang theo `revision` (`If-Match`); lệch thì trả 409. Nội dung được dựng lại từ whitelist, tối đa 2 MB và 5.000 đối tượng mỗi trang.
- Ảnh: upload/dán, hoặc API tải hộ từ URL có chặn SSRF (chỉ http/https cổng 80/443, chặn địa chỉ nội bộ sau mỗi redirect, tối đa 3 redirect, 10 MB, 10 giây, kiểm magic bytes). Mọi ảnh được mã hóa lại sang WebP bằng `sharp` (bỏ EXIF, tối đa 2400 px, có ảnh thu nhỏ) và chỉ phục vụ khi ClamAV trong worker báo `SAFE`.
- Thẻ trích dẫn chỉ lưu `annotationId`; nội dung lấy theo quyền đọc hiện tại.
- Mục Lịch học có thể gắn một vở của chủ sở hữu.
- Hạn mức: 200 vở, 500 trang mỗi vở, 1 GB ảnh mỗi người.

### Web (commit này)

- **Kệ vở** `/workspace/notes`: mục "Vở ghi" trên sidebar cho cả ba vai trò. Bìa, tên, môn, số trang, lần sửa gần nhất. Tạo, sửa, nhân bản, Thùng rác (khôi phục, xóa vĩnh viễn), tìm theo tên hoặc chữ gõ, lọc theo môn, hiện dung lượng ảnh đã dùng.
- **Trang vở** `/workspace/notes/:id`:
  - Khổ A4 dọc, A4 ngang, trang vô hạn.
  - 8 kiểu giấy, gồm vở ô li 4 ô và khuông nhạc, vẽ bằng SVG pattern.
  - 5 màu giấy.
  - Cột ảnh thu nhỏ: thêm, nhân bản, xóa, kéo đổi thứ tự (có nút lên/xuống cho bàn phím).
  - Phóng to/thu nhỏ, "Vừa trang", kéo trang bằng Space hoặc chuột giữa, chế độ toàn màn hình.
- **Công cụ:**
  - Bút bi, bút máy (theo lực ấn hoặc tốc độ) và bút chì, dùng `perfect-freehand`. Lưu 8 màu hay dùng.
  - Bút dạ vẽ dưới chữ; giữ Shift để kẻ thẳng.
  - Tẩy cả nét hoặc từng phần.
  - Hình: đường, mũi tên, chữ nhật, elip, tam giác. Vẽ tay rồi giữ yên thì nét tự nắn thành hình.
  - Chữ: font, cỡ, màu, đậm/nghiêng/gạch, căn lề, danh sách, nền hộp.
  - Ảnh: chọn file, dán, kéo từ máy, hoặc kéo từ trang khác (gửi URL cho API tải hộ). Có đổi cỡ, xoay, cắt và đổi lớp.
  - Trang trí: sticker, washi, khung, nhãn, biểu tượng, đều do dự án tự vẽ bằng SVG.
  - Chọn và lasso: di chuyển, đổi cỡ, đổi màu, nhân bản, xóa, sao chép/dán sang trang hoặc vở khác.
  - Hoàn tác/làm lại 100 bước, phím tắt và bảng phím tắt mở bằng `?`.
- **Font tự host** trong `apps/web/public/fonts/notes` (không gọi Google lúc chạy): Be Vietnam Pro, Inter, Noto Serif, Lora, Patrick Hand, Dancing Script, Roboto Mono. Cả bảy đều có bộ chữ tiếng Việt và theo giấy phép OFL 1.1; xem `README.md` và `OFL.txt` cạnh font.
- **Tự lưu** sau 1 giây ngừng thao tác, có trạng thái "Đã lưu / Đang lưu… / Lưu lỗi – Thử lại". Hỏi trước khi rời trang khi còn thay đổi chưa lưu.
- **Xung đột hai tab:** hiện "Trang đã được sửa ở nơi khác" cùng hai lựa chọn: tải bản mới nhất, hoặc lưu bản của mình thành trang mới. Không ghi đè im lặng.
- **Liên kết:**
  - "Ghi vào vở" trên đoạn tô và giấy nhớ ở reader, trên từng mục Sổ tay, và "Ghi các mục đang hiện vào vở" (tối đa 20). Các mục được đưa vào trang mới cuối vở đã chọn hoặc vào vở mới.
  - Bấm thẻ trích dẫn (công cụ Chọn) mở reader đúng phiên bản và trang. Mất quyền thì thẻ chỉ hiện "Tài liệu không còn khả dụng".
  - Lịch học: form mục lịch có ô "Vở ghi"; mục lịch hiện link "Mở vở".
  - Lọc Sổ tay hoặc khung "Cần xem lại" của Lịch học theo môn thì hiện "Vở ghi của môn này".
  - Trang Cài đặt có mục "Dung lượng vở ghi".
- **Xuất file:**
  - "In / Lưu PDF" cả vở hoặc trang đang mở: trang in `/workspace/notes/:id/print` mỗi trang một tờ A4, giữ nét vector, font và ảnh, rồi mở hộp thoại in của trình duyệt.
  - "Tải ảnh PNG trang này".
- Sửa nhỏ: nhấn Esc khi đang gõ dở Telex/VNI chỉ hủy phần đang gõ, không đóng hộp chữ.

## Khác thiết kế

- **PDF xuất bằng trang in của trình duyệt**, không render phía server bằng `pdf-lib`. Cách này giữ được vector, font tự host và ảnh đã kiểm quyền mà API không phải dựng lại trình vẽ. Không có route `GET /notebooks/:id/export`.
- Font nằm ở `public/fonts/notes` thay vì `app/fonts`, để trang in và canvas xuất PNG dùng chung một `@font-face`.
- Lịch học gắn được **một vở**, chưa gắn tới một trang cụ thể.
- "Vở gắn môn hiện ở bộ lọc môn" làm theo cách: khi Sổ tay hoặc Lịch học lọc theo một môn, hiện link tới các vở của môn đó. Bộ lọc không thêm mục chọn mới.

## Chưa làm

- ~~Cache canvas theo ô cho trang hàng nghìn nét và đo PERF-01~~: đã làm ở [CANVAS-02](2026-11-03-notebook-perf.md).
- Các mục ngoài phạm vi trong thiết kế (OCR, chia sẻ vở, ngoại tuyến, ghi âm, AI tóm tắt, nhập PDF làm nền).
- Kiểm chứng trên iPad, Apple Pencil, màn hình cảm ứng và Safari: đang hoãn theo hướng web-first. Phần chặn chạm lòng bàn tay chỉ là cơ chế cơ bản: đã thấy bút thì bỏ qua chạm tay.

## Kiểm chứng

Local (Windows, Node 24.19.0, pnpm 11.25.0, Chrome do Playwright điều khiển):

- `tests/canvas-01.spec.ts` (2 ca, đều đạt):
  1. Tạo vở giấy ô li. Vẽ hai nét, hoàn tác, làm lại. Gõ tiếng Việt có dấu bằng Patrick Hand. Thêm ảnh PNG. Tải lại trang thì nét, chữ, font và ảnh vẫn đúng. Thêm trang 2, chuyển lên đầu. Sửa cùng trang ở hai tab thì hiện hộp xung đột. Trang in có 2 tờ và PDF Chromium có đúng 2 trang. Kệ vở và trang vở không tràn ngang ở 320 px.
  2. Ghi một giấy nhớ từ Sổ tay vào vở mới. Thẻ hiện đúng nội dung, bấm thì mở reader ở trang 2. Vở gắn môn của tài liệu hiện khi lọc Sổ tay theo môn đó.
- `pnpm format:check` và `pnpm check` (lint, typecheck, 196 unit, build) đều đạt.
- `pnpm test:integration`: 246 đạt, 1 bỏ qua. Khi chạy cả bộ thì lộ ra hai lỗi của chính bộ test, đã sửa:
  - Ca "khóa người duyệt" khóa tài khoản `other`; trigger của DB thu hồi phiên, nên các ca CANVAS chạy sau nhận 401. Nay ca đó đăng nhập lại `other` sau khi mở khóa, giống ca khóa tài khoản trước đó.
  - Test schema nay đếm 39 bảng, 77 khóa ngoại, 133 `CHECK`, 21 index riêng phần. Phần tăng khớp đúng migration vở ghi: 3 bảng, 5 khóa ngoại, 21 `CHECK`, 5 index riêng phần.
- Cả bộ e2e (một worker, chia ba lượt theo file): 72 + 74 + 56 = **202 đạt, 0 hỏng**; 8 ca opt-in bỏ qua. `workspace-ui.spec.ts` nay đếm thêm một link "Vở ghi" trên sidebar cho mỗi vai trò.
- Ảnh kéo thật từ Google: đã chạy thử trên Chrome ở [CANVAS-02](2026-11-03-notebook-perf.md). Đường tải hộ từ URL với ảnh thật thì chưa chạy thử. Edge ngoài phạm vi: chủ dự án chốt chỉ kiểm chứng trên Chrome.
