# UX-03 — Thanh ☰ cho mọi trang, lịch to hơn, sửa form tạo vở

Ngày 03/11/2026. Nhánh `codex/workspace-topbar`, xây trên `main` `eb4e8f3` (sau PR #69). Chủ dự án thử Vở ghi và yêu cầu ba việc:

- form tạo vở bị lệch khung;
- đồng bộ sidebar trên mọi trang cho gọn mắt và dùng tối đa màn hình;
- khung lịch lệch, nhỏ, khó nhìn.

## Thay đổi

- **Mọi trang trong không gian làm việc dùng thanh ☰ trên cùng.**
  - Ở mọi độ rộng màn hình, sidebar trái thu thành một thanh mảnh gồm nút **☰ Menu** và logo, dính ở đầu trang.
  - Bấm ☰ thì danh sách điều hướng xổ xuống đè lên trang, không đẩy nội dung.
  - Esc, chọn một mục, hoặc bấm ra ngoài thì menu đóng; Esc trả focus về nút ☰.
  - Trước đây chỉ trang mở vở và màn hình ≤ 900 px làm vậy.
  - Trang giới thiệu `/project` giữ sidebar cũ.
- **Nội dung trải hết chiều rộng cửa sổ.** Bỏ giới hạn 1.200 px; lề hai bên co theo màn hình (16–48 px). Header và tiêu đề trang thấp hơn để nội dung lên cao hơn.
- **Lịch học:**
  - Hàng tiêu đề thứ và hàng "Cả ngày" nay thẳng cột với lưới giờ. Trước đây lưới giờ có thanh cuộn dọc nên các cột lệch đúng bằng bề rộng thanh cuộn. Cách sửa: hai hàng trên chừa cùng khoảng đó (`scrollbar-gutter: stable`).
  - Mỗi giờ cao 64 px (trước là 48 px).
  - Lưới giờ cao theo cửa sổ (tối thiểu 560 px).
  - Chữ ngày, giờ và buổi học lớn hơn.
  - Ô lịch tháng chia chiều cao cửa sổ; cột việc cần làm rộng 320 px.
- **Form tạo vở và các hộp thoại của Vở ghi nằm giữa màn hình.** Reset CSS của Tailwind đặt `margin` về 0, làm mất cách trình duyệt căn giữa `<dialog>`.
- **Reader, chế độ cuộn liền:** dựng sẵn các trang trong khoảng hai lần chiều cao khung đọc (trước là một lần). Nội dung rộng hơn thì trang PDF vừa chiều rộng cũng cao hơn. Với khoảng một lần, trang kế tiếp chưa kịp có ghim giấy nhớ ở chế độ chỉ xem.

## Kiểm thử

- Thêm `tests/helpers/navigation.ts`: `navLink(page, tên)` mở ☰ (thử lại nếu cú bấm rơi vào lúc trang còn hydrate) rồi trả về link, và `closeNavigation`.
- Các test trước đây bấm thẳng link trên sidebar nay đi qua menu: `assignments`, `catalog`, `learn-03`, `materials`, `users`, `cal-01`, `canvas-01`, `ux-02`, `auth`, `workspace-ui`.
- `ui-refinements` nay kiểm thanh ☰ ở cả bốn độ rộng (360, 320, 768, 1440 px).
- `cal-02` dùng 64 px mỗi giờ khi kéo thả.

Local (Windows, Node 24.19.0, pnpm 11.25.0):

- `pnpm format:check`, `pnpm check` (lint, typecheck, 196 unit, build production) đạt.
- Cả bộ e2e chia ba lượt theo file: **203 đạt**, 9 ca opt-in bỏ qua.
  - `read-05` hỏng vì lý do ở mục reader phía trên; sau khi sửa thì đạt.
  - `cal-02` hỏng vì còn dùng 48 px mỗi giờ; sau khi cập nhật thì đạt.
  - 5 ca `password-change` hỏng ở lượt chạy lại vì thiếu `pnpm test:setup` (đã biết); chạy lại sau setup thì 6/6 đạt.
- Đã xem bằng Chrome trên app dev: form tạo vở nằm giữa; lịch thẳng cột và lớn hơn; Kho học liệu và Lịch học dùng thanh ☰ và rộng hết màn hình.
