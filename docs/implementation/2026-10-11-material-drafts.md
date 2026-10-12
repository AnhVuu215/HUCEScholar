# Bản nháp học liệu

Lát cắt đầu của mốc học liệu, kế thừa quy tắc 1.1 và stack đã chốt. Chỉ lưu metadata; chưa có upload PDF hoặc công bố.

## Hành vi

- LECTURER/STUDENT dùng `/api/v1/material-drafts`: GET danh sách riêng, GET `/:id`, POST tạo, PATCH `/:id` sửa; GET `/courses` tìm/phân trang môn có thể chọn. ADMIN không biên soạn. Server ép owner và kind từ phiên; không nhận manager/kind/file/status từ client.
- UI `/workspace/lecturer/materials` và `/workspace/student/materials`; tiêu đề/loại/nguồn/quyền và 1–20 môn bắt buộc, tác giả/mô tả có thể trống. API yêu cầu đủ các key fields (tác giả/mô tả gửi chuỗi rỗng khi chưa nhập). Độ dài được giới hạn tại cả UI/API.
- Chủ bản thấy metadata riêng, kể cả khi mất phân công; người khác nhận 404. Giảng viên chỉ sửa nếu còn phân công và môn/khoa hoạt động cho tất cả môn cũ/mới. Sinh viên chỉ sửa bài bổ sung của mình.
- Mỗi lần ghi kiểm tra lại actor, giữ khóa theo thứ tự actor → catalog advisory → document/version, rồi cập nhật metadata/liên kết/revision/audit cùng transaction. Race thu hồi–sửa được serialize theo cùng lock với phân công; stale revision trả 409, không tự ghi đè.
- Giao diện giữ dữ liệu khi lỗi/xung đột; đóng form, bấm liên kết điều hướng cùng tab hoặc đăng xuất khi đang sửa đều cần xác nhận bỏ thay đổi. Đăng xuất chỉ gọi API thu hồi phiên sau khi xác nhận; hủy xác nhận giữ cả nội dung và phiên. Reload/đóng tab dùng cảnh báo native của trình duyệt khi có thay đổi. Không lưu metadata riêng vào localStorage.
- Bản mới có version_no 1, chưa có bản đã công bố hiện hành. Chỉ sửa DRAFT; tạo phiên bản sau công bố và trạng thái xét duyệt nối vào mốc sau.

## Schema

Migration `202610110005_material_draft_without_file`: file_id có thể null **chỉ khi DRAFT**, CHECK chặn mọi trạng thái khác khi thiếu file. Không tạo metadata files giả, không suy ra SAFE từ việc lưu bản nháp. Các FK, partial indexes và snapshot triggers gốc giữ nguyên. Prisma mapping cập nhật quan hệ nullable.

SQL/ERD/Word trong docs/database là baseline lịch sử; migration + Prisma schema là nguồn triển khai. Tổng sau migration: 23 bảng nghiệp vụ, 47 FK, 61 CHECK, 7 partial indexes và 5 snapshot triggers.

## Ranh giới

Chưa có upload/kho file, worker kiểm tra virus/PDF, gửi/rút, duyệt/từ chối, tạo bản kế tiếp, đọc/tải, PWA hoặc kiểm chứng thiết bị thật. Checkbox downloadAllowed chỉ ghi đề nghị, chưa cấp quyền tải. Metadata nguồn/quyền là nội dung khai báo chờ quy trình kiểm duyệt, không tự chứng minh bản quyền.

Local không được seed fixture. Dữ liệu synthetic chỉ ở hucescholar_test; account test tách theo suite, credential lưu trong file ignored. Captures của ba trạng thái editor/list/conflict trên Chrome desktop 1440×1000, tablet 768×1024 và mobile 360×800 ở `.impeccable/review/materials/`, không commit.

## Kiểm chứng ngày 2026-10-11

- 41 unit, 77 integration và 34 Playwright tests qua; format, lint, typecheck và build qua. Integration bao gồm isolation theo owner/role, CSRF, transaction rollback, stale/concurrent revisions, race thu hồi phân công và CHECK thiếu file ở mọi trạng thái ngoài DRAFT.
- Playwright kiểm tra lưu/tải lại/sửa, dữ liệu còn nguyên khi xung đột, retry lỗi mạng, xác nhận đóng form/chuyển liên kết/đăng xuất. Hủy đăng xuất giữ phiên; xác nhận đăng xuất thu hồi phiên. Capture ba kích thước không tràn ngang; đây là viewport mô phỏng, chưa phải kiểm chứng thiết bị thật.
- Review API không còn finding quan trọng. Hai finding về mất dữ liệu khi chuyển liên kết và đăng xuất đã được sửa và recheck; UI disposition `ship`. Documenter giữ hệ thống thiết kế hiện hữu, ghi nhận khác biệt prototype–production mà không thay token ngoài phạm vi.
- Bản build mới đã chạy local: API health `ok`, hai route học liệu trả HTTP 200. Database local có 5 migration hoàn tất, 61 CHECK, một ADMIN; catalog/phân công/học liệu/version/file đều trống. HTTP 200 chỉ xác nhận route phục vụ; luồng đăng nhập đúng role và ghi dữ liệu được chứng minh trên database test.

Mốc kế tiếp: upload PDF vào kho riêng, xác thực/kiểm tra file và worker scan; sau đó mới triển khai gửi duyệt, duyệt và công bố.
