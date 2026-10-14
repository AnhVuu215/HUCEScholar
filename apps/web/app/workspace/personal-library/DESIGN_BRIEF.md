# Thư viện của tôi

Mode Operate, ordinary extension của kho và workspace production, dùng navy/Segoe và library-list/native controls. Không đổi root DESIGN/sidecar wireframe hoặc thêm raster.

## Direction contract

THESIS: tìm lại tài liệu đã chủ động lưu và phiên bản đã đọc, biết rõ hai liên kết có ý nghĩa khác nhau.
OWN-WORLD: sidebar navy, nền mát, content-section và hàng library-list; chữ/version/thời gian giữ thứ bậc sẵn có, không bìa minh họa.
STORY: lưu từ reader → Đã lưu mở bản hiện hành; Đọc gần đây mở exact version và tiến độ server. Bỏ lưu chỉ bỏ liên kết cá nhân.
FIRST VIEWPORT: heading, dẫn giải riêng tư ngắn, hai nút chọn danh sách, trạng thái/tổng, hàng title/author/version rồi CTA đọc/bỏ lưu. Không làm lại shell.
FORM: controls native ≥44px, hàng desktop reflow một cột mobile, phân trang wrap. Lỗi trạng thái lưu giữ unknown và yêu cầu refresh trước retry; bỏ lưu xác nhận inline. Tài liệu không khả dụng không có title/link đọc, vẫn bỏ lưu được. Không cache/offline.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## QUALITY BAR

Ordinary Operate extension: giữ shell/navy/Segoe production; phân biệt saved-current với recent-version/page ngay trong nội dung. Link đọc và nút ≥44px, không tràn trang ở 1440/768/360; reader render PDF thật trước chụp. Bỏ lưu có xác nhận; unknown/error yêu cầu đối chiếu trạng thái; focus và thông báo không mất khi row unmount. Không lộ metadata mục mất quyền, không thêm raster hoặc thay root DESIGN/sidecar wireframe.
