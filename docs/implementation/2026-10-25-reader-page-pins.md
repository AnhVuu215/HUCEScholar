# READ-04 — Ghim ghi chú lên trang PDF

Ngày 25/10/2026. Nhánh `codex/read-04-page-pins`, xây trên `main` sau PR #44.

Chủ dự án muốn viết ghi chú ngay trên trang PDF, như dán giấy nhớ, thay vì chỉ ở khung bên cạnh. [Thiết kế V2](../superpowers/specs/2026-10-17-workspace-v2-design.md) từng để "chèn chữ vào PDF" ra ngoài đợt nền tảng. Lượt này làm phần giấy nhớ; bút vẽ tay vẫn chưa làm.

Đã chốt theo lựa chọn khuyến nghị (đổi được ở API):

- **Không thêm loại ghi chú mới.** Ghi chú trang (`PAGE_NOTE`) có thêm **vị trí ghim tùy chọn**. Nhờ vậy sổ ghi chú, tìm kiếm, "Cần xem lại", lịch (CAL-04a), thẻ ôn tập và xuất ghi chú dùng được ngay, không phải sửa.
- **File PDF gốc không bị sửa.** Giấy nhớ là một lớp vẽ riêng phía trên trang, chỉ chủ ghi chú thấy, gắn với đúng phiên bản và trang như mọi ghi chú khác.
- Vị trí lưu trong cùng hệ tọa độ với vùng tô (`normalized-pdf-v1`: trang gốc chưa xoay, 0..1, trục y hướng lên). Phóng to, thu nhỏ, xoay hay đổi cỡ màn hình thì giấy nhớ vẫn ở đúng chỗ trên trang.
- Dùng được cả với **PDF scan** không có lớp chữ, vì không cần chọn chữ.

## Hành vi

- Thanh công cụ của reader có nút **Ghim ghi chú lên trang**. Bấm nút thì khung ghi chú mở ở tab ghi chú trang, rồi chờ bấm một chỗ trên trang (con trỏ hình chữ thập). Esc hoặc **Hủy chọn vị trí** để thôi.
- Bấm vào trang: "Đã chọn vị trí trên trang N. Lưu ghi chú để ghim.", focus chuyển vào ô nội dung. Bản nháp hiện trên trang dạng viền nét đứt, có chữ đang gõ.
- Trong form ghi chú trang có nút **Ghim lên trang** / **Chọn lại vị trí** / **Bỏ ghim**. Nút chọn vị trí chỉ bật khi đang xem đúng trang của bản soạn.
- Ghi chú đã ghim hiện trên trang thành **giấy nhớ** màu vàng, rộng tối đa 180px (hoặc nửa trang khi trang hẹp), tối đa 5 dòng. Giấy nhớ được đẩy vào trong mép trang nếu điểm ghim nằm sát mép.
  - **Bấm** giấy nhớ (hoặc Enter/Space khi focus): mở ghi chú để sửa.
  - **Kéo** giấy nhớ (chuột, quá 4px mới tính là kéo): thả ra là lưu chỗ mới, "Đã chuyển ghi chú · Trang N.". Nếu chính ghi chú đó đang mở trong form thì kéo chỉ đổi bản soạn, lưu cùng nội dung.
  - Xung đột (ghi chú đã đổi ở tab khác): báo lỗi, tải lại danh sách, giấy nhớ về chỗ đã lưu.
- Ô **Hiện giấy nhớ trên trang** ẩn/hiện mọi giấy nhớ để đọc trang cho thoáng; không lưu lại giữa các lần mở.
- Danh sách ghi chú trang ghi thêm "· Ghim trên trang". Mở một ghi chú đã ghim từ sổ ghi chú thì reader cuộn tới chỗ giấy nhớ, như với vùng tô.
- Giấy nhớ chỉ hiện cho các ghi chú **đã tải** của trang (30 mục đầu, thêm khi bấm "Xem thêm ghi chú").

## API và schema

- `POST /library/versions/:id/notes` nhận thêm `position: { x, y }` (số 0..1, đúng hai khóa). Không có `position` là ghi chú chỉ ở khung bên như trước. Gửi lại cùng `requestId` mà khác vị trí → 409 `NOTE_REQUEST_REUSED`.
- `PATCH /library/versions/:id/notes/:noteId`: không có `position` thì giữ nguyên; `position: null` là bỏ ghim; có giá trị là chuyển chỗ. Đổi vị trí tăng `revision` như sửa nội dung.
- Mọi phản hồi ghi chú trang có `position` (`null` khi chưa ghim).
- Migration `202610250001_note_position`: thay CHECK không tên `annotations_check` bằng `ck_annotation_kind_anchor`. Ghi chú trang được có `anchor` dạng `{ coordinateSpace: 'normalized-pdf-v1', point: [x, y] }`, không thêm khóa nào khác, hai số trong 0..1. Vùng tô giữ ràng buộc cũ. Số CHECK không đổi (107).

## Kiểm chứng

Local (Windows, Node 24.19.0, pnpm 11.25.0), database `_test` và Redis DB 15:

- Integration, 1 ca mới trong `materials.integration.spec.ts`:
  - tạo ghi chú ghim, gửi lại cùng yêu cầu ra cùng ghi chú; khác vị trí hoặc bỏ vị trí → 409
  - vị trí sai (ngoài 0..1, thiếu/thừa khóa, chuỗi, mảng) → 400
  - chuyển chỗ tăng revision; sửa nội dung không gửi `position` thì giữ chỗ; revision cũ → 409; `null` bỏ ghim
  - danh sách theo trang và tìm trong sổ ghi chú trả `position`
  - ghi thẳng vào database `anchor` sai (ngoài 0..1, chuỗi, thiếu tọa độ, sai hệ tọa độ, thừa khóa) bị `ck_annotation_kind_anchor` chặn
- Browser `tests/read-04.spec.ts` (tài khoản riêng `pins`): ghim từ thanh công cụ, bản nháp hiện trên trang, lưu thì giấy nhớ nằm đúng chỗ đã bấm (lệch < 3px); tải lại vẫn đúng chỗ; kéo 60×100px rồi tải lại thì ở chỗ mới; ẩn/hiện; 320px không tràn ngang; bấm để sửa, bỏ ghim thì ghi chú còn nhưng giấy nhớ mất.
- `tests/highlight-geometry.spec.ts`: điểm ghim đúng góc ở cả 4 góc xoay với crop box lệch gốc; chuyển ngược từ điểm bấm (trang vẽ ở cỡ CSS khác viewport) ra đúng vị trí; điểm ngoài trang bị kẹp vào mép.
- Bộ đầy đủ: `pnpm format:check` và `pnpm check` (lint, typecheck, 126 unit, build) đạt; `pnpm test:integration` 221 đạt, 1 bỏ qua; `pnpm test:e2e --workers=1` 180 đạt, 8 bỏ qua, 1 lỗi.
  - Ca lỗi là `version-01`: 409 khi test tự lưu tiến độ. Test đọc revision tiến độ đúng lúc reader cũng đang tự lưu trang 1 sau khi mở, nên hai lượt ghi tranh nhau. Lỗi này có sẵn từ trước và chỉ hiện khi trùng thời điểm (trên `main`, 5/5 lượt chạy đạt). Test nay chờ "Đã lưu tiến độ · Trang 1" rồi mới đọc revision; chạy lại `version-01` và `read-04` mỗi ca 3 lần: 6/6 đạt.
- Chưa kiểm trên điện thoại thật, cảm ứng hay Safari (đang hoãn).

## Chưa làm

- Di chuyển giấy nhớ bằng bàn phím. Hiện tại bàn phím mở được giấy nhớ để sửa và chọn lại vị trí bằng nút trong form, nhưng chọn vị trí vẫn cần bấm chuột lên trang.
- Bút vẽ tay, hình khối, đổi màu giấy nhớ.
- Xuất PDF kèm giấy nhớ; file xuất Markdown/văn bản (EXPORT-01) chưa ghi ghi chú nào đã được ghim.
- Cuộn liền các trang và ảnh thu nhỏ (READ-05).
