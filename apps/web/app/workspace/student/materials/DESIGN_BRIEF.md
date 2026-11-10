# Học liệu của tôi

Mode: Operate. Mở rộng shell và form production hiện có; không sửa DESIGN.md lịch sử. Từ ROLE-01 (10/11/2026) chỉ sinh viên có trang này, ở /workspace/student/materials; không còn vai trò giảng viên hay phân công môn.

THESIS: người biên soạn biết bản nào đang chuẩn bị, đã lưu gì, còn thiếu PDF hay đang chờ duyệt.
OWN-WORLD: navy #001e42, blue #0056a6, Segoe UI, nền/line/focus từ globals.css; inline editor kế thừa user-editor, không mở thêm thế giới thị giác.
STORY: sinh viên chọn PDF/DOCX ngay lúc tạo → tiêu đề/môn/nguồn/căn cứ quyền → lưu thông tin và upload → scan nguồn/chuyển PDF/scan PDF → xem trước → gửi duyệt; quản trị viên duyệt mới công bố (ROLE-01). Trước ROLE-01 giảng viên tự công bố; luồng đó đã bỏ.
FIRST VIEWPORT: heading, phạm vi nháp/chờ duyệt trung thực, nút tạo và danh sách riêng có bộ lọc trạng thái; editor mở ngay trước danh sách. Bản đã lưu có PDF, gửi/rút và lịch sử. Bản terminal có xác nhận tạo kế tiếp; lịch sử phiên bản nằm sau lần duyệt, chọn bản để xem quyết định cũ.
FORM: thuộc bề mặt Operate hiện có, không concept roll cho việc mở rộng. Hai cột field desktop, một cột mobile; bảng reflow thành hàng nhóm; lựa chọn môn đầy đủ và wrap. Môn thêm/gỡ được stage, chỉ lưu khi bấm Lưu bản nháp. Xung đột/lỗi giữ nội dung; đóng khi có sửa cần xác nhận inline. Form loading/error/retry, focus và nút 44px theo nền tảng.

Dữ liệu local bắt đầu rỗng. Chỉ test DB chứa nội dung synthetic. Browser desktop/tablet/mobile không thay kiểm tra thiết bị thật hoặc khả năng cài PWA.

Gửi có xác nhận inline vì khóa snapshot, không thêm modal. Rút bắt buộc lý do; giữ lý do khi lỗi/refresh và hỏi bỏ thay đổi khi rời trang. Khi chưa rõ kết quả phải tải trạng thái trước retry. Chờ duyệt khóa metadata/PDF nhưng vẫn mở để xem/rút. Lịch sử có loading/error/retry/phân trang. Không ship raster.

FINISH: hoàn tất review giao diện và đối soát hệ thống sau kiểm chứng; giữ DESIGN/sidecar wireframe lịch sử.

PDF/DOCX17/10: một file selection ở DraftForm, gợi ý tên chỉ khi tiêu đề trống. Metadata-only giữ hành vi lưu/đóng; có file thì giữ form để upload/status/preview. Lỗi upload giữ ID và file; mất phản hồi POST metadata chặn tạo lại, hướng dẫn kiểm tra danh sách. Scan/conversion/publication tách nhãn, poll tối đa3phút khi tab hiện, có dừng/cập nhật thủ công và không ghi đè các trường đang soạn. Word có thể lệch bố cục/công thức; xem trước trước công bố. Không mở modal hoặc đổi visual system.

Nếu metadata ở tab khác đổi trong lúc poll, giữ revision ban đầu và hiện snapshot mới trong khối đối chiếu hiện có. Người dùng sửa/đối chiếu rồi xác nhận trước lưu với revision mới, hoặc chủ động dùng thông tin máy chủ. Không âm thầm nhận revision metadata mới rồi ghi nội dung cũ lên trên. File-only progress được cập nhật độc lập.

UPLOAD-01 20/10: trang dùng `useScanWatch` (trước ROLE-01 giảng viên dùng chung). Chỉ poll khi tab hiện; tab ẩn không gửi request và không tính vào ba phút, hiện lại thì kiểm tra ngay. Ba lần lỗi kết nối liên tiếp dừng chờ và báo mất kết nối, không phải lỗi file; 401/403/404 dừng và báo lý do. Thông báo chờ luôn nói file đã lưu, không cần tải lên lại, và giờ kiểm tra gần nhất.
