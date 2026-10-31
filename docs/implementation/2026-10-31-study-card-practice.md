# STUDY-02 — Luyện thẻ ôn tập và lọc theo môn, tài liệu

Ngày 31/10/2026. Nhánh `codex/study-02-practice`, xây trên `main` `ad3c05e` (sau PR #62).

[STUDY-01](2026-10-21-study-cards.md) mới có danh sách thẻ, nút lật đáp án, sửa và xóa. Phần "Chưa làm" ghi: ôn theo lịch, xáo thẻ, đánh dấu nhớ/chưa nhớ, lọc thẻ theo tài liệu hay môn. Lượt này làm phần luyện tập và bộ lọc. Ôn theo lịch (spaced repetition) để lại.

Đã chốt theo lựa chọn khuyến nghị (đổi được ở API hoặc giao diện):

- **Kết quả "Nhớ / Chưa nhớ" chỉ sống trong một lượt luyện, không lưu.** Muốn lưu thì phải chọn cách dùng dữ liệu đó: thuật toán nhắc lại, khoảng cách ôn, hiển thị ở đâu. Chưa nên thêm cột vào `study_cards` khi chưa có thiết kế đó. Không đổi schema.
- **Hết lượt chỉ ôn lại thẻ chưa nhớ khi người dùng chọn.** Màn tổng kết đưa ba lựa chọn: ôn lại riêng các thẻ chưa nhớ, luyện lại tất cả, hoặc về danh sách thẻ. Không tự động chèn thẻ chưa nhớ vào cuối lượt.
- **Xáo thứ tự mặc định bật**, tắt được cho lượt sau. Xáo ở trình duyệt; API trả thẻ mới nhất trước.
- **Một lượt tối đa 200 thẻ mới nhất** trong bộ lọc. Có nhiều hơn thì trang báo số thẻ và gợi ý chọn môn hoặc tài liệu.
- **Lọc theo môn và theo tài liệu**, dùng cho cả danh sách lẫn lượt luyện. Hai bộ lọc kết hợp được. Bộ lọc nằm trong trạng thái trang, chưa ghi vào URL.

## Hành vi

Trang **Thẻ ôn tập** (`/workspace/study`):

- **Bộ lọc.** Hai ô chọn: **Môn học** gồm các môn có tài liệu chứa thẻ đọc được, và **Tài liệu** ghi tên kèm số thẻ. Ô chỉ hiện khi có từ hai tài liệu trở lên hoặc có môn để chọn. Không tải được danh sách bộ lọc thì trang vẫn hiện mọi thẻ.
- **Bắt đầu luyện.** Nút **Luyện N thẻ** (đang lọc thì là "Luyện N thẻ đang lọc") thay danh sách bằng màn luyện. Bộ lọc bị khóa cho tới khi kết thúc lượt.
- **Từng thẻ.**
  - Dòng trạng thái ghi "Thẻ i / n · Nhớ … · Chưa nhớ …", rồi đến câu hỏi.
  - Bấm **Hiện đáp án** thì hiện đáp án, đoạn trích, nguồn và link "Mở trang nguồn", kèm hai nút **Nhớ** và **Chưa nhớ**.
  - Focus chuyển vào câu hỏi mỗi khi sang thẻ mới, và vào nút "Nhớ" khi đáp án vừa hiện. Như vậy dùng được bằng bàn phím mà không mất vị trí.
- **Tổng kết.** Hết lượt, trang hiện "Xong lượt: nhớ x / n thẻ" (focus vào dòng này), kèm ba nút **Ôn lại k thẻ chưa nhớ**, **Luyện lại tất cả** và **Về danh sách thẻ**. Nút **Kết thúc luyện** ở đầu khung dừng lượt bất cứ lúc nào.

## API

Cần phiên đăng nhập; chỉ đọc nên không cần CSRF. Thẻ của phiên bản không còn đọc được không bao giờ được trả, theo đúng quy tắc của STUDY-01.

- `GET /api/v1/study-cards?courseId=` — thêm bộ lọc môn cho danh sách có sẵn. Dùng cùng `versionId` được.
- `GET /api/v1/study-cards/filters` — trả `{ documents: [{ versionId, title, cards }], courses: [{ id, code, name }] }`, chỉ gồm tài liệu đọc được có thẻ của mình và các môn của chúng.
- `GET /api/v1/study-cards/practice?versionId=&courseId=` — trả `{ items, total }`, tối đa 200 thẻ mới nhất kèm tên tài liệu.
- Mã id sai dạng trả 400; chưa đăng nhập trả 401.

## Kiểm chứng

Local (Windows, Node 24.19.0, pnpm 11.25.0), database `_test` sau `pnpm test:setup`:

- Integration, ca mới "STUDY-02" với hai tài liệu thuộc hai môn:
  - Lượt luyện có cả hai thẻ, mới nhất trước, kèm tên tài liệu.
  - Lọc theo môn, theo tài liệu, hay kết hợp đều ra đúng thẻ; môn không tồn tại thì rỗng. Danh sách có phân trang cũng lọc theo môn đúng.
  - Bộ lọc đếm đúng số thẻ mỗi tài liệu và có cả hai môn.
  - Người khác không thấy gì. Tài liệu bị ẩn thì thẻ của nó mất khỏi lượt luyện và khỏi bộ lọc.
  - Trả 400 khi id sai dạng; 401 khi chưa đăng nhập.

  `pnpm test:integration`: 230 đạt, 1 bỏ qua. Ca STUDY-01 cũ vẫn đạt.
- Browser `tests/study-02.spec.ts`:
  - Lọc theo tài liệu thì thấy đúng 3 thẻ, không có thẻ của tài liệu khác.
  - Luyện 3 thẻ: focus vào câu hỏi và vào nút "Nhớ" đúng lúc; mỗi thẻ hiện đúng một lần; nhớ 1, chưa nhớ 2.
  - Tổng kết "nhớ 1 / 3", ôn lại đúng 2 thẻ chưa nhớ rồi tới "nhớ 2 / 2".
  - Không tràn ngang ở 320px; về danh sách vẫn còn bộ lọc.
- Cả bộ e2e (`pnpm test:e2e`, một worker): 193 đạt, 8 bỏ qua (16,6 phút). `pnpm format:check`, `pnpm check` (lint, typecheck, unit, build) đạt.
- Chưa thử với trình đọc màn hình thật.

## Chưa làm

- Lưu kết quả và ôn theo lịch (spaced repetition), đưa thẻ đến hạn ôn lên Lịch học.
- Ghi bộ lọc vào URL; lọc theo đoạn chữ trong câu hỏi.
- Phím tắt riêng cho "Hiện đáp án", "Nhớ", "Chưa nhớ" (hiện dùng Tab và Enter).
- Xuất thẻ cùng ghi chú (EXPORT-01).
