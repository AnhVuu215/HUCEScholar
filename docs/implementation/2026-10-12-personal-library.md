# Thư viện cá nhân — 12/10/2026

Mốc mở rộng HUCEScholar trên `codex/personal-library`, kế thừa `d4571ac`. Không merge main, không migration hoặc thêm dependency. Dùng dữ liệu tổng hợp trong database test; chưa kết nối nguồn sách trường.

## Chức năng

Cả ADMIN, LECTURER và STUDENT có **Thư viện của tôi** ở `/workspace/personal-library`. **Đã lưu** giữ liên kết document và mở bản công bố hiện hành. **Đọc gần đây** lấy tiến độ đã được server xác nhận, mở đúng version/page cũ; các version từng đọc có thể xuất hiện thành nhiều mục. Ghi chú không tự chuyển sang PDF mới.

Reader có **Lưu tài liệu**, **Bỏ lưu tài liệu** và xác nhận inline. Bỏ lưu chỉ xóa liên kết riêng, giữ nguyên ghi chú/tiến độ. Khi phản hồi bị mất, mutation bị khóa cho đến khi **Tải trạng thái lưu** đối chiếu server. GET lỗi không suy ra chưa lưu. Danh sách có loading, empty, retry và phân trang; thông báo/focus được giữ ở cấp danh sách sau bỏ lưu và phân trang.

## API và dữ liệu

| Method | Route `/api/v1` | Hành vi |
|---|---|---|
| GET | `/personal-library/saved` | Liên kết riêng, material hiện hành hoặc null |
| GET | `/personal-library/recent` | Tiến độ riêng, material đúng version hoặc null |
| GET | `/personal-library/saved/:id` | Boolean riêng; không xác nhận document tồn tại |
| PUT | `/personal-library/saved/:id` | Body `{saved:true}`; lưu nếu current đọc được |
| DELETE | `/personal-library/saved/:id` | Bỏ liên kết riêng kể cả học liệu không khả dụng |

Danh sách mặc định 12, tối đa 100; thứ tự ổn định theo thời gian và ID. Dùng `saved_documents` và `reading_progress` hiện hữu. API luôn lấy owner từ session; admin không vượt quyền riêng tư. PUT/DELETE idempotent và kiểm tra CSRF. Save serialize theo owner rồi khóa actor/document/version/file cùng thứ tự với các nghiệp vụ hiện hữu; đọc lại current dưới khóa document. Giao dịch đọc RepeatableRead giữ list/count nhất quán.

Tái sử dụng điều kiện đọc của LibraryService: APPROVED, VISIBLE, SAFE và hạn quyền. Tài liệu mất quyền chỉ trả liên kết cá nhân và `material:null`, không trả tiêu đề/tác giả/nguồn/object key; UI không cấp link đọc. File, notes và progress vẫn kiểm tra quyền ở từng request. Không cache dữ liệu cá nhân hoặc PDF.

## Kiểm chứng

- Format, lint, typecheck, **50 unit** và build API/web đạt. Toàn bộ integration **129 đạt, 1 skip**: scanner thật là suite opt-in riêng. Không thay đổi migration hoặc schema.
- API mới RED→GREEN gồm riêng tư theo ba role, PUT đồng thời/idempotent, CSRF/validation, default12/pagination, hidden/unsafe/expired không lộ metadata, bỏ liên kết không xóa tiến độ, saved theo current và recent theo version cũ. Fixture expiry ban đầu vi phạm trigger bất biến; đã sửa dữ liệu trước khi chuyển APPROVED, giữ nguyên trigger.
- Browser full **50 đạt**, hai ca cần đối chiếu. Health giữ loading quá thời gian assertion5s ở một lượt, chạy lại không đổi code đã đạt; chưa kết luận nguyên nhân tải chậm. Phép đo ảnh reader bỏ sót padding32px, đã sửa theo geometry hiện hữu. `--last-failed` **2 đạt**, tổng **52 hành trình** được xác nhận.
- Luồng mới xác nhận lưu sau mất response, mở lại trang2, bỏ lưu sau mất response mà recent vẫn giữ, retry danh sách và focus sau phân trang/bỏ lưu. Test dùng fixture tổng hợp và server thật, chỉ interception response/network và danh sách phân trang được điều khiển để kiểm chứng; không giả lập toàn bộ API.
- Whole-branch code review phát hiện mất notice/focus khi row unmount và defaultlimit20 không khớp spec. Đã sửa persistent feedback và DTO12; reviewer recheck không còn finding trong phạm vi sửa. Log `.local/personal-*.log`, detector/captures bị Git bỏ qua.

## Giới hạn

Chưa có dữ liệu sách thật, quyền toàn văn hoặc API thư viện HUCE được xác nhận. Không có bộ sưu tập, highlight, đọc offline, service worker, thông báo hoặc app native. Responsive Edge/Playwright tại 1440/768/360 không thay thế kiểm thử Safari/iOS/Android và cài PWA trên thiết bị thật. S3/HTTPS/cloud chưa triển khai trong mốc này. Reader chưa có guard Back/Forward SPA cho ghi chú chưa lưu; giữ giới hạn đã công bố ở mốc trước.

## Tiếp tục ngày 14/10/2026

Đã đối chiếu lại mã nguồn đang dang dở, thêm browser assertion cho GET trạng thái lưu lỗi/retry lỗi và sửa integration fixture không phụ thuộc trang đầu hàng đợi duyệt toàn cục. Kiểm chứng mới, rà soát độc lập, smoke bản build và backlog được ghi tại [báo cáo tiến độ 14/10](2026-10-14-project-status.md); không dùng kết quả 12/10 làm bằng chứng kiểm thử mới.
