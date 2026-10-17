# Ghi chú theo trang và tiến độ đọc

Mốc tiếp nối kho học liệu trên nhánh `codex/reader-notes-progress`, từ main `c44f80e`. Không thêm dependency, không đổi wireframe và không tự merge main.

## Đã triển khai

- ADMIN, LECTURER, STUDENT tạo/xem/sửa/xóa **ghi chú của chính mình**, theo phiên bản và trang. Plain text trim 1–4000 ký tự, cursor 30 mục. Admin không đọc ghi chú người khác.
- Tạo note có UUID request duy nhất theo owner. Retry cùng request/body trả note cũ; body khác trả 409. UI giữ UUID và nội dung khi không rõ kết quả, tránh lưu trùng sau mất response. Idempotency chỉ tồn tại trong vòng đời bản ghi; UI đổi UUID sau lưu/bỏ bản soạn.
- Sửa/xóa kiểm tra revision. Conflict giữ bản soạn; tải danh sách không xóa nội dung đang nhập. Xóa cần xác nhận, tải lại danh sách hủy xác nhận cũ để chọn revision mới.
- Bản soạn vẫn gắn trang bắt đầu khi đổi trang PDF; panel không unmount khi PDF lỗi/thử lại. Link nội bộ, đăng xuất và đóng/tải lại trang có guard khi chưa lưu.
- Tiến độ riêng theo owner/version, chỉ lưu sau khi canvas và text layer render thành công. GET trước khi bật ghi; PUT revision 0 khi chưa có, revision tăng sau xác nhận. Debounce 400ms, ghi tuần tự và gộp trang mới nhất.
- Mở lại cùng version khôi phục trang đã lưu. Lỗi mạng có retry; conflict tab yêu cầu tải lại, không tự overwrite. Lỗi GET có lựa chọn đọc từ trang 1 với lưu tiến độ tắt. Không lưu zoom, rotation hoặc offset; `page_offset=0`.
- Trạng thái lưu nằm trước PDF; form/danh sách ghi chú nằm sau PDF. Giữ palette, Segoe UI và controls hiện hữu; copy landing/workspace/project cập nhật theo chức năng thật.

## API và dữ liệu

Routes dưới `/api/v1/library/versions/:id`: GET/POST `notes`, PATCH/DELETE `notes/:noteId`, GET/PUT `progress`. Session bắt buộc; mutation cần CSRF. Không nhận owner từ client, không có admin bypass, không đưa nội dung vào audit/log. Response theo chính sách no-store hiện hữu.

Mọi route dùng cùng quyền đọc APPROVED + VISIBLE + SAFE + hạn quyền. Khi tài liệu không còn khả dụng, dừng cấp dữ liệu cá nhân nhưng giữ hàng trong database. Bản cũ APPROVED còn quyền vẫn có ghi chú/tiến độ riêng; không chuyển sang bản PDF mới.

Mutation lấy advisory transaction lock theo owner (`hashtextextended('hucescholar:reading:' + owner, 0)`), sau đó khóa SHARE actor → document → version → file. Điều này tuần tự hóa create/retry/CAS mà vẫn tương thích kiểm duyệt đang khóa document rồi SHARE manager. Không dùng actor UPDATE: reviewer phát hiện thứ tự đó gây deadlock; ca regression tái hiện lỗi NOWAIT trước sửa và đạt sau sửa.

Migration `202610120001_annotation_request_id` thêm UUID NOT NULL default `gen_random_uuid()` và unique `(user_id, request_id)` cho annotations. Đã deploy qua Prisma migrate lên test và local. Local xác nhận **23 bảng, 47 FK, 61 CHECK, 7 partial indexes, 6 user triggers**, cột UUID và unique index còn đầy đủ. Không sửa baseline hoặc dùng db push.

## Kiểm chứng

- RED API: route mới chưa tồn tại; GREEN integration materials 47 ca, sau regression khóa là 48 ca.
- Browser RED cho thiếu editor/resume; bổ sung regression riêng xác nhận bản soạn từng mất khi PDF lỗi, rồi sửa cách mount panel.
- Full integration: **114 đạt, 1 bỏ qua có chủ ý** (scanner thật opt-in). Gồm privacy cả ba role, CSRF, validation, cursor, idempotency, stale/concurrent revision, hidden/unsafe/expired, bản cũ và retention.
- Focused browser notes/progress đạt: response mất sau commit không nhân đôi; conflict edit giữ draft; trang 2 khôi phục; lỗi mạng/conflict progress không overwrite; đọc khi GET lỗi không ghi.
- Format/lint/typecheck, **50 unit**, build API/web đạt. Browser full run 48 đạt, 1 assertion copy cũ thất bại; cập nhật assertion rồi chạy lại `--last-failed`: 1 đạt. Tổng **49 hành trình** được xác nhận. Chi tiết trong execution ledger của [plan](../superpowers/plans/2026-10-12-reader-notes-progress.md).
- Visual review desktop 1440, tablet 768, mobile 360 dùng PDF 2 trang tự tạo. Canvas chờ đúng chiều rộng; không tràn document. Detector chạy một lần trả `[]`; finish reviewer verdict **ship** trong phạm vi captures. Ordinary extension giữ nguyên DESIGN/sidecar lịch sử.

Log cục bộ (ignored) nằm ở `.local/reading-*.log`; captures ở `.impeccable/review/reading/`. Những đầu ra này là bằng chứng môi trường phát triển, không phải dữ liệu HUCE hay xác nhận production.

Bản build cuối đã khởi động lại local 3000/3001: HTTP health, landing, login, library và PDF worker trả 200; notes/progress chưa đăng nhập trả 401 với no-store.

## Giới hạn và tiếp nối

**Cập nhật17/10:** đã bổ sung guard Back/Forward trong lịch sử ứng dụng, thay thế giới hạn SPA của mốc12/10. Chọn ở lại giữ URL/bản soạn và không thêm entry giả; đang lưu chặn traversal. Bản soạn vẫn chỉ trong bộ nhớ trang, chưa có lưu nháp offline. Xem [phạm vi kiểm chứng và giới hạn](2026-10-17-web-reader-history.md).

Tiến độ đang pending khi rời trang có thể chưa được ghi; chỉ thông báo “Đã lưu” sau response hợp lệ. Không có beacon/offline queue. Chưa có text highlight, OCR, export ghi chú hoặc đồng bộ anchor sang version mới. Chưa chứng minh cài PWA/Safari/iOS/Android trên thiết bị thật, PDF HUCE thật hoặc S3 production. Cảnh báo `pg client.query` deprecation có sẵn không được coi là ca kiểm thử thất bại.

Mốc tiếp theo: vòng đời học liệu (phiên bản kế tiếp, bàn giao, ẩn/khôi phục), sau đó thư viện cá nhân/nguồn sách và PWA/HTTPS.
