# CITE-01 — Trích dẫn có nguồn và liên kết trang PDF

Cập nhật sau CITE-01: lỗi giữ bản soạn moderation được xác định là menu xuất hiện trước hydration, gây điều hướng document mới; đã có [bản sửa và kiểm chứng riêng](2026-10-18-moderation-draft-history-fix.md). Kết quả41/42 bên dưới là lịch sử lượt CITE-01 trước sửa.

Nối tiếp READ-03 trên nền `5a19c49`. Phạm vi là CITE-01 trong [kế hoạch reader V2](../superpowers/plans/2026-10-17-workspace-v2-reader-library.md). Tìm ghi chú toàn phiên bản, tìm chữ/mục lục và chế độ đọc tập trung còn trong kế hoạch.

## Hành vi

- Chọn chữ thật trong một trang PDF rồi chọn **Trích dẫn** trên toolbar cạnh đoạn chọn hoặc **Trích dẫn đoạn chọn** trên thanh đọc. Trích dẫn gồm quote plain text, tên tài liệu, tác giả nếu có, phiên bản, trang PDF và liên kết cùng origin đang truy cập. Đây không phải định dạng APA/IEEE và không suy ra số trang in.
- Liên kết `/workspace/library/versions/{id}?page={p}` giữ đúng phiên bản, không dùng bản hiện hành thay thế; không chứa quote, ghi chú, signed URL hoặc quyền truy cập. Người đọc cần phiên đăng nhập và quyền như các lượt đọc bình thường. Nếu phải đăng nhập lại, cần mở lại liên kết; chưa thêm luồng chuyển hướng sau đăng nhập.
- Chỉ hiện **Đã sao chép** sau khi Clipboard API xác nhận. Khi API không có hoặc bị từ chối, textarea chỉ đọc giữ nguyên nội dung để chọn và sao chép thủ công. Không gửi nội dung sang dịch vụ ngoài; không ghi vào localStorage, history state hoặc service worker.
- Sao chép không tạo annotation. **Lưu đoạn vào ghi chú** là thao tác riêng, mở bộ soạn READ-03 với quote/anchor/trang gốc dù đã chuyển trang. Người dùng vẫn phải lưu rõ ràng, có requestId và guard bản soạn hiện hữu.
- Trang được dẫn ưu tiên tiến độ cũ; nút quay lại giữ trang đã lưu trước khi mở link. Chỉ lưu sau khi PDF render thành công. Tham số rỗng, lặp, không phải số nguyên dương hoặc vượt số trang PDF được báo lỗi và chưa render/lưu trước khi người dùng chọn cách tiếp tục.
- Điều hướng cùng phiên bản nhưng khác query cũng đi qua guard click/Back/Forward. Hash đơn thuần giữ hành vi hiện hữu. Không thay API, schema, quyền đọc hoặc PDF/DOCX gốc.

## Kiểm chứng

- `pnpm check` đạt: lint/typecheck, 82 unit tests và build API/web. Không thêm dependency hoặc migration.
- Lượt browser rộng chạy trích dẫn, reader V2, READ-03, geometry và toàn bộ `materials.spec.ts`: **41 đạt, 1 lỗi**. Lỗi là khôi phục lý do quyết định kiểm duyệt sau Back/Forward, không thuộc reader. Chạy riêng vẫn lỗi; bản sao sạch HEAD `5a19c49` không có thay đổi CITE-01 cũng tái hiện đúng lỗi tại `materials.spec.ts:1390`. Đây là lỗi có sẵn, chưa sửa trong lát cắt này. Log baseline: `.local/citations-baseline-5a19c49/.local/moderation-baseline.log`.
- Reviewer độc lập phát hiện guard chỉ xét pathname và đóng citation trả focus vào nút disabled. Đã sửa, thêm regression và được rà soát lại. Ca Back query đã thất bại trước sửa với số prompt0 thay vì1; ca reload sau link sai thất bại với đích trang3 của PDF2trang.
- Lượt đầu dùng chung tài khoản reader-v2 gây429. Đã tách tài khoản tổng hợp citations và dùng chung một tài liệu fixture, giữ nguyên limiter sản phẩm. Chỉ dùng database `_test` và Redis DB15; không dùng credential thật.
- Clipboard success/deny/missing được mô phỏng để kiểm tra Promise và fallback, không ghi đè clipboard của máy người dùng trong test. Formatter kiểm tiếng Việt/xuống dòng/HTML như plain text, thiếu tác giả và origin không hợp lệ. Link mất quyền trả404/no-store ở metadata và PDF.
- Ảnh 1440/390/320 và reflow assertion ở `.local/citations-*.png`; đã xem desktop/mobile. PDF fixture tổng hợp, không phải bằng chứng quét mã độc hoặc kiểm thử thiết bị thật.

- Sau bản sửa cuối: web lint/typecheck/build, tools TypeScript và `pnpm format:check` đạt. Playwright xác nhận **11/11 đạt**, gồm9ca CITE-01 và2ca hồi quy tiến độ/lịch sử reader. Log `.local/citations-confirmation.log`, `.local/citations-web-final.log` và `.local/citations-format-check.log`.
- Ca GET tiến độ lỗi ngay lần đầu cũng có RED→GREEN: trước sửa, sau chọn đọc trang1 rồi tải lại, input nhận trang3 và PDF lỗi; sau sửa, lựa chọn đọc trang1 đánh dấu đã xử lý đích link, lần tải lại lấy tiến độ server. Test chờ phản hồi GET và trạng thái loading kết thúc, không lấy trạng thái render cũ làm bằng chứng.

Chưa deploy, chưa chạy full browser suite toàn hệ thống hoặc converter DOCX thật trong lượt CITE-01. Bước tiếp theo trong V2 là LEARN-01. Lỗi giữ bản soạn moderation của lượt này đã được xử lý ở bản sửa riêng liên kết phía trên; kết quả toàn bộ browser suite vẫn cần kiểm chứng riêng trước khi tuyên bố đạt toàn hệ thống.
