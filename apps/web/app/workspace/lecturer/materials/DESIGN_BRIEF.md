# Học liệu của tôi

Mode: Operate. Mở rộng shell và form production hiện có; không sửa DESIGN.md lịch sử. Giảng viên chuẩn bị metadata nháp theo môn được phân công, sinh viên dùng cùng cấu trúc ở /workspace/student/materials với nhãn tài liệu bổ sung.

THESIS: người biên soạn biết bản nào đang chuẩn bị, đã lưu gì, còn thiếu PDF hay đang chờ duyệt.
OWN-WORLD: navy #001e42, blue #0056a6, Segoe UI, nền/line/focus từ globals.css; inline editor kế thừa user-editor, không mở thêm thế giới thị giác.
STORY: tạo → điền metadata/nguồn/quyền → chọn môn → lưu → PDF SAFE → gửi duyệt → theo dõi lịch sử/rút về nháp với lý do. Sau thu hồi phân công giữ metadata, chặn sửa/gửi nhưng vẫn được rút yêu cầu của mình.
FIRST VIEWPORT: heading, phạm vi nháp/chờ duyệt trung thực, nút tạo và danh sách riêng có bộ lọc trạng thái; editor mở ngay trước danh sách. Bản đã lưu có PDF, gửi/rút và lịch sử. Bản terminal có xác nhận tạo kế tiếp; lịch sử phiên bản nằm sau lần duyệt, chọn bản để xem quyết định cũ.
FORM: thuộc bề mặt Operate hiện có, không concept roll cho việc mở rộng. Hai cột field desktop, một cột mobile; bảng reflow thành hàng nhóm; lựa chọn môn đầy đủ và wrap. Môn thêm/gỡ được stage, chỉ lưu khi bấm Lưu bản nháp. Xung đột/lỗi giữ nội dung; đóng khi có sửa cần xác nhận inline. Form loading/error/retry, focus và nút 44px theo nền tảng.

Dữ liệu local bắt đầu rỗng. Chỉ test DB chứa nội dung synthetic. Browser desktop/tablet/mobile không thay kiểm tra thiết bị thật hoặc khả năng cài PWA.

Gửi có xác nhận inline vì khóa snapshot, không thêm modal. Rút bắt buộc lý do; giữ lý do khi lỗi/refresh và hỏi bỏ thay đổi khi rời trang. Khi chưa rõ kết quả phải tải trạng thái trước retry. Chờ duyệt khóa metadata/PDF nhưng vẫn mở để xem/rút. Lịch sử có loading/error/retry/phân trang. Không ship raster.

FINISH: hoàn tất review giao diện và đối soát hệ thống sau kiểm chứng; giữ DESIGN/sidecar wireframe lịch sử.
