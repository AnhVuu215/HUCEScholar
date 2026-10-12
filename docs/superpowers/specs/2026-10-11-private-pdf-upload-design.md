# PDF riêng tư cho bản nháp

Kế tiếp mốc bản nháp, theo yêu cầu tiếp tục triển khai và stack đã chốt. Giảng viên/sinh viên đính kèm hoặc thay PDF của bản DRAFT do mình quản lý; không cấp quyền đọc/tải hay công bố ở mốc này.

## Thiết kế

API nhận một body nhị phân `application/pdf` tại `POST /api/v1/material-drafts/:id/pdf`, `If-Match` là revision đặt trong dấu ngoặc kép, `X-File-Name` là tên encodeURIComponent. Chọn streaming trực tiếp thay multipart vì chỉ có một file, không cần thêm parser multipart. Metadata đã lưu trước đó. Giới hạn mặc định 25 MiB, tối đa cấu hình 50 MiB, timeout nhận 60 giây, hai upload đồng thời mỗi tiến trình và một upload mỗi actor. Kiểm tra session/role/CSRF/quyền trước đọc body; kiểm tra lại trong transaction khi gắn file để bắt mất quyền hoặc revision thay đổi giữa chừng. Dữ liệu tạm/không gắn được được dọn; crash có thể để orphan và cần vận hành đối soát.

File được stream vào thư mục temp riêng ngoài webroot, tính SHA256/kích thước, kiểm tra `%PDF-` và tên `.pdf`. Kho local filesystem chỉ cho development/test, không phục vụ static; production bắt buộc S3 private, SDK credential chain và bucket quản trị riêng. Object key ngẫu nhiên, bất biến. Không giữ transaction DB trong lúc nhận/lưu bytes. Transaction tạo files CHECKING, thay file_id của version DRAFT, tăng revision document/version và ghi audit cùng nhau. Không xóa file cũ đang xử lý để tránh race; lifecycle dọn file mồ côi là công việc vận hành được ghi rõ.

Worker riêng từ codebase NestJS dùng BullMQ/Redis. PostgreSQL là nguồn trạng thái; định kỳ đối soát CHECKING với job ổn định theo file ID, phục hồi enqueue thất bại hoặc job mất khỏi Redis. Retry ba lần với backoff. Worker tải file riêng, kiểm tra lại hash/kích thước, quét ClamAV qua TCP INSTREAM và chạy Poppler pdfinfo/pdftotext bằng spawn không shell, timeout và giới hạn output. PDF mã hóa, parser lỗi, mã độc, hash sai đều FAILED; scanner unavailable không SAFE, retry rồi FAILED. SAFE cần số trang dương, has_text_layer và checked_at. Job idempotent, cập nhật có điều kiện CHECKING; xử lý file cũ không thay kết quả file mới.

UI thêm khu vực PDF trong bản nháp đã lưu, tách form metadata. Chỉ upload khi metadata sạch và quyền còn hợp lệ; upload thành công cập nhật revision trong editor và làm mới danh sách. Khi lỗi giữ metadata và file chọn; khi kết quả upload chưa rõ do mất mạng yêu cầu mở lại bản trước retry. Có nút kiểm tra trạng thái; không polling vô hạn hoặc lưu vào localStorage. Trạng thái MISSING/CHECKING/SAFE/FAILED có chữ rõ ràng, SAFE không ngụ ý đã duyệt.

## Ranh giới và kiểm chứng

Không tạo cloud bucket, không dùng tài liệu thật, không gửi duyệt/reader trong mốc này. Unit dùng scanner fake có khai báo để kiểm tra trạng thái; integration dùng PostgreSQL/Redis test và kho riêng test; Playwright dùng PDF synthetic. Docker worker cung cấp Poppler; ClamAV dùng image chính thức cùng profile riêng, cần definitions mới và giới hạn tài nguyên. Chỉ ghi nhận quét thật khi đã chạy với scanner thực, không suy từ mock. Không đổi 23 bảng/constraint khi schema hiện có đủ.
