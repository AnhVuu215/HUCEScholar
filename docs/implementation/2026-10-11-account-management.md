# Mốc quản lý tài khoản — 11/10/2026

## Chức năng đã triển khai

Trang `/workspace/admin/users` dùng session Admin hiện có. Có tìm tên/email, lọc role/trạng thái, phân trang 20 bản ghi; cấp tài khoản giảng viên/sinh viên, sửa tên/email, khóa/mở khóa và xác minh tài khoản PENDING. Bảng chuyển sang nhóm thông tin một cột trên điện thoại; tạo/sửa và xác nhận khóa dùng form inline, có focus, lỗi, trạng thái chờ, retry và thông báo kết quả.

Admin nhập password khởi tạo 16–128 ký tự và xác nhận đã đối chiếu người dùng với danh sách hợp lệ. Tạo account ACTIVE/verified, Argon2id hash và audit trong transaction. API không trả password/hash/phiên; audit chỉ giữ actor, event và khóa thực thể. Không có danh sách trường hoặc dữ liệu HUCE thật được nhập tự động. Việc đối chiếu là trách nhiệm của Admin.

ADMIN chỉ đọc; không cấp ADMIN mới, không đổi role/mật khẩu hoặc xóa tài khoản trong module này. Cách này giữ Admin hiện có và tránh thay role làm sai tham chiếu giảng viên/phân công. Các chức năng này cần nghiệp vụ riêng nếu mở rộng về sau.

## API

Tất cả endpoint đều yêu cầu session ACTIVE/verified với role ADMIN và trả `Cache-Control: no-store`. Mutation yêu cầu Origin + CSRF. Guard và DTO validation tại NestJS là ranh giới bảo mật; ẩn nút ở frontend không cấp quyền.

| Method | Endpoint | Input/kết quả |
|---|---|---|
| GET | `/api/v1/admin/users` | `search?`, `role?`, `status?`, `page=1`, `limit=20` (tối đa 100); `{items,total,page,limit}` |
| GET | `/api/v1/admin/users/:id` | Bản hiện hành để đối chiếu; `{user}` |
| POST | `/api/v1/admin/users` | `email`, `displayName`, role LECTURER/STUDENT, `password`, `eligibilityConfirmed:true`; 201 `{user}` |
| PATCH | `/api/v1/admin/users/:id` | `email`, `displayName`, `revision`; 200 `{user}` |
| PATCH | `/api/v1/admin/users/:id/status` | ACTIVE/LOCKED, `revision`; kích hoạt chưa verified cần `eligibilityConfirmed:true`; 200 `{user}` |

Projection user: `id` chuỗi int64, `email`, `displayName`, `role`, `status`, `verifiedAt`, `createdAt`, `updatedAt`, `revision`. 400 input/ID sai, 401 session không hợp lệ, 403 không có quyền/đích ADMIN, 404 không có user, 409 email trùng (`EMAIL_TAKEN`) hoặc revision cũ (`STALE_REVISION`). Email được trim/lowercase, tên trim. Không mass assign thuộc tính DB từ JSON.

## Nhất quán và thu hồi phiên

Writes khóa actor để ổn định quyền ADMIN, khóa user đích và kiểm tra revision trong cùng transaction với audit. Hai request dùng cùng revision chỉ một request ghi thành công. List/count dùng snapshot RepeatableRead. Xung đột sửa không làm mất nội dung: tải bản mới, hiển thị giá trị hiện hành và yêu cầu xác nhận đối chiếu trước khi lưu với revision mới.

Khóa/mở khóa dùng trigger thu hồi phiên có sẵn; mở khóa không hồi sinh cookie cũ. Đổi email thu hồi mọi session bằng thời gian database `greatest(clock_timestamp(),created_at)` để không vi phạm CHECK nếu đồng hồ API chậm hơn DB. Đổi tên giữ phiên. Login recheck email dưới row lock cùng status/verification/password_hash: một request đọc email cũ trước khi Admin đổi email không thể tạo phiên mới sau thao tác thu hồi.

Không thay schema hoặc migration. Toàn bộ 23 bảng và constraints/trigger đã có được giữ nguyên. Không thêm dependency.

## Bằng chứng kiểm tra

- Baseline trước thay đổi: 40 unit PASS, working tree sạch.
- API mới: quan sát RED vì endpoint chưa có; sau triển khai pass. Regression login/email race quan sát RED→GREEN. Clock-skew regression quan sát 500 do CHECK rồi GREEN sau sửa.
- Integration cuối: 55 tests PASS trên database `_test` và Redis DB15; không ghi fixture vào database local người dùng.
- Kết quả cuối: format, lint, typecheck, build PASS; 41 unit + 55 integration + 25 Playwright = **121 tests PASS**. Browser kiểm tra CRUD, từ chối role khác, retry/empty, lỗi trùng email, giữ bản nháp/đối chiếu và reflow desktop 1440, tablet 768, mobile 360. Assertion trang tiến độ đã cập nhật theo nội dung mới.
- Code review độc lập: ba finding đã sửa và reviewer kiểm tra lại, không còn finding material trong phạm vi đó.
- Detector Impeccable: advisory cỡ chữ so với DESIGN.md của prototype. Surface sản phẩm kế thừa cỡ chữ/tokens hiện hữu; không đổi hệ thống thiết kế prototype để làm im cảnh báo.
- Review UI độc lập yêu cầu sửa placeholder và vùng chạm; đã sửa, chụp lại cùng sáu ảnh list/form trên desktop/tablet/mobile. Verdict cho hai sửa lỗi: resolved/ship; placeholder 6.06:1, text actions tối thiểu 44×44px, không thấy regression trong capture. Documenter kiểm tra hệ thống đã kế thừa, không đổi DESIGN.md/sidecar của prototype.
- Web/API bản build đã khởi động lại ở 127.0.0.1:3000/3001. Trang quản lý mở được bằng cookie Admin local hiện có sau restart, hiển thị đúng một ADMIN; không thêm tài khoản minh họa vào DB local. Bằng chứng runtime/screenshot nằm trong `.local/` bị Git bỏ qua.

## Giới hạn và bước kế tiếp

Chưa có SMTP/gửi email, reset hoặc bắt buộc đổi mật khẩu; password khởi tạo là password hiện có, không phải token một lần. Chưa có dữ liệu trường, catalog, phân công giảng viên, học liệu, upload/reader hay PWA service worker. Kiểm tra responsive bằng Chrome tự động không chứng minh Safari/iOS/Android/PWA trên thiết bị thật. Chưa deploy hoặc merge vào main.

Tiếp theo: quản lý khoa/ngành/môn, sau đó phân công giảng viên để chuẩn bị kho học liệu và luồng kiểm duyệt.
