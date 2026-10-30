# SEARCH-03 — Xếp kết quả tìm học liệu theo độ khớp

Ngày 30/10/2026. Nhánh `codex/search-ranking`, xây trên `main` sau PR #58. Roadmap ghi khoảng trống "Chưa xếp hạng kết quả" ở Kho học liệu: [SEARCH-02](2026-10-21-multiword-search.md) lọc đúng nhưng vẫn xếp mới cập nhật trước, nên tài liệu có đúng cụm ở tiêu đề có thể nằm sau tài liệu chỉ khớp tên tác giả.

Đã chốt theo lựa chọn khuyến nghị (đổi được ở API):

- **Luật xếp đơn giản, giải thích được**, không dùng điểm full-text hay `pg_trgm`. Thứ tự: (1) tiêu đề chứa nguyên cụm đã gõ, đúng thứ tự từ; (2) nhiều từ khớp trong tiêu đề hơn; (3) nguyên cụm có ở tiêu đề + tác giả; (4) mới cập nhật trước, rồi id.
- **Chỉ xếp khi có từ tìm.** Không tìm thì vẫn mới cập nhật trước như cũ.
- **Không đổi điều kiện khớp**: vẫn phải có mọi từ (SEARCH-02); xếp hạng chỉ đổi thứ tự.

## Hành vi

- `GET /library?search=` trả kết quả theo thứ tự trên; `total`, phân trang, bộ lọc môn/nguồn/loại và quyền đọc không đổi.
- Dòng trạng thái ở Kho học liệu thêm "· Khớp tiêu đề xếp trước" khi đang tìm, "· Mới cập nhật trước" khi không tìm.

## Thiết kế

- Migration `202610300001_search_title`: thêm `version_search.folded_title` (riêng tiêu đề đã bỏ dấu), backfill rồi đặt NOT NULL; `refresh_version_search()` ghi cả hai cột. Lưu sẵn vì bỏ dấu lúc truy vấn tốn ~58 µs mỗi dòng (đo ở SEARCH-01). Không đụng `document_versions`, nên `tr_protect_version` không bị ảnh hưởng.
- `foldedPhrase` trong `search-fold.ts` tạo mẫu `LIKE` cho cả cụm, dùng chung cách escape với `foldedTerms`.
- Truy vấn raw trả mọi id khớp đã xếp hạng. API lấy id thỏa bộ lọc Prisma, giữ thứ tự xếp hạng, cắt trang rồi mới tải dữ liệu của trang đó, trong cùng transaction RepeatableRead. Cách cũ cũng đã đưa toàn bộ id khớp vào `IN (...)`, nên quy mô dữ liệu đi qua API không đổi; kho rất lớn thì nên chuyển bộ lọc vào SQL.

## Kiểm chứng

Local (Windows, Node 24.19.0, pnpm 11.25.0), database `_test` sau `pnpm test:setup` (áp migration mới):

- Unit `search-fold`: cụm giữ thứ tự từ, gộp khoảng trắng, `%`/`_` là ký tự thường.
- Integration, ca mới: bốn tài liệu công bố từ cũ tới mới; tìm "KINH TẾ <mã>" trả đúng thứ tự cụm ở tiêu đề → đủ từ ở tiêu đề → cụm ở tác giả → chỉ khớp tác giả, ngược với thứ tự mới nhất. Trang 2 với `limit=2` đúng hai mục cuối, `total` vẫn 4; thêm bộ lọc loại thì 0; không tìm thì mới nhất đứng đầu. Kiểm `folded_title` do trigger ghi.
- `pnpm format:check`, `pnpm check` (lint, typecheck, 128 unit, build) đạt; `pnpm test:integration` 227 đạt, 1 bỏ qua.
- Browser `library-catalog`, `library-query`, `workspace-ui`: 15/15 đạt. Chưa chạy lại cả bộ e2e.
- Chưa đo thời gian truy vấn trên kho lớn; chưa thử với dữ liệu thật.

## Chưa làm

- Tìm trong nội dung PDF, khớp nguyên từ thay vì chuỗi con, gợi ý môn.
