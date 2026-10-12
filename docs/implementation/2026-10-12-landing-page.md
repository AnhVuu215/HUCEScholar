# Landing page HUCEScholar

## Phạm vi

Thay trang khởi tạo `/` bằng landing page tiếng Việt giới thiệu nền tảng cho sinh viên/giảng viên. Trang tiến độ, health API và retry được giữ ở `/project`; liên kết từ login/workspace cập nhật theo route mới. Không đổi auth, database, bản nháp, upload hoặc worker.

## Tham khảo và biến tấu

Đã xem trực tiếp [NEU Reader](https://reader.neu.edu.vn/): header ngang, hero căn giữa có gradient, hình thiết bị, tủ sách và hướng dẫn. HUCEScholar giữ cách tổ chức nội dung dễ nhận biết nhưng dùng hero lệch trái, bộ bìa hình học tự dựng, tông navy/xanh từ hệ thống hiện hữu tham khảo [HUCE](https://huce.edu.vn/). Không sao chép artwork, logo, ảnh thiết bị, nội dung sách hoặc dữ liệu NEU.

Landing có header/CTA đăng nhập, hero, chủ đề học tập minh họa, phần bản nháp/PDF hiện có, hướng dẫn ba vai trò, FAQ native và CTA cuối trang. Các nút hướng dẫn có aria-pressed, điều khiển bằng bàn phím, cập nhật vùng nội dung có tên. FAQ dùng details/summary. Layout kiểm tra cả bề rộng 320px.

Các bìa/môn minh họa không phải catalog được công bố. Mẫu bản nháp không phải dữ liệu người dùng. Nguồn quyền, gửi duyệt, công bố, reader, ghi chú, PWA và quan hệ với trường được mô tả đúng tình trạng. Không thêm tải ứng dụng, public signup hoặc kết quả tìm kiếm giả. CTA dẫn `/login`; phiên hiện hành tiếp tục được luồng auth xử lý theo role.

## Hệ thống giao diện

CSS mới chỉ áp dụng trong `.landing`. Be Vietnam Pro self-host gồm ba weight, có SIL OFL và nguồn từng font tại `apps/web/app/fonts/README.md`; không tải font bên thứ ba lúc truy cập. Không thêm dependency. SVG icon/H mark và hình học trên bìa được tác giả hóa trong code; không có raster được ship. Root DESIGN.md/sidecar và prototype lịch sử giữ nguyên; hướng thiết kế của trang nằm ở `apps/web/DESIGN_BRIEF.md`.

## Kiểm chứng

Browser test mới kiểm tra CTA đến login thật, đổi hướng dẫn bằng bàn phím, FAQ giải thích reader chưa có, link tiến độ, reflow/navigation ở desktop 1440, bề rộng người dùng 1253, tablet 768, mobile 390 và narrow 320. Các kiểm tra health/retry/loading/failure tiếp tục ở `/project`.

Toàn bộ 42 browser test đạt khi chạy với hai worker, bao gồm 7 test landing mới và 35 test hiện hữu. Lượt đầu có 41/42 đạt, ca phân công hiện hữu timeout 30 giây khi nhiều worker cùng compile route đầu tiên; không đổi nghiệp vụ hoặc timeout để né lỗi. `pnpm check` đạt lint, typecheck, 50 unit test và production build API/web; `pnpm format:check` đạt.

Một lỗi cascade navy-on-navy ở heading cuối trang đã được sửa trong batch kiểm tra giao diện; H mark cũng đổi sang nét chữ H riêng để tránh gần logo khối của reference. Finish review yêu cầu chuyển nhãn phân loại phía trên tiêu đề minh họa vào hàng metadata; đã thực hiện. Sau chỉnh sửa cuối, lint/typecheck/build web được chạy lại; 7 browser test landing và năm ảnh responsive được kiểm tra lại.

Detector đối chiếu DESIGN lịch sử báo 74 khác biệt cỡ chữ và 2 khác biệt màu ở mức advisory, không có lỗi bắt buộc. Đây là khác biệt có chủ đích của landing production với wireframe lịch sử; không thay đổi token prototype để hợp thức hóa trang mới.

Finish reviewer xác nhận chỉnh sửa đã giải quyết, không có regression đáng kể và đưa verdict `ship` trên năm ảnh mới. Documenter đối chiếu source, PRODUCT, brief và hệ thống lịch sử; xác nhận giữ nguyên DESIGN.md/sidecar, mô tả quyết định landing trong brief/CSS riêng.

Chưa kiểm chứng Safari/WebKit, thiết bị vật lý hoặc deployment HTTPS. Tham khảo UI không đồng nghĩa được dùng dữ liệu hoặc thương hiệu chính thức của trường.
