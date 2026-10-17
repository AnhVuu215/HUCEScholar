# Rà và chỉnh giao diện web — 17/10/2026

Phạm vi: cải thiện UI hiện hữu, giữ navy/Segoe UI và luồng web. Không đổi nghiệp vụ API, schema, quyền hoặc thêm yêu cầu cài PWA.

## Vấn đề và thay đổi

- **Xung đột CSS menu:** stylesheet `pdfjs-dist/web/pdf_viewer.css` có selector toàn cục `.sidebar`, đặt width239px, min/max-width, bo góc và bóng. Menu ứng dụng vô tình nhận các thuộc tính này, thành một hộp hẹp trên điện thoại. Đổi class dùng trong workspace và `/project` sang `.workspace-sidebar`; giữ stylesheet PDF.js cho text layer.
- **Điều hướng trên màn hình nhỏ:** ở độ rộng tối đa900px, workspace dùng nút Menu44px, `aria-expanded`/`aria-controls`; mở để thấy toàn bộ điều hướng. Escape đóng và trả focus về nút. Theo liên kết đóng menu; guard bản soạn tiếp tục chặn click ở document capture trước menu khi người dùng chọn ở lại. Desktop vẫn hiện toàn bộ điều hướng. Liên kết công việc đứng trước tiến độ/cài ứng dụng.
- **Đăng nhập:** trên phone/tablet giữ header thương hiệu gọn, đưa form vào viewport đầu tiên. Desktop giữ bố cục hai cột. Thay đổi chỉ áp dụng `/login`, không làm mất phần hướng dẫn `/install`. Không thay cơ chế xác thực hoặc nội dung form.
- **Bộ lọc:** select trong Kho học liệu chưa nhận style48px có viền/nền của các form quản lý. Dùng chung quy tắc trường nhập cho `.form-field select` và select quản lý hiện hữu, giúp bộ lọc dễ nhận biết và đủ vùng chạm.
- **Hướng dẫn:** sinh viên bắt đầu từ tìm/đọc/ghi chú. FAQ mô tả highlight đã có cho PDF có lớp chữ, ghi chú trang cho PDF scan. Loại bỏ khẳng định tĩnh về số học liệu đã công bố; bìa minh họa được ghi nhãn, dẫn người dùng đăng nhập để xem kho thật. Mô tả đúng giảng viên tự công bố sau khi quét đạt, nguồn tham khảo tùy chọn.

## Kiểm chứng

Kiểm thử regression mới kiểm tra vị trí form, chiều rộng menu thực, không nhận shadow PDF.js, trạng thái đóng/mở, bàn phím/Escape, focus, điều hướng và overflow ở320/360/768/1440px. `tests/landing.spec.ts` kiểm tra nội dung hướng dẫn hiện hành. Kiểm thử RED trước sửa cho thấy trường mật khẩu nằm dưới viewport800px (mép dưới848.75px).

Rà mã phát hiện Next Link gọi preventDefault trước handler bubbling của menu, làm chọn lại mục hiện tại không đóng. Đã tái hiện RED. Giữ handler bubbling và bỏ điều kiện defaultPrevented: guard rời bản soạn dừng propagation tại document capture khi cần chặn. Kiểm thử bao phủ cả chọn lại mục hiện tại và hủy rời trang trên điện thoại. Thử nghiệm dùng React capture đã bị kiểm thử loại bỏ vì Next gắn root ở document: React capture có thể chạy trước listener guard.

- `pnpm lint`, `pnpm typecheck`, `pnpm --filter @hucescholar/web build`: đạt sau sửa cuối.
- `pnpm format:check` và `git diff --check`: đạt.
- Đợt đầu:43/43 Playwright qua cho auth, landing, materials và UI mới.
- Sau sửa cuối:9/9 Playwright qua (57giây), bao gồm320/360/768/1440px, chọn lại menu hiện tại, select đủ44px trở lên, hủy rời bản soạn trên điện thoại, highlight, Back/Forward native/fallback và đăng xuất khi còn bản soạn.
- Hai đợt kiểm tra ảnh desktop/tablet/mobile: menu không còn nhận width/shadow PDF.js, form đăng nhập hiện sớm, bộ lọc có viền và đủ48px. Ảnh nằm trong `.impeccable/review/web-ui/` bị Git bỏ qua. Review độc lập đã được đối chiếu bằng kiểm thử thực tế và xử lý lỗi đóng menu.

Ảnh chụp chỉ dùng form trống và tài khoản kiểm thử trên database test; không chứa mật khẩu. Responsive trình duyệt không thay thế kiểm chứng cảm ứng trên thiết bị thật. API/schema không đổi; không chạy lại bộ integration backend trong đợt UI này. Không cài PWA hoặc triển khai cloud.

Detector:0 anti-pattern;19 advisory về font/color theo `DESIGN.md` lịch sử dành cho wireframe. Giữ token và kích thước production hiện hữu theo surface brief, không sửa đồng loạt ngoài phạm vi.
