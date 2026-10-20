# SEARCH-01 — Tìm học liệu không dấu

Ngày 20/10/2026. Nhánh `codex/search-01-library-search`, xây trên `main` sau PR #12. Phạm vi là phần còn lại của SEARCH-01 trong [roadmap](../roadmap/2026-10-17-web-improvement-roadmap.md). Bộ lọc trong URL, nút bỏ lọc, Back/Forward và số trang đã có từ [SEARCH-02](2026-10-18-library-catalog.md); mốc đó ghi rõ chưa có tìm không dấu.

## Hành vi

- `GET /library?search=` khớp tiêu đề và tác giả **không phân biệt dấu tiếng Việt và hoa thường**: “giao trinh duong loi”, “GIÁO TRÌNH ĐƯỜNG LỐI” hay “Giao Trình đường lối” đều tìm thấy “Giáo trình Đường lối”. Vẫn là khớp chuỗi con liền mạch như trước, không tách từ hoặc xếp hạng.
- `%`, `_` và `\` người dùng gõ là ký tự thường, không phải ký tự đại diện.
- Ô tìm kiếm ghi “gõ có dấu hay không đều được”. Quyền đọc, bộ lọc và phân trang không đổi.

## Thiết kế

- Migration `202610200002_fold_vi`: hàm `hucescholar.fold_vi(text)` IMMUTABLE bỏ thanh điệu, dấu nguyên âm và đ/Đ bằng `translate` (140 ký tự sinh tự động) rồi `lower`. Không cần extension `unaccent`. `apps/api/src/materials/search-fold.ts` có `foldVietnamese` cùng quy tắc; integration test so sánh hai bên trên toàn bộ chữ cái tiếng Việt hoa/thường.
- Migration `202610200003_version_search`: bảng phụ `version_search(version_id, folded)` do trigger `AFTER INSERT OR UPDATE OF title, authors` trên `document_versions` duy trì, backfill bằng `INSERT`. Không thêm cột vào `document_versions`: `tr_protect_version` coi phiên bản đã duyệt/đang chờ duyệt là bất biến, nên giá trị dẫn xuất nằm ở bảng riêng và không bao giờ cần `UPDATE` các phiên bản đó.
- API lấy id phiên bản hiện hành đã duyệt có `folded LIKE` mẫu đã escape, rồi thu hẹp bộ lọc Prisma sẵn có bằng id trong cùng transaction RepeatableRead.
- Cột `search_text` và GIN index full-text từ baseline giữ nguyên, chưa dùng.

## Đo trước khi thêm index

Bảng tạm trên PostgreSQL local (Docker), chuỗi tiêu đề + tác giả tiếng Việt thực tế, mẫu `LIKE '%…%'` không khớp (quét toàn bộ):

| Cách làm | 10.000 dòng | 50.000 dòng |
| --- | --- | --- |
| Bỏ dấu lúc truy vấn (`fold_vi(...) LIKE`) | 582 ms | 3.014 ms |
| Chuỗi đã bỏ dấu lưu sẵn (`folded LIKE`) | 2,0 ms | 10,0 ms |

Vì vậy chọn lưu sẵn. Với quy mô dự kiến, quét tuần tự trên chuỗi lưu sẵn đủ nhanh nên **chưa thêm index**. Nếu kho vượt vài trăm nghìn phiên bản, cân nhắc `pg_trgm` GIN trên `version_search.folded` sau khi đo lại trên dữ liệu thật. Số đo là máy dev, không phải production.

## Kiểm chứng

Local (Windows, Node 24.19.0, pnpm 11.25.0), database `_test` và Redis DB 15:

- `pnpm format:check`, `pnpm check` (lint, typecheck, 91 unit gồm 2 ca `search-fold`, build): đạt.
- `pnpm test:integration`: 184 passed, 1 skipped. Ca mới tạo bản nháp với tiêu đề tạm rồi sửa thành “Giáo trình Đường lối …” (bao cả đường INSERT và UPDATE của trigger), kiểm `version_search.folded`, đi qua gửi duyệt và duyệt thật; năm cách gõ có/không dấu/hoa đều tìm thấy, `_`, `%` và tiêu đề khác không khớp; `fold_vi` SQL bằng `foldVietnamese` trên mọi chữ cái tiếng Việt hoa/thường. Test schema cập nhật 26 bảng, 53 khóa ngoại, 7 trigger trên nhóm bảng được bảo vệ.
- `pnpm test:e2e --workers=1`: 157 passed, 1 skipped (không có lỗi).

## Còn lại

Tìm theo từ khóa không liền mạch/xếp hạng, gợi ý môn (IDEA-14/15) và tìm trong nội dung PDF vẫn là ý tưởng. Đợt B của roadmap hoàn tất với SEARCH-01.
