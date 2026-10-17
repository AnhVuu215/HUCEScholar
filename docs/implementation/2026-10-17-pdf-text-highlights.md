# Vùng tô và ghi chú theo đoạn PDF — 17/10/2026

Nhánh `codex/pdf-text-highlights`, tiếp nối `acabd14`. Mở rộng reader/annotations có sẵn; không thêm dependency, migration, dữ liệu thật hoặc cài PWA.

## Luồng sử dụng

Chọn chữ trên một trang PDF → **Tô sáng đoạn chọn** → chọn Vàng/Xanh lá/Xanh dương, thêm ghi chú tùy chọn → **Lưu vùng tô**. Bấm đoạn tô hoặc **Sửa vùng tô** trong danh sách để mở bộ soạn; có xóa và xác nhận inline. PDF scan không chọn được chữ vẫn có ghi chú theo trang.

Mỗi vùng tô riêng theo người, phiên bản và trang, không chuyển sang PDF mới. Giữ bản soạn khi chuyển trang hoặc PDF lỗi; xác nhận rời trang dùng chung với ghi chú theo trang. Quote/nội dung render plain text. Không sửa PDF gốc, không đưa nội dung vào history/storage/service worker/audit.

## Hợp đồng dữ liệu

CRUD `/api/v1/library/versions/:id/highlights`: GET `pageNumber,cursor`, POST `pageNumber,anchor,color,content,requestId`, PATCH `revision,color,content`, DELETE `revision`. Dùng quyền đọc và khóa owner có sẵn của ReadingService, session/CSRF, không có admin bypass. `/notes` vẫn chỉ PAGE_NOTE; không dùng ID khác kind/version để sửa/xóa.

Tận dụng TEXT_HIGHLIGHT, anchor/color/request_id/revision đã có trong annotations. Anchor bất biến sau tạo: `coordinateSpace: normalized-pdf-v1`, quote 1–2000 ký tự, quads 1–100 phần tử, mỗi phần tử tám số hữu hạn 0..1 theo thứ tự chu vi, diện tích khác0. Tọa độ lấy từ crop box PDF chưa xoay, trục y PDF; chuyển qua PDF.js viewport khi chọn/vẽ. Color chỉ nhận ba mã #FFF59D/#A5D6A7/#90CAF9; content 0–4000 ký tự. Tạo mới yêu cầu PDF có text layer.

UUID create kiểm tra cả quote/quads/color/content/page/version/kind; retry cùng payload trả ID cũ. PATCH/DELETE kiểm tra revision. Lỗi mạng giữ UUID/payload và khóa chỉnh sửa cho đến lưu thành công hoặc hủy; một lỗi CSRF ở lần retry không xóa trạng thái chưa rõ kết quả. Frontend lấy đủ các cursor page để không mất lớp tô sau mục thứ30; hủy response cũ, xóa lớp tô khi GET thất bại/mất quyền.

Body JSON cho route highlights tối đa64KiB để chứa quads, quote và ghi chú tiếng Việt đủ độ dài. Route khác vẫn giữ16KiB; DTO tiếp tục giới hạn từng trường. Dùng bộ parser hiện có, không thêm runtime dependency.

## Quyết định hiển thị

Lớp tô không bắt pointer, text layer nhận chọn chữ/click; các thao tác tương đương có nút và nhãn trong danh sách. Vùng chọn tạm gắn với đúng DOM page vừa render để không dùng lại sau zoom/thay trang. Bộ soạn giữ anchor gốc khi chuyển trang PDF.

Kiểm thử xoay phát hiện biến CSS làm tròn kích thước text layer PDF.js chỉ được khai báo trong viewer mặc định. Reader tùy chỉnh đã bổ sung `--scale-round-x/y` và tính userUnit vào total scale; nếu thiếu, chữ chọn lệch khỏi canvas ở góc90/270. Không vá dependency.

## Kiểm chứng

- RED API404 trước triển khai; GREEN hai ca integration cho quyền, validation, request UUID, CAS, phân trang và nội dung UTF-8 đủ giới hạn. Toàn bộ integration: **136 đạt, một ca quét file thật opt-in bị bỏ qua**; không coi fixture SAFE là bằng chứng quét ClamAV/Poppler trong lượt này.
- **50 unit test đạt**; lint/typecheck và build API/web đạt. Web đã build lại sau sửa bố cục; không có migration mới, test setup xác nhận không có migration pending.
- Browser đã qua chọn thật bằng chuột, mất phản hồi/retry, giữ payload khi CSRF retry503, sửa/màu/xóa, đổi trang/reload và khớp chữ ở0/90/180/270 với zoom. Bốn ca hình học kiểm tra crop origin khác0; danh sách31 mục xác nhận lấy đủ cursor, GET lỗi/retry và xung đột tab vẫn giữ bản soạn gắn trang ban đầu.
- Review độc lập phát hiện trạng thái chưa rõ lần lưu có thể bị mở khóa sau lỗi CSRF ở retry. Regression tái hiện trước sửa và đạt sau sửa; giữ uncertainty cho đến response thành công hoặc hủy. Vùng chọn tạm gắn DOM page cụ thể, không chỉ key trang/zoom.
- Vòng browser toàn bộ đầu tiên:75 đạt, một lỗi account dùng chung chạm429 và một metadata proxy ECONNRESET chưa xác định nguyên nhân. Đã tách fixture highlights/highlights-list khỏi notes, giữ limiter sản phẩm. Lượt cuối **77/77 ca Playwright đạt trong3,7 phút**, gồm bốn ca hình học, hai hành trình highlight, các guard Back/Forward và hồi quy toàn ứng dụng; lỗi proxy không lặp lại, không tuyên bố đã xác định/sửa nguyên nhân của lỗi mạng đó.
- Kiểm tra ảnh desktop1440/tablet768/mobile360 tìm thấy thanh sticky đi vào vùng soạn. Đã giới hạn thanh vào container PDF và thêm assertion hình học; lượt ảnh xác nhận sau sửa đã được đọc, không che bộ soạn hoặc tràn chiều ngang. Detector một lượt:19 advisory font/màu có sẵn ngoài phần CSS bổ sung, DESIGN.md tự giới hạn ở wireframe; không đổi nhận diện sản phẩm.
- Smoke build local3000/3001: health/landing/project/library200; workspace `private,no-store`, highlights chưa đăng nhập401/no-store. Log `.local/highlights-*.log` và ảnh `.impeccable/review/highlights/` là bằng chứng local với PDF tổng hợp; dữ liệu test và credential tách khỏi bản demo chính.

## Giới hạn

Chưa OCR/ghi chú tự do trên ảnh scan, chia sẻ ghi chú, xuất PDF kèm vùng tô hoặc đồng bộ sang version mới. Chưa lưu nháp bền vững/offline. Không bảo đảm xử lý PDF có text layer hỏng hoặc thứ tự chữ sai; chỉ chọn trong một trang, tối đa2000 ký tự/100 hình chữ nhật cho một vùng tô. Chưa chứng minh Safari/iOS/Android thật, cảm ứng chọn chữ hoặc production/S3; kết quả Chrome local không thay thế kiểm thử thiết bị.

Việc web tiếp theo: tự đổi mật khẩu/buộc đổi mật khẩu khởi tạo và reset sau khi có SMTP. Cài PWA và thiết bị thật tiếp tục tạm hoãn theo yêu cầu người dùng.
