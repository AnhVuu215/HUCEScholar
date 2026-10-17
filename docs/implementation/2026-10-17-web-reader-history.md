# Tiếp tục bản web — 17/10/2026

Nhánh `codex/reader-history-guard`, tiếp nối `7e9ec26`. Ưu tiên web; người dùng đã yêu cầu tạm hoãn cài PWA. Không thêm dependency, API, migration hay thay đổi quyền đọc/ghi chú.

## Trạng thái sản phẩm

- Giảng viên upload PDF từ nguồn tự chọn và tự công bố sau SAFE, không cần admin duyệt; môn/phân công và ownership vẫn kiểm tra tại API. Hiện nhận PDF tối đa25MiB, chưa nhận mọi định dạng file.
- Sinh viên tìm/lọc, đọc PDF, tạo/sửa/xóa ghi chú plain text riêng theo phiên bản/trang, lưu tiến độ và dùng thư viện cá nhân. Chưa có highlight trực tiếp lên chữ trong PDF.
- Admin cấp/quản lý tài khoản, danh mục/phân công, duyệt tài liệu sinh viên và quản lý vòng đời học liệu.
- Đây là chức năng local với tài liệu minh họa; chưa xác nhận dữ liệu HUCE hoặc môi trường vận hành.

## Thay đổi lượt này

Khoảng trống đã công bố ở mốc reader: Back/Forward SPA bỏ qua guard click/unload. Browser regression đầu tiên tái hiện không có xác nhận khi Back.

Root cài bộ theo dõi vị trí lịch sử một lần cho mỗi document, kể cả lúc chưa có bản soạn. Giữ nguyên state opaque của Next, chỉ thêm nhóm/vị trí; không đưa nội dung ghi chú, credential hay API response vào history. Trình duyệt có Navigation API cung cấp vị trí thật cho cả fragment; browser thiếu API dùng các entry do ứng dụng đánh dấu.

Guard capture `popstate` chạy trước router. Nếu người dùng chọn ở lại hoặc thao tác lưu còn pending, giữ router/editor tại chỗ và trở về entry gốc bằng `history.go(delta)`. Không push entry thay thế, giữ Forward và độ dài lịch sử. Write push/replace đến trong lúc trở về được xếp hàng, chỉ áp dụng sau khi khôi phục để không ghi nhầm index hoặc cắt mất Forward. Callback đọc trạng thái React đã commit mới nhất.

Đi tới fragment trong cùng trang không hỏi bỏ bản soạn. Trạng thái Next của entry fragment được giữ để Forward không gây reload. Guard link/logout/beforeunload hiện hữu tiếp tục hoạt động; quyền riêng tư và cơ chế lưu/idempotency/revision không đổi.

## Kiểm chứng

Các kiểm tra đã đạt:

- Browser: hủy Back/Forward, xác nhận rời trang, giữ bản soạn/URL/history length, không lưu nội dung trong history; chạy cả vị trí native và fallback không có Navigation API.
- Browser: fragment Back/Forward, chuyển nhiều bước, entry qua reload, chặn khi POST lưu đang pending, rồi điều hướng khi máy chủ đã xác nhận; giữ hồi quy note retry/conflict.
- Regression cho write của router đến trong lúc khôi phục: RED trên fallback (Back tiếp theo không còn hỏi), GREEN sau sửa. Bốn ca tập trung đạt, gồm hồi quy ghi chú cũ.
- `pnpm check` đạt: lint/typecheck, 8 suite/50 unit test, build API và web. `pnpm format:check` đạt.
- Toàn bộ browser **71/71 đạt** trong một lượt, Chrome local, một worker (3,6 phút). Có kiểm tra luồng tài khoản, phân công, upload/tự công bố, kiểm duyệt sinh viên, reader, ghi chú, thư viện cá nhân và nền tảng PWA; không thực hiện cài ứng dụng trên thiết bị.
- Smoke bản build local3000/3001: health, landing/login/project/library trả200; workspace `private, no-store`, notes chưa đăng nhập trả401/`no-store`.

Review độc lập chỉ ra rủi ro mất metadata Next ở fragment và ghi history trong lúc đang khôi phục. Đã giữ opaque state, dùng index native khi có và xếp hàng write; regression Back lặp lại qua trường hợp write trễ đạt. Kiểm thử dùng cấu hình Playwright chuẩn với API đã build, giữ nguyên env/port/database/Redis cách ly; tránh restart Nest watch trong lúc browser chạy.

## Giới hạn

Chưa có lưu nháp bền vững: đóng tiến trình/trình duyệt, sự cố thiết bị hoặc điều hướng đã chấp nhận bỏ thay đổi vẫn có thể mất bản soạn. Cross-document departure dùng xác nhận native `beforeunload`, phụ thuộc chính sách browser; không hứa chặn tuyệt đối mọi kiểu điều hướng.

Browser cũ thiếu Navigation API chỉ có offset chính xác trong vùng history do ứng dụng đánh dấu. Nếu gặp fragment/entry cũ không có vị trí, bắt đầu vùng theo dõi mới thay vì đoán chiều; guard không bảo đảm Back vượt ranh giới đó. Chưa kiểm chứng Safari/iOS/Android thật; Playwright Chrome và mô phỏng bỏ Navigation API không thay thế thiết bị thật. API auth redirect và route do chương trình chủ động thay đổi không phải transaction blocker tổng quát của Next.

## Thứ tự tiếp theo

1. Web: highlight chữ với PDF có text layer, riêng theo owner/version; PDF scan giữ ghi chú theo trang. Cần chốt hành vi anchor/màu/sửa/xóa và kiểm chứng tọa độ khi zoom/xoay trước triển khai.
2. Tài khoản: tự đổi mật khẩu, buộc đổi mật khẩu khởi tạo; reset qua email sau khi có SMTP và chính sách token/rate limit. Không có public signup/SSO.
3. Hoàn thiện web trước pilot: kiểm chứng nguồn nội dung và quyền, S3 private/HTTPS/cookie-proxy, backup và phục hồi. Không tự mua/tạo dịch vụ cloud.
4. PWA/thiết bị thật: tạm hoãn theo yêu cầu; không mở rộng cache sang PDF, ghi chú hoặc dữ liệu đăng nhập.

Log cục bộ `.local/history-*.log` bị Git bỏ qua; browser dùng database `_test`/Redis15 và PDF tổng hợp, không sửa dữ liệu demo/người dùng của bản local chính.
