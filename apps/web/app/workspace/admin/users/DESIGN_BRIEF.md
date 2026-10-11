# Quản lý tài khoản

Mode: Operate. Admin quản lý quyền truy cập từ danh sách người dùng hợp lệ. Kế thừa navy/blue, Segoe UI, focus và shell trong apps/web/app/globals.css; không thay thế thiết kế đã có. DESIGN.md ở root mô tả prototype, chỉ dùng làm tham khảo, không sao chép toàn bộ bố cục.

Một danh sách tìm/lọc/phân trang là nội dung chính. Tạo/sửa hiển thị inline trước danh sách; thao tác khóa có xác nhận tác động và danh tính cụ thể. Tránh dashboard thống kê khi chưa có dữ liệu phục vụ quyết định. Desktop dùng bảng bốn cột, mobile mỗi hàng xếp thành một nhóm; không che email hoặc nút thao tác. Tablet giảm khoảng trống, vẫn giữ thao tác cảm ứng ít nhất 44px.

Loading/error/empty/success phân biệt bằng chữ. Lỗi lưu giữ form; xung đột tải tên/email hiện hành để đối chiếu, giữ các ô đang nhập và yêu cầu xác nhận trước khi dùng revision mới. Focus vào form khi mở, vào lỗi khi thất bại, vào phần đối chiếu khi tải bản mới và trở lại nút cấp khi đóng. Credential chỉ ở trường password khi đang cấp, không hiển thị trong list/thông báo/screenshot sau submit. Không dùng modal hoặc thêm thư viện UI. ADMIN chỉ đọc; không có nút giả cho chức năng chưa làm. Placeholder tìm kiếm dùng `--muted` opaque; text action tối thiểu 44×44px.
