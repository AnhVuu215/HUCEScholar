-- HUCEScholar reference schema 1.0 / 2026-10-10

-- Target: PostgreSQL. Run only against a separate empty database.

-- No DROP, seed data, database credentials or external file downloads.

BEGIN;

CREATE SCHEMA hucescholar;

REVOKE ALL ON SCHEMA hucescholar FROM PUBLIC;

SET LOCAL search_path = hucescholar, pg_catalog;

CREATE TABLE users (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email varchar(254) NOT NULL,
  display_name varchar(150) NOT NULL CHECK (btrim(display_name) <> ''),
  password_hash text NOT NULL,
  role varchar(12) NOT NULL CHECK (role IN ('ADMIN','LECTURER','STUDENT')),
  status varchar(12) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','ACTIVE','LOCKED')),
  verified_at timestamptz,
  verified_by bigint REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  UNIQUE (email),
  CHECK (email = lower(btrim(email)) AND position('@' in email) > 1),
  CHECK (status <> 'ACTIVE' OR verified_at IS NOT NULL)
);

COMMENT ON TABLE users IS 'Tài khoản nội bộ; một role chính cho MVP, chưa có SSO hoặc tự đăng ký.';

COMMENT ON COLUMN users.id IS 'Khóa chính do database cấp';

COMMENT ON COLUMN users.email IS 'Lưu lowercase sau trim; định danh đăng nhập duy nhất';

COMMENT ON COLUMN users.display_name IS 'Tên hiển thị';

COMMENT ON COLUMN users.password_hash IS 'Hash mật khẩu; không lưu mật khẩu gốc';

COMMENT ON COLUMN users.role IS 'Role chính; thay role chỉ do admin';

COMMENT ON COLUMN users.status IS 'Chỉ ACTIVE và đã xác minh mới sử dụng học liệu';

COMMENT ON COLUMN users.verified_at IS 'Admin xác minh thuộc nhóm người dùng hợp lệ';

COMMENT ON COLUMN users.verified_by IS 'Admin thực hiện xác minh; bootstrap admin đầu tiên có thể null';

COMMENT ON COLUMN users.created_at IS 'Thời điểm tạo, lưu theo UTC';

COMMENT ON COLUMN users.updated_at IS 'Ứng dụng cập nhật khi ghi thay đổi';

COMMENT ON COLUMN users.revision IS 'Khóa kiểm soát cập nhật đồng thời; mỗi lần ghi tăng 1';

CREATE TABLE auth_sessions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id bigint NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  token_hash varchar(128) NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  CHECK (expires_at > created_at),
  CHECK (revoked_at IS NULL OR revoked_at >= created_at)
);

COMMENT ON TABLE auth_sessions IS 'Phiên web có thể thu hồi; có thể ánh xạ sang cơ chế session của framework.';

COMMENT ON COLUMN auth_sessions.id IS 'Khóa chính do database cấp';

COMMENT ON COLUMN auth_sessions.user_id IS 'Chủ phiên';

COMMENT ON COLUMN auth_sessions.token_hash IS 'Hash token ngẫu nhiên; không lưu cookie gốc';

COMMENT ON COLUMN auth_sessions.created_at IS 'Thời điểm tạo, lưu theo UTC';

COMMENT ON COLUMN auth_sessions.expires_at IS 'Hết hạn phiên';

COMMENT ON COLUMN auth_sessions.revoked_at IS 'Thu hồi khi đăng xuất, khóa tài khoản hoặc reset mật khẩu';

CREATE TABLE password_reset_tokens (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id bigint NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  token_hash varchar(128) NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  CHECK (expires_at > created_at),
  CHECK (used_at IS NULL OR used_at >= created_at)
);

COMMENT ON TABLE password_reset_tokens IS 'Token đặt lại mật khẩu một lần; không thay đổi trạng thái khóa tài khoản.';

COMMENT ON COLUMN password_reset_tokens.id IS 'Khóa chính do database cấp';

COMMENT ON COLUMN password_reset_tokens.user_id IS 'Tài khoản cần khôi phục';

COMMENT ON COLUMN password_reset_tokens.token_hash IS 'Hash token khôi phục';

COMMENT ON COLUMN password_reset_tokens.created_at IS 'Thời điểm tạo, lưu theo UTC';

COMMENT ON COLUMN password_reset_tokens.expires_at IS 'Thời điểm hết hạn';

COMMENT ON COLUMN password_reset_tokens.used_at IS 'Đánh dấu đã tiêu thụ trong giao dịch reset';

CREATE TABLE faculties (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code varchar(30) NOT NULL UNIQUE,
  name varchar(200) NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE faculties IS 'Khoa hoặc đơn vị quản lý học phần.';

COMMENT ON COLUMN faculties.id IS 'Khóa chính do database cấp';

COMMENT ON COLUMN faculties.code IS 'Mã nội bộ; không tự nhận là mã chính thức';

COMMENT ON COLUMN faculties.name IS 'Tên đơn vị';

COMMENT ON COLUMN faculties.is_active IS 'Ngừng sử dụng thay vì xóa dữ liệu đang được tham chiếu';

COMMENT ON COLUMN faculties.created_at IS 'Thời điểm tạo, lưu theo UTC';

CREATE TABLE programs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  faculty_id bigint NOT NULL REFERENCES faculties(id) ON DELETE RESTRICT,
  code varchar(30) NOT NULL UNIQUE,
  name varchar(200) NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE programs IS 'Ngành hoặc chương trình thuộc một khoa.';

COMMENT ON COLUMN programs.id IS 'Khóa chính do database cấp';

COMMENT ON COLUMN programs.faculty_id IS 'Khoa quản lý';

COMMENT ON COLUMN programs.code IS 'Mã chương trình';

COMMENT ON COLUMN programs.name IS 'Tên chương trình';

COMMENT ON COLUMN programs.is_active IS 'Trạng thái sử dụng';

COMMENT ON COLUMN programs.created_at IS 'Thời điểm tạo, lưu theo UTC';

CREATE TABLE courses (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  faculty_id bigint NOT NULL REFERENCES faculties(id) ON DELETE RESTRICT,
  code varchar(30) NOT NULL UNIQUE,
  name varchar(200) NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0)
);

COMMENT ON TABLE courses IS 'Học phần; có thể dùng chung giữa nhiều chương trình.';

COMMENT ON COLUMN courses.id IS 'Khóa chính do database cấp';

COMMENT ON COLUMN courses.faculty_id IS 'Đơn vị quản lý học phần';

COMMENT ON COLUMN courses.code IS 'Mã học phần';

COMMENT ON COLUMN courses.name IS 'Tên học phần';

COMMENT ON COLUMN courses.is_active IS 'Trạng thái sử dụng';

COMMENT ON COLUMN courses.created_at IS 'Thời điểm tạo, lưu theo UTC';

COMMENT ON COLUMN courses.revision IS 'Khóa kiểm soát cập nhật đồng thời; mỗi lần ghi tăng 1';

CREATE TABLE program_courses (
  program_id bigint NOT NULL REFERENCES programs(id) ON DELETE RESTRICT,
  course_id bigint NOT NULL REFERENCES courses(id) ON DELETE RESTRICT,
  PRIMARY KEY (program_id, course_id)
);

COMMENT ON TABLE program_courses IS 'Bảng nối chương trình và học phần nhiều–nhiều.';

COMMENT ON COLUMN program_courses.program_id IS 'Chương trình';

COMMENT ON COLUMN program_courses.course_id IS 'Học phần';

CREATE TABLE lecturer_assignments (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  lecturer_id bigint NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  course_id bigint NOT NULL REFERENCES courses(id) ON DELETE RESTRICT,
  assigned_by bigint NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  revoked_by bigint REFERENCES users(id) ON DELETE RESTRICT,
  reason text,
  CHECK (revoked_at IS NULL OR revoked_at >= assigned_at),
  CHECK ((revoked_at IS NULL) = (revoked_by IS NULL))
);

COMMENT ON TABLE lecturer_assignments IS 'Lưu cả phân công hiện hành và lịch sử thu hồi.';

COMMENT ON COLUMN lecturer_assignments.id IS 'Khóa chính do database cấp';

COMMENT ON COLUMN lecturer_assignments.lecturer_id IS 'Giảng viên; backend kiểm tra role và ACTIVE';

COMMENT ON COLUMN lecturer_assignments.course_id IS 'Học phần phụ trách';

COMMENT ON COLUMN lecturer_assignments.assigned_by IS 'Admin phân công';

COMMENT ON COLUMN lecturer_assignments.assigned_at IS 'Bắt đầu phân công';

COMMENT ON COLUMN lecturer_assignments.revoked_at IS 'Null là chưa thu hồi';

COMMENT ON COLUMN lecturer_assignments.revoked_by IS 'Admin thu hồi';

COMMENT ON COLUMN lecturer_assignments.reason IS 'Lý do thay đổi';

CREATE TABLE documents (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kind varchar(20) NOT NULL CHECK (kind IN ('LECTURER_MATERIAL','STUDENT_SUPPLEMENT')),
  created_by bigint NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  manager_id bigint NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  visibility varchar(8) NOT NULL DEFAULT 'VISIBLE' CHECK (visibility IN ('VISIBLE','HIDDEN')),
  current_version_id bigint,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  UNIQUE (current_version_id)
);

COMMENT ON TABLE documents IS 'Danh tính ổn định của học liệu; sở hữu hiện tại và trạng thái ẩn thuộc tài liệu.';

COMMENT ON COLUMN documents.id IS 'Khóa chính do database cấp';

COMMENT ON COLUMN documents.kind IS 'Giáo trình giảng viên hoặc tài liệu sinh viên bổ sung';

COMMENT ON COLUMN documents.created_by IS 'Người tạo gốc; không đổi khi bàn giao';

COMMENT ON COLUMN documents.manager_id IS 'Chủ quản lý hiện tại; không dùng làm nhãn tác giả';

COMMENT ON COLUMN documents.visibility IS 'Ẩn toàn tài liệu và mọi phiên bản';

COMMENT ON COLUMN documents.current_version_id IS 'Bản đã duyệt hiện hành; null trước công bố đầu tiên';

COMMENT ON COLUMN documents.created_at IS 'Thời điểm tạo, lưu theo UTC';

COMMENT ON COLUMN documents.updated_at IS 'Ứng dụng cập nhật khi ghi thay đổi';

COMMENT ON COLUMN documents.revision IS 'Khóa kiểm soát cập nhật đồng thời; mỗi lần ghi tăng 1';

CREATE TABLE files (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  uploaded_by bigint NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  object_key varchar(500) NOT NULL UNIQUE,
  original_name varchar(255) NOT NULL,
  mime_type varchar(80) NOT NULL DEFAULT 'application/pdf' CHECK (mime_type = 'application/pdf'),
  byte_size bigint NOT NULL CHECK (byte_size > 0),
  sha256 char(64) NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  scan_status varchar(8) NOT NULL DEFAULT 'CHECKING' CHECK (scan_status IN ('CHECKING','SAFE','FAILED')),
  page_count integer CHECK (page_count > 0),
  has_text_layer boolean,
  checked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (scan_status <> 'SAFE' OR (page_count IS NOT NULL AND checked_at IS NOT NULL AND has_text_layer IS NOT NULL))
);

COMMENT ON TABLE files IS 'Metadata của PDF trong kho riêng tư; database không chứa bytes của file.';

COMMENT ON COLUMN files.id IS 'Khóa chính do database cấp';

COMMENT ON COLUMN files.uploaded_by IS 'Người upload gốc';

COMMENT ON COLUMN files.object_key IS 'Khóa đối tượng bất biến, không phải URL công khai';

COMMENT ON COLUMN files.original_name IS 'Tên file đã làm sạch để hiển thị/tải';

COMMENT ON COLUMN files.mime_type IS 'Khai báo MIME; không thay việc kiểm tra bytes';

COMMENT ON COLUMN files.byte_size IS 'Dung lượng; hạn mức upload do cấu hình dịch vụ';

COMMENT ON COLUMN files.sha256 IS 'Hash xác minh file; không UNIQUE vì không tự gộp bản trùng';

COMMENT ON COLUMN files.scan_status IS 'Kết quả kiểm tra kỹ thuật hiện hành';

COMMENT ON COLUMN files.page_count IS 'Số trang được parser xác định';

COMMENT ON COLUMN files.has_text_layer IS 'Khả năng highlight cần kiểm tra thêm ở từng trang';

COMMENT ON COLUMN files.checked_at IS 'Thời điểm hoàn thành kiểm tra';

COMMENT ON COLUMN files.created_at IS 'Thời điểm tạo, lưu theo UTC';

CREATE TABLE document_versions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  document_id bigint NOT NULL REFERENCES documents(id) ON DELETE RESTRICT,
  version_no integer NOT NULL CHECK (version_no > 0),
  file_id bigint NOT NULL REFERENCES files(id) ON DELETE RESTRICT,
  created_by bigint NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  title varchar(300) NOT NULL CHECK (btrim(title) <> ''),
  authors text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  material_type varchar(20) NOT NULL CHECK (material_type IN ('TEXTBOOK','LECTURE','EXERCISE','EXAM','REFERENCE','OTHER')),
  publication_year smallint CHECK (publication_year BETWEEN 1000 AND 9999),
  source_reference text NOT NULL,
  rights_basis text NOT NULL,
  rights_valid_until timestamptz,
  download_allowed boolean NOT NULL DEFAULT false,
  review_status varchar(20) NOT NULL DEFAULT 'DRAFT' CHECK (review_status IN ('DRAFT','SUBMITTED','CHANGES_REQUIRED','APPROVED','REJECTED')),
  change_summary text NOT NULL DEFAULT '',
  search_text text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  UNIQUE (document_id, version_no),
  UNIQUE (document_id, id)
);

COMMENT ON TABLE document_versions IS 'Snapshot file, metadata và quyền. Bản APPROVED/REJECTED bất biến; sửa bằng bản mới.';

COMMENT ON COLUMN document_versions.id IS 'Khóa chính do database cấp';

COMMENT ON COLUMN document_versions.document_id IS 'Tài liệu gốc';

COMMENT ON COLUMN document_versions.version_no IS 'Số thứ tự tăng trong tài liệu; cấp dưới khóa tài liệu';

COMMENT ON COLUMN document_versions.file_id IS 'PDF của phiên bản';

COMMENT ON COLUMN document_versions.created_by IS 'Người tạo snapshot gốc';

COMMENT ON COLUMN document_versions.title IS 'Tiêu đề của phiên bản';

COMMENT ON COLUMN document_versions.authors IS 'Nhãn tác giả học thuật; tách khỏi tài khoản quản lý';

COMMENT ON COLUMN document_versions.description IS 'Mô tả học liệu';

COMMENT ON COLUMN document_versions.material_type IS 'Loại học liệu';

COMMENT ON COLUMN document_versions.publication_year IS 'Năm tài liệu nếu biết';

COMMENT ON COLUMN document_versions.source_reference IS 'Nguồn hoặc dẫn chứng; có thể hoàn thiện khi còn nháp';

COMMENT ON COLUMN document_versions.rights_basis IS 'Căn cứ được chia sẻ/đọc/tải; bắt buộc có nội dung trước gửi duyệt';

COMMENT ON COLUMN document_versions.rights_valid_until IS 'Hết hạn căn cứ nếu có; null không tự chứng minh quyền vô thời hạn';

COMMENT ON COLUMN document_versions.download_allowed IS 'Được tải file gốc khi còn đủ quyền đọc';

COMMENT ON COLUMN document_versions.review_status IS 'Trạng thái xét công bố của phiên bản';

COMMENT ON COLUMN document_versions.change_summary IS 'Mô tả thay đổi so với bản trước';

COMMENT ON COLUMN document_versions.search_text IS 'Metadata đã chuẩn hóa tiếng Việt có/không dấu do ứng dụng tạo';

COMMENT ON COLUMN document_versions.created_at IS 'Thời điểm tạo, lưu theo UTC';

COMMENT ON COLUMN document_versions.updated_at IS 'Ứng dụng cập nhật khi ghi thay đổi';

COMMENT ON COLUMN document_versions.revision IS 'Khóa kiểm soát cập nhật đồng thời; mỗi lần ghi tăng 1';

CREATE TABLE version_courses (
  version_id bigint NOT NULL REFERENCES document_versions(id) ON DELETE RESTRICT,
  course_id bigint NOT NULL REFERENCES courses(id) ON DELETE RESTRICT,
  PRIMARY KEY (version_id, course_id)
);

COMMENT ON TABLE version_courses IS 'Học phần gắn với snapshot, tránh thay môn của bản đã công bố.';

COMMENT ON COLUMN version_courses.version_id IS 'Phiên bản';

COMMENT ON COLUMN version_courses.course_id IS 'Học phần';

CREATE TABLE publication_requests (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  version_id bigint NOT NULL REFERENCES document_versions(id) ON DELETE RESTRICT,
  submitted_by bigint NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  submitted_revision integer NOT NULL CHECK (submitted_revision > 0),
  submitted_at timestamptz NOT NULL DEFAULT now(),
  status varchar(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','WITHDRAWN','APPROVED','CHANGES_REQUIRED','REJECTED')),
  resolved_by bigint REFERENCES users(id) ON DELETE RESTRICT,
  resolved_at timestamptz,
  reason text,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  CHECK ((status = 'PENDING' AND resolved_by IS NULL AND resolved_at IS NULL) OR (status <> 'PENDING' AND resolved_by IS NOT NULL AND resolved_at IS NOT NULL)),
  CHECK (status NOT IN ('WITHDRAWN','CHANGES_REQUIRED','REJECTED') OR nullif(btrim(reason), '') IS NOT NULL),
  CHECK (resolved_at IS NULL OR resolved_at >= submitted_at)
);

COMMENT ON TABLE publication_requests IS 'Mỗi dòng là một lần gửi duyệt. Rút/sửa/gửi lại tạo dòng mới, giữ người gửi cũ.';

COMMENT ON COLUMN publication_requests.id IS 'Khóa chính do database cấp';

COMMENT ON COLUMN publication_requests.version_id IS 'Phiên bản được xét';

COMMENT ON COLUMN publication_requests.submitted_by IS 'Người thực sự gửi lần này';

COMMENT ON COLUMN publication_requests.submitted_revision IS 'Revision sau chuyển phiên bản sang SUBMITTED';

COMMENT ON COLUMN publication_requests.submitted_at IS 'Lúc gửi';

COMMENT ON COLUMN publication_requests.status IS 'Trạng thái của lần gửi, tách khỏi review_status của phiên bản';

COMMENT ON COLUMN publication_requests.resolved_by IS 'Người duyệt/rút; bàn giao là admin';

COMMENT ON COLUMN publication_requests.resolved_at IS 'Lúc kết thúc lần gửi';

COMMENT ON COLUMN publication_requests.reason IS 'Bắt buộc khi yêu cầu sửa/từ chối/rút';

COMMENT ON COLUMN publication_requests.revision IS 'Khóa kiểm soát cập nhật đồng thời; mỗi lần ghi tăng 1';

CREATE TABLE ownership_transfers (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  document_id bigint NOT NULL REFERENCES documents(id) ON DELETE RESTRICT,
  from_user_id bigint NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  to_user_id bigint NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  performed_by bigint NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  reason text NOT NULL CHECK (btrim(reason) <> ''),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (from_user_id <> to_user_id)
);

COMMENT ON TABLE ownership_transfers IS 'Lịch sử bàn giao giáo trình; không đổi tác giả hoặc chủ ghi chú.';

COMMENT ON COLUMN ownership_transfers.id IS 'Khóa chính do database cấp';

COMMENT ON COLUMN ownership_transfers.document_id IS 'Giáo trình được bàn giao';

COMMENT ON COLUMN ownership_transfers.from_user_id IS 'Chủ quản lý trước';

COMMENT ON COLUMN ownership_transfers.to_user_id IS 'Giảng viên nhận';

COMMENT ON COLUMN ownership_transfers.performed_by IS 'Admin xác nhận';

COMMENT ON COLUMN ownership_transfers.reason IS 'Lý do bàn giao';

COMMENT ON COLUMN ownership_transfers.created_at IS 'Thời điểm tạo, lưu theo UTC';

CREATE TABLE visibility_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  document_id bigint NOT NULL REFERENCES documents(id) ON DELETE RESTRICT,
  performed_by bigint NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  from_visibility varchar(8) NOT NULL CHECK (from_visibility IN ('VISIBLE','HIDDEN')),
  to_visibility varchar(8) NOT NULL CHECK (to_visibility IN ('VISIBLE','HIDDEN')),
  reason text NOT NULL CHECK (btrim(reason) <> ''),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (from_visibility <> to_visibility)
);

COMMENT ON TABLE visibility_events IS 'Nhật ký ẩn/khôi phục toàn tài liệu.';

COMMENT ON COLUMN visibility_events.id IS 'Khóa chính do database cấp';

COMMENT ON COLUMN visibility_events.document_id IS 'Tài liệu bị tác động';

COMMENT ON COLUMN visibility_events.performed_by IS 'Admin xử lý';

COMMENT ON COLUMN visibility_events.from_visibility IS 'Trạng thái trước';

COMMENT ON COLUMN visibility_events.to_visibility IS 'Trạng thái sau';

COMMENT ON COLUMN visibility_events.reason IS 'Căn cứ quyết định';

COMMENT ON COLUMN visibility_events.created_at IS 'Thời điểm tạo, lưu theo UTC';

CREATE TABLE annotations (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id bigint NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  version_id bigint NOT NULL REFERENCES document_versions(id) ON DELETE RESTRICT,
  page_number integer NOT NULL CHECK (page_number > 0),
  kind varchar(16) NOT NULL CHECK (kind IN ('PAGE_NOTE','TEXT_HIGHLIGHT')),
  content text NOT NULL DEFAULT '',
  anchor jsonb,
  color varchar(7) NOT NULL DEFAULT '#FFF59D' CHECK (color ~ '^#[0-9A-Fa-f]{6}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  CHECK ((kind = 'PAGE_NOTE' AND btrim(content) <> '' AND anchor IS NULL) OR (kind = 'TEXT_HIGHLIGHT' AND anchor IS NOT NULL AND jsonb_typeof(anchor) = 'object' AND anchor ? 'quads' AND jsonb_typeof(anchor->'quads') = 'array' AND jsonb_array_length(anchor->'quads') > 0))
);

COMMENT ON TABLE annotations IS 'Ghi chú riêng gắn người, phiên bản và trang; không gắn sang current_version tự động.';

COMMENT ON COLUMN annotations.id IS 'Khóa chính do database cấp';

COMMENT ON COLUMN annotations.user_id IS 'Chủ ghi chú; backend luôn lọc theo tài khoản phiên';

COMMENT ON COLUMN annotations.version_id IS 'Phiên bản PDF gốc';

COMMENT ON COLUMN annotations.page_number IS 'Trang bắt đầu từ 1, không quá page_count';

COMMENT ON COLUMN annotations.kind IS 'Ghi chú theo trang hoặc highlight chữ';

COMMENT ON COLUMN annotations.content IS 'Nội dung riêng tư; không đưa vào audit/log';

COMMENT ON COLUMN annotations.anchor IS 'Highlight: quads và quote trên trang gốc chưa xoay, chuẩn hóa 0..1';

COMMENT ON COLUMN annotations.color IS 'Màu hiển thị';

COMMENT ON COLUMN annotations.created_at IS 'Thời điểm tạo, lưu theo UTC';

COMMENT ON COLUMN annotations.updated_at IS 'Ứng dụng cập nhật khi ghi thay đổi';

COMMENT ON COLUMN annotations.revision IS 'Khóa kiểm soát cập nhật đồng thời; mỗi lần ghi tăng 1';

CREATE TABLE reading_progress (
  user_id bigint NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  version_id bigint NOT NULL REFERENCES document_versions(id) ON DELETE RESTRICT,
  page_number integer NOT NULL CHECK (page_number > 0),
  page_offset numeric(6,5) NOT NULL DEFAULT 0 CHECK (page_offset BETWEEN 0 AND 1),
  updated_at timestamptz NOT NULL DEFAULT now(),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  PRIMARY KEY (user_id, version_id)
);

COMMENT ON TABLE reading_progress IS 'Một tiến độ cho mỗi người và mỗi phiên bản, không ghi đè bản cũ khi có bản mới.';

COMMENT ON COLUMN reading_progress.user_id IS 'Người đọc';

COMMENT ON COLUMN reading_progress.version_id IS 'Phiên bản đang đọc';

COMMENT ON COLUMN reading_progress.page_number IS 'Trang hiện tại';

COMMENT ON COLUMN reading_progress.page_offset IS 'Vị trí tương đối trong trang';

COMMENT ON COLUMN reading_progress.updated_at IS 'Ứng dụng cập nhật khi ghi thay đổi';

COMMENT ON COLUMN reading_progress.revision IS 'Khóa kiểm soát cập nhật đồng thời; mỗi lần ghi tăng 1';

CREATE TABLE saved_documents (
  user_id bigint NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  document_id bigint NOT NULL REFERENCES documents(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, document_id)
);

COMMENT ON TABLE saved_documents IS 'Lưu theo tài liệu để theo dõi bản mới; bỏ lưu không xóa ghi chú hoặc tiến độ.';

COMMENT ON COLUMN saved_documents.user_id IS 'Chủ thư viện';

COMMENT ON COLUMN saved_documents.document_id IS 'Tài liệu đã lưu';

COMMENT ON COLUMN saved_documents.created_at IS 'Thời điểm tạo, lưu theo UTC';

CREATE TABLE books (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  title varchar(300) NOT NULL CHECK (btrim(title) <> ''),
  authors text NOT NULL DEFAULT '',
  publisher varchar(200),
  publication_year smallint CHECK (publication_year BETWEEN 1000 AND 9999),
  edition varchar(80),
  isbn varchar(20),
  source_provider varchar(100) NOT NULL,
  external_id varchar(150),
  source_url text NOT NULL,
  metadata_rights_basis text NOT NULL,
  native_document_id bigint REFERENCES documents(id) ON DELETE RESTRICT,
  checked_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  managed_by bigint NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0)
);

COMMENT ON TABLE books IS 'Metadata sách và nguồn ngoài; không giả định có PDF hoặc tồn kho.';

COMMENT ON COLUMN books.id IS 'Khóa chính do database cấp';

COMMENT ON COLUMN books.title IS 'Tên sách';

COMMENT ON COLUMN books.authors IS 'Tác giả hiển thị';

COMMENT ON COLUMN books.publisher IS 'Nhà xuất bản nếu biết';

COMMENT ON COLUMN books.publication_year IS 'Năm xuất bản';

COMMENT ON COLUMN books.edition IS 'Ấn bản';

COMMENT ON COLUMN books.isbn IS 'ISBN nếu biết; không tự gộp ấn bản';

COMMENT ON COLUMN books.source_provider IS 'Tên nguồn danh mục';

COMMENT ON COLUMN books.external_id IS 'ID sách tại nguồn nếu có';

COMMENT ON COLUMN books.source_url IS 'Liên kết HTTPS/HTTP; backend xác thực và mở an toàn';

COMMENT ON COLUMN books.metadata_rights_basis IS 'Căn cứ được sử dụng thông tin danh mục';

COMMENT ON COLUMN books.native_document_id IS 'Tài liệu nội bộ có quyền phục vụ, nếu có; vẫn kiểm tra quyền riêng';

COMMENT ON COLUMN books.checked_at IS 'Lần kiểm tra nguồn gần nhất';

COMMENT ON COLUMN books.is_active IS 'Ngừng hiển thị bản ghi';

COMMENT ON COLUMN books.managed_by IS 'Admin biên tập';

COMMENT ON COLUMN books.created_at IS 'Thời điểm tạo, lưu theo UTC';

COMMENT ON COLUMN books.updated_at IS 'Ứng dụng cập nhật khi ghi thay đổi';

COMMENT ON COLUMN books.revision IS 'Khóa kiểm soát cập nhật đồng thời; mỗi lần ghi tăng 1';

CREATE TABLE book_courses (
  book_id bigint NOT NULL REFERENCES books(id) ON DELETE RESTRICT,
  course_id bigint NOT NULL REFERENCES courses(id) ON DELETE RESTRICT,
  PRIMARY KEY (book_id, course_id)
);

COMMENT ON TABLE book_courses IS 'Gợi ý sách theo học phần; độc lập với môn của một PDF.';

COMMENT ON COLUMN book_courses.book_id IS 'Sách';

COMMENT ON COLUMN book_courses.course_id IS 'Môn liên quan';

CREATE TABLE reports (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  reported_by bigint NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  document_id bigint REFERENCES documents(id) ON DELETE RESTRICT,
  version_id bigint,
  book_id bigint REFERENCES books(id) ON DELETE RESTRICT,
  category varchar(20) NOT NULL CHECK (category IN ('FILE_ERROR','WRONG_COURSE','RIGHTS','CONTENT','BROKEN_LINK','OTHER')),
  description text NOT NULL CHECK (btrim(description) <> ''),
  status varchar(12) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','IN_REVIEW','RESOLVED','DISMISSED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  CHECK ((document_id IS NOT NULL)::integer + (book_id IS NOT NULL)::integer = 1),
  CHECK (version_id IS NULL OR document_id IS NOT NULL),
  FOREIGN KEY (document_id, version_id) REFERENCES document_versions(document_id, id) ON DELETE RESTRICT
);

COMMENT ON TABLE reports IS 'Báo cáo một tài liệu hoặc một sách; version_id chỉ rõ bản PDF nếu cần.';

COMMENT ON COLUMN reports.id IS 'Khóa chính do database cấp';

COMMENT ON COLUMN reports.reported_by IS 'Người báo cáo';

COMMENT ON COLUMN reports.document_id IS 'Tài liệu bị báo cáo';

COMMENT ON COLUMN reports.version_id IS 'Phiên bản cụ thể của document_id, nếu có';

COMMENT ON COLUMN reports.book_id IS 'Sách bị báo cáo, loại trừ document_id';

COMMENT ON COLUMN reports.category IS 'Loại vấn đề';

COMMENT ON COLUMN reports.description IS 'Mô tả; không tự đính kèm ghi chú riêng';

COMMENT ON COLUMN reports.status IS 'Tiến trình xử lý báo cáo';

COMMENT ON COLUMN reports.created_at IS 'Thời điểm tạo, lưu theo UTC';

COMMENT ON COLUMN reports.updated_at IS 'Ứng dụng cập nhật khi ghi thay đổi';

COMMENT ON COLUMN reports.revision IS 'Khóa kiểm soát cập nhật đồng thời; mỗi lần ghi tăng 1';

CREATE TABLE report_actions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  report_id bigint NOT NULL REFERENCES reports(id) ON DELETE RESTRICT,
  performed_by bigint NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  action varchar(20) NOT NULL CHECK (action IN ('TAKE_REVIEW','REQUEST_INFO','RESOLVE','DISMISS')),
  result text NOT NULL,
  visibility_event_id bigint REFERENCES visibility_events(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE report_actions IS 'Lịch sử xử lý báo cáo; quyết định ẩn liên kết visibility_events.';

COMMENT ON COLUMN report_actions.id IS 'Khóa chính do database cấp';

COMMENT ON COLUMN report_actions.report_id IS 'Báo cáo';

COMMENT ON COLUMN report_actions.performed_by IS 'Admin xử lý';

COMMENT ON COLUMN report_actions.action IS 'Loại xử lý';

COMMENT ON COLUMN report_actions.result IS 'Kết quả được phép hiển thị cho người báo cáo';

COMMENT ON COLUMN report_actions.visibility_event_id IS 'Quyết định ẩn liên quan nếu có';

COMMENT ON COLUMN report_actions.created_at IS 'Thời điểm tạo, lưu theo UTC';

CREATE TABLE audit_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id bigint REFERENCES users(id) ON DELETE RESTRICT,
  event_type varchar(80) NOT NULL,
  entity_type varchar(80) NOT NULL,
  entity_id bigint NOT NULL,
  reason_code varchar(80),
  request_id varchar(100),
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE audit_events IS 'Nhật ký kỹ thuật có danh sách trường cho phép; không chứa mật khẩu, token hoặc ghi chú.';

COMMENT ON COLUMN audit_events.id IS 'Khóa chính do database cấp';

COMMENT ON COLUMN audit_events.actor_id IS 'Người thực hiện; null cho tác vụ nền';

COMMENT ON COLUMN audit_events.event_type IS 'Ví dụ ACCOUNT_LOCKED, ASSIGNMENT_REVOKED';

COMMENT ON COLUMN audit_events.entity_type IS 'Tên loại đối tượng';

COMMENT ON COLUMN audit_events.entity_id IS 'ID đối tượng; tham chiếu đa hình không có FK';

COMMENT ON COLUMN audit_events.reason_code IS 'Mã lý do, không lưu payload tùy ý';

COMMENT ON COLUMN audit_events.request_id IS 'ID tương quan request, không phải token';

COMMENT ON COLUMN audit_events.created_at IS 'Thời điểm tạo, lưu theo UTC';

ALTER TABLE documents ADD CONSTRAINT fk_current_version_same_document FOREIGN KEY (id, current_version_id) REFERENCES document_versions(document_id, id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;

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

-- Database guards complement backend authorization; they do not replace it.
CREATE FUNCTION protect_version_snapshot() RETURNS trigger
LANGUAGE plpgsql SET search_path = hucescholar, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.review_status IN ('SUBMITTED','APPROVED','REJECTED') THEN
      RAISE EXCEPTION 'Cannot delete submitted or terminal version' USING ERRCODE = '23514';
    END IF;
    RETURN OLD;
  END IF;
  IF NEW.document_id <> OLD.document_id OR NEW.version_no <> OLD.version_no
     OR NEW.created_by <> OLD.created_by THEN
    RAISE EXCEPTION 'Version identity is immutable' USING ERRCODE = '23514';
  END IF;
  IF OLD.review_status IN ('APPROVED','REJECTED') AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'Terminal version is immutable; create a new version' USING ERRCODE = '23514';
  END IF;
  IF OLD.review_status = 'SUBMITTED' AND
     (to_jsonb(NEW) - ARRAY['review_status','revision','updated_at']) IS DISTINCT FROM
     (to_jsonb(OLD) - ARRAY['review_status','revision','updated_at']) THEN
    RAISE EXCEPTION 'Withdraw submitted version before editing its snapshot' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER tr_protect_version BEFORE UPDATE OR DELETE ON document_versions
FOR EACH ROW EXECUTE FUNCTION protect_version_snapshot();

CREATE FUNCTION protect_version_courses() RETURNS trigger
LANGUAGE plpgsql SET search_path = hucescholar, pg_temp AS $$
DECLARE state varchar(20);
BEGIN
  -- Lock the parent to serialize course changes with publication of that snapshot.
  IF TG_OP <> 'INSERT' THEN
    SELECT review_status INTO state FROM document_versions WHERE id = OLD.version_id FOR UPDATE;
    IF state NOT IN ('DRAFT','CHANGES_REQUIRED') THEN
      RAISE EXCEPTION 'Version courses are frozen' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF TG_OP <> 'DELETE' THEN
    SELECT review_status INTO state FROM document_versions WHERE id = NEW.version_id FOR UPDATE;
    IF state NOT IN ('DRAFT','CHANGES_REQUIRED') THEN
      RAISE EXCEPTION 'Version courses are frozen' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;
  RETURN OLD;
END $$;
CREATE TRIGGER tr_protect_version_courses BEFORE INSERT OR UPDATE OR DELETE ON version_courses
FOR EACH ROW EXECUTE FUNCTION protect_version_courses();

CREATE FUNCTION protect_file_identity() RETURNS trigger
LANGUAGE plpgsql SET search_path = hucescholar, pg_temp AS $$
BEGIN
  IF ROW(NEW.object_key, NEW.sha256, NEW.byte_size, NEW.mime_type, NEW.uploaded_by)
     IS DISTINCT FROM ROW(OLD.object_key, OLD.sha256, OLD.byte_size, OLD.mime_type, OLD.uploaded_by)
     OR (OLD.scan_status = 'SAFE' AND NEW.page_count IS DISTINCT FROM OLD.page_count) THEN
    RAISE EXCEPTION 'File identity and parsed page count are immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER tr_protect_file BEFORE UPDATE ON files
FOR EACH ROW EXECUTE FUNCTION protect_file_identity();

CREATE FUNCTION protect_document_identity() RETURNS trigger
LANGUAGE plpgsql SET search_path = hucescholar, pg_temp AS $$
BEGIN
  IF ROW(NEW.kind, NEW.created_by) IS DISTINCT FROM ROW(OLD.kind, OLD.created_by) THEN
    RAISE EXCEPTION 'Document kind and original creator are immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER tr_protect_document BEFORE UPDATE ON documents
FOR EACH ROW EXECUTE FUNCTION protect_document_identity();

CREATE FUNCTION check_current_published_version() RETURNS trigger
LANGUAGE plpgsql SET search_path = hucescholar, pg_temp AS $$
DECLARE target_id bigint; target_state varchar(20);
BEGIN
  -- Deferred checks read final row state, rather than an obsolete queued NEW image.
  SELECT current_version_id INTO target_id FROM documents WHERE id = NEW.id;
  IF target_id IS NOT NULL THEN
    SELECT review_status INTO target_state FROM document_versions
      WHERE id = target_id AND document_id = NEW.id;
    IF target_state IS DISTINCT FROM 'APPROVED' THEN
      RAISE EXCEPTION 'Current version must be an approved version of the same document' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER ct_current_published_version
AFTER INSERT OR UPDATE ON documents DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION check_current_published_version();


REVOKE ALL ON ALL TABLES IN SCHEMA hucescholar FROM PUBLIC;

REVOKE ALL ON ALL SEQUENCES IN SCHEMA hucescholar FROM PUBLIC;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA hucescholar FROM PUBLIC;

COMMIT;
