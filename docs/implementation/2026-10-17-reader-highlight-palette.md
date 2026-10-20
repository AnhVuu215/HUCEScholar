# READ-02 — Tám màu tô sáng và khả năng đọc dữ liệu tương thích

Nhánh `codex/reader-highlight-palette`, nền `14a15dd`. Thực hiện READ-02 trong [kế hoạch reader V2](../superpowers/plans/2026-10-17-workspace-v2-reader-library.md). Các task selection toolbar, trích dẫn, panel và tìm ghi chú toàn tài liệu vẫn chưa triển khai.

## Hành vi

Giữ Vàng `#FFF59D`, Xanh lá `#A5D6A7`, Xanh dương `#90CAF9`; thêm Hồng `#F8BBD0`, Tím `#CE93D8`, Cam `#FFCC80`, Xanh ngọc `#80CBC4`, Xám `#B0BEC5`. API validation áp dụng cùng bảng cho POST và PATCH. Giữ anchor, revision, requestId và quyền riêng tư của CRUD hiện hữu.

Palette dùng radio native, tên màu, swatch và dấu chọn; hỗ trợ Tab/phím mũi tên, focus và disabled khi đang lưu hoặc chưa xác nhận lần lưu. Tối thiểu44px; reflow hai cột ở320px. Màu chỉ là background annotation; nhãn giữ ink/paper hiện hữu. Không đổi opacity0.65 hoặc multiply của PDF overlay.

Decoder đọc mọi hex6 hợp lệ, giữ màu lạ khi hiển thị thay vì làm mất toàn danh sách. Nhãn dự phòng `Màu đã lưu (#HEXHEX)`. Khi sửa màu chưa có trong palette, giữ nguyên nội dung/anchor, không chọn mặc định và chặn lưu cho đến khi người dùng chủ động chọn màu hỗ trợ. Mã CSS khác hex6 bị từ chối. Không đổi dữ liệu cũ, không migration; CHECK hiện hữu đã nhận hex6.

## Thứ tự tích hợp và rollback

1. Commit `749762b` bổ sung decoder/guard tương thích trước, vẫn chỉ ghi ba màu cũ. Khi triển khai có nhiều client, phát hành bản này và yêu cầu tải lại tab từ trước bản tương thích.
2. Sau đó mới phát hành API và UI tám màu trong commit kế tiếp. Nâng frontend/API cùng đợt; không bật client ghi màu mới trước API.
3. Khi đã có màu mới trong dữ liệu, rollback an toàn giữ ít nhất decoder ở bước1. Không quay về decoder cũ chỉ chấp nhận ba màu. Nếu rollback API về whitelist cũ, rollback frontend đồng thời về bản tương thích bước1: màu khác vẫn xem được và phải chọn lại màu hỗ trợ trước PATCH. Không chạy frontend tám màu với API ba màu.

Không triển khai production trong lượt làm việc này; thứ tự commit là hướng dẫn phát hành, không phải bằng chứng các tab cũ đã cập nhật.

## Bằng chứng local

- Test RED: năm màu mới bị API từ chối; decoder cũ từ chối cả danh sách có màu hex hợp lệ ngoài palette; UI chưa có radio và không hiện highlight màu lạ.
- Sau sửa:14/14 unit test validation màu đạt;6/6 client decoder test đạt;2/2 browser journey đạt (tạo/sửa đủ8màu, đăng nhập lại, anchor/revision, keyboard, viewport1440/390/320, màu tương lai giữ nội dung).
- Fixture là PDF tự sinh, account/database test riêng và kết quả scan synthetic có ghi rõ; không thay file hoặc tài khoản thực. Ảnh UI ở `.impeccable/review/reader-v2/` được Git bỏ qua.
- Detector một lượt: chỉ một advisory cỡ chữ14px so với DESIGN của wireframe lịch sử; giữ cỡ chữ UI sản phẩm hiện hành trong brief.
- Integration:155 đạt,1 test real PDF worker bỏ qua vì không bật `REAL_PDF_WORKER_TEST`; không coi fixture scan synthetic là bằng chứng quét file thật.
- `pnpm check` cuối sau bản sửa dropdown: lint/typecheck,82 unit test và API/web build đạt. `pnpm format:check` đạt.
- Kiểm tra tính toán cho chữ đen và overlay multiply/opacity0.65: tỷ lệ tương phản thấp nhất12.20 trên giấy trắng,10.55 trên mẫu nền xanh nhạt RGB230/239/248. Đây là kiểm tra hai mẫu nền, không bảo đảm mọi ảnh/chữ trong PDF bất kỳ.
- Regression phát hiện chọn lại zoom đang dùng làm reader kẹt loading: SelectField phát change dù value không đổi, xóa rendered mà không tạo renderKey mới. Thêm test RED và sửa handler chỉ phát change khi giá trị thực sự đổi, giống select native. Test chuột cũ cũng cần cuộn span/overlay vào viewport trước lấy tọa độ, thay vì click ngoài màn hình.
- Regression sau sửa:23/23 test đạt, gồm reader V2/decoder, hai hành trình highlight cũ (retry, CAS, giữ bản soạn khi điều hướng, reload), geometry0/90/180/270, toàn bộ workspace UI và dropdown. Chạy qua CLI Playwright trực tiếp vì pnpm trên Windows không chuyển tiếp đúng ký tự `|` trong biểu thức grep.
- Review độc lập `palette_review`: không có Critical/Important; yêu cầu cập nhật evidence đã xử lý. Không có thay đổi API tìm kiếm annotations, citation hoặc toolbar/panel của các task sau.
