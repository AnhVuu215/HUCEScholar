# VERSION-01 — Có bản mới nhưng không mất bản cũ

Ngày 21/10/2026. Nhánh `codex/version-01-newer-version`, xây trên `main` sau PR #26, độc lập với LEARN-02. Đây là ý tưởng "Có bản mới nhưng không mất bản cũ" ở mục 6 của [roadmap](../roadmap/2026-10-17-web-improvement-roadmap.md); roadmap chưa đặt mã nên lượt này đặt VERSION-01.

## Vấn đề

Trước đây, mở một phiên bản cũ (từ "Đọc gần đây", trang đầu hoặc link đã lưu) chỉ thấy dòng "· Bản công bố trước". Người đọc không biết bản hiện hành là bản nào và không có đường sang đó.

## Hành vi

- Reader của một bản công bố trước hiện khung **Phiên bản hiện hành**:
  - "Bạn đang đọc phiên bản N, là bản công bố trước. Bản hiện hành là phiên bản M: <tiêu đề>."
  - nói rõ ghi chú, đoạn tô và tiến độ đọc ở phiên bản N giữ nguyên tại đó, không tự chuyển sang bản hiện hành
  - nút **Mở phiên bản M**. Không tự chuyển trang, không di chuyển anchor ghi chú.
- **Đọc gần đây** trong thư viện cá nhân vẫn giữ đúng phiên bản đã đọc và thêm dòng "Đã có phiên bản M; ghi chú của bạn vẫn ở phiên bản N." kèm link sang bản hiện hành.
- Chỉ gợi ý khi bản hiện hành **cũng đọc được**: đã duyệt, file quét đạt, tài liệu hiển thị, căn cứ quyền còn hạn. Bản hiện hành không đọc được thì không có khung và không có link.

## API

- Mỗi mục thư viện (`GET /library/versions/:id`, danh sách đã lưu và đọc gần đây) có thêm `currentVersion: { versionId, versionNo, title } | null`. Trường này khác `null` chỉ khi mục là bản cũ và bản hiện hành qua cùng điều kiện `available()` như mọi lượt đọc.
- Danh sách kho vốn chỉ có bản hiện hành nên luôn trả `null`, không thêm truy vấn. Các nơi khác thêm đúng một truy vấn cho cả trang kết quả.
- Không đổi schema, không migration.
- Web kiểm `currentVersion` trong `isLibraryItem`: id hợp lệ, khác id đang đọc, chỉ xuất hiện khi `current` là `false`.

## Kiểm chứng

Local (Windows, Node 24.19.0, pnpm 11.25.0), database `_test` và Redis DB 15:

- Integration (mở rộng 2 ca có sẵn trong `materials.integration.spec.ts`):
  - bản cũ trỏ đúng id, số và tiêu đề bản hiện hành; bản hiện hành và danh sách kho trả `null`
  - bản hiện hành hết hạn quyền thì bản cũ trả `null`
  - đọc gần đây giữ bản cũ và có `currentVersion`; đã lưu theo bản hiện hành nên `null`
- Browser `tests/version-01.spec.ts` (tài khoản riêng `version01`):
  - ghi chú ở bản 1; xuất bản bản 2; mở bản 1 → khung báo và ghi chú vẫn hiện
  - 320px và 1440px không tràn ngang (ảnh `.local/version-notice-*.png`)
  - **Mở phiên bản 2** → đúng URL, đúng tiêu đề, không có khung, không có ghi chú của bản 1
  - **Đọc gần đây** có dòng báo và link sang bản 2
- Bộ đầy đủ:
  - `pnpm format:check`, `pnpm check` (lint, typecheck, 107 unit, build): đạt.
  - `pnpm test:integration`: 204 passed, 1 skipped, chạy trên database `_test` tạo lại từ migration của nhánh này. Lượt đầu còn dùng database đã chạy migration LEARN-02 (nhánh khác) nên bài kiểm schema đếm 11 partial index thay vì 10.
  - `pnpm test:e2e --workers=1`: 168 passed, 8 skipped (5,7 phút).

## Chưa làm

- Trang đầu (HOME-01) vẫn chỉ ghi "Bản công bố trước" ở thẻ Học tiếp, chưa có link sang bản hiện hành.
- Chưa so sánh nội dung hai phiên bản hay đề xuất chuyển ghi chú; theo roadmap, ghi chú không tự chuyển sang PDF mới.
- Thông báo trong ứng dụng khi có bản mới thuộc NOTIFY-01, không đổi ở lượt này.
