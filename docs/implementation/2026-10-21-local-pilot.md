# QA-01 — Pilot local với bộ tài liệu tự soạn

Ngày 21/10/2026. Nhánh `codex/qa-01-local-pilot`, xây trên `main` sau PR #15. Phạm vi là phần local của QA-01 (đợt C) trong [roadmap](../roadmap/2026-10-17-web-improvement-roadmap.md): chạy luồng ba vai trò trên tài liệu có đặc điểm khó, với ClamAV/Poppler/LibreOffice thật thay vì fixture SAFE.

**Đây là lượt chạy tự động, không phải phiên dùng thử với người thật.** Chưa có giảng viên/sinh viên tham gia, chưa đo thời gian hoàn thành hay số lần cần hướng dẫn. Phần đó của QA-01 vẫn mở và cần tài liệu được phép dùng từ người tham gia.

## Bộ tài liệu

`python scripts/create-pilot-corpus.py` sinh vào `.local/pilot-corpus/` (không commit). Mọi nội dung tự soạn; PDF tiếng Việt do LibreOffice trong image `hucescholar-docx-converter:local` xuất, chạy `--network none`, nên font lấy từ image và không tải gì thêm.

| File | Đặc điểm | Kết quả mong đợi |
| --- | --- | --- |
| `vietnamese-text.pdf` | 3 trang tiếng Việt có dấu, mục lục 3 chương, bảng | SAFE, tìm chữ, mục lục |
| `bai-giang-tieng-viet.docx` | Nguồn Word của file trên | Chuyển PDF thật, tải Word gốc |
| `scan-only.pdf` | 3 trang ảnh, không lớp chữ | SAFE, báo không có lớp chữ |
| `rotated-mixed.pdf` | Trang `/Rotate` 0/90/180/270 và một trang A3 ngang | Mọi trang hiển thị đúng chiều |
| `long-400-pages.pdf` | 400 trang, mục lục 20 chương, cụm duy nhất ở trang 397 | Nhảy trang cuối, tìm được 1 kết quả |
| `near-limit.pdf` | ≈ 22,9 MiB ảnh nhiễu | SAFE |
| `over-limit.pdf` | ≈ 25,7 MiB | Form và API đều từ chối |
| `permissions-only.pdf` | Mở không cần mật khẩu, cấm sao chép (RC4) | Quan sát |
| `encrypted.pdf` | Cần mật khẩu để mở | FAILED |
| `truncated.pdf`, `garbage.pdf` | Cắt cụt / chỉ có header PDF | FAILED |

## Cách chạy

Worker chỉ được nối vào database `_test` và Redis 15 qua `infra/compose.docx-test.yaml`. Tắt worker trước khi chạy bộ browser thường, vì các ca như UPLOAD-01 giả định file ở trạng thái "đang kiểm tra".

```powershell
pnpm test:setup
docker compose --env-file infra/.env -f infra/compose.yaml --profile files build
python scripts/create-pilot-corpus.py
docker compose --env-file infra/.env -f infra/compose.yaml -f infra/compose.docx-test.yaml --profile files up -d clamav docx-converter file-worker
$env:PILOT_REAL = '1'
pnpm exec playwright test tests/pilot-local.spec.ts --workers=1
Remove-Item Env:PILOT_REAL
docker compose --env-file infra/.env -f infra/compose.yaml -f infra/compose.docx-test.yaml --profile files stop file-worker docx-converter clamav
```

Số đo và trạng thái ghi vào `test-results/pilot-local/observations.json`, ảnh chụp ở cùng thư mục. Không ghi nội dung ghi chú, mật khẩu, cookie hay URL PDF.

## Hành trình đã chạy

1. Admin tạo khoa/môn và phân công giảng viên.
2. Giảng viên tạo bản nháp, chọn file, lưu và chờ worker thật cho từng file. Công bố file đạt; file không đạt thì nút Công bố bị vô hiệu hóa.
3. Sinh viên tìm tài liệu không dấu, đọc, tìm chữ, dùng mục lục, tô và ghi chú trang. Sinh viên gửi báo cáo cho bản scan, rồi mở lại ở phiên đăng nhập mới.
4. Giảng viên tạo phiên bản 2. Ghi chú cũ vẫn ở phiên bản 1, phiên bản 2 không có ghi chú.
5. Admin xử lý báo cáo, không đọc được ghi chú của sinh viên, rồi ẩn và khôi phục tài liệu. Khôi phục cần `resolved: true`.

## Số đo local

Windows, Docker Desktop, Chrome Playwright, một lượt. Đây là số đo trên máy dev, không suy ra hiệu năng production.

| Ca | Upload | Worker tới kết quả | Mở trang 1 | Ghi chú |
| --- | --- | --- | --- | --- |
| PDF tiếng Việt | 0,7 s | 3,2 s | — | Tìm "cốt thép": 13 kết quả, 0,3 s |
| DOCX | 1,3 s | 6,3 s | 1,6 s | Chuyển 3 trang |
| Scan | 1,2 s | 3,1 s | 2,1 s | Ô tìm chữ bị vô hiệu hóa kèm giải thích |
| Trang xoay | 1,2 s | 3,1 s | 1,1 s | Đúng chiều sau khi sửa (bên dưới) |
| 400 trang | 0,7 s | 12,5 s | 3,7 s | Nhảy trang 400: 0,3 s; tìm cả tài liệu: 7,9 s |
| Sát giới hạn | 1,3 s | 6,2 s | 3,2 s | |
| File hỏng/mã hóa | 0,6–1,3 s | 9–12,5 s | — | FAILED sau các lần thử lại |

Thời gian worker có độ trễ polling của giao diện (bước 2–3 giây), nên chỉ là cận trên.

## Phát hiện

### Đã sửa trong nhánh này

- **Trang có `/Rotate` hiển thị sai chiều.** Reader truyền góc người dùng chọn vào `getViewport({ rotation })`. PDF.js coi giá trị này là góc tuyệt đối, nên góc `/Rotate` của trang bị bỏ qua: trang lưu `/Rotate 90` hiện dọc và chữ nằm ngang. Bản scan và bản vẽ hay có kiểu này. Giờ reader cộng `pdfPage.rotate` với góc người dùng. Vùng tô lưu theo `normalized-pdf-v1` trong không gian PDF nên không đổi dữ liệu đã lưu. Ca hồi quy `tests/reader-rotation.spec.ts` dùng fixture có trang 2 `/Rotate 90`: đỏ khi chưa sửa (nhận `portrait`), xanh sau khi sửa.
- Câu gợi ý mục lục thiếu dấu cách: "Tối đa250 mục" thành "Tối đa 250 mục".

### Cần chủ dự án quyết định

- **PDF chỉ khóa quyền bị từ chối.** `parsePdfInfo` yêu cầu `Encrypted: no`. PDF mở không cần mật khẩu nhưng cấm sao chép/in vẫn có `Encrypted: yes`, nên bị FAILED. PDF.js vẫn đọc được loại này, nhưng tô chữ và trích dẫn dựa vào lớp chữ có thể đụng tới quyền tác giả đặt ra. Có ba hướng: giữ nguyên, nhận kèm cảnh báo, hoặc nhận nhưng tắt tô/trích dẫn. Chưa đổi chính sách.
- **Giảng viên không biết vì sao file bị từ chối.** File mã hóa, khóa quyền, cắt cụt hay rác đều hiện cùng câu "PDF không đạt kiểm tra; chọn file khác hoặc liên hệ quản trị viên". Muốn phân biệt (ví dụ "PDF có mật khẩu") thì phải lưu mã lỗi không nhạy cảm cho file. Hiện bảng `files` chỉ có trạng thái, nên đây là thay đổi schema riêng.
- **Tìm học liệu chỉ khớp một cụm liền.** "suc ben vat lieu" tìm thấy, còn "bai giang" + mã môn (bỏ chữ ở giữa) ra 0 kết quả. Có thể tách từ và yêu cầu khớp tất cả; cần đo lại truy vấn như SEARCH-01.
- Tìm chữ trong PDF không bỏ dấu ("cot thep": 0 kết quả). Giới hạn này đã ghi ở READ-01, ở đây chỉ xác nhận lại trên tài liệu tiếng Việt thật.

### Đã chạy đúng

Hệ thống cho kết quả đúng ở các điểm sau:

- Giới hạn 25 MiB được chặn ở cả form lẫn API (413 `PDF_TOO_LARGE`).
- Bốn file hỏng hoặc mã hóa không bao giờ được công bố.
- PDF 400 trang và PDF sát giới hạn đọc được.
- Mục lục tiếng Việt từ LibreOffice dẫn đúng trang.
- Phiên mới mở lại đúng trang đọc dở (trang 3).
- Ghi chú gắn đúng phiên bản.
- Admin không xem được ghi chú của sinh viên.
- Tài liệu bị ẩn trả 404 cho sinh viên và trả 200 sau khi khôi phục.

## Kiểm chứng

- Pilot opt-in `tests/pilot-local.spec.ts`: **5/5 đạt** với worker thật (ClamAV 1.4.6, Poppler, LibreOffice trong image). Các lần chạy trước đó dừng vì lỗi kịch bản (kỳ vọng nút Công bố biến mất, câu tìm sai cụm, chưa tính việc mở lại đúng trang đọc dở, thiếu `resolved`) và vì lỗi xoay trang ở trên. Mỗi lần đều sửa đúng nguyên nhân rồi chạy lại.
- `pnpm format:check`, `pnpm check` (lint, typecheck, 97 unit, build): đạt.
- `tests/reader-rotation.spec.ts`: đỏ khi chưa có bản sửa, xanh khi có.
- Bộ browser đầy đủ `pnpm exec playwright test --workers=1` (worker thật đã tắt): **159 đạt, 6 bỏ qua** (5 ca pilot và 1 ca DOCX thật, đều opt-in), 10,3 phút.
- Sau khi sửa phần kiểm tra dung lượng phía API, chạy lại pilot: 5/5 đạt; API trả 413 `PDF_TOO_LARGE`.

## Còn lại

- Phiên dùng thử với người thật (2 giảng viên, 5 sinh viên, 1 admin theo roadmap) và tài liệu họ được phép cung cấp.
- Chưa thử Safari, thiết bị cảm ứng, S3 hay HTTPS (OPS-02).
- Ba quyết định ở trên.
