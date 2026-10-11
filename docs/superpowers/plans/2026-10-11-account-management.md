# Quản lý tài khoản — triển khai theo phạm vi đã chốt

## Mục tiêu và quyết định

Admin cấp tài khoản giảng viên/sinh viên từ danh sách hợp lệ, tìm/lọc/phân trang, sửa tên/email và khóa/mở khóa. Giữ Next.js client → REST NestJS → Prisma/PostgreSQL và token CSRF/session hiện có. Làm trực tiếp trên nhánh tính năng `codex/bootstrap` để tiếp tục checkout và ứng dụng local của người dùng; không tạo checkout khác hoặc đổi kiến trúc.

- Tất cả API `/admin/users` yêu cầu ADMIN hoạt động, đã xác minh. Kiểm tra lại actor trong transaction ghi dữ liệu.
- ADMIN hiển thị chỉ đọc; không tạo, đổi role, xóa hoặc khóa ADMIN trong module này. Role tài khoản đã cấp giữ nguyên. Như vậy không làm mất admin hoạt động hoặc phá tham chiếu phân công.
- Admin nhập mật khẩu khởi tạo 16–128 ký tự; hash Argon2id. Yêu cầu xác nhận thuộc danh sách hợp lệ; ghi verified_at/by và audit trong cùng transaction. Không trả mật khẩu/hash hoặc ghi chúng vào audit/log. Chưa có SMTP, reset hoặc buộc đổi mật khẩu; không gọi mật khẩu này là mật khẩu dùng một lần.
- Sửa tên/email sử dụng revision + row lock; email chuẩn hóa trim/lowercase, trùng trả 409. Đổi email thu hồi mọi phiên của tài khoản; đổi tên không thu hồi. Không chỉnh mật khẩu qua API sửa thông tin.
- GET `/admin/users/:id` tải bản mới để đối chiếu xung đột: giữ các ô đang nhập, hiển thị tên/email hiện hành và yêu cầu xác nhận đối chiếu trước khi dùng revision mới. Khóa/mở khóa có thể đóng xác nhận và tải lại danh sách vì không có bản nháp thông tin.
- Đổi trạng thái ACTIVE/LOCKED sử dụng revision; PENDING chỉ được kích hoạt sau xác nhận hợp lệ. DB trigger hiện có thu hồi phiên khi đổi trạng thái; mở khóa không khôi phục phiên cũ.
- ID là chuỗi bigint dương trong phạm vi int64. Chỉ select/serialize trường an toàn. Lọc role/status, search tên/email, giới hạn page/limit; thứ tự id giảm dần.
- Giao diện `/workspace/admin/users` kế thừa navy/blue, Segoe UI, sidebar hiện có. Bảng desktop, danh sách một cột trên mobile. Form tạo/sửa inline, xác nhận khóa inline; loading/error/empty/success, retry, lỗi trùng email và xung đột phải có cách khôi phục, giữ nội dung đã nhập. Không lưu credential ở localStorage.

## Thực hiện

1. Viết `apps/api/test/users.integration.spec.ts`: kiểm tra anonymous/role/CSRF; cấp và đăng nhập tài khoản thật; normalize email/duplicate/validation; lọc/phân trang; sửa tên/email và revocation; stale/concurrent revision; khóa/mở khóa; PENDING xác minh; bảo vệ ADMIN; audit không chứa secret. Chạy test trước code: route chưa tồn tại phải thất bại 404.
2. Thêm module `apps/api/src/users/`: DTO validation, controller routes, service transaction, whitelist projection, mapping 400/403/404/409. Export auth guards/service từ AuthModule, import UsersModule trong AppModule. Không thay schema/migration.
3. Viết `tests/users.spec.ts` cho hành trình ADMIN cấp → tìm → sửa → khóa/mở khóa → người dùng đăng nhập; role denial; lỗi mạng, conflict và layout desktop/mobile/tablet. Chạy để chứng minh giao diện còn thiếu.
4. Tạo trang users, component quản lý và form, client parser/API. Tái sử dụng RoleWorkspace làm shell có children được bảo vệ để tránh lặp auth/logout. Thêm liên kết vào sidebar/trang tài khoản Admin, cập nhật nội dung tiến độ trung thực. Thêm CSS scoped theo token hiện có và surface brief.
5. Chạy format, lint/typecheck/unit/build; integration riêng DB `_test`/Redis15; E2E trên 3100/3101. Inspect screenshot desktop/mobile/tablet một lượt, sửa có căn cứ nếu cần. Chạy detector Impeccable một lần. Review code/security và sửa lỗi có test chứng minh. Cập nhật README/PRODUCT/nhật ký; build và khởi động lại chỉ process 3000/3001 của dự án để người dùng xem chức năng mới.

## Điểm cần kiểm chứng

- Không lộ password_hash/session token ở danh sách, mutation hoặc audit.
- Không cho STUDENT/LECTURER dùng API bằng cách gọi URL trực tiếp.
- Hai request cùng revision chỉ một request thành công; 409 giữ form và cho tải bản mới.
- Khóa và đổi email thu hồi phiên; mở khóa không hồi sinh cookie cũ.
- Dữ liệu test và tài khoản fixture không được ghi vào database local của người dùng.

## Tiến độ

- Baseline: 40 unit tests PASS; working tree sạch trước thay đổi.
- API/UI đã triển khai; 55 integration PASS; regression đăng nhập/email race đã quan sát RED→GREEN. Review code đã xác nhận ba sửa lỗi: login/email race, timestamp thu hồi phiên, giữ bản nháp khi đối chiếu.
- Hoàn thành: format/lint/typecheck/build; 41 unit + 55 integration + 25 browser = 121 PASS. Hai sửa UI về contrast/touch target đã được reviewer chấm resolved. Documenter xác nhận extension kế thừa hệ thống, không đổi prototype DESIGN.md.
- Runtime local web/API đã khởi động lại; mở được `/workspace/admin/users` bằng cookie Admin của người dùng, DB local chỉ có tài khoản Admin đã có.
