# HUCEScholar Database Design

Thiết kế dữ liệu ngày 10/10/2026, dựa trên proposal, use case và quy tắc nghiệp vụ phiên bản 1.1.

- `HUCEScholar_schema_postgresql.sql`: schema SQL tham chiếu, tạo namespace `hucescholar` trong một database trống. Không phải migration cho database đang có dữ liệu.
- `HUCEScholar_ERD_logical.mmd`: ERD tổng quan để đưa vào báo cáo.
- `HUCEScholar_ERD_physical.mmd`: toàn bộ bảng và quan hệ khóa ngoại.
- `HUCEScholar_Data_Dictionary.md`: từ điển đầy đủ các trường, nullability, ràng buộc và quan hệ.
- `diagrams/`: hình ERD có thể chèn vào báo cáo; các góc nhìn tập trung vào quan hệ chính. Mermaid vật lý và SQL là nguồn đầy đủ cho mọi khóa ngoại, bao gồm người thực hiện lịch sử.

SQL ban đầu chọn PostgreSQL làm phương án tham chiếu. Ngày 11/10/2026, stack MVP đã chốt PostgreSQL + Prisma, cùng Next.js/NestJS và web responsive + PWA; xem [quyết định tech stack](../HUCEScholar-tech-stack.md). SQL đã được sao chép nguyên văn vào baseline migration trong `apps/api/prisma/migrations/202610110001_baseline/`. Migration tiếp theo thêm trigger thu hồi phiên khi trạng thái, mật khẩu, role hoặc xác minh thay đổi. Dùng `pnpm --filter @hucescholar/api db:migrate` cho ứng dụng; không chạy lại SQL tham chiếu hoặc `db push` trên database đã có migration. Thiết kế chọn một role chính mỗi tài khoản và một phiên bản đang biên tập mỗi tài liệu để giữ MVP đơn giản; các lựa chọn này được ghi riêng với chính sách nghiệp vụ đã chốt.

Chỉ chạy schema trên database trống dành riêng cho phát triển hoặc kiểm tra. Script không xóa hoặc ghi đè schema cũ; chạy lại trên cùng database sẽ báo đã tồn tại.

```powershell
# Thay placeholder bằng database trống đã tạo và tài khoản được cấp quyền phù hợp.
psql -X -v ON_ERROR_STOP=1 -h localhost -p 5432 -U <database_user> -d <empty_database> -f .\docs\database\HUCEScholar_schema_postgresql.sql
```

Đọc cùng tài liệu Word trong `docs/deliverables/HUCEScholar_ERD_and_Data_Design.docx`. Script sinh các đầu ra là `docs/tools/build_data_design.py`; mô hình gốc ở `docs/tools/hucescholar_data_model.py`. Không chỉnh SQL/diagram riêng rồi bỏ quên mô hình gốc.

Phân quyền người dùng, xác minh role/phân công, số trang ghi chú, quyền nguồn, thứ tự trạng thái, cập nhật revision, cuối cùng còn một admin và giao dịch bàn giao vẫn cần backend triển khai. Database chỉ cưỡng chế những phần được ghi rõ trong tài liệu; không suy ra có RLS hoặc API an toàn chỉ từ các FK.

Kết quả kiểm tra nằm trong `docs/_qa/data_design_validation.json`. Database kiểm tra độc lập với database triển khai sau này. Dữ liệu fixture dùng giao dịch rollback; không phải dữ liệu mẫu tồn tại lâu dài hay bằng chứng đã có nội dung trường.

Đã áp dụng thành công schema vào PostgreSQL 18.3 tạm: 23 bảng, 47 khóa ngoại và 37 ca kiểm tra đạt. Sau rollback không còn tài khoản fixture; server tạm đã dừng. Gói ZIP có bản kết quả tại `validation/Database_Validation.json`.

Mốc ứng dụng 11/10/2026: PostgreSQL 18.6 local và test đã nhận hai migration. Database test xác nhận 23 bảng, 47 FK, 58 CHECK, 7 partial index và trigger gốc; toàn bộ 37 ca SQL gốc tiếp tục đạt trong transaction rollback. **37 là số ca kiểm tra, không phải số CHECK.** Prisma introspection cần đổi phía inverse của FK phiên bản hiện hành thành collection vì ORM không suy ra tính duy nhất từ PK thành phần; khóa ngoại SQL không đổi. Nhật ký: [database và auth](../implementation/2026-10-11-database-auth.md).

Mermaid vật lý dùng đường liền khi FK tham gia PK của bảng con, đường đứt cho quan hệ không định danh; số lượng tối thiểu/tối đa theo FK và unique, chưa bao gồm mọi điều kiện nghiệp vụ. Quy ước: [Mermaid Entity Relationship Diagrams](https://mermaid.js.org/syntax/entityRelationshipDiagram.html). File `.mmd` là mã nguồn chỉnh sửa; các hình PNG kèm theo là sơ đồ đã dựng riêng cho tài liệu Word.

Mốc danh mục 11/10/2026: local và test đã nhận đủ bốn migration. Hai migration mới bổ sung revision dương cho khoa/ngành, nâng tổng số CHECK lên 60; vẫn 23 bảng nghiệp vụ, 47 FK và 7 partial index. Schema SQL/ERD/Word ở đây giữ vai trò baseline tham chiếu; migration và Prisma schema là nguồn triển khai hiện tại. Kết quả: [danh mục và phân công](../implementation/2026-10-11-academic-catalog.md).

Mốc bản nháp: migration 005 cho phép `document_versions.file_id` null chỉ ở DRAFT, bổ sung CHECK `ck_version_file_before_review` (tổng 61). Điều này hỗ trợ lưu metadata trước upload; không có file không mang trạng thái SAFE và không thể chuyển xét duyệt. Chi tiết: [bản nháp học liệu](../implementation/2026-10-11-material-drafts.md).
