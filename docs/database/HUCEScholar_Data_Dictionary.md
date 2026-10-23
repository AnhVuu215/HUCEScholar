# HUCEScholar Data Dictionary

Phiên bản thiết kế 1.0 ngày 10/10/2026. Cơ sở nghiệp vụ 1.1.

23 bảng; 184 trường. SQL là phương án tham chiếu PostgreSQL, chưa phải database triển khai.

**Ghi chú triển khai 11/10/2026:** các bảng bên dưới mô tả baseline thiết kế 1.0. Migration ứng dụng đã bổ sung revision khoa/ngành và migration `202610110005_material_draft_without_file` cho phép `document_versions.file_id` null chỉ khi DRAFT (CHECK bắt buộc file ở mọi trạng thái khác). Prisma schema/migrations là nguồn triển khai hiện tại; không chạy lại SQL baseline lên database ứng dụng. API bản nháp yêu cầu 1–20 môn ngay khi lưu. Chi tiết: [bản nháp học liệu](../implementation/2026-10-11-material-drafts.md).

## Quyết định thiết kế

### Tách tài liệu và phiên bản

documents giữ định danh, manager và visibility. document_versions giữ file, môn, metadata và quyền của snapshot. Ghi chú luôn tham chiếu version_id, không tham chiếu current_version_id.

### Môn thuộc phiên bản

Quan hệ học phần nằm ở version_courses. Bản nháp phải có ít nhất một môn trước gửi duyệt. SQL cho phép nháp chưa chọn môn; backend kiểm tra điều kiện gửi. Bàn giao kiểm tra người nhận được phân công hợp của tất cả môn trong các phiên bản thuộc tài liệu.

### Tác giả và chủ quản lý

documents.created_by và versions.created_by lưu người tạo gốc. authors là nhãn tác giả học thuật; manager_id là người quản lý hiện tại. publication_requests.submitted_by giữ người gửi thực sự của từng lần, không đổi sau bàn giao.

### Một role chính và một bản đang làm

Lựa chọn thiết kế MVP: users.role có một giá trị; một tài liệu chỉ có một bản DRAFT, SUBMITTED hoặc CHANGES_REQUIRED tại một thời điểm. Không bổ sung role kiểm duyệt riêng. Có thể thay đổi mô hình này nếu sau này cần kiêm nhiệm hoặc nhiều nhánh biên tập.

### Tài liệu và sách nguồn ngoài

books chứa metadata, nguồn và quyền dùng metadata. native_document_id là tùy chọn, không chứng minh quyền phục vụ toàn văn. Khi mở PDF vẫn kiểm tra quyền của document/version. Không có dữ liệu tồn kho, mượn trả hoặc API trường trong MVP.

### Xóa và lưu lịch sử

Các FK dùng RESTRICT để tránh xóa dây chuyền file, phiên bản và dữ liệu riêng tư. Ngừng tài khoản, danh mục hoặc ẩn nội dung bằng trạng thái. Chính sách xóa dữ liệu thật và thời hạn lưu cần thống nhất trước vận hành với người dùng thật.

## users

Tài khoản nội bộ; một role chính cho MVP, chưa có SSO. Sinh viên và giảng viên có thể tự đăng ký qua `signup_tokens` (AUTH-04); khi đó `verified_at` là lúc xác nhận email và `verified_by` NULL.

| Trường | Kiểu | Khóa | Null | Ý nghĩa |
|---|---|---|---|---|
| id | bigint | PK | Không | Khóa chính do database cấp |
| email | varchar(254) | — | Không | Lưu lowercase sau trim; định danh đăng nhập duy nhất |
| display_name | varchar(150) | — | Không | Tên hiển thị |
| password_hash | text | — | Không | Hash mật khẩu; không lưu mật khẩu gốc |
| role | varchar(12) | — | Không | Role chính; thay role chỉ do admin |
| status | varchar(12) | — | Không | Chỉ ACTIVE và đã xác minh mới sử dụng học liệu |
| verified_at | timestamptz | — | Có | Admin xác minh thuộc nhóm người dùng hợp lệ |
| verified_by | bigint | FK | Có | Admin thực hiện xác minh; bootstrap admin đầu tiên có thể null |
| created_at | timestamptz | — | Không | Thời điểm tạo, lưu theo UTC |
| updated_at | timestamptz | — | Không | Ứng dụng cập nhật khi ghi thay đổi |
| revision | integer | — | Không | Khóa kiểm soát cập nhật đồng thời; mỗi lần ghi tăng 1 |

Ràng buộc: `UNIQUE (email)`; `CHECK (email = lower(btrim(email)) AND position('@' in email) > 1)`; `CHECK (status <> 'ACTIVE' OR verified_at IS NOT NULL)`

- `verified_by` → `users.id`

## auth_sessions

Phiên web có thể thu hồi; có thể ánh xạ sang cơ chế session của framework.

| Trường | Kiểu | Khóa | Null | Ý nghĩa |
|---|---|---|---|---|
| id | bigint | PK | Không | Khóa chính do database cấp |
| user_id | bigint | FK | Không | Chủ phiên |
| token_hash | varchar(128) | — | Không | Hash token ngẫu nhiên; không lưu cookie gốc |
| created_at | timestamptz | — | Không | Thời điểm tạo, lưu theo UTC |
| expires_at | timestamptz | — | Không | Hết hạn phiên |
| revoked_at | timestamptz | — | Có | Thu hồi khi đăng xuất, khóa tài khoản hoặc reset mật khẩu |

Ràng buộc: `CHECK (expires_at > created_at)`; `CHECK (revoked_at IS NULL OR revoked_at >= created_at)`

- `user_id` → `users.id`

## password_reset_tokens

Token đặt lại mật khẩu một lần; không thay đổi trạng thái khóa tài khoản.

| Trường | Kiểu | Khóa | Null | Ý nghĩa |
|---|---|---|---|---|
| id | bigint | PK | Không | Khóa chính do database cấp |
| user_id | bigint | FK | Không | Tài khoản cần khôi phục |
| token_hash | varchar(128) | — | Không | Hash token khôi phục |
| created_at | timestamptz | — | Không | Thời điểm tạo, lưu theo UTC |
| expires_at | timestamptz | — | Không | Thời điểm hết hạn |
| used_at | timestamptz | — | Có | Đánh dấu đã tiêu thụ trong giao dịch reset |

Ràng buộc: `CHECK (expires_at > created_at)`; `CHECK (used_at IS NULL OR used_at >= created_at)`

- `user_id` → `users.id`

## signup_tokens

Migration `202610220002_signup_tokens` (AUTH-04). Token tự đăng ký một lần gửi tới email; tài khoản chỉ được tạo khi dùng token, nên không có tài khoản chờ xác nhận.

| Trường | Kiểu | Khóa | Null | Ý nghĩa |
|---|---|---|---|---|
| id | bigint | PK | Không | Khóa chính do database cấp |
| email | varchar(254) | — | Không | Email nhận liên kết, lowercase sau trim |
| token_hash | varchar(128) | UNIQUE | Không | Hash token; không lưu token gốc |
| created_at | timestamptz | — | Không | Thời điểm tạo, lưu theo UTC |
| expires_at | timestamptz | — | Không | Hết hạn sau 24 giờ |
| used_at | timestamptz | — | Có | Đã dùng, hoặc bị thay bởi liên kết mới hơn |

Ràng buộc: `ck_signup_email`, `ck_signup_expiry (expires_at > created_at)`, `ck_signup_used (used_at IS NULL OR used_at >= created_at)`; index `ix_signup_email(email)`.

## faculties

Khoa hoặc đơn vị quản lý học phần.

Triển khai migration `202610110003_faculty_revision` bổ sung `revision integer NOT NULL DEFAULT 1 CHECK (revision > 0)` để phát hiện cập nhật đồng thời. Mỗi lần sửa qua API tăng 1.

| Trường | Kiểu | Khóa | Null | Ý nghĩa |
|---|---|---|---|---|
| id | bigint | PK | Không | Khóa chính do database cấp |
| code | varchar(30) | — | Không | Mã nội bộ; không tự nhận là mã chính thức |
| name | varchar(200) | — | Không | Tên đơn vị |
| is_active | boolean | — | Không | Ngừng sử dụng thay vì xóa dữ liệu đang được tham chiếu |
| created_at | timestamptz | — | Không | Thời điểm tạo, lưu theo UTC |

## programs

Ngành hoặc chương trình thuộc một khoa.

Triển khai migration `202610110004_program_revision` bổ sung revision dương, mặc định 1; API tăng mỗi lần sửa để phát hiện cập nhật đồng thời.

| Trường | Kiểu | Khóa | Null | Ý nghĩa |
|---|---|---|---|---|
| id | bigint | PK | Không | Khóa chính do database cấp |
| faculty_id | bigint | FK | Không | Khoa quản lý |
| code | varchar(30) | — | Không | Mã chương trình |
| name | varchar(200) | — | Không | Tên chương trình |
| is_active | boolean | — | Không | Trạng thái sử dụng |
| created_at | timestamptz | — | Không | Thời điểm tạo, lưu theo UTC |
- `faculty_id` → `faculties.id`

## courses

Học phần; có thể dùng chung giữa nhiều chương trình.

| Trường | Kiểu | Khóa | Null | Ý nghĩa |
|---|---|---|---|---|
| id | bigint | PK | Không | Khóa chính do database cấp |
| faculty_id | bigint | FK | Không | Đơn vị quản lý học phần |
| code | varchar(30) | — | Không | Mã học phần |
| name | varchar(200) | — | Không | Tên học phần |
| is_active | boolean | — | Không | Trạng thái sử dụng |
| created_at | timestamptz | — | Không | Thời điểm tạo, lưu theo UTC |
| revision | integer | — | Không | Khóa kiểm soát cập nhật đồng thời; mỗi lần ghi tăng 1 |
- `faculty_id` → `faculties.id`

## program_courses

Bảng nối chương trình và học phần nhiều–nhiều.

| Trường | Kiểu | Khóa | Null | Ý nghĩa |
|---|---|---|---|---|
| program_id | bigint | PK,FK | Không | Chương trình |
| course_id | bigint | PK,FK | Không | Học phần |

Ràng buộc: `PRIMARY KEY (program_id, course_id)`

- `program_id` → `programs.id`
- `course_id` → `courses.id`

## lecturer_assignments

Lưu cả phân công hiện hành và lịch sử thu hồi.

| Trường | Kiểu | Khóa | Null | Ý nghĩa |
|---|---|---|---|---|
| id | bigint | PK | Không | Khóa chính do database cấp |
| lecturer_id | bigint | FK | Không | Giảng viên; backend kiểm tra role và ACTIVE |
| course_id | bigint | FK | Không | Học phần phụ trách |
| assigned_by | bigint | FK | Không | Admin phân công |
| assigned_at | timestamptz | — | Không | Bắt đầu phân công |
| revoked_at | timestamptz | — | Có | Null là chưa thu hồi |
| revoked_by | bigint | FK | Có | Admin thu hồi |
| reason | text | — | Có | Lý do thay đổi |

Ràng buộc: `CHECK (revoked_at IS NULL OR revoked_at >= assigned_at)`; `CHECK ((revoked_at IS NULL) = (revoked_by IS NULL))`

- `lecturer_id` → `users.id`
- `assigned_by` → `users.id`
- `course_id` → `courses.id`
- `revoked_by` → `users.id`

## documents

Danh tính ổn định của học liệu; sở hữu hiện tại và trạng thái ẩn thuộc tài liệu.

| Trường | Kiểu | Khóa | Null | Ý nghĩa |
|---|---|---|---|---|
| id | bigint | PK | Không | Khóa chính do database cấp |
| kind | varchar(20) | — | Không | Giáo trình giảng viên hoặc tài liệu sinh viên bổ sung |
| created_by | bigint | FK | Không | Người tạo gốc; không đổi khi bàn giao |
| manager_id | bigint | FK | Không | Chủ quản lý hiện tại; không dùng làm nhãn tác giả |
| visibility | varchar(8) | — | Không | Ẩn toàn tài liệu và mọi phiên bản |
| current_version_id | bigint | FK | Có | Bản đã duyệt hiện hành; null trước công bố đầu tiên |
| created_at | timestamptz | — | Không | Thời điểm tạo, lưu theo UTC |
| updated_at | timestamptz | — | Không | Ứng dụng cập nhật khi ghi thay đổi |
| revision | integer | — | Không | Khóa kiểm soát cập nhật đồng thời; mỗi lần ghi tăng 1 |

Ràng buộc: `UNIQUE (current_version_id)`

- `created_by` → `users.id`
- `manager_id` → `users.id`
- `current_version_id` → `document_versions.id`; FK thực tế dùng cặp document_id và version_id.

## files

Metadata của PDF trong kho riêng tư; database không chứa bytes của file.

| Trường | Kiểu | Khóa | Null | Ý nghĩa |
|---|---|---|---|---|
| id | bigint | PK | Không | Khóa chính do database cấp |
| uploaded_by | bigint | FK | Không | Người upload gốc |
| object_key | varchar(500) | — | Không | Khóa đối tượng bất biến, không phải URL công khai |
| original_name | varchar(255) | — | Không | Tên file đã làm sạch để hiển thị/tải |
| mime_type | varchar(80) | — | Không | Khai báo MIME; không thay việc kiểm tra bytes |
| byte_size | bigint | — | Không | Dung lượng; hạn mức upload do cấu hình dịch vụ |
| sha256 | char(64) | — | Không | Hash xác minh file; không UNIQUE vì không tự gộp bản trùng |
| scan_status | varchar(8) | — | Không | Kết quả kiểm tra kỹ thuật hiện hành |
| page_count | integer | — | Có | Số trang được parser xác định |
| has_text_layer | boolean | — | Có | Khả năng highlight cần kiểm tra thêm ở từng trang |
| checked_at | timestamptz | — | Có | Thời điểm hoàn thành kiểm tra |
| created_at | timestamptz | — | Không | Thời điểm tạo, lưu theo UTC |

Ràng buộc: `CHECK (scan_status <> 'SAFE' OR (page_count IS NOT NULL AND checked_at IS NOT NULL AND has_text_layer IS NOT NULL))`

- `uploaded_by` → `users.id`

## document_versions

Snapshot file, metadata và quyền. Bản APPROVED/REJECTED bất biến; sửa bằng bản mới.

| Trường | Kiểu | Khóa | Null | Ý nghĩa |
|---|---|---|---|---|
| id | bigint | PK | Không | Khóa chính do database cấp |
| document_id | bigint | FK | Không | Tài liệu gốc |
| version_no | integer | — | Không | Số thứ tự tăng trong tài liệu; cấp dưới khóa tài liệu |
| file_id | bigint | FK | Không | PDF của phiên bản |
| created_by | bigint | FK | Không | Người tạo snapshot gốc |
| title | varchar(300) | — | Không | Tiêu đề của phiên bản |
| authors | text | — | Không | Nhãn tác giả học thuật; tách khỏi tài khoản quản lý |
| description | text | — | Không | Mô tả học liệu |
| material_type | varchar(20) | — | Không | Loại học liệu |
| publication_year | smallint | — | Có | Năm tài liệu nếu biết |
| source_reference | text | — | Không | Nguồn hoặc dẫn chứng; có thể hoàn thiện khi còn nháp |
| rights_basis | text | — | Không | Căn cứ được chia sẻ/đọc/tải; bắt buộc có nội dung trước gửi duyệt |
| rights_valid_until | timestamptz | — | Có | Hết hạn căn cứ nếu có; null không tự chứng minh quyền vô thời hạn |
| download_allowed | boolean | — | Không | Được tải file gốc khi còn đủ quyền đọc |
| review_status | varchar(20) | — | Không | Trạng thái xét công bố của phiên bản |
| change_summary | text | — | Không | Mô tả thay đổi so với bản trước |
| search_text | text | — | Không | Metadata đã chuẩn hóa tiếng Việt có/không dấu do ứng dụng tạo |
| created_at | timestamptz | — | Không | Thời điểm tạo, lưu theo UTC |
| updated_at | timestamptz | — | Không | Ứng dụng cập nhật khi ghi thay đổi |
| revision | integer | — | Không | Khóa kiểm soát cập nhật đồng thời; mỗi lần ghi tăng 1 |

Ràng buộc: `UNIQUE (document_id, version_no)`; `UNIQUE (document_id, id)`

- `document_id` → `documents.id`
- `file_id` → `files.id`
- `created_by` → `users.id`

## version_courses

Học phần gắn với snapshot, tránh thay môn của bản đã công bố.

| Trường | Kiểu | Khóa | Null | Ý nghĩa |
|---|---|---|---|---|
| version_id | bigint | PK,FK | Không | Phiên bản |
| course_id | bigint | PK,FK | Không | Học phần |

Ràng buộc: `PRIMARY KEY (version_id, course_id)`

- `version_id` → `document_versions.id`
- `course_id` → `courses.id`

## publication_requests

Mỗi dòng là một lần gửi duyệt. Rút/sửa/gửi lại tạo dòng mới, giữ người gửi cũ.

| Trường | Kiểu | Khóa | Null | Ý nghĩa |
|---|---|---|---|---|
| id | bigint | PK | Không | Khóa chính do database cấp |
| version_id | bigint | FK | Không | Phiên bản được xét |
| submitted_by | bigint | FK | Không | Người thực sự gửi lần này |
| submitted_revision | integer | — | Không | Revision sau chuyển phiên bản sang SUBMITTED |
| submitted_at | timestamptz | — | Không | Lúc gửi |
| status | varchar(20) | — | Không | Trạng thái của lần gửi, tách khỏi review_status của phiên bản |
| resolved_by | bigint | FK | Có | Người duyệt/rút; bàn giao là admin |
| resolved_at | timestamptz | — | Có | Lúc kết thúc lần gửi |
| reason | text | — | Có | Bắt buộc khi yêu cầu sửa/từ chối/rút |
| revision | integer | — | Không | Khóa kiểm soát cập nhật đồng thời; mỗi lần ghi tăng 1 |

Ràng buộc: `CHECK ((status = 'PENDING' AND resolved_by IS NULL AND resolved_at IS NULL) OR (status <> 'PENDING' AND resolved_by IS NOT NULL AND resolved_at IS NOT NULL))`; `CHECK (status NOT IN ('WITHDRAWN','CHANGES_REQUIRED','REJECTED') OR nullif(btrim(reason), '') IS NOT NULL)`; `CHECK (resolved_at IS NULL OR resolved_at >= submitted_at)`

- `version_id` → `document_versions.id`
- `submitted_by` → `users.id`
- `resolved_by` → `users.id`

## ownership_transfers

Lịch sử bàn giao giáo trình; không đổi tác giả hoặc chủ ghi chú.

| Trường | Kiểu | Khóa | Null | Ý nghĩa |
|---|---|---|---|---|
| id | bigint | PK | Không | Khóa chính do database cấp |
| document_id | bigint | FK | Không | Giáo trình được bàn giao |
| from_user_id | bigint | FK | Không | Chủ quản lý trước |
| to_user_id | bigint | FK | Không | Giảng viên nhận |
| performed_by | bigint | FK | Không | Admin xác nhận |
| reason | text | — | Không | Lý do bàn giao |
| created_at | timestamptz | — | Không | Thời điểm tạo, lưu theo UTC |

Ràng buộc: `CHECK (from_user_id <> to_user_id)`

- `document_id` → `documents.id`
- `from_user_id` → `users.id`
- `to_user_id` → `users.id`
- `performed_by` → `users.id`

## visibility_events

Nhật ký ẩn/khôi phục toàn tài liệu.

| Trường | Kiểu | Khóa | Null | Ý nghĩa |
|---|---|---|---|---|
| id | bigint | PK | Không | Khóa chính do database cấp |
| document_id | bigint | FK | Không | Tài liệu bị tác động |
| performed_by | bigint | FK | Không | Admin xử lý |
| from_visibility | varchar(8) | — | Không | Trạng thái trước |
| to_visibility | varchar(8) | — | Không | Trạng thái sau |
| reason | text | — | Không | Căn cứ quyết định |
| created_at | timestamptz | — | Không | Thời điểm tạo, lưu theo UTC |

Ràng buộc: `CHECK (from_visibility <> to_visibility)`

- `document_id` → `documents.id`
- `performed_by` → `users.id`

## annotations

Triển khai 12/10/2026 bổ sung `request_id uuid NOT NULL DEFAULT gen_random_uuid()` và unique `(user_id, request_id)` bằng migration `202610120001_annotation_request_id`. UUID không phải token; cùng owner/request/body trả lại note đã tạo để retry sau mất response. Dữ liệu baseline bên dưới giữ nguyên; Prisma schema/migrations là nguồn triển khai. API hiện chỉ hỗ trợ PAGE_NOTE plain text 1–4000 ký tự, kiểm tra trang và revision. Không log/audit nội dung riêng.

Ghi chú riêng gắn người, phiên bản và trang; không gắn sang current_version tự động.

| Trường | Kiểu | Khóa | Null | Ý nghĩa |
|---|---|---|---|---|
| id | bigint | PK | Không | Khóa chính do database cấp |
| user_id | bigint | FK | Không | Chủ ghi chú; backend luôn lọc theo tài khoản phiên |
| version_id | bigint | FK | Không | Phiên bản PDF gốc |
| page_number | integer | — | Không | Trang bắt đầu từ 1, không quá page_count |
| kind | varchar(16) | — | Không | Ghi chú theo trang hoặc highlight chữ |
| content | text | — | Không | Nội dung riêng tư; không đưa vào audit/log |
| anchor | jsonb | — | Có | Highlight: quads và quote trên trang gốc chưa xoay, chuẩn hóa 0..1 |
| color | varchar(7) | — | Không | Màu hiển thị |
| created_at | timestamptz | — | Không | Thời điểm tạo, lưu theo UTC |
| updated_at | timestamptz | — | Không | Ứng dụng cập nhật khi ghi thay đổi |
| revision | integer | — | Không | Khóa kiểm soát cập nhật đồng thời; mỗi lần ghi tăng 1 |

Ràng buộc: `CHECK ((kind = 'PAGE_NOTE' AND btrim(content) <> '' AND anchor IS NULL) OR (kind = 'TEXT_HIGHLIGHT' AND anchor IS NOT NULL AND jsonb_typeof(anchor) = 'object' AND anchor ? 'quads' AND jsonb_typeof(anchor->'quads') = 'array' AND jsonb_array_length(anchor->'quads') > 0))`

- `user_id` → `users.id`
- `version_id` → `document_versions.id`

## reading_progress

Một tiến độ cho mỗi người và mỗi phiên bản, không ghi đè bản cũ khi có bản mới.

| Trường | Kiểu | Khóa | Null | Ý nghĩa |
|---|---|---|---|---|
| user_id | bigint | PK,FK | Không | Người đọc |
| version_id | bigint | PK,FK | Không | Phiên bản đang đọc |
| page_number | integer | — | Không | Trang hiện tại |
| page_offset | numeric(6,5) | — | Không | Vị trí tương đối trong trang |
| updated_at | timestamptz | — | Không | Ứng dụng cập nhật khi ghi thay đổi |
| revision | integer | — | Không | Khóa kiểm soát cập nhật đồng thời; mỗi lần ghi tăng 1 |

Ràng buộc: `PRIMARY KEY (user_id, version_id)`

- `user_id` → `users.id`
- `version_id` → `document_versions.id`

## saved_documents

Lưu theo tài liệu để theo dõi bản mới; bỏ lưu không xóa ghi chú hoặc tiến độ.

| Trường | Kiểu | Khóa | Null | Ý nghĩa |
|---|---|---|---|---|
| user_id | bigint | PK,FK | Không | Chủ thư viện |
| document_id | bigint | PK,FK | Không | Tài liệu đã lưu |
| created_at | timestamptz | — | Không | Thời điểm tạo, lưu theo UTC |

Ràng buộc: `PRIMARY KEY (user_id, document_id)`

- `user_id` → `users.id`
- `document_id` → `documents.id`

## books

Metadata sách và nguồn ngoài; không giả định có PDF hoặc tồn kho.

| Trường | Kiểu | Khóa | Null | Ý nghĩa |
|---|---|---|---|---|
| id | bigint | PK | Không | Khóa chính do database cấp |
| title | varchar(300) | — | Không | Tên sách |
| authors | text | — | Không | Tác giả hiển thị |
| publisher | varchar(200) | — | Có | Nhà xuất bản nếu biết |
| publication_year | smallint | — | Có | Năm xuất bản |
| edition | varchar(80) | — | Có | Ấn bản |
| isbn | varchar(20) | — | Có | ISBN nếu biết; không tự gộp ấn bản |
| source_provider | varchar(100) | — | Không | Tên nguồn danh mục |
| external_id | varchar(150) | — | Có | ID sách tại nguồn nếu có |
| source_url | text | — | Không | Liên kết HTTPS/HTTP; backend xác thực và mở an toàn |
| metadata_rights_basis | text | — | Không | Căn cứ được sử dụng thông tin danh mục |
| native_document_id | bigint | FK | Có | Tài liệu nội bộ có quyền phục vụ, nếu có; vẫn kiểm tra quyền riêng |
| checked_at | timestamptz | — | Có | Lần kiểm tra nguồn gần nhất |
| is_active | boolean | — | Không | Ngừng hiển thị bản ghi |
| managed_by | bigint | FK | Không | Admin biên tập |
| created_at | timestamptz | — | Không | Thời điểm tạo, lưu theo UTC |
| updated_at | timestamptz | — | Không | Ứng dụng cập nhật khi ghi thay đổi |
| revision | integer | — | Không | Khóa kiểm soát cập nhật đồng thời; mỗi lần ghi tăng 1 |
- `native_document_id` → `documents.id`
- `managed_by` → `users.id`

## book_courses

Gợi ý sách theo học phần; độc lập với môn của một PDF.

| Trường | Kiểu | Khóa | Null | Ý nghĩa |
|---|---|---|---|---|
| book_id | bigint | PK,FK | Không | Sách |
| course_id | bigint | PK,FK | Không | Môn liên quan |

Ràng buộc: `PRIMARY KEY (book_id, course_id)`

- `book_id` → `books.id`
- `course_id` → `courses.id`

## reports

Báo cáo một tài liệu hoặc một sách; version_id chỉ rõ bản PDF nếu cần.

| Trường | Kiểu | Khóa | Null | Ý nghĩa |
|---|---|---|---|---|
| id | bigint | PK | Không | Khóa chính do database cấp |
| reported_by | bigint | FK | Không | Người báo cáo |
| document_id | bigint | FK | Có | Tài liệu bị báo cáo |
| version_id | bigint | FK | Có | Phiên bản cụ thể của document_id, nếu có |
| book_id | bigint | FK | Có | Sách bị báo cáo, loại trừ document_id |
| category | varchar(20) | — | Không | Loại vấn đề |
| description | text | — | Không | Mô tả; không tự đính kèm ghi chú riêng |
| status | varchar(12) | — | Không | Tiến trình xử lý báo cáo |
| created_at | timestamptz | — | Không | Thời điểm tạo, lưu theo UTC |
| updated_at | timestamptz | — | Không | Ứng dụng cập nhật khi ghi thay đổi |
| revision | integer | — | Không | Khóa kiểm soát cập nhật đồng thời; mỗi lần ghi tăng 1 |

Ràng buộc: `CHECK ((document_id IS NOT NULL)::integer + (book_id IS NOT NULL)::integer = 1)`; `CHECK (version_id IS NULL OR document_id IS NOT NULL)`; `FOREIGN KEY (document_id, version_id) REFERENCES document_versions(document_id, id) ON DELETE RESTRICT`

- `reported_by` → `users.id`
- `document_id` → `documents.id`
- `version_id` → `document_versions.id`; FK thực tế dùng cặp document_id và version_id.
- `book_id` → `books.id`

## report_actions

Lịch sử xử lý báo cáo; quyết định ẩn liên kết visibility_events.

| Trường | Kiểu | Khóa | Null | Ý nghĩa |
|---|---|---|---|---|
| id | bigint | PK | Không | Khóa chính do database cấp |
| report_id | bigint | FK | Không | Báo cáo |
| performed_by | bigint | FK | Không | Admin xử lý |
| action | varchar(20) | — | Không | Loại xử lý |
| result | text | — | Không | Kết quả được phép hiển thị cho người báo cáo |
| visibility_event_id | bigint | FK | Có | Quyết định ẩn liên quan nếu có |
| created_at | timestamptz | — | Không | Thời điểm tạo, lưu theo UTC |
- `report_id` → `reports.id`
- `performed_by` → `users.id`
- `visibility_event_id` → `visibility_events.id`

## audit_events

Nhật ký kỹ thuật có danh sách trường cho phép; không chứa mật khẩu, token hoặc ghi chú.

| Trường | Kiểu | Khóa | Null | Ý nghĩa |
|---|---|---|---|---|
| id | bigint | PK | Không | Khóa chính do database cấp |
| actor_id | bigint | FK | Có | Người thực hiện; null cho tác vụ nền |
| event_type | varchar(80) | — | Không | Ví dụ ACCOUNT_LOCKED, ASSIGNMENT_REVOKED |
| entity_type | varchar(80) | — | Không | Tên loại đối tượng |
| entity_id | bigint | — | Không | ID đối tượng; tham chiếu đa hình không có FK |
| reason_code | varchar(80) | — | Có | Mã lý do, không lưu payload tùy ý |
| request_id | varchar(100) | — | Có | ID tương quan request, không phải token |
| created_at | timestamptz | — | Không | Thời điểm tạo, lưu theo UTC |
- `actor_id` → `users.id`

## Phân chia trách nhiệm

- **Database:** PK, NOT NULL, CHECK giá trị trạng thái; FK và quan hệ phiên bản thuộc tài liệu; unique email, số phiên bản, mục lưu và tiến độ.
- **Database:** Partial unique: một phân công chưa thu hồi mỗi giảng viên/môn, một bản đang làm mỗi tài liệu và một lần duyệt PENDING mỗi phiên bản.
- **Database:** Trigger đóng băng bản đã APPROVED/REJECTED và payload đang SUBMITTED; bảo vệ các môn của snapshot, danh tính file và tác giả gốc. Con trỏ hiện hành phải cùng tài liệu và APPROVED ở cuối giao dịch.
- **Backend:** Kiểm tra ACTIVE, verified_at, role hiện tại, sở hữu và tất cả phân công ở mỗi thao tác. FK user không chứng minh người đó là giảng viên/admin đang hoạt động.
- **Backend:** Kiểm tra quyền nguồn, SAFE, thời hạn quyền, VISIBLE và APPROVED tại mỗi lần cấp file. Preview riêng theo quyền quản lý chỉ khi file SAFE. Kiểm tra MIME thật và bảo vệ object storage.
- **Backend:** page_number không vượt page_count; highlight có lớp chữ ở trang đó, quads đúng cấu trúc và nằm trong 0..1. SQL chỉ kiểm tra dạng JSON cơ bản và trang dương.
- **Backend:** Cập nhật revision theo WHERE id = ? AND revision = ?; không ghi đè xung đột. Giữ admin hoạt động cuối cùng bằng khóa giao dịch chung trước thay role/trạng thái.
- **Backend:** Chuyển trạng thái hợp lệ, lịch sử append only, hạn mức upload, chống spam, token một lần/hết hạn và thu hồi session. Không cho role ADMIN đọc ghi chú của người khác.
- **Kho file:** object_key là khóa riêng tư bất biến; không ghi đè bytes tại cùng khóa. Hash và kiểm tra malware thực tế không được suy ra từ metadata SQL.

## Giao dịch trọng yếu

### Gửi duyệt

Khóa documents rồi phiên bản; kiểm tra quyền và revision. Với bản bị yêu cầu sửa, bắt đầu chỉnh sửa đưa về DRAFT. Kiểm tra SAFE, nguồn/quyền và ít nhất một môn; tăng revision khi chuyển SUBMITTED rồi tạo publication_requests PENDING với đúng submitted_revision.

### Duyệt công bố

Khóa documents, phiên bản rồi request theo thứ tự cố định. So sánh request PENDING, phiên bản SUBMITTED và submitted_revision. Kiểm tra lại SAFE, môn/phân công và quyền; kết thúc request, đổi phiên bản APPROVED và current_version_id trong cùng giao dịch. Giữ HIDDEN nếu tài liệu đang ẩn.

### Rút và gửi lại

Cùng khóa với duyệt. Kết thúc request bằng WITHDRAWN, ghi người/lý do; đưa phiên bản về DRAFT và tăng revision. Gửi lại tạo request mới, giữ nguyên lần gửi trước. Khi admin yêu cầu sửa, request kết thúc CHANGES_REQUIRED; phiên bản cũng mang trạng thái đó tới khi bắt đầu sửa.

### Bàn giao giảng viên

Khóa document trước các phiên bản/request. Chỉ LECTURER_MATERIAL; kiểm tra revision và người nhận ACTIVE, LECTURER, có mọi môn liên quan. Đổi manager; kết thúc request PENDING bằng WITHDRAWN với lý do bàn giao; bản SUBMITTED về DRAFT, tăng revision. Ghi ownership_transfers và audit trong cùng giao dịch; giữ file, tác giả, ghi chú và bản công bố.

### Ẩn hoặc khôi phục

Khóa document, kiểm tra revision và lý do. Cập nhật visibility, visibility_events, audit cùng giao dịch. Khôi phục cần bản hiện hành APPROVED và SAFE, quyền hợp lệ; kiểm tra riêng bản cũ khi được yêu cầu đọc. Dừng lượt cấp file mới, không hứa thu hồi file đã tải.

### Ghi chú và tiến độ

Lọc owner bằng user trong phiên máy chủ, kiểm tra quyền đọc phiên bản và page_count, cập nhật theo revision. Anchor dùng tọa độ chuẩn hóa 0..1 trên trang PDF gốc chưa xoay; không lấy tọa độ màn hình. Nội dung ghi chú không vào audit hoặc thông báo cho giảng viên.

## Chỉ mục

```sql
CREATE UNIQUE INDEX ux_active_assignment ON lecturer_assignments(lecturer_id, course_id) WHERE revoked_at IS NULL;
CREATE INDEX ix_assignment_course ON lecturer_assignments(course_id) WHERE revoked_at IS NULL;
CREATE INDEX ix_session_user ON auth_sessions(user_id) WHERE revoked_at IS NULL;
CREATE INDEX ix_reset_user ON password_reset_tokens(user_id) WHERE used_at IS NULL;
CREATE INDEX ix_program_course_reverse ON program_courses(course_id, program_id);
CREATE INDEX ix_document_manager ON documents(manager_id, kind);
CREATE INDEX ix_file_hash ON files(sha256);
CREATE UNIQUE INDEX ux_one_working_version ON document_versions(document_id) WHERE review_status IN ('DRAFT','SUBMITTED','CHANGES_REQUIRED');
CREATE INDEX ix_version_file ON document_versions(file_id);
CREATE INDEX ix_version_metadata ON document_versions USING gin(to_tsvector('simple', search_text));
CREATE INDEX ix_version_course_reverse ON version_courses(course_id, version_id);
CREATE UNIQUE INDEX ux_one_pending_request ON publication_requests(version_id) WHERE status = 'PENDING';
CREATE INDEX ix_request_queue ON publication_requests(status, submitted_at);
CREATE INDEX ix_request_submitter ON publication_requests(submitted_by, submitted_at DESC);
CREATE INDEX ix_transfer_document ON ownership_transfers(document_id, created_at DESC);
CREATE INDEX ix_visibility_document ON visibility_events(document_id, created_at DESC);
CREATE INDEX ix_annotation_owner_page ON annotations(user_id, version_id, page_number);
CREATE INDEX ix_annotation_version ON annotations(version_id);
CREATE INDEX ix_progress_version ON reading_progress(version_id);
CREATE INDEX ix_saved_document ON saved_documents(document_id);
CREATE UNIQUE INDEX ux_book_source ON books(lower(source_provider), external_id) WHERE external_id IS NOT NULL;
CREATE INDEX ix_book_course_reverse ON book_courses(course_id, book_id);
CREATE INDEX ix_report_owner ON reports(reported_by, created_at DESC);
CREATE INDEX ix_report_queue ON reports(status, created_at);
CREATE INDEX ix_report_document ON reports(document_id, version_id);
CREATE INDEX ix_report_book ON reports(book_id);
CREATE INDEX ix_report_action ON report_actions(report_id, created_at);
CREATE INDEX ix_audit_entity ON audit_events(entity_type, entity_id, created_at DESC);
```

GIN chỉ tìm metadata chuẩn hóa, không phải toàn văn PDF. Backend tạo search_text và chuẩn hóa truy vấn cùng quy tắc tiếng Việt. Chỉ mục không tự chứng minh đáp ứng mục tiêu hiệu năng; cần đo trên dữ liệu và môi trường thực.

## Truy vết use case

| Use case | Bảng | Mục đích |
|---|---|---|
| UC01–UC04 | users, auth_sessions, password_reset_tokens | Đăng nhập, xác minh, khóa/role và khôi phục mật khẩu |
| UC05–UC06 | faculties, programs, courses, program_courses, lecturer_assignments, ownership_transfers | Danh mục, phân công và bàn giao |
| UC07–UC10 | documents, document_versions, version_courses, files, annotations, reading_progress | Tìm, đọc, ghi chú và tải |
| UC11–UC12 | saved_documents, annotations, reading_progress, books, book_courses | Thư viện cá nhân và nguồn sách |
| UC13–UC18 | documents, document_versions, files, version_courses, publication_requests | Đóng góp, biên soạn, phiên bản và công bố |
| UC19–UC21 | visibility_events, reports, report_actions, audit_events | Ẩn/khôi phục, báo cáo và xử lý |
| UC22 | books, book_courses, documents | Biên tập danh mục sách và liên kết PDF được phép |

## Giới hạn kiểm chứng

Kết quả chạy schema và ca kiểm tra database tạm được ghi ở docs/_qa/data_design_validation.json. Chưa có backend, RLS, kho PDF hoặc migration lên database triển khai. Fixture rollback không phải seed data lâu dài.

## Tài liệu kỹ thuật

- PostgreSQL Constraints: https://www.postgresql.org/docs/18/ddl-constraints.html
- PostgreSQL CREATE TRIGGER: https://www.postgresql.org/docs/18/sql-createtrigger.html
