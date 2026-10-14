# Giảng viên tự công bố tài liệu PDF

Quyết định của chủ sản phẩm ngày14/10/2026: không yêu cầu tài liệu HUCE; giảng viên tự upload và công bố, không cần admin duyệt. Không thay đổi định dạng PDF25MiB, quét an toàn, phân công môn, quyền chủ sở hữu hoặc luồng tài liệu sinh viên.

- Giảng viên có thể để trống/không gửi sourceReference và rightsBasis. UI ghi rõ nguồn tùy chọn và không yêu cầu khai báo căn cứ quyền. Không tự điền nguồn HUCE, giấy phép hoặc lời xác nhận giả.
- Sinh viên vẫn cần nguồn/căn cứ quyền, gửi duyệt và admin quyết định như hiện tại. Không thể gọi endpoint tự công bố của giảng viên.
- POST /material-drafts/:id/publish nhận revision. Chỉ LECTURER hoạt động/đã xác minh, quản lý đúng học liệu, đủ phân công môn; file SAFE; tiêu đề/môn hợp lệ. Khóa actor/catalog/document/version/file theo thứ tự hiện tại; atomically chuyển DRAFT→APPROVED và đặt current_version_id. APPROVED là trạng thái terminal nội bộ; publication_method=LECTURER_SELF phân biệt nguồn công bố với ADMIN_REVIEW. Không tạo publication_requests hoặc giả quyết định admin.
- Khi retry sau mất response, tải trạng thái để đối chiếu; retry revision cũ/concurrent publish không tạo lịch sử trùng. Không tự mở tài liệu HIDDEN. FILE CHECKING/FAILED/MISSING không công bố. Tài khoản khác/admin không công bố thay. Phiên bản APPROVED bất biến; cập nhật bằng phiên bản kế tiếp, giữ ghi chú cũ.
- Học liệu giảng viên cũ SUBMITTED vẫn được rút về nháp; CHANGES_REQUIRED được mở lại. Không tự chuyển các yêu cầu hoặc tài liệu cũ sang công bố. Endpoint submit cũ còn tương thích nhưng UI giảng viên dùng publish.
- Thêm publication_method qua migration SQL mới, default ADMIN_REVIEW để giữ bản cũ. Giữ nguyên23bảng/FK/partial index/trigger; không db push. Restore không yêu cầu source/rights text với LECTURER_SELF; vẫn kiểm tra SAFE, APPROVED, hạn hiệu lực nếu có và visibility.
- UI label chính xác: Đã công bố cho self-publication, Đã duyệt cho review cũ; thông báo không khẳng định admin đã duyệt. Nút Công bố có xác nhận inline và recovery riêng. Thư viện/reader không yêu cầu nguồn nếu trống; không trình bày dữ liệu tự công bố như đã kiểm chứng giấy phép.

Kiểm chứng: API role/owner/CSRF/revision/file/assignment/hidden, nguồn tùy chọn chỉ giảng viên, publish mới và phiên bản kế tiếp; browser lecturer không điền nguồn/quyền→upload→SAFE→publish mất phản hồi→refresh→library đọc, sinh viên vẫn gửi duyệt. Migrate test và local, lint/typecheck/unit/build/integration/browser tuần tự; không codegen trong lúc Nest watch test chạy. Không deploy/push/merge.
