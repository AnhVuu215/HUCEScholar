# Kho học liệu và trình đọc — implementation plan

**Goal:** Người dùng đã đăng nhập tìm học liệu hiện hành, đọc đúng phiên bản và tải khi được phép.

**Architecture:** Mở rộng module Materials, giữ quyền tại NestJS. Kho chỉ liệt kê bản hiện hành APPROVED của tài liệu VISIBLE, PDF SAFE, quyền còn hạn. Endpoint theo version ID dùng cùng điều kiện đọc, cho phép bản APPROVED cũ; không phụ thuộc phân công đang còn hay tài khoản tác giả đang hoạt động. Mỗi lượt metadata/file xác thực người đọc; admin không có ngoại lệ phân phối. Không migration.

**UI:** Kế thừa workspace navy hiện có. Kho có tìm tiêu đề/tác giả, môn và loại, phân trang, tách nguồn giảng viên/sinh viên. Chi tiết ghi rõ nguồn, căn cứ quyền, phiên bản, quyền tải. Reader PDF.js một trang mỗi lượt, text layer, chuyển trang, zoom, xoay, vừa chiều rộng; không ghi chú, tiến độ hoặc offline trong mốc này.

**API:** GET /library; GET /library/versions/:id; GET /library/versions/:id/pdf; GET /library/versions/:id/download. File stream private hỗ trợ một HTTP byte Range, 206/416 đúng độ dài; tải kiểm tra thêm download_allowed. Metadata không chứa object key/hash. Không URL ký hoặc public bucket; no-store. Quyền được đối soát tại thời điểm cấp lượt mới, không thu hồi byte đã cấp.

## Tasks

- [x] API: viết integration RED cho kho, quyền ba role, trạng thái/expiry, download, Range; triển khai DTO/controller/service và mở rộng store Range; GREEN (106 integration toàn bộ). Commit sau review cuối.
- [x] Web: thêm PDF.js pin version + worker/tài nguyên self-host, không CDN; viết browser RED với PDF hợp lệ tự tạo; xây kho và reader responsive với retry/cancel/cleanup; kiểm tra API proxy và download.
- [x] Validation: format/lint/typecheck/build đạt; 50 unit, 106 integration đạt (một scanner thực opt-in bỏ qua), 47 browser đạt; ảnh 1440/768/360 cho kho và reader. Code review đã giải quyết hai vấn đề lifecycle; finish review ship, documenter không yêu cầu thay đổi. PRODUCT/README/progress đã cập nhật.

Delivery: tách commit API/web/docs và push nhánh hiện tại sau kiểm chứng cuối.

## Giới hạn và nghiệm thu

Không dùng dữ liệu trường hoặc giả định quyền thư viện. Fixture PDF do test tạo, SAFE synthetic không là bằng chứng scanner thật. Local filesystem/Edge tự động không chứng minh S3, Safari hoặc thiết bị vật lý. Không thay wireframe DESIGN/sidecar; incumbent CSS là nguồn giao diện sản phẩm. Ẩn/khôi phục quản trị, phiên bản mới, ghi chú và PWA ở mốc riêng. Tiêu chí: bản không đủ quyền không lộ metadata/bytes, phân trang/lọc đúng, range byte chính xác, reader hiện trang thật và khôi phục được sau lỗi mạng.
