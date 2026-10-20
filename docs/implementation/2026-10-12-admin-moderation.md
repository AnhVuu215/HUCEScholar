# Kiểm duyệt học liệu và bản hiện hành

Cập nhật 18/10/2026: đã sửa đường điều hướng sớm sau đăng nhập làm Back/Forward tải document mới và mất bản soạn. Menu chờ xác thực client hoàn tất trước khi hiện link theo role. [Nguyên nhân và kiểm chứng hồi quy](2026-10-18-moderation-draft-history-fix.md).

## Phạm vi

Admin xem hàng chờ, metadata/nguồn/quyền, PDF SAFE, yêu cầu sửa, từ chối hoặc duyệt phiên bản làm bản hiện hành. Chủ nhận CHANGES_REQUIRED mở lại DRAFT, sửa rồi gửi lại; giữ các quyết định cũ. Chưa có tạo phiên bản kế tiếp, bàn giao, ẩn/khôi phục, kho tìm kiếm, reader, ghi chú hoặc tải file cho người học.

## API và giao dịch

- `GET /api/v1/admin/publication-requests`: trạng thái mặc định PENDING; lọc status, kind, search và phân trang page/limit. Xếp thời điểm gửi/id tăng dần để xử lý lượt cũ trước.
- `GET /:id`: người gửi, quyết định/lý do/người xử lý, version/revision, metadata, môn và trạng thái kỹ thuật/hiển thị. Không trả object key, hash, credentials hoặc ghi chú.
- `GET /:id/pdf`: stream nguyên PDF private cho quyền kiểm duyệt ADMIN, chỉ khi SAFE và snapshot còn khớp. `no-store`, inline với tên cố định, không signed URL/public bucket. Mở tab mới; đây là preview full-response, chưa phải reader có Range/PDF.js. Lỗi kho local trả 503 trước headers; S3 thật chưa kiểm chứng.
- `POST /:id/decision`: `{revision, submittedRevision, outcome, reason, rightsConfirmed}`. Outcome APPROVED/CHANGES_REQUIRED/REJECTED. Lý do trim 1–1.000 ký tự cho mọi quyết định để có dấu vết, bao gồm duyệt. APPROVED bắt buộc rightsConfirmed=true: admin xác nhận đã xem nội dung/căn cứ quyền, không suy ra quyền từ scan SAFE.
- `POST /api/v1/material-drafts/:id/reopen`: `{revision}`, chỉ chủ CHANGES_REQUIRED còn đủ quyền/phân công; về DRAFT, tăng revision, giữ lịch sử. Owner list hỗ trợ cả năm trạng thái.

Mutation dùng session/RBAC/CSRF, whitelist validation và kiểm lại admin ACTIVE/verified trong transaction. Khóa actor → catalog advisory 68467,1 → document → version → request; duyệt thêm manager và file SHARE. Request còn PENDING, request revision khớp, submitted_revision khớp input và revision phiên bản SUBMITTED hiện tại. Duyệt kiểm lại manager đúng role/ACTIVE/verified, tất cả môn/khoa và phân công hiện hành, nguồn/quyền/metadata, hạn quyền và file SAFE dưới khóa. Yêu cầu sửa/từ chối vẫn được xử lý nếu các điều kiện công bố không còn hợp lệ.

Request, review_status phiên bản, document revision/current_version_id và audit ghi cùng transaction. APPROVED cập nhật bản hiện hành; không đổi visibility/download_allowed hoặc snapshot. HIDDEN vẫn HIDDEN. Duyệt/rút và hai quyết định cùng revision chỉ một lượt được lưu. Trigger/partial index/FK PostgreSQL giữ nguyên, không migration/db push.

Một request lịch sử trỏ phiên bản có thể đã sửa sau khi rút/mở lại. `snapshotMatches` chỉ đúng khi trạng thái/revision chứng minh snapshot còn nguyên. Nếu không khớp, chi tiết ghi rõ metadata là hiện tại, chặn preview và quyết định; không trình bày PDF mới như PDF của lần gửi cũ.

## Giao diện

`/workspace/admin/moderation` kế thừa shell navy, bảng reflow và inline editor. Chi tiết chỉ đọc; quyết định có xác nhận inline nêu phiên bản/lần lưu. Chờ xử lý khóa thao tác. Lỗi hoặc chưa rõ kết quả giữ lý do và yêu cầu **Tải trạng thái yêu cầu** trước retry, không tự gửi lại mutation. Link/đóng/đăng xuất với quyết định chưa lưu cần xác nhận bỏ. Khi duyệt thành công vẫn ghi rõ kho/reader chưa mở; chủ thấy quyết định/lý do trong lịch sử.

## Kiểm chứng

Back/Forward của Next.js có thể unmount form mà không phát beforeunload. Một quyết định chưa lưu được giữ tạm trong RAM của tab, khóa theo actor/request/revision; chỉ khôi phục sau khi xác thực cùng actor và đọc lại request PENDING/snapshot còn khớp. Không ghi localStorage/sessionStorage. Bỏ thay đổi hoặc xử lý thành công xóa bản giữ tạm. Xác nhận quyền khi duyệt không được tự khôi phục.

Fixture đều minh họa, dùng database `_test`, Redis 15 và kho PDF test riêng. SAFE synthetic không thay bằng chứng scanner thực. Cleanup terminal fixture chạy DDL transaction có khóa độc quyền, chỉ tạm tắt hai trigger snapshot/course trên database test, xóa theo user IDs của lần chạy rồi bật lại trước COMMIT; production không bị đổi trigger.

- `pnpm check`: lint/typecheck, 50 unit tests, build API/web đạt. Integration chạy tuần tự sau generate với `--no-cache`: 101 đạt, một ca scanner thực opt-in bỏ qua. Bao gồm HIDDEN giữ nguyên, quyền/SAFE/phân công, manager bị khóa, snapshot cũ không được preview, rollback audit và quyết định/rút đồng thời.
- Browser cuối `pnpm test:e2e --workers=1`: 46 đạt, gồm API và web proxy preview, xác nhận quyền, commit quyết định rồi ngắt response, refresh trạng thái, chủ mở lại/gửi lại và Back/Forward khôi phục lý do/lựa chọn. Code review đã xử lý mất nội dung khi history navigation; test mới được quan sát RED trước bản sửa.
- Một lượt integration chạy trùng generate gặp ts-jest cache/type chưa ổn định; chạy sau build với cache sạch đạt. Các lượt browser đa worker gặp một ECONNRESET của preview proxy (không tái hiện khi đối soát API/proxy) và một ca phân công cũ vượt tổng timeout 30 giây; suite cuối chạy một worker đạt toàn bộ. Không đổi logic phân công để che timeout.
- Hai lượt tự kiểm tra giao diện, sáu ảnh toàn trang pending/retry ở 1440/768/360 px; không overflow ngang. Detector một lượt: 17 advisory thuộc token incumbent (16 font, một màu), không có finding trong CSS mới. Không thay DESIGN/sidecar wireframe lịch sử.
- Finish review kết luận ship, không còn sửa đổi bắt buộc trong phạm vi. Documenter đối chiếu giao diện, brief và tài liệu: không cần thay hệ thống thiết kế. Trạng thái owner CHANGES_REQUIRED được kiểm tra bằng source và browser flow, chưa có ảnh review riêng; các advisory incumbent không được hợp thức hóa thành quy tắc mới.
- Build local đã khởi động lại. Landing, route admin moderation và student materials trả HTTP 200; đây là kiểm tra phục vụ route, không thay hành vi đăng nhập trong browser suite. Fixture PDF preview là synthetic bytes; chưa kiểm chứng trình xem PDF native trên thiết bị thật hoặc S3/proxy với tài liệu lớn.

Không có dữ liệu trường thật, quyền phân phối được xác nhận, deployment HTTPS, kiểm chứng S3 hoặc thiết bị vật lý trong mốc này.
