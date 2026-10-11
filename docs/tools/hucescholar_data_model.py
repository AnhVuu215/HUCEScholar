"""Single source for the ERD, dictionary and PostgreSQL reference schema."""
TABLES = []
LINKS = []


def entity(name, group, purpose, columns, constraints=()):
    TABLES.append(dict(name=name, group=group, purpose=purpose,
                       columns=[dict(name=n, sql=s, meaning=m) for n, s, m in columns],
                       constraints=list(constraints)))


def fk(child, column, parent, required=True, label=None):
    LINKS.append(dict(child=child, column=column, parent=parent, required=required,
                      label=label or column))


ID = ('id', 'bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY', 'Khóa chính do database cấp')
CREATED = ('created_at', 'timestamptz NOT NULL DEFAULT now()', 'Thời điểm tạo, lưu theo UTC')
UPDATED = ('updated_at', 'timestamptz NOT NULL DEFAULT now()', 'Ứng dụng cập nhật khi ghi thay đổi')
REV = ('revision', 'integer NOT NULL DEFAULT 1 CHECK (revision > 0)', 'Khóa kiểm soát cập nhật đồng thời; mỗi lần ghi tăng 1')

entity('users', 'Tài khoản', 'Tài khoản nội bộ; một role chính cho MVP, chưa có SSO hoặc tự đăng ký.', [
    ID, ('email', 'varchar(254) NOT NULL', 'Lưu lowercase sau trim; định danh đăng nhập duy nhất'),
    ('display_name', "varchar(150) NOT NULL CHECK (btrim(display_name) <> '')", 'Tên hiển thị'),
    ('password_hash', 'text NOT NULL', 'Hash mật khẩu; không lưu mật khẩu gốc'),
    ('role', "varchar(12) NOT NULL CHECK (role IN ('ADMIN','LECTURER','STUDENT'))", 'Role chính; thay role chỉ do admin'),
    ('status', "varchar(12) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','ACTIVE','LOCKED'))", 'Chỉ ACTIVE và đã xác minh mới sử dụng học liệu'),
    ('verified_at', 'timestamptz', 'Admin xác minh thuộc nhóm người dùng hợp lệ'),
    ('verified_by', 'bigint REFERENCES users(id) ON DELETE RESTRICT', 'Admin thực hiện xác minh; bootstrap admin đầu tiên có thể null'),
    CREATED, UPDATED, REV
], ["UNIQUE (email)", "CHECK (email = lower(btrim(email)) AND position('@' in email) > 1)", "CHECK (status <> 'ACTIVE' OR verified_at IS NOT NULL)"])
fk('users', 'verified_by', 'users', False)

entity('auth_sessions', 'Tài khoản', 'Phiên web có thể thu hồi; có thể ánh xạ sang cơ chế session của framework.', [
    ID, ('user_id', 'bigint NOT NULL REFERENCES users(id) ON DELETE RESTRICT', 'Chủ phiên'),
    ('token_hash', 'varchar(128) NOT NULL UNIQUE', 'Hash token ngẫu nhiên; không lưu cookie gốc'),
    CREATED, ('expires_at', 'timestamptz NOT NULL', 'Hết hạn phiên'), ('revoked_at', 'timestamptz', 'Thu hồi khi đăng xuất, khóa tài khoản hoặc reset mật khẩu')
], ['CHECK (expires_at > created_at)', 'CHECK (revoked_at IS NULL OR revoked_at >= created_at)'])
fk('auth_sessions', 'user_id', 'users')

entity('password_reset_tokens', 'Tài khoản', 'Token đặt lại mật khẩu một lần; không thay đổi trạng thái khóa tài khoản.', [
    ID, ('user_id', 'bigint NOT NULL REFERENCES users(id) ON DELETE RESTRICT', 'Tài khoản cần khôi phục'),
    ('token_hash', 'varchar(128) NOT NULL UNIQUE', 'Hash token khôi phục'), CREATED,
    ('expires_at', 'timestamptz NOT NULL', 'Thời điểm hết hạn'), ('used_at', 'timestamptz', 'Đánh dấu đã tiêu thụ trong giao dịch reset')
], ['CHECK (expires_at > created_at)', 'CHECK (used_at IS NULL OR used_at >= created_at)'])
fk('password_reset_tokens', 'user_id', 'users')

entity('faculties', 'Danh mục', 'Khoa hoặc đơn vị quản lý học phần.', [ID, ('code', 'varchar(30) NOT NULL UNIQUE', 'Mã nội bộ; không tự nhận là mã chính thức'), ('name', 'varchar(200) NOT NULL', 'Tên đơn vị'), ('is_active', 'boolean NOT NULL DEFAULT true', 'Ngừng sử dụng thay vì xóa dữ liệu đang được tham chiếu'), CREATED])
entity('programs', 'Danh mục', 'Ngành hoặc chương trình thuộc một khoa.', [ID, ('faculty_id', 'bigint NOT NULL REFERENCES faculties(id) ON DELETE RESTRICT', 'Khoa quản lý'), ('code', 'varchar(30) NOT NULL UNIQUE', 'Mã chương trình'), ('name', 'varchar(200) NOT NULL', 'Tên chương trình'), ('is_active', 'boolean NOT NULL DEFAULT true', 'Trạng thái sử dụng'), CREATED])
fk('programs', 'faculty_id', 'faculties')
entity('courses', 'Danh mục', 'Học phần; có thể dùng chung giữa nhiều chương trình.', [ID, ('faculty_id', 'bigint NOT NULL REFERENCES faculties(id) ON DELETE RESTRICT', 'Đơn vị quản lý học phần'), ('code', 'varchar(30) NOT NULL UNIQUE', 'Mã học phần'), ('name', 'varchar(200) NOT NULL', 'Tên học phần'), ('is_active', 'boolean NOT NULL DEFAULT true', 'Trạng thái sử dụng'), CREATED, REV])
fk('courses', 'faculty_id', 'faculties')
entity('program_courses', 'Danh mục', 'Bảng nối chương trình và học phần nhiều–nhiều.', [('program_id', 'bigint NOT NULL REFERENCES programs(id) ON DELETE RESTRICT', 'Chương trình'), ('course_id', 'bigint NOT NULL REFERENCES courses(id) ON DELETE RESTRICT', 'Học phần')], ['PRIMARY KEY (program_id, course_id)'])
fk('program_courses', 'program_id', 'programs'); fk('program_courses', 'course_id', 'courses')
entity('lecturer_assignments', 'Danh mục', 'Lưu cả phân công hiện hành và lịch sử thu hồi.', [
    ID, ('lecturer_id', 'bigint NOT NULL REFERENCES users(id) ON DELETE RESTRICT', 'Giảng viên; backend kiểm tra role và ACTIVE'),
    ('course_id', 'bigint NOT NULL REFERENCES courses(id) ON DELETE RESTRICT', 'Học phần phụ trách'),
    ('assigned_by', 'bigint NOT NULL REFERENCES users(id) ON DELETE RESTRICT', 'Admin phân công'),
    ('assigned_at', 'timestamptz NOT NULL DEFAULT now()', 'Bắt đầu phân công'),
    ('revoked_at', 'timestamptz', 'Null là chưa thu hồi'), ('revoked_by', 'bigint REFERENCES users(id) ON DELETE RESTRICT', 'Admin thu hồi'),
    ('reason', 'text', 'Lý do thay đổi')
], ['CHECK (revoked_at IS NULL OR revoked_at >= assigned_at)', 'CHECK ((revoked_at IS NULL) = (revoked_by IS NULL))'])
for c in ['lecturer_id', 'assigned_by']: fk('lecturer_assignments', c, 'users')
fk('lecturer_assignments', 'course_id', 'courses'); fk('lecturer_assignments', 'revoked_by', 'users', False)

entity('documents', 'Học liệu', 'Danh tính ổn định của học liệu; sở hữu hiện tại và trạng thái ẩn thuộc tài liệu.', [
    ID, ('kind', "varchar(20) NOT NULL CHECK (kind IN ('LECTURER_MATERIAL','STUDENT_SUPPLEMENT'))", 'Giáo trình giảng viên hoặc tài liệu sinh viên bổ sung'),
    ('created_by', 'bigint NOT NULL REFERENCES users(id) ON DELETE RESTRICT', 'Người tạo gốc; không đổi khi bàn giao'),
    ('manager_id', 'bigint NOT NULL REFERENCES users(id) ON DELETE RESTRICT', 'Chủ quản lý hiện tại; không dùng làm nhãn tác giả'),
    ('visibility', "varchar(8) NOT NULL DEFAULT 'VISIBLE' CHECK (visibility IN ('VISIBLE','HIDDEN'))", 'Ẩn toàn tài liệu và mọi phiên bản'),
    ('current_version_id', 'bigint', 'Bản đã duyệt hiện hành; null trước công bố đầu tiên'), CREATED, UPDATED, REV
], ['UNIQUE (current_version_id)'])
fk('documents', 'created_by', 'users'); fk('documents', 'manager_id', 'users'); fk('documents', 'current_version_id', 'document_versions', False)
LINKS[-1]['child_max'] = 1

entity('files', 'Học liệu', 'Metadata của PDF trong kho riêng tư; database không chứa bytes của file.', [
    ID, ('uploaded_by', 'bigint NOT NULL REFERENCES users(id) ON DELETE RESTRICT', 'Người upload gốc'),
    ('object_key', 'varchar(500) NOT NULL UNIQUE', 'Khóa đối tượng bất biến, không phải URL công khai'),
    ('original_name', 'varchar(255) NOT NULL', 'Tên file đã làm sạch để hiển thị/tải'),
    ('mime_type', "varchar(80) NOT NULL DEFAULT 'application/pdf' CHECK (mime_type = 'application/pdf')", 'Khai báo MIME; không thay việc kiểm tra bytes'),
    ('byte_size', 'bigint NOT NULL CHECK (byte_size > 0)', 'Dung lượng; hạn mức upload do cấu hình dịch vụ'),
    ('sha256', "char(64) NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$')", 'Hash xác minh file; không UNIQUE vì không tự gộp bản trùng'),
    ('scan_status', "varchar(8) NOT NULL DEFAULT 'CHECKING' CHECK (scan_status IN ('CHECKING','SAFE','FAILED'))", 'Kết quả kiểm tra kỹ thuật hiện hành'),
    ('page_count', 'integer CHECK (page_count > 0)', 'Số trang được parser xác định'),
    ('has_text_layer', 'boolean', 'Khả năng highlight cần kiểm tra thêm ở từng trang'),
    ('checked_at', 'timestamptz', 'Thời điểm hoàn thành kiểm tra'), CREATED
], ["CHECK (scan_status <> 'SAFE' OR (page_count IS NOT NULL AND checked_at IS NOT NULL AND has_text_layer IS NOT NULL))"])
fk('files', 'uploaded_by', 'users')

entity('document_versions', 'Học liệu', 'Snapshot file, metadata và quyền. Bản APPROVED/REJECTED bất biến; sửa bằng bản mới.', [
    ID, ('document_id', 'bigint NOT NULL REFERENCES documents(id) ON DELETE RESTRICT', 'Tài liệu gốc'),
    ('version_no', 'integer NOT NULL CHECK (version_no > 0)', 'Số thứ tự tăng trong tài liệu; cấp dưới khóa tài liệu'),
    ('file_id', 'bigint NOT NULL REFERENCES files(id) ON DELETE RESTRICT', 'PDF của phiên bản'),
    ('created_by', 'bigint NOT NULL REFERENCES users(id) ON DELETE RESTRICT', 'Người tạo snapshot gốc'),
    ('title', "varchar(300) NOT NULL CHECK (btrim(title) <> '')", 'Tiêu đề của phiên bản'),
    ('authors', "text NOT NULL DEFAULT ''", 'Nhãn tác giả học thuật; tách khỏi tài khoản quản lý'),
    ('description', "text NOT NULL DEFAULT ''", 'Mô tả học liệu'),
    ('material_type', "varchar(20) NOT NULL CHECK (material_type IN ('TEXTBOOK','LECTURE','EXERCISE','EXAM','REFERENCE','OTHER'))", 'Loại học liệu'),
    ('publication_year', 'smallint CHECK (publication_year BETWEEN 1000 AND 9999)', 'Năm tài liệu nếu biết'),
    ('source_reference', 'text NOT NULL', 'Nguồn hoặc dẫn chứng; có thể hoàn thiện khi còn nháp'),
    ('rights_basis', 'text NOT NULL', 'Căn cứ được chia sẻ/đọc/tải; bắt buộc có nội dung trước gửi duyệt'),
    ('rights_valid_until', 'timestamptz', 'Hết hạn căn cứ nếu có; null không tự chứng minh quyền vô thời hạn'),
    ('download_allowed', 'boolean NOT NULL DEFAULT false', 'Được tải file gốc khi còn đủ quyền đọc'),
    ('review_status', "varchar(20) NOT NULL DEFAULT 'DRAFT' CHECK (review_status IN ('DRAFT','SUBMITTED','CHANGES_REQUIRED','APPROVED','REJECTED'))", 'Trạng thái xét công bố của phiên bản'),
    ('change_summary', "text NOT NULL DEFAULT ''", 'Mô tả thay đổi so với bản trước'),
    ('search_text', "text NOT NULL DEFAULT ''", 'Metadata đã chuẩn hóa tiếng Việt có/không dấu do ứng dụng tạo'),
    CREATED, UPDATED, REV
], ['UNIQUE (document_id, version_no)', 'UNIQUE (document_id, id)'])
fk('document_versions', 'document_id', 'documents'); fk('document_versions', 'file_id', 'files'); fk('document_versions', 'created_by', 'users')
entity('version_courses', 'Học liệu', 'Học phần gắn với snapshot, tránh thay môn của bản đã công bố.', [('version_id', 'bigint NOT NULL REFERENCES document_versions(id) ON DELETE RESTRICT', 'Phiên bản'), ('course_id', 'bigint NOT NULL REFERENCES courses(id) ON DELETE RESTRICT', 'Học phần')], ['PRIMARY KEY (version_id, course_id)'])
fk('version_courses', 'version_id', 'document_versions'); fk('version_courses', 'course_id', 'courses')

entity('publication_requests', 'Kiểm duyệt', 'Mỗi dòng là một lần gửi duyệt. Rút/sửa/gửi lại tạo dòng mới, giữ người gửi cũ.', [
    ID, ('version_id', 'bigint NOT NULL REFERENCES document_versions(id) ON DELETE RESTRICT', 'Phiên bản được xét'),
    ('submitted_by', 'bigint NOT NULL REFERENCES users(id) ON DELETE RESTRICT', 'Người thực sự gửi lần này'),
    ('submitted_revision', 'integer NOT NULL CHECK (submitted_revision > 0)', 'Revision sau chuyển phiên bản sang SUBMITTED'),
    ('submitted_at', 'timestamptz NOT NULL DEFAULT now()', 'Lúc gửi'),
    ('status', "varchar(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','WITHDRAWN','APPROVED','CHANGES_REQUIRED','REJECTED'))", 'Trạng thái của lần gửi, tách khỏi review_status của phiên bản'),
    ('resolved_by', 'bigint REFERENCES users(id) ON DELETE RESTRICT', 'Người duyệt/rút; bàn giao là admin'),
    ('resolved_at', 'timestamptz', 'Lúc kết thúc lần gửi'), ('reason', 'text', 'Bắt buộc khi yêu cầu sửa/từ chối/rút'), REV
], ["CHECK ((status = 'PENDING' AND resolved_by IS NULL AND resolved_at IS NULL) OR (status <> 'PENDING' AND resolved_by IS NOT NULL AND resolved_at IS NOT NULL))", "CHECK (status NOT IN ('WITHDRAWN','CHANGES_REQUIRED','REJECTED') OR nullif(btrim(reason), '') IS NOT NULL)", 'CHECK (resolved_at IS NULL OR resolved_at >= submitted_at)'])
fk('publication_requests', 'version_id', 'document_versions'); fk('publication_requests', 'submitted_by', 'users'); fk('publication_requests', 'resolved_by', 'users', False)

entity('ownership_transfers', 'Kiểm duyệt', 'Lịch sử bàn giao giáo trình; không đổi tác giả hoặc chủ ghi chú.', [
    ID, ('document_id', 'bigint NOT NULL REFERENCES documents(id) ON DELETE RESTRICT', 'Giáo trình được bàn giao'),
    ('from_user_id', 'bigint NOT NULL REFERENCES users(id) ON DELETE RESTRICT', 'Chủ quản lý trước'),
    ('to_user_id', 'bigint NOT NULL REFERENCES users(id) ON DELETE RESTRICT', 'Giảng viên nhận'),
    ('performed_by', 'bigint NOT NULL REFERENCES users(id) ON DELETE RESTRICT', 'Admin xác nhận'),
    ('reason', "text NOT NULL CHECK (btrim(reason) <> '')", 'Lý do bàn giao'), CREATED
], ['CHECK (from_user_id <> to_user_id)'])
fk('ownership_transfers', 'document_id', 'documents')
for c in ['from_user_id', 'to_user_id', 'performed_by']: fk('ownership_transfers', c, 'users')
entity('visibility_events', 'Kiểm duyệt', 'Nhật ký ẩn/khôi phục toàn tài liệu.', [
    ID, ('document_id', 'bigint NOT NULL REFERENCES documents(id) ON DELETE RESTRICT', 'Tài liệu bị tác động'),
    ('performed_by', 'bigint NOT NULL REFERENCES users(id) ON DELETE RESTRICT', 'Admin xử lý'),
    ('from_visibility', "varchar(8) NOT NULL CHECK (from_visibility IN ('VISIBLE','HIDDEN'))", 'Trạng thái trước'),
    ('to_visibility', "varchar(8) NOT NULL CHECK (to_visibility IN ('VISIBLE','HIDDEN'))", 'Trạng thái sau'),
    ('reason', "text NOT NULL CHECK (btrim(reason) <> '')", 'Căn cứ quyết định'), CREATED
], ['CHECK (from_visibility <> to_visibility)'])
fk('visibility_events', 'document_id', 'documents'); fk('visibility_events', 'performed_by', 'users')

entity('annotations', 'Học tập cá nhân', 'Ghi chú riêng gắn người, phiên bản và trang; không gắn sang current_version tự động.', [
    ID, ('user_id', 'bigint NOT NULL REFERENCES users(id) ON DELETE RESTRICT', 'Chủ ghi chú; backend luôn lọc theo tài khoản phiên'),
    ('version_id', 'bigint NOT NULL REFERENCES document_versions(id) ON DELETE RESTRICT', 'Phiên bản PDF gốc'),
    ('page_number', 'integer NOT NULL CHECK (page_number > 0)', 'Trang bắt đầu từ 1, không quá page_count'),
    ('kind', "varchar(16) NOT NULL CHECK (kind IN ('PAGE_NOTE','TEXT_HIGHLIGHT'))", 'Ghi chú theo trang hoặc highlight chữ'),
    ('content', "text NOT NULL DEFAULT ''", 'Nội dung riêng tư; không đưa vào audit/log'),
    ('anchor', 'jsonb', 'Highlight: quads và quote trên trang gốc chưa xoay, chuẩn hóa 0..1'),
    ('color', "varchar(7) NOT NULL DEFAULT '#FFF59D' CHECK (color ~ '^#[0-9A-Fa-f]{6}$')", 'Màu hiển thị'), CREATED, UPDATED, REV
], ["CHECK ((kind = 'PAGE_NOTE' AND btrim(content) <> '' AND anchor IS NULL) OR (kind = 'TEXT_HIGHLIGHT' AND anchor IS NOT NULL AND jsonb_typeof(anchor) = 'object' AND anchor ? 'quads' AND jsonb_typeof(anchor->'quads') = 'array' AND jsonb_array_length(anchor->'quads') > 0))"])
fk('annotations', 'user_id', 'users'); fk('annotations', 'version_id', 'document_versions')
entity('reading_progress', 'Học tập cá nhân', 'Một tiến độ cho mỗi người và mỗi phiên bản, không ghi đè bản cũ khi có bản mới.', [
    ('user_id', 'bigint NOT NULL REFERENCES users(id) ON DELETE RESTRICT', 'Người đọc'),
    ('version_id', 'bigint NOT NULL REFERENCES document_versions(id) ON DELETE RESTRICT', 'Phiên bản đang đọc'),
    ('page_number', 'integer NOT NULL CHECK (page_number > 0)', 'Trang hiện tại'),
    ('page_offset', 'numeric(6,5) NOT NULL DEFAULT 0 CHECK (page_offset BETWEEN 0 AND 1)', 'Vị trí tương đối trong trang'), UPDATED, REV
], ['PRIMARY KEY (user_id, version_id)'])
fk('reading_progress', 'user_id', 'users'); fk('reading_progress', 'version_id', 'document_versions')
entity('saved_documents', 'Học tập cá nhân', 'Lưu theo tài liệu để theo dõi bản mới; bỏ lưu không xóa ghi chú hoặc tiến độ.', [
    ('user_id', 'bigint NOT NULL REFERENCES users(id) ON DELETE RESTRICT', 'Chủ thư viện'),
    ('document_id', 'bigint NOT NULL REFERENCES documents(id) ON DELETE RESTRICT', 'Tài liệu đã lưu'), CREATED
], ['PRIMARY KEY (user_id, document_id)'])
fk('saved_documents', 'user_id', 'users'); fk('saved_documents', 'document_id', 'documents')

entity('books', 'Thư viện và phản hồi', 'Metadata sách và nguồn ngoài; không giả định có PDF hoặc tồn kho.', [
    ID, ('title', "varchar(300) NOT NULL CHECK (btrim(title) <> '')", 'Tên sách'),
    ('authors', "text NOT NULL DEFAULT ''", 'Tác giả hiển thị'), ('publisher', 'varchar(200)', 'Nhà xuất bản nếu biết'),
    ('publication_year', 'smallint CHECK (publication_year BETWEEN 1000 AND 9999)', 'Năm xuất bản'),
    ('edition', 'varchar(80)', 'Ấn bản'), ('isbn', 'varchar(20)', 'ISBN nếu biết; không tự gộp ấn bản'),
    ('source_provider', 'varchar(100) NOT NULL', 'Tên nguồn danh mục'), ('external_id', 'varchar(150)', 'ID sách tại nguồn nếu có'),
    ('source_url', 'text NOT NULL', 'Liên kết HTTPS/HTTP; backend xác thực và mở an toàn'),
    ('metadata_rights_basis', 'text NOT NULL', 'Căn cứ được sử dụng thông tin danh mục'),
    ('native_document_id', 'bigint REFERENCES documents(id) ON DELETE RESTRICT', 'Tài liệu nội bộ có quyền phục vụ, nếu có; vẫn kiểm tra quyền riêng'),
    ('checked_at', 'timestamptz', 'Lần kiểm tra nguồn gần nhất'), ('is_active', 'boolean NOT NULL DEFAULT true', 'Ngừng hiển thị bản ghi'),
    ('managed_by', 'bigint NOT NULL REFERENCES users(id) ON DELETE RESTRICT', 'Admin biên tập'), CREATED, UPDATED, REV
])
fk('books', 'native_document_id', 'documents', False); fk('books', 'managed_by', 'users')
entity('book_courses', 'Thư viện và phản hồi', 'Gợi ý sách theo học phần; độc lập với môn của một PDF.', [
    ('book_id', 'bigint NOT NULL REFERENCES books(id) ON DELETE RESTRICT', 'Sách'),
    ('course_id', 'bigint NOT NULL REFERENCES courses(id) ON DELETE RESTRICT', 'Môn liên quan')
], ['PRIMARY KEY (book_id, course_id)'])
fk('book_courses', 'book_id', 'books'); fk('book_courses', 'course_id', 'courses')
entity('reports', 'Thư viện và phản hồi', 'Báo cáo một tài liệu hoặc một sách; version_id chỉ rõ bản PDF nếu cần.', [
    ID, ('reported_by', 'bigint NOT NULL REFERENCES users(id) ON DELETE RESTRICT', 'Người báo cáo'),
    ('document_id', 'bigint REFERENCES documents(id) ON DELETE RESTRICT', 'Tài liệu bị báo cáo'),
    ('version_id', 'bigint', 'Phiên bản cụ thể của document_id, nếu có'),
    ('book_id', 'bigint REFERENCES books(id) ON DELETE RESTRICT', 'Sách bị báo cáo, loại trừ document_id'),
    ('category', "varchar(20) NOT NULL CHECK (category IN ('FILE_ERROR','WRONG_COURSE','RIGHTS','CONTENT','BROKEN_LINK','OTHER'))", 'Loại vấn đề'),
    ('description', "text NOT NULL CHECK (btrim(description) <> '')", 'Mô tả; không tự đính kèm ghi chú riêng'),
    ('status', "varchar(12) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','IN_REVIEW','RESOLVED','DISMISSED'))", 'Tiến trình xử lý báo cáo'), CREATED, UPDATED, REV
], ['CHECK ((document_id IS NOT NULL)::integer + (book_id IS NOT NULL)::integer = 1)', 'CHECK (version_id IS NULL OR document_id IS NOT NULL)', 'FOREIGN KEY (document_id, version_id) REFERENCES document_versions(document_id, id) ON DELETE RESTRICT'])
fk('reports', 'reported_by', 'users'); fk('reports', 'document_id', 'documents', False); fk('reports', 'version_id', 'document_versions', False); fk('reports', 'book_id', 'books', False)
entity('report_actions', 'Thư viện và phản hồi', 'Lịch sử xử lý báo cáo; quyết định ẩn liên kết visibility_events.', [
    ID, ('report_id', 'bigint NOT NULL REFERENCES reports(id) ON DELETE RESTRICT', 'Báo cáo'),
    ('performed_by', 'bigint NOT NULL REFERENCES users(id) ON DELETE RESTRICT', 'Admin xử lý'),
    ('action', "varchar(20) NOT NULL CHECK (action IN ('TAKE_REVIEW','REQUEST_INFO','RESOLVE','DISMISS'))", 'Loại xử lý'),
    ('result', 'text NOT NULL', 'Kết quả được phép hiển thị cho người báo cáo'),
    ('visibility_event_id', 'bigint REFERENCES visibility_events(id) ON DELETE RESTRICT', 'Quyết định ẩn liên quan nếu có'), CREATED
])
fk('report_actions', 'report_id', 'reports'); fk('report_actions', 'performed_by', 'users'); fk('report_actions', 'visibility_event_id', 'visibility_events', False)
entity('audit_events', 'Thư viện và phản hồi', 'Nhật ký kỹ thuật có danh sách trường cho phép; không chứa mật khẩu, token hoặc ghi chú.', [
    ID, ('actor_id', 'bigint REFERENCES users(id) ON DELETE RESTRICT', 'Người thực hiện; null cho tác vụ nền'),
    ('event_type', 'varchar(80) NOT NULL', 'Ví dụ ACCOUNT_LOCKED, ASSIGNMENT_REVOKED'),
    ('entity_type', 'varchar(80) NOT NULL', 'Tên loại đối tượng'),
    ('entity_id', 'bigint NOT NULL', 'ID đối tượng; tham chiếu đa hình không có FK'),
    ('reason_code', 'varchar(80)', 'Mã lý do, không lưu payload tùy ý'),
    ('request_id', 'varchar(100)', 'ID tương quan request, không phải token'), CREATED
])
fk('audit_events', 'actor_id', 'users', False)

INDEXES = [
    'CREATE UNIQUE INDEX ux_active_assignment ON lecturer_assignments(lecturer_id, course_id) WHERE revoked_at IS NULL;',
    'CREATE INDEX ix_assignment_course ON lecturer_assignments(course_id) WHERE revoked_at IS NULL;',
    'CREATE INDEX ix_session_user ON auth_sessions(user_id) WHERE revoked_at IS NULL;',
    'CREATE INDEX ix_reset_user ON password_reset_tokens(user_id) WHERE used_at IS NULL;',
    'CREATE INDEX ix_program_course_reverse ON program_courses(course_id, program_id);',
    'CREATE INDEX ix_document_manager ON documents(manager_id, kind);',
    'CREATE INDEX ix_file_hash ON files(sha256);',
    "CREATE UNIQUE INDEX ux_one_working_version ON document_versions(document_id) WHERE review_status IN ('DRAFT','SUBMITTED','CHANGES_REQUIRED');",
    'CREATE INDEX ix_version_file ON document_versions(file_id);',
    'CREATE INDEX ix_version_metadata ON document_versions USING gin(to_tsvector(\'simple\', search_text));',
    'CREATE INDEX ix_version_course_reverse ON version_courses(course_id, version_id);',
    "CREATE UNIQUE INDEX ux_one_pending_request ON publication_requests(version_id) WHERE status = 'PENDING';",
    'CREATE INDEX ix_request_queue ON publication_requests(status, submitted_at);',
    'CREATE INDEX ix_request_submitter ON publication_requests(submitted_by, submitted_at DESC);',
    'CREATE INDEX ix_transfer_document ON ownership_transfers(document_id, created_at DESC);',
    'CREATE INDEX ix_visibility_document ON visibility_events(document_id, created_at DESC);',
    'CREATE INDEX ix_annotation_owner_page ON annotations(user_id, version_id, page_number);',
    'CREATE INDEX ix_annotation_version ON annotations(version_id);',
    'CREATE INDEX ix_progress_version ON reading_progress(version_id);',
    'CREATE INDEX ix_saved_document ON saved_documents(document_id);',
    'CREATE UNIQUE INDEX ux_book_source ON books(lower(source_provider), external_id) WHERE external_id IS NOT NULL;',
    'CREATE INDEX ix_book_course_reverse ON book_courses(course_id, book_id);',
    'CREATE INDEX ix_report_owner ON reports(reported_by, created_at DESC);',
    'CREATE INDEX ix_report_queue ON reports(status, created_at);',
    'CREATE INDEX ix_report_document ON reports(document_id, version_id);',
    'CREATE INDEX ix_report_book ON reports(book_id);',
    'CREATE INDEX ix_report_action ON report_actions(report_id, created_at);',
    'CREATE INDEX ix_audit_entity ON audit_events(entity_type, entity_id, created_at DESC);'
]
