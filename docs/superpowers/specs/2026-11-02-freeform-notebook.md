# CANVAS — Vở ghi tự do

Trạng thái: đề xuất ngày 02/11/2026, **đã triển khai** ngày 03/11/2026 ([mốc triển khai](../../implementation/2026-11-03-freeform-notebook.md), có ghi phần khác thiết kế và phần chưa làm). Mã hạng mục: CANVAS-01.

## Mục tiêu

Chủ dự án muốn một chỗ ghi chép tự do giống các ứng dụng take note trên iPad (GoodNotes, Notability). Người dùng mở một trang mới, chọn kiểu giấy rồi viết tay bằng bút, gõ bằng bàn phím với font tự chọn, kéo ảnh từ Google vào và trang trí trang.

Hiện HUCEScholar chỉ có ghi chú **gắn vào trang PDF**: tô màu, giấy nhớ, rồi gom lại ở Sổ tay (LEARN-03). Chưa có chỗ để tự viết bài giảng, vẽ sơ đồ hay giải bài tập không thuộc một tài liệu cụ thể. Vở ghi lấp khoảng trống đó và vẫn nối vào vòng học tập: **tìm tài liệu → đọc → ghi lại → quay lại ôn tập**. Điểm khác các app iPad là mỗi đoạn trích đưa vào vở vẫn mở lại được đúng tài liệu, phiên bản và trang gốc.

Tên gọi: **"Vở ghi"**, để khỏi nhầm với "Sổ tay" hiện có (danh sách ghi chú trên PDF).

## Trải nghiệm

### Kệ vở

- Mục **Vở ghi** mới trên sidebar cho cả ba vai trò.
- Mở ra là kệ vở, mỗi cuốn hiện bìa (màu/hoa văn chọn sẵn), tên, môn (tùy chọn), số trang và lần sửa gần nhất.
- Có thể tạo vở, đổi tên, đổi bìa, gắn môn, nhân bản, xóa (vào Thùng rác 30 ngày rồi xóa hẳn) và tìm theo tên hoặc chữ đã gõ trong vở.
- Lọc vở theo môn bằng cùng bộ lọc môn đang dùng ở Sổ tay và Lịch học.

### Trang vở

- **Khổ trang:** A4 dọc, A4 ngang, hoặc **trang vô hạn** (bảng trắng, cuộn mọi hướng, dùng cho sơ đồ tư duy).
- **Kiểu giấy:** trắng trơn, kẻ ngang (dòng hẹp/rộng), ô vuông 5 mm, lưới chấm, Cornell (cột gợi ý, phần ghi, phần tóm tắt), **vở ô li 4 ô kiểu Việt Nam**, giấy kẻ nhạc (khuông nhạc).
- **Màu giấy:** trắng, kem, vàng nhạt, xám, giấy tối (khi viết ban đêm).
- Mỗi trang chọn kiểu riêng; vở có kiểu mặc định cho trang mới.
- Cột trái hiện ảnh thu nhỏ của các trang, cho phép thêm, chèn giữa, nhân bản, kéo đổi thứ tự hoặc xóa trang.
- Phóng to/thu nhỏ (Ctrl + lăn chuột, nút +/−, "Vừa trang") và kéo trang bằng phím Space + chuột hoặc chuột giữa.

### Bộ công cụ

| Công cụ   | Chi tiết                                                                                                                                                                          |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bút       | Ba loại: bút bi (nét đều), bút máy (nét theo lực ấn khi bút cảm ứng có lực, theo tốc độ khi dùng chuột), bút chì (nét nhạt có hạt). 3 độ dày, bảng màu, lưu 8 màu hay dùng.         |
| Bút dạ    | Nét trong suốt, vẽ **dưới** chữ để không che chữ. Có chế độ kẻ thẳng (giữ Shift).                                                                                                  |
| Tẩy       | Tẩy cả nét hoặc tẩy từng phần nét, có 3 cỡ.                                                                                                                                        |
| Hình      | Đường thẳng, mũi tên, chữ nhật, elip, tam giác. Vẽ tay rồi giữ yên nửa giây thì nét tự nắn thành hình chuẩn.                                                                      |
| Chữ       | Bấm vào trang để gõ. Chọn font, cỡ, màu, đậm/nghiêng/gạch chân, căn lề, gạch đầu dòng, danh sách số, hộp có nền màu.                                                               |
| Ảnh       | Kéo thả từ Google hoặc trang web khác, kéo từ máy, dán bằng Ctrl+V, hoặc chọn file. Kéo đổi cỡ, xoay, cắt, đổi lớp trên/dưới.                                                       |
| Trang trí | Sticker, băng dính washi, khung, nhãn tiêu đề, biểu tượng (dấu tích, sao, cảnh báo, bóng đèn ý tưởng). Do dự án tự vẽ (SVG), không dùng tài nguyên có bản quyền.                  |
| Trích dẫn | Đưa một đoạn đã tô hoặc giấy nhớ từ Sổ tay vào trang dưới dạng thẻ trích dẫn: có đoạn chữ, tên tài liệu và số trang. Bấm vào thẻ thì mở reader đúng phiên bản và trang.           |
| Chọn      | Vẽ vòng lasso hoặc kéo khung để chọn nhiều đối tượng, rồi di chuyển, đổi cỡ, đổi màu nét, nhân bản, xóa, sao chép sang trang/vở khác.                                              |

Tiện ích chung:

- Hoàn tác/làm lại (Ctrl+Z / Ctrl+Shift+Z, tối đa 100 bước mỗi trang).
- Phím tắt đổi công cụ (P bút, H bút dạ, E tẩy, T chữ, V chọn, I ảnh) và bảng phím tắt mở bằng phím `?`.
- Tự lưu khi ngừng thao tác 1 giây, có dấu "Đã lưu / Đang lưu / Lưu lỗi – thử lại".
- Hỏi trước khi rời trang khi còn thay đổi chưa lưu, giống UX-02.

### Font chữ

Dùng font tự host trong `apps/web/app/fonts`, không tải từ Google Fonts lúc chạy. Font nào không có bộ chữ tiếng Việt đầy đủ (ă â đ ê ô ơ ư và đủ dấu) sẽ bị loại khi triển khai.

| Nhóm       | Font đề xuất (giấy phép OFL)      |
| ---------- | --------------------------------- |
| Không chân | Be Vietnam Pro (mặc định), Inter  |
| Có chân    | Noto Serif, Lora                  |
| Viết tay   | Patrick Hand, Dancing Script      |
| Đơn cách   | Roboto Mono (ghi code, công thức) |

### Liên kết với phần còn lại của sản phẩm

- **Từ reader:** nút "Ghi vào vở" trên đoạn tô hoặc giấy nhớ chèn thẻ trích dẫn vào vở đang mở gần nhất (hoặc cho chọn vở).
- **Từ Sổ tay:** chọn nhiều mục → "Đưa vào vở", mỗi mục thành một thẻ trích dẫn xếp dọc trang.
- **Từ Lịch học:** buổi học có thể gắn một vở/trang. Mở buổi học thì có link "Mở vở ghi".
- **Gắn môn:** vở gắn môn sẽ hiện ở bộ lọc môn của Sổ tay và Lịch học.
- **Xuất file:** xuất cả vở hoặc các trang đã chọn ra **PDF** (giữ nét vector và ảnh) hoặc **PNG** từng trang.

## Quyết định mặc định đã chốt

Theo cách làm của dự án, chọn phương án khuyến nghị và ghi lại; đổi được trước khi triển khai.

- **Riêng tư tuyệt đối:** vở chỉ chủ sở hữu xem được, quyền do API kiểm. Admin không xem được vở người khác, giống nguyên tắc ghi chú. Chưa có chia sẻ vở; chia sẻ cần thiết kế riêng (thu hồi quyền, bản sao), xem mục 7 của roadmap.
- **Thẻ trích dẫn khi mất quyền tài liệu:** thẻ vẫn nằm trên trang nhưng chỉ hiện "Tài liệu không còn khả dụng", ẩn đoạn chữ và tiêu đề. API trả nội dung thẻ theo quyền đọc hiện tại, giống quy tắc xuất ghi chú (EXPORT-01) và Lịch học. Không lưu bản sao đoạn chữ để vượt quyền.
- **Không cache vở, ảnh hay link ký trong service worker**, theo AGENTS.md. Chưa có chế độ ngoại tuyến. Mất mạng thì báo "Chưa lưu được" và giữ nguyên phần đang vẽ trong bộ nhớ trang để thử lại.
- **Chữ viết tay chưa tìm kiếm được** (không có OCR). Chỉ chữ gõ, tên vở và đoạn trích dẫn được tìm, có tìm không dấu như Sổ tay.
- **Bút cảm ứng:** dùng Pointer Events, có lực ấn khi thiết bị báo. Kiểm chứng trên iPad/Safari và màn hình cảm ứng đang **hoãn** theo hướng web-first. Phạm vi kiểm chứng của đợt này là chuột, touchpad và bút Wacom trên Chrome/Edge. Phần chặn chạm lòng bàn tay chỉ là cơ chế cơ bản (khi đang dùng bút thì bỏ qua chạm tay), chưa tuyên bố hỗ trợ thiết bị.

## Ảnh kéo từ Google: cách làm an toàn

Khi kéo ảnh từ trang kết quả Google sang tab khác, trình duyệt thường chỉ gửi **đường dẫn** (`text/uri-list`, `text/html`), ít khi gửi kèm file ảnh. Vì vậy cần hai đường:

1. **Có file trong lúc kéo/dán** (kéo từ máy, Ctrl+V ảnh chụp màn hình): upload thẳng.
2. **Chỉ có URL:** web gửi URL cho API và **API tải hộ**. Đây là chỗ dễ bị tấn công SSRF, nên API phải:
   - chỉ nhận `https`/`http`, cổng 80/443;
   - phân giải DNS rồi chặn địa chỉ nội bộ (loopback, private, link-local, metadata cloud `169.254.169.254`, IPv6 tương đương), kiểm lại sau mỗi lần redirect, tối đa 3 redirect;
   - giới hạn 10 MB, timeout 10 giây, không gửi cookie hay header của người dùng;
   - kiểm magic bytes, không tin `Content-Type`;
   - giới hạn tần suất 30 ảnh/phút mỗi người.
   - Nếu tải lỗi thì báo "Không lấy được ảnh từ trang này — hãy lưu ảnh về máy rồi kéo vào". Không chèn ảnh dạng link ngoài (hotlink), vì link chết làm hỏng vở và lộ thời điểm người dùng mở vở cho trang bên ngoài.

Mọi ảnh, dù đi đường nào, đều:

- chỉ nhận PNG, JPEG, WebP, GIF (khung đầu) hoặc HEIC nếu thư viện xử lý được;
- được **mã hóa lại** sang WebP bằng `sharp` để bỏ EXIF/GPS và dữ liệu ẩn;
- được thu về tối đa 2400 px cạnh dài và tạo thêm ảnh thu nhỏ;
- được quét ClamAV giống PDF.

Trạng thái quét lưu riêng, không gộp với trạng thái hiển thị. Ảnh đang quét hiện khung chờ; ảnh không đạt hiện khung lỗi kèm lý do và nút xóa.

Bản quyền: ảnh chỉ nằm trong vở riêng của người dùng, tương tự lưu ảnh về máy để học. Vì chưa có chia sẻ vở, dự án không phát tán lại ảnh. Khi sau này mở chia sẻ phải xem lại điểm này.

## Mô hình dữ liệu

Ba bảng mới trong schema `hucescholar`, tạo bằng migration SQL (có ràng buộc `CHECK` và index riêng phần), không dùng `db push`.

```text
notebooks
  id, owner_id → users, title (1–120 ký tự), cover (mã bìa), course_id? → courses,
  default_paper (kiểu giấy cho trang mới), page_count,
  created_at, updated_at, deleted_at (thùng rác)

notebook_pages
  id, notebook_id → notebooks, position (sắp thứ tự, unique theo vở khi chưa xóa),
  size  CHECK IN ('A4_PORTRAIT','A4_LANDSCAPE','INFINITE'),
  paper CHECK IN ('BLANK','RULED_NARROW','RULED_WIDE','GRID','DOT','CORNELL','O_LI','MUSIC'),
  paper_color, revision (tăng mỗi lần lưu), content jsonb (≤ 2 MB),
  search_text (chữ gõ + trích dẫn, có index unaccent), thumbnail_object_key?,
  updated_at

notebook_assets
  id, owner_id → users, object_key (kho private như PDF), mime_type, byte_size,
  width, height, sha256, scan_status ('CHECKING','SAFE','REJECTED'), check_error,
  source ('UPLOAD','PASTE','URL'), source_host? (chỉ tên miền, để ghi "Ảnh từ …"),
  created_at
```

`content` lưu danh sách đối tượng vector theo lớp:

```json
{
  "v": 1,
  "items": [
    { "id": "…", "type": "stroke", "tool": "fountain", "color": "#1d4ed8", "width": 2,
      "points": [[x, y, pressure], …] },
    { "id": "…", "type": "text", "x": 0, "y": 0, "w": 0, "font": "be-vietnam-pro",
      "size": 16, "color": "…", "runs": [ { "text": "…", "bold": true } ] },
    { "id": "…", "type": "image", "assetId": "…", "x": 0, "y": 0, "w": 0, "h": 0,
      "rotation": 0, "crop": null },
    { "id": "…", "type": "shape", "shape": "arrow", … },
    { "id": "…", "type": "sticker", "sticker": "washi-blue", … },
    { "id": "…", "type": "quote", "annotationId": "…" }
  ]
}
```

- Thẻ trích dẫn chỉ lưu `annotationId`. Đoạn chữ, tài liệu và trang do API điền khi đọc, theo quyền hiện tại.
- Nét lưu điểm đã làm gọn (giảm điểm thừa, làm tròn 0,1 px) để giữ dung lượng nhỏ.
- API kiểm schema `content` bằng validator, bỏ trường lạ, giới hạn số đối tượng (5.000 mỗi trang) và số điểm mỗi nét.
- Chữ gõ được lưu dạng dữ liệu và hiển thị bằng text node, không bao giờ chèn HTML thô.

**Lưu đồng thời:** mỗi lần lưu gửi kèm `revision`. Nếu lệch (vở đang mở ở tab khác) thì API trả 409, web báo "Trang đã được sửa ở nơi khác" và cho chọn tải lại hoặc lưu thành trang mới. Không ghi đè im lặng.

**Hạn mức:** 1 GB ảnh mỗi người, 500 trang mỗi vở, 200 vở mỗi người. Trang Cài đặt hiện dung lượng đã dùng.

## API

| Phương thức + đường dẫn                                     | Việc                                                        |
| ----------------------------------------------------------- | ----------------------------------------------------------- |
| `GET/POST /notebooks`, `PATCH/DELETE /notebooks/:id`        | Kệ vở, tạo/sửa/xóa mềm; `POST /notebooks/:id/restore`        |
| `POST /notebooks/:id/duplicate`                             | Nhân bản vở (ảnh dùng chung asset, không copy file)         |
| `GET/POST /notebooks/:id/pages`, `PATCH/DELETE …/pages/:pid` | Danh sách trang, thêm, lưu nội dung theo `revision`, xóa    |
| `POST /notebooks/:id/pages/reorder`                         | Đổi thứ tự trang                                            |
| `POST /notebook-assets` (multipart)                         | Upload ảnh từ file/dán                                      |
| `POST /notebook-assets/from-url`                            | API tải ảnh hộ từ URL (các chặn SSRF ở trên)                |
| `GET /notebook-assets/:id`                                  | Trả ảnh qua kiểm quyền chủ sở hữu, `Cache-Control: private, no-store` |
| `GET /notebooks/search?q=`                                  | Tìm theo tên vở và chữ gõ, không dấu                       |
| `GET /notebooks/:id/export?format=pdf&pages=`               | Xuất PDF (render phía server bằng `pdf-lib`, giữ vector)    |

Mọi route kiểm `owner_id` ở API. Vở hoặc ảnh không thuộc người gọi thì trả 404 (không 403) để không lộ sự tồn tại.

## Kỹ thuật phía web

- **Vẽ:**
  - Một `<canvas>` cho nét đang vẽ (mượt, 60 fps) và một lớp SVG cho nội dung đã lưu, giúp phóng to vẫn nét và xuất PDF vector dễ.
  - Nét dùng `perfect-freehand` (MIT, rất nhỏ) để tạo hình nét theo lực/tốc độ.
  - Trang có hàng nghìn nét thì chuyển phần đã lưu sang canvas cache theo ô.
- **Không dùng tldraw:** bản SDK cần giấy phép khi chạy production. Không dùng Excalidraw vì nét kiểu vẽ phác không hợp vở học. Tự viết trình vẽ nhỏ sẽ hợp phong cách ít thư viện của `apps/web` hiện nay (chỉ có Next, React, pdf.js).
- **Gõ chữ:** hộp chữ là `contenteditable` đặt chồng trên trang lúc sửa; xong thì chuyển về dữ liệu `runs`. Gõ tiếng Việt bằng Unikey/Telex phải qua IME đúng (`compositionstart/end`); có test e2e riêng cho phần này.
- **Hoàn tác:** lưu thao tác dạng lệnh (thêm/sửa/xóa đối tượng) trong bộ nhớ, không chụp lại cả trang.
- **Giấy nền:** vẽ bằng SVG pattern, không phải ảnh, nên in/xuất PDF vẫn sắc nét.
- **Khả năng tiếp cận:** đủ thao tác bằng bàn phím cho kệ vở, danh sách trang, hộp chữ và thanh công cụ; nhãn tiếng Việt cho mọi nút. Phần vẽ tay vốn là thao tác chuột/bút, nên ghi rõ giới hạn này.
- **Hiệu năng:** đo bằng công cụ PERF-01 một trang 2.000 nét và 20 ảnh trên máy cấu hình thấp. Mục tiêu đặt sau khi có số đo đầu tiên.

## Phạm vi một lần làm xong (CANVAS-01)

Theo cách làm đã chốt, mọi phần web ở trên làm trong **một PR**, chia commit theo lớp:

1. Migration và API vở/trang (quyền, `revision`, tìm kiếm, hạn mức).
2. Ảnh: upload, tải hộ từ URL có chặn SSRF, mã hóa lại, quét, phục vụ ảnh có kiểm quyền.
3. Kệ vở và trang: giấy, khổ, danh sách trang, phóng to/kéo.
4. Công cụ: bút, bút dạ, tẩy, hình, chữ và font, ảnh, trang trí, chọn lasso, hoàn tác, phím tắt.
5. Liên kết: thẻ trích dẫn từ reader/Sổ tay, gắn môn, gắn vở vào buổi học, xuất PDF/PNG.
6. Test (dưới đây) và tài liệu mốc triển khai.

**Ngoài phạm vi, kèm lý do:**

- Nhận dạng chữ viết tay/OCR: cần đánh giá tiếng Việt và chi phí, xem mục 7 roadmap.
- Chia sẻ vở và vở chung nhóm: cần mô hình quyền riêng.
- Chế độ ngoại tuyến: AGENTS.md cấm cache dữ liệu riêng tư trong service worker.
- Kiểm chứng iPad/Apple Pencil/cảm ứng: đang hoãn theo yêu cầu web-first.
- Ghi âm kèm ghi chép kiểu Notability: cần lưu trữ và quyền micro riêng.
- AI tóm tắt vở: cần ngân sách và chính sách dữ liệu.
- Nhập file GoodNotes/PDF có sẵn làm nền để viết lên: có thể làm sau bằng tái dùng luồng kiểm tra PDF, nhưng cần quyết định riêng về dung lượng.

## Kiểm thử

- **Unit:** validator `content`, làm gọn nét, chặn SSRF (IP nội bộ, redirect sang nội bộ, DNS rebinding giả lập, file quá lớn, sai magic bytes), xung đột `revision`.
- **Integration API:**
  - người khác gọi vở/ảnh nhận 404;
  - admin cũng nhận 404;
  - thẻ trích dẫn ẩn khi mất quyền tài liệu;
  - vượt hạn mức bị từ chối;
  - ảnh chưa quét xong không phục vụ.
- **E2E Playwright:**
  - tạo vở → chọn giấy ô li → vẽ nét → gõ chữ tiếng Việt có dấu với font viết tay → thả ảnh → tải lại trang vẫn còn đúng;
  - hoàn tác/làm lại;
  - đổi thứ tự trang;
  - đưa đoạn tô từ reader vào vở rồi bấm thẻ mở đúng trang;
  - hai tab sửa cùng trang hiện cảnh báo xung đột;
  - xuất PDF có đủ số trang;
  - giao diện không tràn ở 320 px.
- **Ngoài tự động:** chạy pilot local với ảnh thật kéo từ Google trên Chrome và Edge. Ghi rõ đây là bằng chứng local, chưa phải thiết bị cảm ứng.

## Câu hỏi để chủ dự án chốt (đã có mặc định)

1. **Tên:** "Vở ghi". Mặc định giữ tên này.
2. **Ai được dùng:** cả ba vai trò. Mặc định có. Giảng viên dùng soạn ý bài giảng; admin ít dùng nhưng không hại.
3. **Tải ảnh hộ từ URL:** mặc định bật, kèm các chặn SSRF. Nếu muốn an toàn tối đa thì bỏ, khi đó chỉ nhận ảnh đã lưu về máy hoặc dán.
4. **Hạn mức 1 GB ảnh/người:** mặc định 1 GB; chỉnh theo dung lượng kho thực tế khi làm OPS-02.
