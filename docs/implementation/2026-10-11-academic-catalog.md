# Danh mục đào tạo và phân công

## Khoa

API `/api/v1/admin/catalog/faculties`: GET danh sách có search/status/page/limit, GET `/:id`, POST tạo, PATCH `/:id` sửa mã/tên/trạng thái với revision. UI `/workspace/admin/catalog/faculties` dùng cùng shell Admin, có tìm/lọc/phân trang và form inline. CSRF, quyền ADMIN, audit trong transaction; mã trim/uppercase và unique. Không xóa hoặc cascade. Chặn ngừng khoa còn ngành/môn hoạt động. Migration `202610110003_faculty_revision` thêm revision và CHECK, giữ schema 23 bảng và các trigger/index cũ.

Danh mục local bắt đầu rỗng; dữ liệu kiểm thử chỉ ở database riêng. Đây là triển khai local, chưa vận hành hoặc xác minh trên điện thoại thật. Khoa/ngành/môn/phân công được chia thành các commit riêng theo kế hoạch `docs/superpowers/plans/2026-10-11-academic-catalog.md`.

## Ngành

API cùng mẫu tại `/admin/catalog/programs`, thêm facultyId bắt buộc khi tạo và bộ lọc facultyId. Khoa được giữ cố định sau khi tạo. Tạo/kích hoạt ngành yêu cầu khoa hoạt động; ngừng ngành vẫn giữ liên kết lịch sử. Migration `202610110004_program_revision` thêm revision dương. Picker khoa tìm theo mã/tên, phân trang 20, có retry, không cắt danh sách ở 100 bản ghi. UI `/workspace/admin/catalog/programs`. Kiểm thử bổ sung chặn ngừng khoa có con, không ghi audit/revision khi thất bại, rollback khi audit lỗi và giữ draft khi 409.

## Môn và ngành sử dụng

API cùng mẫu `/admin/catalog/courses`; revision kế thừa baseline. GET `/:id` trả thêm programs trong cùng snapshot. PATCH `/courses/:id/programs` thay tập ngành với revision và tối đa 100 liên kết/môn trong MVP. Hỗ trợ khác khoa. Thêm mới yêu cầu môn/ngành/khoa hoạt động; liên kết lịch sử với ngành đã ngừng có thể giữ/gỡ, không tự xóa. Toàn bộ liên kết/revision/audit cập nhật atomic. Ngừng môn bị chặn nếu còn phân công hiện hành. UI `/workspace/admin/catalog/courses` có form riêng để tìm/chọn/gỡ ngành, thay đổi chỉ ghi khi bấm Lưu liên kết.

## Phân công

- ADMIN: GET/POST `/api/v1/admin/assignments`, PATCH `/:id/revoke`; UI `/workspace/admin/assignments`. Tìm theo môn, tên/email giảng viên; lọc hiện hành/thu hồi và phân trang. Picker môn/giảng viên có tìm và phân trang.
- LECTURER: GET `/api/v1/lecturer/assignments`; UI `/workspace/lecturer/assignments`. Server ép lecturerId theo phiên đăng nhập, không nhận lecturerId từ query. STUDENT không có quyền đọc các endpoint này.
- Cấp yêu cầu giảng viên ACTIVE/verified đúng role, môn/khoa hoạt động. Transaction giữ khóa hàng và advisory lock dùng chung với catalog, chống tranh chấp khi ngừng môn. Không có hai phân công hiện hành cho cùng giảng viên/môn.
- Thu hồi yêu cầu lý do 1–1000 ký tự, chỉ thực hiện một lần. Giữ nguyên bản ghi, dùng thời gian DB và lưu revoked_by/audit cùng giao dịch; cấp lại có ID mới. Không cập nhật bảng tài liệu, phiên bản hoặc quyền sở hữu.
- API học liệu chưa tồn tại. Kiểm tra phân công tại sửa/gửi/duyệt sẽ được triển khai cùng học liệu; không suy ra các quyền này đã được thực thi chỉ từ màn hình phân công.

## Ranh giới và kiểm chứng

Hai migration additive bổ sung revision khoa/ngành; schema vẫn 23 bảng, 47 FK, 60 CHECK, 7 partial index và snapshot guards gốc. SQL tham chiếu trong docs/database là baseline lịch sử, không chạy lại lên database ứng dụng.

Kiểm thử mới: quyền/CSRF, validation, trùng mã, revision, lifecycle cha/con, cập nhật khác khoa, liên kết inactive, rollback audit; phân công đúng người, giảng viên chỉ thấy mình (kể cả giảng viên khác cùng môn), tạo/thu hồi đồng thời, tranh chấp ngừng môn và lịch sử cấp lại. Browser kiểm tra hành trình tạo/sửa danh mục, liên kết ngành, stale draft, cấp/thu hồi và retry mạng. Captures synthetic tại `.impeccable/review/catalog/` (Git bỏ qua), Chrome 1440×1000, 768×1024, 360×800; không có overflow ngang. Chưa xác minh thiết bị thật, cài PWA hoặc deployment.

Kết quả cuối ngày 11/10/2026: 41 unit test, 66 integration test và 30 Playwright test đạt (137 ca); lint/typecheck, format check và build API/web đạt. Bộ Playwright dùng Admin riêng cho danh mục và phân công, tránh vượt giới hạn 10 lần đăng nhập/email trong 15 phút khi mở rộng suite; giới hạn ứng dụng giữ nguyên. `pnpm test:setup` chuẩn bị các tài khoản tổng hợp này chỉ trong `hucescholar_test`, thông tin đăng nhập nằm ở file local bị Git bỏ qua.

Review UI xác nhận hai sửa đổi: hiển thị đầy đủ lựa chọn giảng viên/môn trên tablet/mobile, và focus/caret đồng nhất cho ô lý do thu hồi. Lượt xác nhận chỉ chấm lại hai điểm đó; không suy ra đã kiểm tra toàn bộ khả năng tiếp cận hoặc thiết bị thật. Handoff tài liệu giữ nguyên hệ thống production hiện tại; `DESIGN.md` gốc vẫn mô tả prototype lịch sử.

Local đã nhận đủ bốn migration: 60 CHECK, một Admin, chưa có khoa/ngành/môn/phân công được nhập. Không chép fixture test sang local.

API/web local đã restart từ build cuối: health API trả `ok`, trang phân công trả HTTP 200 và trình duyệt với phiên Admin hiện tại tải thành công danh mục khoa rỗng tại `http://127.0.0.1:3000/workspace/admin/catalog/faculties`.
