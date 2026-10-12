# Kho học liệu và reader

Mode: Operate cho tìm/lọc; Read cho PDF. Ordinary extension trong workspace hiện có; CSS sản phẩm là nguồn trực quan, không đổi DESIGN/sidecar wireframe.

THESIS: tìm đúng học liệu, biết nguồn và phiên bản, vào trang đọc mà vẫn thấy quyền tải.
OWN-WORLD: navy sidebar, nền mát, Segoe UI, form/button/table vocabulary hiện hữu; không bìa sách giả hoặc số liệu giả.
STORY: tìm/lọc → đọc đúng version → mở lại trang đã lưu → trang/zoom/xoay → ghi chú riêng theo trang hoặc tải nếu nguồn cho phép.
FIRST VIEWPORT: kho ưu tiên bộ lọc/kết quả; reader có trạng thái lưu tiến độ, tiêu đề/version và điều khiển. Nguồn/quyền mở rộng inline; ghi chú riêng nằm sau trang PDF với form và danh sách cùng trang đọc.
FORM: danh sách thành hàng rộng trên desktop, một cột trên mobile; reader vừa chiều rộng, zoom cuộn trong vùng riêng, điều khiển chạm tối thiểu 44px. Loading/error/empty/retry rõ ràng; văn bản dài wrap. Không motion trang trí hoặc raster mới.

Ghi chú plain text theo trang, riêng theo người/version; form giữ trang ban đầu khi đổi trang PDF. Lỗi lưu giữ bản soạn, xung đột yêu cầu tải lại. Tiến độ chỉ lưu trang render thành công, không ghi đè revision cũ. Không ngụ ý dữ liệu trường thật, DRM, highlight hoặc offline. API là nguồn quyền; frontend không quyết định đủ quyền từ nhãn SAFE.
