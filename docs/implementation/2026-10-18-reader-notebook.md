# LEARN-01 — Sổ ghi chú toàn phiên bản

Trong reader, chọn **Toàn tài liệu** để tìm lại ghi chú trang hoặc đoạn tô của chính mình trên mọi trang PDF của phiên bản đang mở. Tìm trong nội dung và chữ đã tô; lọc loại và tám màu. Tìm cụm chữ có dấu, không phân biệt hoa thường; `%`, `_`, `\` là ký tự thường. Không có tìm không dấu hoặc sổ tay toàn kho (nay đã có ở [LEARN-03c](2026-10-28-notebook-unaccent-search.md) và [LEARN-03](2026-10-26-library-notebook.md)).

**Trang này** và **Toàn tài liệu** giữ cả hai editor mounted. Duyệt/lọc không bỏ bản soạn. Chọn kết quả đi qua guard một lần, chuyển đúng trang và focus editor sau khi PDF render. Ghi chú được mở bằng ID/revision đã nhận; anchor không đổi. Nếu tab khác sửa/xóa, API CAS hiện hữu chặn ghi đè và giữ bản soạn. Có thể quay lại sổ, làm mới và mở bản hiện hành.

## Contract

`POST /api/v1/library/versions/:id/annotations/search` dùng cookie phiên, CSRF và `Cache-Control: no-store`. Body:

```ts
{
  query?: string; // trim, tối đa100 ký tự; literal substring
  kind?: 'PAGE_NOTE' | 'TEXT_HIGHLIGHT';
  color?: string; // một trong tám màu hiện có, chỉ dùng cho đoạn tô
  cursor?: string; // opaque base64url, tối đa256 ký tự
  limit?: number; // integer1..50, mặc định20
}
```

Trả `201 { items, nextCursor }`. Không nhận owner từ client. Session + library access được kiểm trong transaction cho mọi lượt tải; ADMIN không đọc được ghi chú người khác. Unknown fields/null/bộ lọc sai trả400; khóa account trả401, thiếu CSRF403, tài liệu không còn khả dụng404. Color riêng ngầm giới hạn TEXT_HIGHLIGHT; color cùng PAGE_NOTE trả400.

Sort `(page_number ASC, id ASC)`, lấy `limit+1`. Cursor canonical chứa owner/version/page/id và fingerprint bộ lọc; không cấp quyền. SQL parameterized và escape wildcard. Không tải mọi trang PDF để tìm ghi chú. Không đổi schema/migration. Baseline `EXPLAIN (ANALYZE, BUFFERS)` trên fixture25 annotations của owner/version:0.038ms ở lượt local đã ghi nhận; không suy ra hiệu năng production hoặc nhu cầu index từ fixture nhỏ này.

Client gửi chữ tìm trong POST body, không đưa vào URL/storage/service worker. Hủy request khi đổi filter/version hoặc đóng sổ; phản hồi muộn không cập nhật state. Result component được tạo mới khi quay lại sổ hoặc submit, để cursor/kết quả cũ không đè lượt làm mới; form và editor giữ nguyên. Lỗi tải thêm giữ mục đã tải để retry; mất quyền xóa kết quả khỏi danh sách.

## Kiểm chứng local

- Integration:156 passed,1 skipped theo cấu hình hiện có. Bao phủ hai owner + ADMIN, nhiều trang/>20 mục, literal query/kind/color, cursor sai/chủ khác/version khác, limit/unknown field, CSRF, khóa account và ẩn tài liệu.
- Chrome browser:26/26 ca notebook/reader-v2/direct-annotations/citations/geometry. Năm ca notebook bao phủ phân trang không trùng, lọc, giữ/hủy bản soạn, đúng trang/focus, timeout/retry, phản hồi muộn, CAS tab khác, xóa mục cuối, mất quyền và đổi phiên bản. Kiểm viewport320/390/768/1440 bằng assertion overflow/controls.
- RED: endpoint chưa có trả404. Review phát hiện quay lại sổ vẫn giữ nút tải thêm khi lượt refresh đang chờ; regression đã thấy1 nút thay vì0 trước sửa và qua sau sửa. Review cuối không còn findings.
- Lint/typecheck,82 unit và API/web build toàn repo đã qua (`pnpm check`). Lượt full Playwright cuối sau READ-01:127 passed,1 skipped theo cấu hình DOCX thật hiện có. Chi tiết lệnh ở ledger. Chưa kiểm chứng production, thiết bị thật hoặc dữ liệu HUCE thật.

Suite dùng tài khoản synthetic riêng `notebook`, hai PDF tự tạo và DB `_test`/Redis15. Ca khóa account khôi phục cả trạng thái và phiên dùng chung vì trigger thu hồi phiên khi khóa. Không nới rate limit sản phẩm; fixture route timeout dùng handler một lần để tránh route bị xử lý hai lần.
