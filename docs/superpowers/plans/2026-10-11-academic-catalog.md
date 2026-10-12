# Danh mục đào tạo và phân công

Tiếp tục trên `codex/bootstrap`, kế thừa Next.js/NestJS và shell Admin đã có. Không nhập dữ liệu HUCE giả vào database local.

## Quyết định nghiệp vụ

- Admin tạo/sửa mã, tên, trạng thái khoa/ngành/môn. Mã chuẩn hóa uppercase, duy nhất trong từng loại. Ngành/môn chọn khoa khi tạo; khoa phụ trách không đổi trong MVP.
- Ngừng khoa cần ngừng ngành/môn con trước. Không cascade, không xóa. Kích hoạt ngành/môn yêu cầu khoa hoạt động.
- Môn dùng chung nhiều ngành, kể cả khác khoa. Liên kết được lưu khi ngừng danh mục; thêm liên kết mới chỉ giữa danh mục hoạt động.
- Ngừng môn cần thu hồi phân công hiện hành trước. Phân công yêu cầu giảng viên ACTIVE, đã xác minh và môn/khoa hoạt động. Thu hồi có lý do, giữ lịch sử; phân công lại tạo bản ghi mới.
- `revision` và transaction ngăn ghi đè. Catalog/assignment mutations serialize bằng transaction advisory lock (khối lượng Admin nhỏ), kết hợp khóa hàng để ổn định quyền/trạng thái. Không ảnh hưởng đọc đồng thời.
- Giảng viên xem phân công của mình. Quyền sửa/gửi học liệu được bổ sung trong milestone học liệu, luôn kiểm tra phân công hiện hành tại API.

## Các commit theo chức năng

1. Khoa: migration revision; API ADMIN list/get/create/update; giao diện tìm/lọc/phân trang, form inline; kiểm thử quyền, validation, trùng mã, revision, CSRF, audit, browser.
2. Ngành: revision; thêm khoa phụ trách, điều kiện khoa hoạt động; kiểm thử lifecycle và liên kết cha.
3. Môn và chương trình: tạo/sửa môn; cập nhật các ngành sử dụng môn, hỗ trợ khác khoa; kiểm thử atomicity, revision, lifecycle.
4. Phân công: cấp/thu hồi/lịch sử, tìm giảng viên/môn có phân trang; trang xem phân công riêng giảng viên; kiểm thử quyền, điều kiện, cạnh tranh, lịch sử.

Mỗi commit chạy kiểm tra thích hợp trước khi ghi. Cuối milestone chạy toàn bộ lint/typecheck/unit/integration/build/Playwright, review và kiểm tra desktop/tablet/mobile. Cập nhật tài liệu, migrate local additive, restart bản chạy và push các commit; không merge/deploy.
