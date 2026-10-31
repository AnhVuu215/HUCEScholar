# LEARN-02 — Hoàn thiện "Cần xem lại"

Ngày 31/10/2026. Nhánh `codex/review-later-complete`, xây trên `main` `e3371f7` (sau PR #64).

Dấu "Cần xem lại" đã qua năm lượt:
- [LEARN-02](2026-10-21-review-later.md) tạo dấu;
- [CAL-04a](2026-10-25-calendar-review-later.md) đưa dấu lên Lịch học;
- [LEARN-03](2026-10-26-library-notebook.md) thêm bộ lọc trên mọi tài liệu;
- [EXPORT-02](2026-10-28-notebook-export.md) cho xuất theo bộ lọc;
- [LEARN-04](2026-10-31-notebook-review-session.md) cho đặt hoặc bỏ dấu ngay trong buổi ôn.

Mỗi lượt để lại vài việc "chưa làm". Chủ dự án yêu cầu làm xong hẳn một tính năng thay vì chia nhỏ. Lượt này gom **mọi** khoảng trống còn mở của "Cần xem lại" và đóng hết trong một PR:

| Khoảng trống | Ghi ở | Lượt này |
| --- | --- | --- |
| Không đánh dấu được ngay trong danh sách ghi chú của trang đang đọc | LEARN-02 | Có nút ở danh sách "Ghi chú trang" và "Đoạn tô" |
| File xuất Markdown/văn bản không ghi nhãn | LEARN-02 | Cả hai kiểu xuất (một tài liệu, cả sổ tay) đều ghi nhãn |
| Chỉ lên lịch ôn được từ trang Lịch học | CAL-04a | Mục đã đánh dấu trong sổ ghi chú của reader có "Lên lịch ôn" |
| Khung "Cần xem lại" không lọc theo môn hay tài liệu | CAL-04a | Có hai ô lọc |
| Không mở được buổi ôn từ khung "Cần xem lại" | LEARN-04 | Có nút "Ôn lần lượt" mở buổi ôn ở Sổ tay theo đúng bộ lọc |
| Đổi bộ lọc của khung thì form "Lên lịch ôn" đang mở bị mất | UX-02 | Giữ danh sách cũ trong lúc tải lại |

"Lọc cần xem lại xuyên nhiều tài liệu" (LEARN-02) đã có từ LEARN-03.

Đã chốt theo lựa chọn khuyến nghị:

- Đánh dấu ở danh sách của trang dùng chung API và component `ReviewMarkButton` với Sổ tay. Dấu không đổi `revision` của ghi chú, nên sửa ghi chú ngay sau đó vẫn lưu được.
- Nhãn trong file xuất: Markdown ghi "**Ghi chú trang** · Cần xem lại", văn bản ghi "- Ghi chú trang [Cần xem lại]: …".
- Bộ lọc tài liệu chỉ có ở khung Lịch học và ở buổi ôn mở từ khung đó, không thêm vào form Sổ tay. Khi đóng buổi ôn, Sổ tay bỏ giới hạn một tài liệu nhưng giữ bộ lọc "Chỉ mục cần xem lại" và môn.

## Hành vi

- **Reader, tab "Trang này".**
  - Mỗi ghi chú và đoạn tô có nút **Đánh dấu cần xem lại / Bỏ dấu cần xem lại**, và nhãn "· Cần xem lại" khi đang đánh dấu.
  - Lưu xong, dòng trạng thái báo; focus ở lại nút.
- **Reader, tab "Toàn tài liệu".** Mục đang đánh dấu có thêm nút **Lên lịch ôn** (ngày, giờ, thời lượng), như ở Lịch học.
- **File xuất.** Mỗi mục đang đánh dấu có nhãn "Cần xem lại". Xuất Sổ tay theo một tài liệu thì dòng "Bộ lọc" ghi "một tài liệu".
- **Khung "Cần xem lại" trên Lịch học.**
  - Hai ô lọc **Môn học** và **Tài liệu**. Tài liệu ghi kèm số mục; ô chỉ hiện khi có từ hai tài liệu trở lên hoặc có môn để chọn.
  - Nút **Ôn lần lượt N mục** (đang lọc thì có thêm "đang lọc") mở `/workspace/notebook?review=marked&courseId=…&versionId=…`.
- **Sổ tay mở từ link đó.** Ô "Chỉ mục cần xem lại" và môn được điền sẵn, buổi ôn bắt đầu luôn. Id sai dạng trong URL thì bị bỏ qua.

## API

- `GET /api/v1/personal-library/review-later?courseId=&versionId=`: thêm hai bộ lọc, kết hợp được; id sai dạng trả 400.
- `GET /api/v1/personal-library/review-later/filters`: trả `{ documents: [{ versionId, title, marks }], courses: [{ id, code, name }] }`, chỉ gồm tài liệu còn đọc được có dấu của mình.
- `POST /api/v1/personal-library/notebook/search` và `/notebook/export`: nhận thêm `versionId` để giới hạn một tài liệu. Cursor gắn với bộ lọc này như các bộ lọc khác.
- `GET /library/versions/:id/annotations/export`: nay lấy thêm cột `review_later` để ghi nhãn.
- Không đổi schema.

## Kiểm chứng

Local (Windows, Node 24.19.0, pnpm 11.25.0), database `_test` sau `pnpm test:setup`:

- **Unit** `annotation-export.spec.ts`: ca mới cho nhãn ở cả hai định dạng và trong file Sổ tay. `pnpm test` đạt.
- **Integration**, ca mới "LEARN-02" với hai tài liệu thuộc hai môn:
  - khung lọc theo môn, theo tài liệu và kết hợp; trả 400 khi id sai;
  - bộ lọc đếm đúng số mục, có cả hai môn; người khác không thấy; 401 khi chưa đăng nhập;
  - tìm Sổ tay theo một tài liệu chỉ ra mục đã đánh dấu, hoặc mọi mục nếu không lọc dấu; `versionId` sai trả 400;
  - hai kiểu xuất ghi nhãn đúng mục; file Sổ tay ghi "một tài liệu · cần xem lại".

  Ca EXPORT-02 cũ đổi đúng một dòng, vì mục của nó đang đánh dấu nên nay có nhãn. `pnpm test:integration`: 231 đạt, 1 bỏ qua.
- **Browser** `tests/review-later-complete.spec.ts` (tài khoản `review2`):
  1. Đánh dấu ghi chú và đoạn tô từ danh sách của trang; nhãn hiện, focus ở lại nút; sửa ghi chú ngay sau đó vẫn lưu và giữ dấu.
  2. Lên lịch ôn từ sổ ghi chú.
  3. File văn bản tải về có cả hai nhãn.
  4. Khung Lịch học lọc theo tài liệu còn đúng 2 mục; "Ôn lần lượt 2 mục đang lọc" mở buổi ôn "Mục 1 / 2" với ô "Chỉ mục cần xem lại" đã tích; hết buổi về Sổ tay thì thấy cả mục của tài liệu kia.
  5. Lọc theo môn còn 1 mục; không tràn ngang ở 320px.
- Đổi bộ lọc khi form "Lên lịch ôn" đang mở: spec trên mở form, gõ giờ rồi lọc theo tài liệu, giờ vẫn còn. Khi tạm bỏ bản sửa, spec hỏng đúng ở bước này.
- Cả bộ e2e (`pnpm test:e2e`, một worker, trước bản sửa đổi bộ lọc): 195 đạt, 8 bỏ qua (16,0 phút). Sau bản sửa chạy lại `review-later-complete`, `cal-04`, `learn-02`, `learn-04`: 4/4 đạt.
- `pnpm format:check`, `pnpm check` (lint, typecheck, unit, build) đạt.
- Chưa thử với trình đọc màn hình thật.

## Không làm

Các việc dưới đây không phải khoảng trống của "Cần xem lại" mà là tính năng khác, ghi lại để không lẫn:

- Nối buổi ôn đã đặt với dấu: bỏ dấu không xóa buổi ôn. Đây là quyết định của CAL-04a, giữ nguyên.
- Lưu tiến độ buổi ôn hay ôn theo lịch (spaced repetition): thuộc STUDY/LEARN, cần thiết kế riêng.
