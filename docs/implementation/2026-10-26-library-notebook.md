# LEARN-03 — Sổ tay toàn kho

Ngày 26/10/2026. Nhánh `codex/learn-03-library-notebook`, xây trên `main` sau PR #48–#49 (READ-05b). Đây là ý tưởng IDEA-03 "Sổ tay toàn kho, tìm note của mình theo môn" ([spec workspace v2](../superpowers/specs/2026-10-17-workspace-v2-design.md)) và "Sổ tay theo môn" ở mục 6 của [roadmap](../roadmap/2026-10-17-web-improvement-roadmap.md).

Đã chốt theo lựa chọn khuyến nghị (đổi được ở API/web về sau):

- **Một trang riêng** `/workspace/notebook`, mục **Sổ tay** trong nhóm Học tập, cho cả ba vai trò. Ghi chú vẫn chỉ của chủ; admin không xem được sổ tay người khác.
- **Chỉ đọc + đánh dấu.** Sửa nội dung vẫn làm trong reader. Mỗi mục có link "Mở trang N" tới đúng phiên bản/trang; nút "Cần xem lại" dùng lại API của LEARN-02.
- **Tài liệu mất quyền không hiện.** Ghi chú trên phiên bản bị ẩn, file không còn an toàn, hết hạn quyền hoặc chưa duyệt vẫn được giữ trong DB nhưng không được liệt kê, và tên tài liệu không bị lộ. Mở lại quyền thì ghi chú hiện lại.
- Bộ lọc giống sổ ghi chú trong reader (chữ, loại, màu, cần xem lại) cộng thêm **môn học**.

## Hành vi

- Kết quả xếp theo phiên bản mới nhất trước, trong mỗi phiên bản theo trang rồi theo thứ tự tạo. Mục cùng phiên bản gom dưới một tiêu đề: tên tài liệu, số phiên bản, "(bản cũ)" nếu không phải bản hiện hành, mã môn.
- Danh sách môn chỉ gồm môn của các tài liệu còn đọc được mà người dùng có ghi chú. Không tải được danh sách môn thì ô chỉ có "Mọi môn", vẫn tìm được.
- Tìm cụm chữ có dấu, không phân biệt hoa thường; `%`, `_`, `\` là ký tự thường (như LEARN-01). Chữ tìm nằm trong body POST, không vào URL, history hay bộ nhớ trình duyệt.
- Mỗi lượt tìm tạo phiên kết quả mới; request cũ bị hủy, phản hồi muộn không ghi đè. "Tải thêm ghi chú" lấy 20 mục mỗi lần. Lỗi mạng giữ form và mục đã tải, có nút thử lại.
- Bỏ dấu "Cần xem lại" khi đang lọc thì mục vẫn ở chỗ cũ tới lần tìm sau, để focus không nhảy (như LEARN-02).

## API

`POST /api/v1/personal-library/notebook/search`, cookie phiên + CSRF, `Cache-Control: no-store`. Body:

```ts
{
  query?: string; // trim, tối đa 100 ký tự
  kind?: 'PAGE_NOTE' | 'TEXT_HIGHLIGHT';
  color?: string; // một trong tám màu, chỉ cho đoạn tô
  reviewLater?: boolean; // true: chỉ mục cần xem lại
  courseId?: string; // id môn dạng chuỗi số
  cursor?: string; // opaque base64url, tối đa 256 ký tự
  limit?: number; // 1..50, mặc định 20
}
```

Trả `201 { items, nextCursor }`. Mỗi item là ghi chú/đoạn tô như API reader, kèm `material` (metadata phiên bản như kho, hoặc `null`).

- Không nhận owner từ client; field lạ, sai kiểu, `color` cùng `PAGE_NOTE` → 400. Không phiên → 401 (CSRF → 403 trước đó với POST), tài khoản khóa → 403.
- Trước tiên lấy các phiên bản **đọc được** (`available()` dùng chung với kho và reader) mà chủ có ghi chú, lọc môn qua `version_courses`; rồi tìm ghi chú trong các phiên bản đó bằng SQL có tham số. Không sao chép điều kiện quyền đọc sang SQL riêng.
- Keyset `(version_id DESC, page_number ASC, id ASC)`, lấy `limit+1`. Cursor chứa owner, vị trí cuối và fingerprint bộ lọc; cursor của người khác hoặc bộ lọc khác → 400.
- `GET /api/v1/personal-library/notebook/courses` → `{ items: [{ id, code, name }] }`.
- Không đổi schema, không migration. Index `ix_annotation_owner_page (user_id, version_id, page_number)` đã có phục vụ truy vấn theo chủ. Chưa đo trên dữ liệu lớn.

## Kiểm chứng

Local (Windows, Node 24.19.0, pnpm 11.25.0), database `_test` và Redis DB 15:

- Integration, 1 ca mới trong `materials.integration.spec.ts`:
  - ba tài liệu, một bị ẩn: thứ tự phiên bản/trang đúng; ghi chú của tài liệu ẩn không hiện, hiện lại khi bỏ ẩn
  - wildcard là chữ thường; lọc loại, màu, cần xem lại, môn (tài liệu thứ hai được gắn thêm môn thứ hai lúc còn nháp, vì môn bị khóa khi đã gửi duyệt); môn không tồn tại → rỗng
  - phân trang 1 mục/lần đi qua nhiều tài liệu không trùng; cursor dùng chéo bộ lọc hoặc của người khác → 400; body sai → 400
  - danh sách môn đúng chủ; người khác và admin không thấy gì; thiếu CSRF → 403; không phiên → 401
- Browser `tests/learn-03.spec.ts` (tài khoản riêng `learn03`): vào từ menu; hai tài liệu thành hai nhóm đúng thứ tự; chữ tìm không vào URL; lọc môn; đánh dấu cần xem lại giữ focus và lọc được; 320/768/1440px không tràn ngang; lỗi mạng rồi thử lại; "Mở trang 2" mở đúng phiên bản/trang trong reader.
- Bộ đầy đủ: `pnpm format:check`, `pnpm check` (lint, typecheck, 126 unit, build) đạt; `pnpm test:integration` 222 passed, 1 skipped; `pnpm test:e2e --workers=1`: 183 passed, 8 skipped (7,5 phút; lượt đầu 3 ca `workspace-ui` đếm mục menu cũ, đã tăng số mục và chạy lại riêng đạt).
- Chưa kiểm chứng production, thiết bị thật hay dữ liệu HUCE thật.

## Chưa làm

- Mở một mục từ sổ tay chỉ tới đúng trang, chưa tự mở editor của ghi chú đó như sổ ghi chú trong reader.
- Chưa sửa/xóa ngay trên sổ tay. Xuất cả sổ tay đã có ở [EXPORT-02](2026-10-28-notebook-export.md).
- Chưa tìm không dấu, chưa nhóm tùy ý, chưa "buổi ôn tập" duyệt lần lượt.
