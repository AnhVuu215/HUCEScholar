# UPLOAD-04 — Admin thấy lý do file không đạt

Ngày 21/10/2026. Nhánh `codex/upload-04-admin-file-reasons`, xây trên `main`. Tiếp phần "Còn lại" của [UPLOAD-03](2026-10-21-file-check-reasons.md): người tải lên đã thấy lý do, nhưng màn hình admin chỉ hiện "Không đạt kiểm tra".

## Hành vi

- API kiểm duyệt (`GET /admin/publication-requests…`) và vòng đời (`GET /admin/materials…`, trong `latest`/`current`) trả thêm `fileError`. Đây là mã đã lưu ở `files.check_error`; `null` khi file chưa lỗi hoặc là file cũ chưa ghi lý do. Không có thông điệp gốc của ClamAV hay Poppler.
- Nhãn ngắn dùng chung (`fileFailedLabel`), ví dụ "PDF không đạt kiểm tra: PDF có mật khẩu", hiện ở:
  - chi tiết yêu cầu kiểm duyệt
  - chi tiết vòng đời, dòng "Phiên bản mới nhất" (trước đây màn hình này không hiện trạng thái PDF)
  - danh sách học liệu của người tải lên
- File cũ không có mã thì vẫn hiện "PDF không đạt kiểm tra" như trước. Hướng dẫn sửa chi tiết vẫn chỉ hiện cho người tải lên trong bản nháp.

Không đổi schema, quyền hay luồng duyệt.

## Kiểm chứng

Local (Windows, Node 24.19.0, pnpm 11.25.0), database `_test` và Redis DB 15:

- Integration:
  - ba ca lý do của UPLOAD-03 nay kiểm thêm `latest.fileError` trên API vòng đời
  - ca mới: yêu cầu kiểm duyệt có PDF FAILED `INVALID_PDF` trả `fileError`; file SAFE trả `null`
- Browser `upload-03.spec.ts`: danh sách bản nháp hiện "PDF không đạt kiểm tra: PDF có mật khẩu"; admin mở quản lý tài liệu đó thấy cùng lý do.
- Màn hình kiểm duyệt chỉ được kiểm qua API, chưa có ca trình duyệt cho trạng thái FAILED.
