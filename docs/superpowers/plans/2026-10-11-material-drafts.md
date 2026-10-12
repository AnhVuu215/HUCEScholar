# Bản nháp học liệu — lát cắt đầu của mốc học liệu

Mục tiêu: giảng viên/sinh viên tạo, tìm và sửa metadata bản nháp của chính mình. Kế thừa nghiệp vụ 1.1, Next.js/NestJS và schema hiện tại. Thực hiện trực tiếp trong phiên theo yêu cầu tiếp tục triển khai; chia commit theo chức năng. Không nhập nội dung HUCE hoặc tạo file SAFE giả.

## Phạm vi và quyết định

- Dùng `/api/v1/material-drafts` cho hai role LECTURER/STUDENT; server quyết định kind và owner từ phiên, không nhận owner/kind/status/fileId từ client. ADMIN không biên soạn.
- GET danh sách riêng, GET `/:id`, POST và PATCH `/:id` với revision của phiên bản. Tìm tiêu đề, phân trang 20. GET `/courses` chỉ trả môn/khoa hoạt động; giảng viên chỉ nhận môn được phân công hiện hành.
- Tiêu đề, loại, ít nhất một môn, nguồn và căn cứ quyền bắt buộc. Tác giả/mô tả tùy chọn, có giới hạn độ dài; downloadAllowed chỉ là đề nghị, không cấp khả năng tải khi chưa duyệt. Mỗi nháp tối đa 20 môn.
- Giảng viên sửa phải còn phân công ở tất cả môn hiện tại và môn mới; đọc metadata của bản mình vẫn được để biết vì sao không thể sửa. Sinh viên chỉ sửa bài của mình, không sửa giáo trình.
- Transaction khóa actor, advisory lock catalog hiện có, document/version; kiểm tra quyền và revision lại, audit cùng giao dịch. Xung đột không mất draft trên UI; không tự retry ghi.
- Migration 005 cho phép file_id NULL chỉ khi DRAFT bằng CHECK. Không tạo hàng files giả; giữ toàn bộ FK, partial index và snapshot guards. SUBMITTED/APPROVED không thể thiếu file. Baseline SQL/Word được giữ lịch sử.
- Chỉ hỗ trợ bản nháp đầu tiên và cập nhật DRAFT. Tạo phiên bản mới, file, gửi/rút, duyệt, quyền đọc/tải nối vào các lát cắt sau. Không có nút upload/gửi duyệt giả.

## File và commit

1. **API bản nháp**: migration/schema, `apps/api/src/materials/{materials.dto,materials.service,materials.controller,materials.module}.ts`, AppModule; integration cho RBAC/CSRF, owner isolation, role-derived kind, DTO, môn/phân công, revocation, revision/concurrency, rollback audit, missing-file CHECK. Kiểm chứng và commit.
2. **Không gian học liệu**: `apps/web/lib/materials.ts`, components/materials (form, list, picker), routes lecturer/materials + student/materials; nav shell. Kế thừa production CSS, inline editor, responsive table/card, trạng thái lưu/nháp/chưa PDF trung thực, draft giữ khi lỗi, cảnh báo rời form. Playwright tạo/sửa/khôi phục sau reload, stale draft, retry và role guard. Commit sau kiểm chứng.
3. **Bàn giao**: cập nhật README/PRODUCT/nhật ký, migrate local, build/restart, kiểm tra local read-only, push. Không merge/deploy.

## Kiểm chứng

- Test DB `_test` + Redis15, fixture API dọn sau suite; không chạy integration cùng Playwright.
- Chạy test đỏ trước API, sau đó format/lint/typecheck/unit/integration/build/browser. Chỉ chụp một lượt desktop/tablet/mobile với dữ liệu synthetic; sửa lỗi trong một batch, tối đa một lượt xác nhận.
- Schema: 23 bảng nghiệp vụ, 47 FK, 61 CHECK, 7 partial indexes, 5 snapshot triggers. Local không có học liệu fixture.

## Review focus

- Không lộ draft người khác hoặc nội dung riêng cho Admin; opaque 404 cho ID không thuộc mình.
- Thu hồi phân công đồng thời với sửa không được bỏ qua; kiểm tra cả môn cũ tránh xóa môn để né thu hồi.
- Cập nhật môn/revision/audit phải atomic; approved snapshot và liên kết vẫn bất biến.
- Không suy ra SAFE hoặc quyền công bố từ metadata; không nhận file/status/owner trong DTO.
