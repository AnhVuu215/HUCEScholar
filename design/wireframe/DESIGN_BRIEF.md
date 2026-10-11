# HUCEScholar — thiết kế tương tác v2

Ngày 11/10/2026. Đây là bản thiết kế để xem xét luồng và bố cục, chưa phải giao diện thương hiệu cuối cùng hoặc ứng dụng vận hành.

## Cơ sở và phạm vi

Người dùng đã yêu cầu thiết kế sau khi thống nhất: danh sách màn hình ba vai trò, wireframe các luồng chính, prototype bấm thử và trạng thái lỗi/trống/chờ duyệt. Tài liệu nguồn: proposal, use case, quy tắc nghiệp vụ 1.1 và ERD. Không bổ sung AI, chat, lớp học, thanh toán, OCR, tự đăng ký hoặc tích hợp trường.

HTML tĩnh chỉ là phương tiện thể hiện thiết kế. Dữ liệu, tên người, mã môn, sách và trang tài liệu đều minh họa; không giả mạo bản PDF của trường. Tương tác diễn ra trong bộ nhớ trình duyệt, tải lại sẽ đặt lại mẫu; không có đăng nhập thật, lưu lên máy chủ, kiểm tra virus hoặc phân quyền thật.

## Hướng bố cục

Chọn không gian học tập có sidebar navy, kệ học liệu dạng thẻ ngang và reader tập trung. Bản v2 tham khảo cơ chế tủ sách của NEU Reader và màu navy trên website HUCE theo yêu cầu người dùng. Không sao chép bố cục landing, gradient, ảnh thiết bị, logo, nội dung sách hoặc thương hiệu của hai trang nguồn. Đây là đề xuất thiết kế để xem xét, chưa phải bộ nhận diện chính thức.

- Kho: tiêu đề lệch trái, mục tiếp tục đọc dựa trên tiến độ mẫu, thanh tìm kiếm và bộ lọc môn/nguồn; kệ hai cột với bìa chữ, metadata và hành động nằm ngoài bìa. Điện thoại chuyển một cột.
- Reader: trang đọc ở giữa; mục lục và ghi chú là ngữ cảnh phụ. Điện thoại đưa ghi chú xuống dưới trang, không thu nhỏ toàn bộ desktop.
- Giảng viên: danh sách giáo trình và trạng thái lần gửi; bản đang chờ không có hành động sửa âm thầm.
- Admin: hàng đợi cần xử lý thay cho dashboard biểu đồ; quyết định được đặt cạnh bằng chứng file, nguồn và phân công.
- Bộ điều khiển prototype nằm trên cùng, tách khỏi thanh điều hướng sản phẩm. Đổi vai trò chỉ phục vụ xem thiết kế.

## Ngữ pháp giao diện đề xuất

Navy #001e42 cho điều hướng và tiêu đề, xanh #0056a6 cho hành động, nền #f3f6fa, giấy #ffffff, chữ #172b45, chữ phụ #52647a, đường phân cách #dce4ef. Navy được đọc từ computed style của thanh điều hướng huce.edu.vn ngày 11/10/2026; các màu còn lại là lựa chọn thích nghi cho prototype. Trạng thái luôn có chữ. Body 15px Segoe UI/Arial hỗ trợ tiếng Việt; tiêu đề kho 38px (31px điện thoại), nhãn 13px. Trang đọc dùng Times New Roman để giữ chữ có dấu đồng nhất; focus tiêu đề dùng cùng màu xanh với focus công cụ.

Lưới 244px sidebar + nội dung linh hoạt; khoảng cách 8/12/16/24/32px. Ở 1200px kệ học liệu chuyển một cột, 900px sidebar thành menu, 650px form/tóm tắt một cột. Nút chính cao tối thiểu 44px. Bìa chữ là artwork bằng HTML/CSS được ghi rõ minh họa, không phải ảnh bìa thật của trường.

## Direction contract

THESIS: Không gian học tập HUCE, tìm và mở học liệu ngay; không biến kho thành trang quảng bá ứng dụng.

OWN-WORLD: Navy #001e42, hành động xanh #0056a6, nền xanh xám và mặt giấy trắng. Sidebar đậm; thẻ ngang có bìa chữ hẹp, thông tin nguồn/phiên bản bên ngoài; công cụ đọc nhẹ.

STORY: Sinh viên nhận ra môn, hiểu nguồn và quyền, mở đúng phiên bản/trang, tiếp tục ghi chú riêng. Giảng viên/admin giữ luồng gửi và duyệt đã có.

FIRST VIEWPORT: Sidebar 244px; nội dung có tiêu đề 38px bên trái, tiếp tục đọc bên phải, tìm kiếm phía dưới, hai cột học liệu. Điện thoại reflow một cột. Tương tác đặc trưng: mở lại đúng phiên bản và trang từ tiến độ hiện có.

FORM: Code-led, không có comp được duyệt. Hướng được người dùng định sẵn qua hai website; không chọn ngẫu nhiên phong cách. Khóa tham chiếu: huce-neu-reference-v2.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Tham chiếu được xem trực tiếp

- https://reader.neu.edu.vn/ — quan sát trang giới thiệu và tủ sách ngày 11/10/2026: thẻ sách, tìm kiếm, nhãn/tác giả; chỉ tiếp thu khả năng nhận diện học liệu.
- https://huce.edu.vn/ — quan sát header/navigation ngày 11/10/2026 và đọc màu nền navigation rgb(0,30,66). Chỉ tham khảo màu; không dùng logo, ảnh trường hoặc ngụ ý quan hệ chính thức.

## Màn hình và truy vết

| ID | Màn hình | Vai trò | Use case | Kết quả chính |
|---|---|---|---|---|
| C01 | Đăng nhập | Chung | UC01 | Vào không gian được cấp |
| C02 | Khôi phục mật khẩu | Chung | UC04 | Phản hồi chung, không tiết lộ tài khoản |
| S01 | Kho học liệu | Chung | UC07 | Tìm, lọc môn/nguồn, chọn tài liệu |
| S02 | Chi tiết tài liệu | Chung | UC08, UC10, UC11, UC20 | Hiểu nguồn/phiên bản/quyền, đọc/lưu/báo cáo |
| S03 | Reader và ghi chú | Chung | UC08, UC09, UC10 | Đọc đúng bản, ghi chú theo trang, thấy trạng thái lưu |
| S04 | Thư viện cá nhân | Chung | UC11 | Tiếp tục đọc, mở ghi chú cũ, bỏ lưu không xóa ghi chú |
| S05 | Danh mục sách | Chung | UC12 | Tra metadata, xem nguồn ngoài được phép |
| S06 | Chi tiết sách | Chung | UC12, UC20 | Phân biệt link nguồn ngoài với PDF nội bộ |
| S07 | Tài liệu đóng góp | Sinh viên | UC13, UC15, UC16 | Theo dõi, rút, sửa/gửi lại, tạo phiên bản |
| S08 | Gửi tài liệu bổ sung | Sinh viên | UC13, UC15 | Chọn PDF, môn, nguồn/quyền, lưu nháp/gửi |
| L01 | Giáo trình của tôi | Giảng viên | UC14–UC16 | Thấy bản hiện hành và bản đang làm |
| L02 | Soạn giáo trình/phiên bản | Giảng viên | UC14–UC16 | Giới hạn theo môn được phân công, gửi công bố |
| L03 | Chi tiết lần gửi | Người gửi | UC15–UC18 | Xem lý do/kết quả, rút khi chờ hoặc sửa khi được yêu cầu |
| A01 | Hàng đợi kiểm duyệt | Admin | UC17, UC18 | Chọn lượt gửi cần xử lý |
| A02 | Chi tiết kiểm duyệt | Admin | UC17, UC18 | Duyệt, yêu cầu sửa hoặc từ chối có lý do |
| A03 | Tài khoản | Admin | UC02, UC03 | Cấp/xác minh/khóa, bảo vệ admin cuối cùng |
| A04 | Danh mục và phân công | Admin | UC05, UC06 | Xem môn, quản lý phân công |
| A05 | Học liệu và bàn giao | Admin | UC06, UC19 | Chọn người nhận, xác nhận tác động, ẩn/khôi phục |
| A06 | Báo cáo nội dung | Admin | UC21 | Xử lý có kết quả, tách ẩn tài liệu với đóng báo cáo |
| A07 | Danh mục sách quản trị | Admin | UC22 | Biên tập metadata/nguồn, không mặc định có PDF |

Có 20 màn hình chính. Các dialog báo cáo, cấp tài khoản, phân công, bàn giao, ẩn/khôi phục và quyết định duyệt là trạng thái của màn hình, không đếm thành trang độc lập. Danh sách này bao phủ giao diện cốt lõi của 22 use case; không đồng nghĩa từng nhánh đã được triển khai đầy đủ trong prototype.

## Luồng để bấm thử

1. Sinh viên: Kho → tìm “cơ học” → chi tiết → đọc → trang 2 → thêm ghi chú → thư viện cá nhân → mở lại ghi chú. Đổi trạng thái sang “Lỗi lưu” để xem nội dung vẫn còn và nút thử lại.
2. Giảng viên: Giáo trình của tôi → tạo giáo trình → điền trường bắt buộc/chọn file PDF → lưu nháp hoặc gửi → chi tiết lần gửi. Đang chờ phải rút về nháp trước khi sửa. Yêu cầu sửa có lý do và nút chỉnh sửa/gửi lại.
3. Admin: Hàng đợi → kiểm tra file, nguồn, môn và phiên bản → duyệt/yêu cầu sửa/từ chối. Chuyển vai trò sinh viên để thấy tài liệu mới được công bố xuất hiện trong kho mẫu.
4. Admin: Học liệu → bàn giao → chọn người nhận phù hợp và lý do → xác nhận bản đang chờ bị rút về nháp; bản hiện hành/tác giả/ghi chú giữ nguyên.
5. Sách: danh mục → chi tiết → xem liên kết nguồn. Không có nút tải PDF khi chỉ là bản ghi sách nguồn ngoài.

## Trạng thái và hợp đồng giao diện

| Trạng thái | Vị trí | Phản hồi và cách tiếp tục |
|---|---|---|
| Đang tải | Danh sách | Mô tả đang tải; không hiện “không có tài liệu” |
| Không có kết quả | Danh sách | Giữ truy vấn/bộ lọc, có xóa bộ lọc |
| Lỗi kết nối | Danh sách | Nút thử lại; không coi là kho trống |
| CHECKING | Form/kiểm duyệt | Chặn xem trước/gửi/duyệt, giải thích đang kiểm tra |
| FAILED | Form/kiểm duyệt | Không xem file; thay file để kiểm tra lại |
| SUBMITTED | Người gửi | Chỉ xem/rút, không chỉnh sửa |
| CHANGES_REQUIRED | Người gửi | Lý do, bắt đầu sửa về nháp, gửi lại lượt mới |
| REJECTED | Người gửi | Kết thúc lượt này; tạo bản mới, không sửa bản bị từ chối |
| HIDDEN | Chi tiết/reader/thư viện | Ngừng đọc/tải; giữ ghi chú và mục lưu |
| Lỗi lưu ghi chú | Reader | Giữ nội dung chưa lưu, nút thử lại; không hiện “đã lưu” |
| Bản mới | Chi tiết/reader | Cho biết phiên bản; ghi chú cũ vẫn gắn bản cũ |
| Chỉ đọc | Chi tiết/reader | Giải thích quyền tải, không cho tải bằng nút giả |

Prototype mô phỏng các điều kiện bằng dữ liệu và bộ chọn trạng thái. Upload chỉ đọc tên file, không truyền file; tải/mở nguồn có hộp giải thích mô phỏng, không phát file giả. Reader là trang minh họa có chọn trang, không phải PDF.js. Ghi chú theo trang hoạt động trong bộ nhớ; tô sáng chữ trên PDF thực là công việc thử kỹ thuật tiếp theo.

## Điều kiện bàn giao sang phát triển

- Duyệt bố cục/nhãn/luồng với chủ dự án và người thử. Chưa gọi bản này là đã được sinh viên/giảng viên kiểm chứng.
- Chốt bộ dữ liệu thử và quyền nguồn thực tế; thay mọi tên/mã môn minh họa.
- Thử PDF văn bản/scan/xoay và anchoring ghi chú trước khi chốt reader.
- Chốt stack, API, migration và kiểm thử phân quyền ở backend. Việc ẩn/hiện nút trong prototype không chứng minh an toàn.
