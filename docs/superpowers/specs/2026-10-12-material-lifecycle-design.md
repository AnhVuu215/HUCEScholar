# Vòng đời học liệu

Mở rộng module Materials hiện có, giữ roles/nghiệp vụ 1.1 và schema 23 bảng. Luồng owner tạo phiên bản tiếp theo, admin bàn giao và ẩn/khôi phục. Thực thi inline theo yêu cầu triển khai tự chủ, không thêm dependency/migration hoặc thay wireframe.

## Quyết định

- Owner LECTURER/STUDENT POST `material-drafts/:id/versions` với revision của version mới nhất. Chỉ sau APPROVED/REJECTED; một working version/tài liệu. Khóa actor shared → catalog advisory → document → latest version. Kiểm tra owner/kind, phân công/môn còn hiệu lực. Số phiên bản tăng dưới khóa tài liệu; copy tiêu đề/tác giả/mô tả/loại/năm/môn; PDF null, nguồn/quyền trống, download false. Cần nhập lại nguồn/quyền và upload PDF trước gửi. Không mang thời hạn hoặc căn cứ quyền cũ sang bản mới. `current_version_id`, lịch sử, notes/progress giữ nguyên. Concurrent/retry stale trả 409, UI refresh đối soát thay vì tạo thêm.
- Danh sách Học liệu của tôi trả **mỗi document một version mới nhất**, filter/search sau chọn latest. GET `:id/versions` owner-only phân trang chứa snapshot metadata của mọi version; không lộ user notes hay file key. Request history cũ giữ trong DB; thêm versionId vào query requests để owner xem lịch sử từng version.
- ADMIN `admin/materials` list/search/visibility/kind filter, detail gồm document revision, manager, latest/current, tất cả môn của các version, lịch sử transfer/visibility phân trang. GET recipients theo doc/search/page chỉ ACTIVE verified LECTURER có phân công mọi môn đang hoạt động, khác manager; backend kiểm tra lại khi ghi.
- POST `:id/transfer`: document revision + recipientId + lý do 1–1000; chỉ LECTURER_MATERIAL. Khóa admin shared → catalog advisory → document → versions → pending requests; recipient shared. Kiểm tra mọi môn lịch sử. Rút SUBMITTED/request PENDING về DRAFT/WITHDRAWN nguyên tử, giữ người gửi và PDF; đổi manager, tăng document revision, ownership_transfers + audit cùng transaction. Student supplements không được bàn giao. Không yêu cầu manager cũ còn ACTIVE/phân công.
- POST `:id/visibility`: revision + VISIBLE/HIDDEN + lý do. Từ VISIBLE sang HIDDEN dừng đọc tất cả versions; không xóa dữ liệu/file. Restore cần current APPROVED, SAFE, nguồn/quyền hợp lệ, lý do gỡ đã giải quyết được xác nhận bởi admin. Transaction document → current version → file; không thay review/scan. Ghi visibility_events + audit; stale/repeated state409. Duyệt bản mới không tự mở HIDDEN.
- Admin không biên soạn. Routes RoleGuard, SessionGuard và CSRF hiện có. Không owner/client bypass, bigint string JSON, no-store.

## UI và xác nhận

Giữ production CSS navy/Segoe. Owner mở bản terminal, xác nhận tạo bản kế tiếp và yêu cầu PDF/quyền mới; refresh sau lỗi không rõ kết quả. Lịch sử phiên bản hiển thị số/trạng thái/mốc thời gian, nút xem lần xét duyệt của version được chọn. Admin có link Quản lý học liệu, bảng danh sách → chi tiết inline. Bàn giao cần chọn recipient bằng picker phân trang, lý do và xác nhận tác động/rút bản chờ. Ẩn/restore xác nhận trạng thái và phạm vi toàn tài liệu. Sau lỗi mutation khóa retry tới khi Tải trạng thái; giữ reason/recipient để đối chiếu, xác nhận lại trên revision mới. Không ảnh/modal/dependency mới. Responsive 1440/768/360 và focus/loading/error/empty.

## Nghiệm thu

Revision của successor bắt đầu bằng revision terminal trước đó + 1, không reset về 1. Mọi owner write đã address theo document + revision; lineage tăng liên tục ngăn tab/upload/retry cũ khớp nhầm bản khác. Chặn tạo khi revision/số phiên bản chạm giới hạn int. Giữ nguyên contract DTO và không cần migration.

Integration owner/role/CSRF/validation, terminal immutability, latest-list/history, simultaneous creation, transfer assignment/role/status/history/atomic rollback, review-vs-transfer, visibility stale/current/SAFE/expired, notes retained/read denied/restored. Browser tạo version mới, lost response đối soát; admin transfer và hidden/restore có conflict/recovery. Format/lint/types/unit/integration/browser/build; review độc lập cuối nhánh. Push commit chức năng, không tự merge main.
