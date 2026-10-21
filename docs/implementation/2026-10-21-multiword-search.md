# SEARCH-02 — Tìm học liệu theo nhiều từ

Ngày 21/10/2026. Nhánh `codex/search-02-multiword`, xây trên `main` sau PR #17. Pilot local ([QA-01](2026-10-21-local-pilot.md)) cho thấy gõ "bai giang" kèm mã môn ra 0 kết quả, vì [SEARCH-01](2026-10-20-library-search.md) chỉ khớp một cụm liền mạch.

## Hành vi

- `GET /library?search=` tách câu tìm (đã bỏ dấu, chữ thường) theo khoảng trắng. Kết quả phải chứa **mọi từ** trong tiêu đề + tác giả, không cần liền nhau hay đúng thứ tự: "giao trinh K68" tìm thấy "Giáo trình Đường lối K68", "duong loi nguyen" khớp cả tiêu đề lẫn tác giả.
- Từ lặp chỉ tính một lần. Tối đa 10 từ khác nhau (`MAX_SEARCH_TERMS`); từ thứ 11 trở đi bị bỏ qua vì câu tìm đã đủ hẹp. Ô tìm vẫn giới hạn 200 ký tự.
- Vẫn là khớp chuỗi con: "giao" khớp "giao" trong "giao thong". Chưa xếp hạng, chưa tìm trong nội dung PDF.
- `%`, `_`, `\` vẫn là ký tự thường. Gõ một từ hoặc một cụm liền cho kết quả như trước.

## Thiết kế

`foldedTerms` trong `search-fold.ts` thay `foldedContains`. Truy vấn dùng `s.folded LIKE ALL ($1::text[])` với escape mặc định `\` của PostgreSQL. Không đổi schema, migration hay quyền đọc.

## Đo

Bảng tạm 50.000 dòng tiêu đề + tác giả tiếng Việt đã bỏ dấu, PostgreSQL local Docker, trung vị 7 lần `EXPLAIN ANALYZE`:

| Truy vấn | Thời gian |
| --- | --- |
| Một mẫu `LIKE` (cách cũ), không khớp | 6,9 ms |
| `LIKE ALL` 3 từ, không khớp | 14,0 ms |
| `LIKE ALL` 10 từ, khớp | 14,5 ms |

Vẫn quét tuần tự đủ nhanh ở quy mô này, nên chưa thêm index. Đây là số đo máy dev.

## Kiểm chứng

Local (Windows, Node 24.19.0, pnpm 11.25.0), database `_test` và Redis DB 15:

- `pnpm format:check`, `pnpm check` (lint, typecheck, 99 unit, build): đạt. Unit `search-fold` thêm ca tách mọi loại khoảng trắng, bỏ từ lặp, câu chỉ có khoảng trắng và giới hạn 10 từ.
- `pnpm test:integration`: 188 passed, 1 skipped (ca worker thật opt-in). Ca tìm không dấu thêm: từ không liền nhau, đảo thứ tự, từ ở cả tiêu đề và tác giả; mã môn sai một ký tự hoặc thêm từ không có thì không khớp.
- Browser `library-catalog` và `library-query`: 7/7 đạt.
- Lượt lại sau khi gộp `main` (PR #17): `pnpm check` 101 unit đạt; `pnpm test:integration` 193 passed, 1 skipped; `pnpm test:e2e --workers=1` 160 passed, 6 skipped, 1 failed. Ca lỗi là `materials.spec.ts` "reader draft survives cancelled browser back and forward (legacy)": ô ghi chú chưa hiện sau `goBack` trong 5 giây. Ca này không liên quan tới tìm kiếm, từng lỗi tương tự ở lượt QA-01; chạy riêng lại 2/2 đạt. Cần xử lý riêng.
