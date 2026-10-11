# HUCEScholar — bản thiết kế tương tác

Phiên bản 2 · 11/10/2026 · 20 màn hình chính, ba vai trò.

Thiết kế v2 tham khảo tủ sách NEU Reader và màu navy từ website HUCE: sidebar navy, thẻ học liệu ngang có bìa minh họa, mục tiếp tục đọc theo phiên bản/trang. Bố cục, artwork và cách tổ chức không gian học tập được thiết kế riêng. Không dùng logo/ảnh từ hai trang tham chiếu.

## Mở bản thiết kế

Mở `HUCEScholar_Wireframe_Prototype.html` trong Chrome hoặc Edge. File này đã gộp CSS/JavaScript, không cần cài đặt, không cần mạng hoặc chạy server. Bản nguồn nhiều file ở `design/wireframe/index.html` trong workspace cũng mở trực tiếp được khi giữ styles.css và app.js bên cạnh.

Thanh trên cùng dùng để **đổi vai trò**, **đổi trạng thái** của màn hình và mở **Màn hình & luồng**. Đây là công cụ xem bản thiết kế, không phải quyền đăng nhập thật của sản phẩm.

## Thử theo thứ tự

1. **Sinh viên:** tìm “co hoc” hoặc “cơ học” → xem tài liệu → đọc → nhập ghi chú → lưu → mở Thư viện cá nhân. Ở reader, chọn trạng thái “Lỗi lưu ghi chú”, lưu và thử lại để thấy nội dung được giữ.
2. **Giảng viên:** Giáo trình của tôi → Tạo giáo trình → nhập thông tin, chọn PDF và nguồn/quyền → Gửi công bố. Khi đang chờ, rút về nháp trước khi sửa.
3. **Quản trị:** Duyệt tài liệu → Kiểm duyệt → xem thông tin và file mẫu → Duyệt / Yêu cầu sửa / Từ chối. Yêu cầu sửa và từ chối phải có lý do. Đổi lại Sinh viên để thấy tài liệu được duyệt trong kho mẫu.
4. **Bàn giao:** Quản trị → Học liệu & bàn giao → chọn giáo trình Cơ học kết cấu → Bàn giao → chọn Lê Thu Hà và nhập lý do. Bản chờ về nháp; bản công bố và tác giả được giữ.
5. **Sách:** Danh mục sách → chi tiết → Xem nguồn sách. Bản ghi nguồn ngoài không có nút tải PDF nội bộ.

Tải lại trang để đặt lại dữ liệu ban đầu. Không nhập mật khẩu thật hay dữ liệu cá nhân thật vào bản thiết kế.

## Nội dung gói

- `HUCEScholar_Wireframe_Prototype.html`: bản bấm thử độc lập.
- `DESIGN_BRIEF.md`: danh sách 20 màn hình, truy vết use case, luồng, trạng thái và điều kiện chuyển sang phát triển.
- `screens/`: tám ảnh màn hình đại diện cho desktop và điện thoại.
- `validation/verification.json`: kết quả kiểm tra tương tác trong trình duyệt.
- `source/`: mã nguồn trình bày thiết kế để chỉnh sửa tiếp.

## Phạm vi và kiểm chứng

Đã kiểm tra 26 điều kiện tương tác và render 20 biến thể màn hình ở 390px; xem ảnh đại diện tại 1440px và 390px. V2 có thêm 5 kiểm tra riêng: mở lại đúng tài liệu/phiên bản/trang, cập nhật tiến độ, tài khoản chưa có tiến độ, catalog ở 1253px và bốn cặp màu đại diện đạt contrast 4.5:1. Không có lỗi JavaScript chưa xử lý trong các hành trình đã chạy. Đây không phải kiểm thử backend, phân quyền thực tế, tốc độ hệ thống hoặc toàn bộ tiêu chuẩn accessibility.

Reader dùng trang minh họa, chưa hiển thị PDF thật hoặc chọn chữ/highlight thật. Upload chỉ đọc tên file; tải và mở nguồn trình bày bằng hộp mô phỏng. Thay đổi chỉ giữ trong bộ nhớ, không lưu lên máy chủ. Một số nghiệp vụ phụ như CRUD đầy đủ khoa/ngành/môn, thay role và lịch sử nhiều lần gửi được mô tả trong đặc tả nhưng chưa mô phỏng đầy đủ.

Thiết kế không dùng logo trường và không ngụ ý đây là nền tảng được HUCE công nhận. Màu, chữ và bố cục là đề xuất để duyệt, chưa phải bộ nhận diện cuối cùng. Bước tiếp theo là phản hồi bố cục với người dùng, thử kỹ thuật PDF/ghi chú, rồi chốt stack/API/backlog.
