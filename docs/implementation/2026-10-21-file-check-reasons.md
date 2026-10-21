# UPLOAD-03 — Lý do file không đạt và PDF chỉ khóa quyền

Ngày 21/10/2026. Nhánh `codex/upload-03-file-check-reasons`, xây trên `main` sau PR #15. Pilot local ([QA-01](2026-10-21-local-pilot.md)) tìm ra hai vấn đề:

- File có mật khẩu, bị cắt cụt hay hỏng đều hiện cùng một câu, nên người tải lên không biết phải sửa gì.
- PDF mở không cần mật khẩu nhưng cấm sao chép bị từ chối, trong khi nhiều bài giảng ngoài thực tế có kiểu khóa này.

Chủ dự án chọn chính sách: **nhận PDF chỉ khóa quyền, tắt tô sáng và trích dẫn, vẫn cho ghi chú trang**.

## Hành vi

| Trường hợp | Kết quả | Người tải lên thấy |
| --- | --- | --- |
| ClamAV báo FOUND | FAILED `MALWARE` | Phát hiện mã độc, chọn file khác |
| PDF cần mật khẩu để mở | FAILED `PASSWORD_PROTECTED` | Xuất lại PDF không có mật khẩu |
| Poppler không đọc được | FAILED `INVALID_PDF` | File hỏng hoặc chưa tải trọn, xuất lại |
| Quá 10.000 trang | FAILED `TOO_MANY_PAGES` | Tách thành nhiều tài liệu |
| Dịch vụ kiểm tra lỗi qua mọi lần thử | FAILED `CHECK_UNAVAILABLE` | Thử lại sau hoặc báo quản trị viên |
| Lý do khác hoặc file cũ | FAILED, mã `NULL` | Câu chung như trước |
| Mở không cần mật khẩu, `copy:no` | SAFE, `copy_restricted = true` | Ghi chú rằng người đọc không tô hay trích dẫn được |

- Bốn lỗi đầu là nhận định về chính file, nên worker ghi FAILED ngay và dừng thử lại (`UnrecoverableError` của BullMQ). Trước đây job thử lại 3 lần, mất khoảng 9–12 giây.
- Lỗi hạ tầng (mất kết nối ClamAV, công cụ quá thời gian) vẫn thử lại như cũ.
- Mật khẩu được nhận diện bằng mã thoát khác 0 cộng câu "Incorrect password" của Poppler (chạy `LC_ALL=C`). Stderr chỉ dùng để so khớp, giới hạn 4 KiB, không lưu hay ghi log.
- Reader với PDF cấm sao chép: vùng chọn không mở thanh tô, ghi chú đoạn hay trích dẫn; gợi ý giải thích lý do. Đọc, tìm chữ, mục lục và ghi chú trang vẫn dùng được.
- API chặn `POST …/highlights` trên các PDF này với `400 COPY_RESTRICTED`, nên không cần dựa vào giao diện. Tìm chữ trong PDF vẫn bật, vì đó là đọc chứ không sao chép ra ngoài.
- PDF có khóa nhưng vẫn cho sao chép (`copy:yes`) được nhận như PDF thường.

## Schema

Migration `202610210001_file_check_reasons` (SQL thuần, không dùng `db push`) gồm:

- `files.check_error varchar(24)`, có ràng buộc `ck_file_check_error`: chỉ có giá trị khi `scan_status = 'FAILED'` và phải thuộc năm mã ở trên.
- `files.copy_restricted boolean NOT NULL DEFAULT false`.
- Trigger `protect_file_identity` được mở rộng: khi file đã SAFE thì `copy_restricted` cũng bất biến như `page_count`.

Hàng cũ giữ `NULL`/`false`, vì lý do lỗi trước đây chưa từng được ghi. API bản nháp trả `fileError`, reader trả `copyRestricted`. Bản đọc chuyển từ DOCX lấy cờ từ chính PDF đầu ra.

## Kiểm chứng

Local (Windows, Node 24.19.0, pnpm 11.25.0), database `_test` và Redis DB 15.

- Unit `pdf-tools`:
  - nhận `copy:no`/`copy:yes`
  - `INVALID_PDF`, `TOO_MANY_PAGES`
  - phân biệt mật khẩu với file hỏng qua mã thoát + stderr
  - ClamAV FOUND → `MALWARE`, phản hồi lạ → thử lại
- Integration:
  - `PASSWORD_PROTECTED`/`MALWARE` ghi FAILED ngay với `UnrecoverableError`; `CHECK_UNAVAILABLE` chỉ ghi ở lần thử cuối; bản nháp trả `fileError`
  - lỗi không rõ giữ mã `NULL`
  - DB từ chối `check_error` trên file chưa FAILED và mã ngoài danh sách
  - `copy_restricted` không đổi được khi file đã SAFE
  - PDF cấm sao chép: reader trả `copyRestricted`, tô bị `400 COPY_RESTRICTED`, ghi chú trang vẫn 201
  - test schema: 78 ràng buộc CHECK
- Browser `tests/upload-03.spec.ts`:
  - bản nháp FAILED `PASSWORD_PROTECTED` hiện đúng hướng dẫn
  - PDF cấm sao chép: ba nút tô/ghi chú đoạn/trích dẫn bị vô hiệu hóa, ghi chú trang lưu được
- Poppler thật trong image `hucescholar-file-worker` mới build, trên bộ tài liệu pilot:
  - `vietnamese-text`, `scan-only`: OK
  - `permissions-only`: OK, `copyRestricted: true`
  - `encrypted`: `PASSWORD_PROTECTED`
  - `truncated`, `garbage`: `INVALID_PDF`
- Bộ đầy đủ:
  - `pnpm format:check`, `pnpm check` (lint, typecheck, 99 unit, build): đạt.
  - `pnpm test:integration`: 193 passed, 1 skipped.
  - `pnpm test:e2e --workers=1`: 160 passed, 1 skipped (5,4 phút).
- Chưa kiểm trên S3, HTTPS hay thiết bị thật.

## Còn lại

Màn hình admin (kiểm duyệt, vòng đời) vẫn chỉ hiện trạng thái, chưa hiện lý do. Chưa thử EICAR với ClamAV thật trong lượt này; nhánh `MALWARE` được kiểm bằng server giả trả `FOUND`.
