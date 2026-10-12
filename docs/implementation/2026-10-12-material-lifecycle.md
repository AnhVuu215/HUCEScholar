# Vòng đời học liệu — 12/10/2026

Mở rộng Materials trên NestJS/Prisma/PostgreSQL và workspace Next.js. Không thêm dependency hoặc migration, không sửa prototype. Nhánh `codex/material-lifecycle` xếp trên milestone ghi chú/tiến độ `8ef66df`; chưa merge main.

## Đã triển khai

- Giảng viên/sinh viên tạo phiên bản kế tiếp sau APPROVED/REJECTED, chỉ một bản đang xử lý. Copy metadata nhận diện, năm xuất bản và môn; PDF rỗng, nguồn/quyền trống, download false. Nhập lại nguồn/quyền và upload trước khi gửi. Bản hiện hành và ghi chú/tiến độ cũ giữ nguyên.
- Danh sách riêng chọn latest trước khi lọc/tìm, mỗi tài liệu xuất hiện một lần. Lịch sử phiên bản và lịch sử xét duyệt từng bản có phân trang, owner-only.
- Admin tìm/lọc tại `/workspace/admin/materials`, xem manager, latest/current, mọi môn lịch sử và lịch sử quản lý.
- Bàn giao chỉ giáo trình giảng viên. Người nhận khác manager, ACTIVE, verified, LECTURER, có phân công cho mọi môn trong mọi phiên bản; môn/khoa còn hoạt động. Rút các yêu cầu đang chờ nguyên tử; giữ người gửi gốc, tác giả, PDF, bản công bố và dữ liệu riêng.
- Ẩn chặn lượt đọc/tải/notes/progress mới của mọi version; giữ dữ liệu. Khôi phục cần xác nhận lý do đã giải quyết, current APPROVED, PDF SAFE, nguồn/quyền hợp lệ và chưa hết hạn. Duyệt phiên bản không tự bỏ ẩn.
- UI xác nhận inline, giữ lý do/người nhận khi lỗi; khóa retry tới khi tải trạng thái. Thay đổi ở tab khác trả conflict, không tự ghi đè. Lịch sử hiển thị tên người bàn giao/nhận; lý do plain text.

## API và tính nhất quán

Owner: POST/GET `/api/v1/material-drafts/:id/versions`; GET `:id/requests?versionId=...`. Giữ DTO revision của các owner mutations hiện có. Revision của bản mới bắt đầu bằng revision terminal trước + 1, không reset về 1; chặn tràn int. Vì owner writes tìm latest theo document, tăng revision xuyên lineage ngăn tab V1/upload/retry cũ khớp V2/V3. Review độc lập phát hiện vấn đề; regression tái hiện stale write trả 200 trước sửa, sau sửa trả 409.

Admin: GET `/api/v1/admin/materials`, `:id`, `:id/recipients`; POST `:id/transfer`, `:id/visibility`. Mỗi write nhận document revision và lý do; restore thêm `resolved: true`. Session/role guards, CSRF và no-store hiện hữu. Recipient picker chỉ hỗ trợ chọn, API kiểm tra lại toàn bộ khi ghi.

Khóa actor SHARE → catalog advisory `68467,1` → document UPDATE → versions/requests → recipient SHARE. Bàn giao withdraw, đổi manager, history và audit chung transaction; audit lỗi rollback tất cả. Visibility khóa current version/file và kiểm tra dữ liệu hiện hành. Không cấp admin quyền vượt điều kiện đọc hoặc đọc ghi chú người khác.

## Kiểm chứng

- TDD API version/admin, concurrency, rollback, privacy, CSRF, stale revisions, hợp môn lịch sử và retention. Materials integration: 57 đạt, gồm regression tab cũ.
- Browser: mất response sau tạo version vẫn chỉ có một bản mới; refresh đối soát; xem quyết định bản cũ. Admin bàn giao, conflict khi tab khác ẩn, giữ lý do và khôi phục sau refresh.
- Format/lint/typecheck, 50 unit và build API/web đạt. Full integration **123 đạt, 1 skip có chủ ý**. Browser full 48 đạt, 3 assertion cần cập nhật; sửa copy và scope lịch sử rồi chạy `--last-failed` 3 đạt. Tổng **51 hành trình** được xác nhận. Chi tiết trong execution ledger của [plan](../superpowers/plans/2026-10-12-material-lifecycle.md).
- Captures owner/admin tại 1440/768/360 trong `.impeccable/review/lifecycle/`, detector chạy một lần trả `[]`. Reviewer chỉ ra pager admin mobile vượt inset; sửa wrapping scoped và thêm kiểm tra bounds. Recapture cả sáu, verdict **ship** cho fix pager; documenter đối soát ordinary extension consistent và giữ root DESIGN/sidecar wireframe.

Logs `.local/lifecycle-*.log` và captures đều ignored. Fixtures synthetic chỉ trong database `_test`, scan SAFE fixture được ghi rõ; scanner thật là suite opt-in riêng. Không phải dữ liệu hoặc bằng chứng vận hành HUCE.

Production build local đã restart tại `127.0.0.1:3000`/`3001`: health, landing, login và admin materials shell HTTP200; hai API mới chưa đăng nhập trả401/no-store. Shell200 không cấp dữ liệu admin. Không có migration mới cần apply. Bốn commit chức năng đã push lên nhánh triển khai; tài liệu này bổ sung trong commit cuối, chưa merge main.

## Giới hạn

Ẩn không thu hồi file đã tải hoặc bytes đã cấp. Chưa có thông báo email, highlight, PDF offline, nguồn sách HUCE thật hoặc S3 production. Kiểm tra responsive qua Edge desktop không thay thử Safari/iOS/Android và cài PWA thật. Giới hạn Back/Forward của bản soạn reader được giữ như [milestone trước](2026-10-12-reader-notes-progress.md).

Tiếp nối: thư viện cá nhân và nguồn sách được cấp quyền, sau đó PWA/HTTPS và pilot thiết bị thật.
