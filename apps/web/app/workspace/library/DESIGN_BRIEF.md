# Kho học liệu và reader

Mode: Operate cho tìm/lọc; Read cho PDF. Ordinary extension trong workspace hiện có; CSS sản phẩm là nguồn trực quan, không đổi DESIGN/sidecar wireframe.

THESIS: tìm đúng học liệu, biết nguồn và phiên bản, vào trang đọc mà vẫn thấy quyền tải.
OWN-WORLD: navy sidebar, nền mát, Segoe UI, form/button/table vocabulary hiện hữu; không bìa sách giả hoặc số liệu giả.
STORY: tìm/lọc → đọc đúng version → mở lại trang đã lưu → trang/zoom/xoay → ghi chú riêng theo trang hoặc tải nếu nguồn cho phép.
FIRST VIEWPORT: kho ưu tiên bộ lọc/kết quả; reader có trạng thái lưu tiến độ, tiêu đề/version và điều khiển. Nguồn/quyền mở rộng inline; panel ghi chú bên phải khi viewport từ1280px, một cột dưới PDF khi hẹp hơn.
FORM: danh sách thành hàng rộng trên desktop, một cột trên mobile; reader vừa chiều rộng, zoom cuộn trong vùng riêng, điều khiển chạm tối thiểu 44px. Loading/error/empty/retry rõ ràng; văn bản dài wrap. Không motion trang trí hoặc raster mới.

UI V2 đợt A: dùng [shell chung](../../../components/auth/DESIGN_BRIEF.md) cho sidebar theo role và menu tài khoản trên header. Hàng filter dùng cỡ48px; source/type dùng popup bo12px, course còn native. Reader zoom dùng SelectField cỡ44px, hỗ trợ keyboard và portal chống cắt popup.

READ-02: bảng tám màu dùng radio native có tên, swatch và dấu chọn; hai cột trong panel hẹp, target44px và focus theo shell. Ba màu cũ giữ nguyên mã; thêm hồng/tím/cam/xanh ngọc/xám chỉ cho annotations, không đổi màu thương hiệu. Chữ/nhãn dùng ink trên paper; PDF giữ opacity0.65/multiply hiện hữu để đọc chữ gốc. Decoder giữ màu hex6 chưa biết và label dự phòng; editor yêu cầu chọn màu hỗ trợ trước khi lưu, không tự đổi màu.

READ-03: toolbar cạnh vùng chọn với Tô sáng/Ghi chú đoạn chọn, có nút tương đương trong thanh đọc. Popup bo12px, target44px, giới hạn theo viewport và ẩn khi đoạn chọn ngoài vùng nhìn. Tab Đoạn tô/Ghi chú trang chỉ mở một editor; đổi tab hoặc chọn mục khác hỏi bỏ bản soạn khi dirty, chặn khi pending/uncertain. Ẩn panel chuyển focus về nút hiện lại; mở lại trả focus vào tab. Vùng tô chồng nhau có danh sách tên màu và nội dung để chọn, không dùng ID làm tên đọc. Tiêu đề panel18px theo UI sản phẩm, giữ DESIGN wireframe lịch sử. Trích dẫn thuộc CITE-01, chưa có nút chưa hoạt động.

Ghi chú plain text theo trang và vùng tô chữ riêng theo người/version; form giữ trang ban đầu khi đổi trang PDF. Tô sáng từ vùng chọn thật, tám màu có nhãn chữ, ghi chú kèm tùy chọn. Lớp tô không chặn chọn chữ; mở bằng bấm đoạn hoặc nút trong danh sách. Thanh chọn đặt cạnh PDF, bộ soạn/danh sách cùng trang đọc; không modal. Lỗi lưu giữ bản soạn, xung đột yêu cầu tải lại. Tiến độ chỉ lưu trang render thành công, không ghi đè revision cũ. Không ngụ ý dữ liệu trường thật, DRM hoặc offline. PDF scan dùng ghi chú theo trang; API là nguồn quyền, frontend không quyết định đủ quyền từ nhãn SAFE.
