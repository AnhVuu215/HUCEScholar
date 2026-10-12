# Gửi và rút yêu cầu duyệt học liệu

Lát cắt tiếp theo sau bản nháp/PDF: giảng viên và sinh viên gửi phiên bản để xét duyệt, rút với lý do và xem lịch sử. Chưa có quyết định của admin, công bố, reader, tạo phiên bản kế tiếp hoặc gửi lại từ CHANGES_REQUIRED.

## Hành vi và API

- `POST /api/v1/material-drafts/:id/submit`, JSON `{ revision }`: actor hoạt động/đã xác minh, đúng chủ và loại tài liệu; phiên bản DRAFT; thông tin, nguồn, căn cứ quyền và môn đầy đủ; quyền chưa hết hạn, môn/khoa hoạt động và giảng viên có phân công tất cả môn; PDF SAFE. Tăng revision rồi chuyển SUBMITTED, tạo publication_requests PENDING với submitted_revision bằng revision sau chuyển. Không cập nhật current_version_id hoặc visibility.
- `POST /api/v1/material-drafts/:id/withdraw`, JSON `{ revision, reason }`: đúng chủ, revision và SUBMITTED; lần gửi hiện hành còn PENDING và submitted_revision khớp. Lý do trim 1–1.000 ký tự. Đóng request WITHDRAWN với người/thời điểm/lý do, đưa phiên bản về DRAFT, tăng revision. Không cần phân công hiện hành để rút; cần phân công lại để sửa/gửi.
- `GET /api/v1/material-drafts`: mặc định gồm DRAFT và SUBMITTED riêng; bộ lọc reviewStatus nhận hai trạng thái đó. Search/phân trang giữ nguyên. `GET /:id/requests?page=1&limit=10` trả lịch sử của phiên bản mới nhất trong tài liệu do mình quản lý; sắp theo thời điểm gửi/id giảm dần. Không trả object key hoặc bytes.
- ADMIN không biên soạn/gửi/rút qua các endpoint này. Mutation giữ session/RBAC/CSRF và validation từ luồng hiện có; trường client không được phép trả 400.

## Tính nhất quán

Thứ tự khóa: actor → catalog advisory chung với thay đổi phân công → document → version → file (gửi) hoặc pending request (rút). Kiểm revision dưới khóa; thay trạng thái/version, request, document revision và audit trong cùng transaction. Hai lượt gửi/rút cùng revision chỉ một lượt được lưu; rollback audit lỗi giữ nguyên tất cả dữ liệu. File SAFE được đọc lại dưới khóa, không tin trạng thái UI. Partial unique một pending request và snapshot triggers PostgreSQL được giữ nguyên; không migration hoặc db push.

Rút rồi gửi lại tạo request mới, giữ lần cũ. Prisma mô tả relation publication_requests dạng singular do partial unique của baseline; code dùng truy vấn trực tiếp findMany theo version_id để đọc đầy đủ lịch sử, không dựa vào relation đó.

## Giao diện

Mở **Học liệu của tôi** bằng role sinh viên/giảng viên, lưu thông tin và upload PDF. Khi SAFE và quyền phù hợp, **Gửi duyệt** mở xác nhận inline có phiên bản/lần lưu. Bản chờ khóa metadata/PDF; nhập lý do và **Rút về nháp** để sửa. Lịch sử hiển thị trạng thái, thời gian, revision được gửi và lý do; có retry/phân trang. Giữ phong cách workspace navy hiện hữu, không thay thiết kế landing hoặc prototype.

Không gửi khi metadata/file đang sửa hoặc upload. Lý do rút chưa lưu tham gia cảnh báo rời trang/đăng xuất. Khi thất bại hoặc chưa rõ kết quả, khóa tiếp thao tác và yêu cầu **Tải trạng thái duyệt**; giữ lý do nếu vẫn SUBMITTED. Khi chưa rõ kết quả gửi, metadata/PDF cũng bị khóa cho tới khi refresh thành công, tránh mắc kẹt giữa bản local và snapshot đã gửi. Không tự retry mutation và không lưu dữ liệu riêng trong localStorage.

## Kiểm chứng và giới hạn

Integration dùng database `_test` và Redis 15 riêng. Fixture scan SAFE trong ca gửi/rút là trạng thái synthetic được gắn rõ; không thay thế bằng chứng ClamAV/Poppler thực từ mốc upload. Không seed học liệu hoặc yêu cầu giả vào database local chính.

- `pnpm check`: lint, typecheck, 50 unit tests và build API/web đạt. Integration: 94 đạt, một ca scanner thực được bỏ qua; cảnh báo concurrent query của pg có từ trước.
- Browser suite: 44 đạt. Sau sửa phục hồi kết quả gửi chưa rõ và tách khóa PDF khỏi metadata dirty, chạy lại toàn bộ 7 ca materials đạt, cùng lint/typecheck/build web và format check. Ca lecturer thực hiện request thành công rồi ngắt response để kiểm tra metadata/PDF bị khóa và refresh vẫn dùng được.
- Code review đã xử lý lỗi phục hồi kết quả gửi. Finish review kết luận `ship` với sáu ảnh toàn trang và sáu ảnh chi tiết ở 1440/768/360 px cho trạng thái chờ duyệt/lỗi cần tải lại. Detector chạy một lượt: 17 advisory thuộc token incumbent (16 font, một màu), không thuộc CSS mới; không thay thế kiểm tra tương phản hoặc thiết bị thật.
- Đối soát design system kết luận không cần đổi: 11 dòng CSS mới kế thừa workspace Operate. Giữ nguyên DESIGN.md/sidecar của wireframe lịch sử; không nâng advisory hoặc chênh lệch token có từ trước thành quy tắc cho production.
- API/web local được build và khởi động lại; health, landing và route materials hai role trả HTTP 200. Đây chỉ là bằng chứng server local phục vụ route; hành vi có đăng nhập được kiểm tra bằng tài khoản synthetic trong browser suite.

Mốc tiếp theo: queue kiểm duyệt ADMIN, kiểm tra snapshot/revision, yêu cầu sửa/từ chối/duyệt và công bố nguyên tử. Sau đó reader/ghi chú. Chưa có deployment HTTPS, S3 thật hoặc kiểm chứng thiết bị vật lý ở mốc này.
