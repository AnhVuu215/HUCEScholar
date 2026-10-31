# LEARN-04 — Buổi ôn tập từ Sổ tay

Ngày 31/10/2026. Nhánh `codex/learn-04-review-session`, xây trên `main` `26295ed` (sau PR #63).

Roadmap mục 6 có ý tưởng "Buổi ôn tập từ sổ tay": người học chọn một môn, xem lần lượt từng ghi chú và đoạn tô rồi đánh dấu đã xem. Cách thử ít tốn công là lọc rồi duyệt tuần tự, chưa cần thuật toán nhắc lại. [LEARN-03](2026-10-26-library-notebook.md) ghi lại khoảng trống này: "chưa có 'buổi ôn tập' duyệt lần lượt".

Đã chốt theo lựa chọn khuyến nghị (đổi được ở giao diện):

- **Chỉ làm ở giao diện, không đổi API hay schema.** Buổi ôn dùng lại `POST /personal-library/notebook/search`, cùng kiểm quyền và cùng bộ lọc với Sổ tay.
- **Buổi ôn lấy đúng các mục mà lần tìm gần nhất trả về**, giống nút xuất sổ tay: theo môn, chữ, loại, màu, "chỉ mục cần xem lại". Chưa tìm lần nào thì buổi ôn gồm mọi mục.
- **Đi theo thứ tự của Sổ tay**: tài liệu mới trước, rồi theo trang. Không xáo, vì ghi chú thường cần đọc theo mạch tài liệu, khác thẻ ôn tập.
- **"Đã xem" chỉ tính trong buổi ôn, không lưu.** Dấu "Cần xem lại" là dấu thật đã lưu (LEARN-02), đặt hay bỏ ngay trong buổi ôn. Nhờ vậy cuối buổi có thể ôn lại riêng các mục còn đánh dấu.
- **Tối đa 200 mục mỗi buổi.** Nhiều hơn thì trang báo và gợi ý thu hẹp bộ lọc.

## Hành vi

Trang **Sổ tay** (`/workspace/notebook`):

- **Bắt đầu.** Nút **Ôn lần lượt theo bộ lọc đang xem** thay danh sách bằng khung **Buổi ôn tập**.
- **Từng mục.**
  - Mỗi mục ghi "Mục i / n", rồi tên tài liệu và trang. Bên dưới là loại, màu, đoạn tô và nội dung ghi chú như trong Sổ tay.
  - Các nút: **Mở trang N** (vào reader), **Đánh dấu / Bỏ dấu cần xem lại**, **Mục trước**, **Đã xem, mục tiếp** (ở mục cuối là "Đã xem, kết thúc").
  - Focus chuyển vào tiêu đề mỗi khi sang mục mới.
- **Tổng kết.** Hết buổi, trang hiện "Đã xem hết n mục" kèm số mục đang đánh dấu cần xem lại, và ba nút **Ôn lại k mục cần xem lại**, **Ôn lại từ đầu**, **Về sổ tay**.
- **Về sổ tay.** Danh sách tải lại, nên dấu vừa đổi trong buổi ôn hiện đúng.
- **Lỗi.** Không tải được thì báo lỗi kèm nút **Thử tải lại**.

## Kiểm chứng

Local (Windows, Node 24.19.0, pnpm 11.25.0), database `_test` sau `pnpm test:setup`:

- Browser `tests/learn-04.spec.ts` (mới, tài khoản `learn04`), với ba ghi chú trên hai trang:
  - Buổi ôn đi đúng thứ tự trang, focus vào tiêu đề từng mục.
  - Đánh dấu cần xem lại mục 2; lùi lại rồi tiến tới vẫn giữ dấu.
  - Tổng kết báo 1 mục; ôn lại đúng mục đó, "Mục trước" bị khóa, link mở đúng `?page=1`.
  - Bỏ dấu thì tổng kết báo không còn mục nào.
  - Không tràn ngang ở 320px; về sổ tay thì không còn nhãn "Cần xem lại".
  - Tải lỗi thì báo và thử lại được.

  Cả bộ e2e (`pnpm test:e2e`, một worker): 194 đạt, 8 bỏ qua (16,6 phút).
- `pnpm format:check`, `pnpm check` (lint, typecheck, unit, build) đạt. Không đổi API nên không chạy lại integration.
- Chưa thử với trình đọc màn hình thật.

## Chưa làm

- Lưu tiến độ buổi ôn hay đặt lịch ôn lại; gắn buổi ôn vào Lịch học.
- Sửa nội dung ghi chú ngay trong buổi ôn (hiện sửa ở danh sách Sổ tay hoặc trong reader).
- Bắt đầu buổi ôn từ khung "Cần xem lại" của Lịch học: đã có ở [hoàn thiện "Cần xem lại"](2026-10-31-review-later-complete.md).
