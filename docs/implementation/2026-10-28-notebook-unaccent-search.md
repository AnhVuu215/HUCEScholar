# LEARN-03c — Tìm không dấu trong sổ ghi chú

Ngày 28/10/2026. Nhánh `codex/learn-03c-unaccent-search`, xây trên `main` sau PR #54 (LEARN-03b).

[LEARN-01](2026-10-18-reader-notebook.md) và [LEARN-03](2026-10-26-library-notebook.md) chỉ tìm cụm chữ có dấu: gõ "dinh luat" không ra "Định luật". Kho học liệu đã tìm không dấu từ [SEARCH-01](2026-10-20-library-search.md). Lượt này đưa cách đó vào tìm ghi chú.

Đã chốt theo lựa chọn khuyến nghị:

- **Gõ không dấu thì khớp cả có dấu lẫn không dấu; gõ có dấu (kể cả một chữ) thì khớp đúng dấu.** "cai ma" ra cả "Cái má" lẫn "Cái mà"; "má" chỉ ra "Cái má". Người gõ dấu thường muốn chính xác; người gõ không dấu muốn tiện. Cả hai vẫn không phân biệt hoa thường.
- **Dùng lại `hucescholar.fold_vi` và `foldVietnamese` của SEARCH-01**, không thêm extension hay migration. Cả nội dung lẫn chữ tìm được đưa về cùng dạng Unicode (NFC) trước khi so, nên ghi chú dán từ nguồn dùng ký tự tổ hợp (NFD) vẫn tìm được.
- **Không lưu sẵn chuỗi đã bỏ dấu.** SEARCH-01 cần lưu sẵn vì quét cả kho; ở đây truy vấn luôn giới hạn trong ghi chú của một người (và một phiên bản ở reader), nên bỏ dấu lúc truy vấn đủ nhanh. Nếu sau này đo thấy chậm thì thêm bảng phụ như `version_search`.
- `%`, `_`, `\` vẫn là ký tự thường ở cả hai chế độ.

## Hành vi

- Áp dụng cho ô "Tìm trong ghi chú" ở sổ ghi chú trong reader (LEARN-01/02), trang Sổ tay (LEARN-03) và file xuất theo bộ lọc (EXPORT-02), vì cả ba dùng chung `annotationFilter`.
- Gợi ý dưới ô tìm đổi thành "Gõ không dấu để tìm cả chữ có dấu; gõ có dấu thì khớp đúng dấu. Không phân biệt hoa thường, tối đa 100 ký tự."
- Không đổi API, DTO hay schema. Ô tìm chữ trong PDF (READ-01) không đổi.

## Kiểm chứng

Local (Windows, Node 24.19.0, pnpm 11.25.0), database `_test`:

- Integration, ca mới LEARN-03c: "DINH LUAT om" ra "Định luật Ôm"; "cai ma" ra cả má/mà; "Cái má" và "cái MÀ" ra đúng một; ghi chú lưu dạng NFD tìm được bằng "giai tich", "Giải" dạng NFC lẫn NFD; chữ trong đoạn tô "Đường cong 5%_" tìm được bằng "duong cong 5%_" còn "cong 5_" không ra (ký tự đại diện vẫn là chữ thường); "dương" có dấu không ra "Đường"; Sổ tay toàn kho dùng cùng bộ lọc. Ca LEARN-01 cũ (chữ có dấu, `%_\`, hoa thường) vẫn đạt.
- Browser: ca LEARN-03b trong `tests/learn-03.spec.ts` tìm "… ghi chu goc" ra ghi chú "… ghi chú gốc".
- Bộ đầy đủ: `pnpm format:check` và `pnpm check` (lint, typecheck, 127 unit, build) đạt; `pnpm test:integration` 224 đạt, 1 bỏ qua; `pnpm test:e2e --workers=1` 186 đạt, 8 bỏ qua.
- Chưa đo thời gian truy vấn với sổ ghi chú rất lớn.

## Chưa làm

- Tách từ và khớp không theo thứ tự như kho học liệu (SEARCH-01 dùng nhiều từ); ở đây vẫn là cụm chữ liền.
- Tìm không dấu trong chữ của PDF (READ-01).
