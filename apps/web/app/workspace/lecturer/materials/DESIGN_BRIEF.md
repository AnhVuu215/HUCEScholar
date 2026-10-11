# Học liệu của tôi

Mode: Operate. Mở rộng shell và form production hiện có; không sửa DESIGN.md lịch sử. Giảng viên chuẩn bị metadata nháp theo môn được phân công, sinh viên dùng cùng cấu trúc ở /workspace/student/materials với nhãn tài liệu bổ sung.

THESIS: người biên soạn biết bản nào đang chuẩn bị, đã lưu gì và còn thiếu PDF.
OWN-WORLD: navy #001e42, blue #0056a6, Segoe UI, nền/line/focus từ globals.css; inline editor kế thừa user-editor, không mở thêm thế giới thị giác.
STORY: tạo → điền metadata/nguồn/quyền → chọn môn → lưu → tìm/mở lại. Sau thu hồi phân công giữ metadata và nói rõ vì sao chặn sửa.
FIRST VIEWPORT: heading, phạm vi nháp trung thực, nút tạo và danh sách riêng; editor mở ngay trước danh sách. Bản đã lưu có khu vực PDF thật phía sau metadata, hiển thị trạng thái kỹ thuật; chưa có gửi duyệt.
FORM: thuộc bề mặt Operate hiện có, không concept roll cho việc mở rộng. Hai cột field desktop, một cột mobile; bảng reflow thành hàng nhóm; lựa chọn môn đầy đủ và wrap. Môn thêm/gỡ được stage, chỉ lưu khi bấm Lưu bản nháp. Xung đột/lỗi giữ nội dung; đóng khi có sửa cần xác nhận inline. Form loading/error/retry, focus và nút 44px theo nền tảng.

Dữ liệu local bắt đầu rỗng. Chỉ test DB chứa nội dung synthetic. Browser desktop/tablet/mobile không thay kiểm tra thiết bị thật hoặc khả năng cài PWA.
