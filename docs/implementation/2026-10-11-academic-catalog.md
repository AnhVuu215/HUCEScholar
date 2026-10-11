# Danh mục đào tạo và phân công

## Khoa

API `/api/v1/admin/catalog/faculties`: GET danh sách có search/status/page/limit, GET `/:id`, POST tạo, PATCH `/:id` sửa mã/tên/trạng thái với revision. UI `/workspace/admin/catalog/faculties` dùng cùng shell Admin, có tìm/lọc/phân trang và form inline. CSRF, quyền ADMIN, audit trong transaction; mã trim/uppercase và unique. Không xóa hoặc cascade. Chặn ngừng khoa còn ngành/môn hoạt động. Migration `202610110003_faculty_revision` thêm revision và CHECK, giữ schema 23 bảng và các trigger/index cũ.

Danh mục local bắt đầu rỗng; dữ liệu kiểm thử chỉ ở database riêng. Đây là triển khai local, chưa vận hành hoặc xác minh trên điện thoại thật. Khoa/ngành/môn/phân công sẽ được ghi vào các commit riêng theo kế hoạch `docs/superpowers/plans/2026-10-11-academic-catalog.md`.

## Ngành

API cùng mẫu tại `/admin/catalog/programs`, thêm facultyId bắt buộc khi tạo và bộ lọc facultyId. Khoa được giữ cố định sau khi tạo. Tạo/kích hoạt ngành yêu cầu khoa hoạt động; ngừng ngành vẫn giữ liên kết lịch sử. Migration `202610110004_program_revision` thêm revision dương. Picker khoa tìm theo mã/tên, phân trang 20, có retry, không cắt danh sách ở 100 bản ghi. UI `/workspace/admin/catalog/programs`. Kiểm thử bổ sung chặn ngừng khoa có con, không ghi audit/revision khi thất bại, rollback khi audit lỗi và giữ draft khi 409.

## Môn và ngành sử dụng

API cùng mẫu `/admin/catalog/courses`; revision kế thừa baseline. GET `/:id` trả thêm programs trong cùng snapshot. PATCH `/courses/:id/programs` thay tập ngành với revision và tối đa 100 liên kết/môn trong MVP. Hỗ trợ khác khoa. Thêm mới yêu cầu môn/ngành/khoa hoạt động; liên kết lịch sử với ngành đã ngừng có thể giữ/gỡ, không tự xóa. Toàn bộ liên kết/revision/audit cập nhật atomic. Ngừng môn bị chặn nếu còn phân công hiện hành. UI `/workspace/admin/catalog/courses` có form riêng để tìm/chọn/gỡ ngành, thay đổi chỉ ghi khi bấm Lưu liên kết.
