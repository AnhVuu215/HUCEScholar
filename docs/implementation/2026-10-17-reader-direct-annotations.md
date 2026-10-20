# READ-03 — Thao tác trực tiếp và panel ghi chú

Nhánh `codex/reader-direct-annotations`, nền `8dc902e`, nối tiếp READ-02. Phạm vi là READ-03 trong [kế hoạch reader V2](../superpowers/plans/2026-10-17-workspace-v2-reader-library.md); các task CITE-01/LEARN-01/READ-01/SEARCH-02 chưa triển khai trong lượt này.

## Hành vi

- Chọn chữ trong một trang PDF hiện toolbar Tô sáng/Ghi chú đoạn chọn. Cả hai mở vùng tô có ghi chú tùy chọn và nút lưu rõ ràng; không tự tạo bản ghi khi chọn chữ. Thanh đọc giữ nút tương đương cho bàn phím.
- Snapshot gồm version/page/anchor/rect và text surface hiện hữu. Rect chỉ đặt toolbar; dữ liệu lưu vẫn là quote/quads chuẩn hóa. Chọn quá2000 ký tự hoặc lấn ra ngoài text layer báo lý do, không tự cắt đoạn.
- Toolbar theo scroll/resize/visual viewport, giới hạn trong viewport, ẩn khi vùng chọn ra ngoài vùng đọc. Escape đóng toolbar và trả focus vùng đọc. Tab/phím mũi tên/Enter hỗ trợ thao tác bàn phím.
- Panel sticky bên phải từ1280px, dưới PDF khi hẹp hơn; có hai tab Đoạn tô/Ghi chú trang. Bảng màu hai cột trong panel. Ẩn/hiện giữ đường đi focus bàn phím.
- Bấm vùng tô đã lưu hoặc nút trong danh sách mở bộ soạn hiện hữu. Vùng tô chồng nhau hiện các lựa chọn có tên màu/nội dung trước khi sửa.
- Hai thành phần CRUD vẫn mounted để giữ bản soạn; registry chung chỉ cho một editor hoạt động. Chuyển editor/ẩn panel hỏi bỏ bản soạn đúng một lần khi dirty, chặn chuyển khi đang lưu hoặc chưa xác nhận. Guard điều hướng hiện hữu tiếp tục bảo vệ Back/Forward/rời trang.
- Bản soạn giữ trang/quote/anchor ban đầu khi đổi trang, zoom hoặc xoay. Retry giữ requestId, sửa/xóa giữ revision và xử lý409. Trạng thái chưa xác nhận của page note không bị xóa bởi lỗi API của lần thử tiếp theo.

Không đổi API/schema/quyền đọc, không sửa PDF/Word gốc. PDF scan không có text layer vẫn ghi chú trang được. Hai thao tác toolbar chưa bao gồm trích dẫn: CITE-01 sẽ bổ sung cùng formatter nguồn, deep link và fallback clipboard.

## Kiểm chứng

- Test mới phủ viewport1440/768/390/320, snapshot giữ trang đích, chuyển editor/cancel, pending/mất response/retry không nhân đôi, chọn vùng chồng nhau, bàn phím, vùng chọn quá dài/lấn ngoài PDF và ghi chú trang scan.
- Fixture PDF tự sinh; fixture scan là hai trang trống không có text layer, không phải bằng chứng OCR hoặc quét mã độc. Cập nhật SAFE synthetic chỉ trên database có hậu tố `_test` và đúng account fixture. DOCX thật được kiểm riêng bằng converter/ClamAV local.
- Review độc lập phát hiện tên đọc UUID ở danh sách chồng nhau và mất focus khi ẩn panel. Hai test đã tái hiện lỗi trước sửa; kết quả hồi quy cuối ghi bên dưới.
- Ảnh desktop1440/mobile320 đã xem tại `.impeccable/review/reader-direct/`, Git bỏ qua. Detector chạy một lượt: advisory18px so với ramp của wireframe lịch sử; giữ cỡ chữ UI sản phẩm và ghi trong brief.

- Hồi quy cuối:28/28 test đạt, gồm5test READ-03, geometry bốn góc xoay, decoder, tám màu/màu tương lai, ghi chú trang/highlight, mất response/CAS, Back/Forward, tiến độ và DOCX thật. Bật `$env:DOCX_REAL='1'`; chạy Playwright qua `node node_modules/@playwright/test/cli.js` vì shim pnpm Windows không chuyển tiếp đúng dấu `|` của grep.
- `pnpm check` đạt: lint/typecheck,82unit tests, API/web production build. `pnpm format:check` và `git diff --check` đạt.
- `pnpm test:integration`:155đạt,1test real PDF worker bỏ qua vì không bật `REAL_PDF_WORKER_TEST`. Luồng DOCX thật trong browser đã gọi converter/ClamAV/file-worker và xác nhận SAFE/READY; không đánh đồng hai loại bằng chứng.

Chưa phát hành hoặc kiểm chứng thiết bị thật. Chưa chạy full browser suite toàn hệ thống; cần chạy ở mốc tích hợp đợt B như kế hoạch. Bộ hồi quy trên là phạm vi reader/PDF/DOCX bị ảnh hưởng.
