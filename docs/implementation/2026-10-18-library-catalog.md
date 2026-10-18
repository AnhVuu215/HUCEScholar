# SEARCH-02 — Kho học liệu và lịch sử bộ lọc

Phạm vi local, dữ liệu kiểm thử tổng hợp. Không thay đổi API, schema, quyền xuất bản/đọc/tải hoặc tìm không dấu.

## Hành vi

- Hàng chính: tìm tiêu đề/tác giả, môn học, Bộ lọc và Tìm kiếm. Nguồn/loại mở inline bằng nút có trạng thái mở và số lựa chọn; không drawer. Dòng kết quả giữ tác giả, nguồn, loại, phiên bản, môn, số trang và chính sách tải. Đọc tài liệu vẫn mở reader hiện hữu, nơi thực hiện lưu/tải theo quyền.
- URL chỉ chấp nhận `search`, `courseId`, `kind`, `materialType`, `page`. Submit đặt trang1; phân trang giữ bộ lọc đã áp dụng. Back/Forward khôi phục form và kết quả. Xóa bộ lọc về URL kho gốc. Bộ lọc đang soạn chỉ áp dụng sau Tìm kiếm.
- Chuẩn hóa query bằng whitelist: trim tìm kiếm, tối đa200 ký tự; enum nguồn/loại đúng API; ID môn là bigint dương trong miền PostgreSQL; trang nguyên1–100000. Giá trị sai hoặc lặp bị bỏ, tham số khác bị xóa bằng replaceState. Trang1 không cần ghi URL. API vẫn tự kiểm tra quyền và validation.
- Native History API tích hợp với Next `useSearchParams` theo tài liệu Next cài trong repo. Mỗi query chuẩn hóa tạo một session kết quả mới: hủy request cũ, xóa dữ liệu cũ khi tải và khôi phục form từ query. Không tái sử dụng dữ liệu kho giữa các phiên đăng nhập.
- Tìm kiếm ghi chú trong sổ tay và trong PDF vẫn chỉ ở RAM/POST hiện hữu. Không đưa nội dung ghi chú, trích dẫn hoặc signed URL vào URL kho.
- Lỗi list và lỗi danh sách môn có thông báo/thử lại; rỗng có hướng dẫn bỏ lọc. Course choices vẫn lấy từ API kho có quyền đọc, bao gồm môn lịch sử. Không thêm dữ liệu mẫu vào sản phẩm.
- Liên kết có môn hợp lệ nhưng không còn trong choices giữ một option có nhãn rõ, không giả vờ đang chọn Tất cả môn. Khi đổi query, focus trở lại control đã dùng; phân trang đợi kết quả, không giành focus nếu người dùng đã chuyển sang control khác. Xóa lọc đưa focus về tìm kiếm.

## Kiểm chứng

- `catalog-check-final.log`: lint, typecheck,82 unit test và build API/web đều qua.
- `catalog-integration-final.log`:156 integration qua,1 test worker thật opt-in skip sẵn (`REAL_PDF_WORKER_TEST`).
- `catalog-full-browser-final.log`:135 kiểm thử Playwright với1worker,134 qua trong5.5 phút;1 test chuyển DOCX thật opt-in skip sẵn (`DOCX_REAL`). Bao gồm reader, note/highlight cũ, nguồn DOCX theo fixture, thư viện cá nhân/tiến độ, ba role, mất quyền, moderation giữ bản soạn và Back/Forward.
- `catalog-format-final.log` và `git diff --check`: sạch. Review cuối không còn finding sau các sửa focus/course; không commit, merge hoặc deploy trong lượt này.

Các test UI mới mock list/course để kiểm độc lập URL, lỗi mạng, hủy request cũ, phản hồi muộn và tiêu đề dài; đăng nhập dùng API/session thật. Quy trình xuất bản, quyền đọc/tải, lưu, notes và history được kiểm riêng bằng integration/browser hiện hữu. Screenshot `.local/library-{320,390,768,1440}.png` và overflow assertions kiểm bố cục Chrome desktop giả lập viewport; không phải kiểm thử thiết bị thật hoặc production. Không coi hai test opt-in chưa chạy là bằng chứng worker/converter thật.

Review phát hiện và đã tái hiện/sửa focus mất khi remount query, môn cũ hiện sai Tất cả môn và focus khi xóa bộ lọc chưa áp dụng. Full suite ban đầu lộ race của test outline: hộp thoại xuất hiện sau resolve destination nhưng test đã đăng ký cả dismiss lẫn accept. Test hiện đợi xử lý từng hộp thoại cùng click; không đổi reader để né lỗi test. Các lượt bị dừng không phải kết quả nghiệm thu; log cuối ở trên là bằng chứng hoàn tất.

## Bàn giao PREF-01

Chưa thêm preferences API trong SEARCH-02. Khi triển khai phải dùng đúng giá trị hiện hữu:

| Màu | Mã |
| --- | --- |
| Vàng | `#FFF59D` |
| Xanh lá | `#A5D6A7` |
| Xanh dương | `#90CAF9` |
| Hồng | `#F8BBD0` |
| Tím | `#CE93D8` |
| Cam | `#FFCC80` |
| Xanh ngọc | `#80CBC4` |
| Xám | `#B0BEC5` |

Nguồn enum: `apps/web/lib/highlights.ts`, đối chiếu DTO API. Zoom trong `library-reader.tsx`: `fit` (Vừa chiều rộng), `0.75`, `1`, `1.25`, `1.5`, `2` tương ứng75/100/125/150/200%. Mặc định hiện tại `fit`. Không có zoom tự do, OCR hoặc đọc PDF offline.

Preference màu mới chỉ khởi tạo vùng tô mới; không rewrite màu/vị trí/nội dung/revision của vùng tô đã lưu hoặc bản soạn. Zoom mặc định áp dụng khi khởi tạo reader theo contract PREF-01, không ghi đè lựa chọn đang dùng hoặc tiến độ trang đã xác nhận. Phải kiểm validation phía API và cách ưu tiên preference/session trước khi triển khai đợt C.
