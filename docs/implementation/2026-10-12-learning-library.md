# Kho học liệu và trình đọc PDF theo quyền

## Phạm vi

Đã nối chuỗi gửi → kiểm duyệt → tìm → đọc/tải cho ADMIN, LECTURER, STUDENT. Không có quyền đọc đặc biệt cho admin. Kho chỉ liệt kê bản hiện hành; reader dùng version ID bất biến và có thể đọc bản cũ APPROVED còn đủ điều kiện. Chưa có UI tạo bản mới, lịch sử phiên bản cho người đọc, ghi chú, lưu tiến độ, lưu thư viện cá nhân hoặc PWA/offline.

## API và bảo mật

- `GET /api/v1/library`: tìm title/authors không phân biệt hoa thường, lọc courseId/kind/materialType, page/limit (mặc định 20, tối đa 100). Sắp updated_at/id giảm dần, count/items trong RepeatableRead. Đây là tìm metadata, chưa tìm toàn văn hoặc tìm không dấu.
- `GET /library/courses`: chỉ các môn có bản hiện hành đủ quyền đọc, giữ môn lịch sử dù danh mục đã ngừng hoạt động. Không tiết lộ môn chỉ có bản nháp/ẩn.
- `GET /library/versions/:id`: metadata, nguồn/căn cứ/hạn quyền, môn, số trang, quyền tải và cờ current. Không object key/hash hoặc thông tin riêng của người dùng.
- `GET /library/versions/:id/pdf`: stream inline private, `Accept-Ranges: bytes`, single Range 206. Hỗ trợ start-end/open-end/suffix; malformed/multi-range/ngoài file trả 416 + `Content-Range: bytes */size`. Không hỗ trợ multipart ranges.
- `GET /library/versions/:id/download`: cùng điều kiện đọc, thêm download_allowed; trả attachment với tên cố định an toàn.

Mọi endpoint dùng SessionGuard, no-store. Điều kiện chung: APPROVED + document VISIBLE + file SAFE + rights_valid_until chưa hết hạn hoặc null. Bản không đủ quyền trả 404, quyền tải thiếu trả 403; không cấp byte/metadata bản nháp/ẩn/hết hạn. Thu hồi phân công hoặc ngừng môn không tự thu hồi bản đã công bố theo nghiệp vụ. DownloadAllowed=false là không cung cấp chức năng tải bản gốc, không phải DRM.

Cấp file khóa actor SHARE → document SHARE → version SHARE → file SHARE, đọc lại quyền trong transaction trước khi cấp stream. Đối soát tại điểm cấp lượt mới; không thu hồi byte đã cấp hoặc dữ liệu đã tải vào trình duyệt. Stream bị hủy khi client đóng response; listener được gỡ khi source đóng. Lỗi mở object local trả 503 trước headers. S3 adapter chuyển Range và đối chiếu ContentRange/ContentLength, chưa kiểm chứng cloud thật. Schema/trigger/index không thay đổi, không db push.

## Reader và giao diện

`/workspace/library` dùng cùng shell/nav với ba role, danh sách hàng, lọc và phân trang; empty/loading/retry rõ ràng. `/workspace/library/versions/:id` hiển thị title/version, toolbar chuyển trang/nhập số/zoom/xoay, nguồn/quyền inline và tải khi được phép. Component remount theo id để không hiển thị PDF bản trước dưới metadata bản mới.

PDF.js pin 6.4.299, dynamic import chỉ ở client. `scripts/pdfjs-assets.mjs` copy worker/CMaps/standard fonts/wasm/LICENSE từ dependency đã pin vào public/pdfjs/version khi dev/build; assets sinh không commit, lockfile có commit. Tài nguyên self-host, không gửi tài liệu đến CDN. Tham chiếu [Mozilla examples](https://mozilla.github.io/pdf.js/examples/) và [release](https://github.com/mozilla/pdf.js/releases/tag/v6.4.299).

Render một trang với text layer; giới hạn canvas 8 triệu pixel, chiều lớn nhất 4096 pixel, DPR tối đa 2. Zoom cuộn trong stage; vừa chiều rộng không làm tràn trang. Các render tuần tự, canvas riêng và hủy khi đổi trang/zoom; PDFPageProxy.cleanup sau khi render/text đã kết thúc để giải phóng operator/image trước lượt tiếp. Loading task/worker được destroy khi unmount/retry. Trạng thái render gắn page/zoom/rotation/width, không báo đã xong cho kích thước cũ. Trước mỗi render đối soát metadata/quyền, không cache API/PDF qua service worker. Ghi chú/highlight/lưu tiến độ không được giả lập.

## Kiểm chứng và giới hạn

Fixture PDF hai trang hợp lệ do test tự tạo, không sách/bộ dữ liệu ngoài. Integration dùng database `_test` và Redis 15, giữ cleanup transaction/trigger test đã có. SAFE synthetic không là bằng chứng scanner thật. Không seed học liệu vào database local chính.

TDD: endpoint kho mới RED 404 rồi GREEN; test hủy HTTP nguồn file thật 8 MiB quan sát RED trước sửa stream lifecycle. Browser RED tại nav chưa có, rồi thực thi PDF.js thật, canvas có nội dung, text selection, trang/zoom/xoay, download bytes đúng, Range qua web proxy và mở lại sau lỗi mạng. Các lần đầu phát hiện filter tràn tablet và selector canvas trúng canvas nội bộ PDF.js; đã sửa layout và giới hạn selector ở trang thật. Ảnh resize phải đợi canvas theo kích thước mới và render hoàn tất, không dùng status cũ làm bằng chứng.

Kiểm chứng cuối: format, lint, typecheck, 50 unit test và production build API/web đạt; 106 integration đạt, một scanner thực opt-in bỏ qua. Integration gồm quyền ba role, Range, nguồn file mất trả 503, bản cũ và hủy HTTP nguồn thật. Code review xác nhận hai sửa stream/page lifecycle đã giải quyết. Lượt browser đầu toàn bộ đạt 46/47, một fixture admin dùng chung vượt 10 lần đăng nhập/15 phút (429); tách reader-admin/reader-student ở database test, không nới limiter hoặc tự retry login ứng dụng. Chạy lại toàn bộ đạt 47/47.

Sau khi cấu hình Playwright tự chuẩn bị assets, chạy riêng luồng reader đạt. Restart local bằng production build: health, landing, route kho và PDF worker trả 200; API kho không có session trả 401 + no-store. HTTP serving này không thay thế bằng chứng fixture đã đăng nhập hoặc kiểm chứng production deployment.

Hai vòng kiểm tra ảnh 1440/768/360: kho và reader có PDF thật, không overflow ngang. Finish review kết luận ship; documenter xác nhận kế thừa nhất quán shell, palette, typography, control và responsive hiện hành, không có thay đổi design system cần ghi nhận. Detector một lượt: 17 advisory thuộc CSS incumbent (16 font, một màu), không primary hoặc finding CSS mới. Không sửa DESIGN/sidecar. Chưa chứng minh S3/HTTPS deployment, tài liệu tiếng Việt nhiều font/scan lớn, Safari hoặc cảm ứng trên thiết bị thật. Các điều kiện này cần pilot với PDF được cấp quyền.
