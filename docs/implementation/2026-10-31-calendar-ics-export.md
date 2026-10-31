# CAL-05 — Xuất lịch học ra file `.ics`

Ngày 31/10/2026. Nhánh `codex/cal-05-ics-export`, xây trên `main` `becf93a` (sau PR #61).

[Thiết kế lịch](../superpowers/specs/2026-10-22-study-calendar.md) ghi CAL-05 là "xuất `.ics` hoặc link đăng ký riêng (token, thu hồi được) để xem trong Google Calendar". Điều kiện là người dùng đồng ý chia sẻ ra ngoài và có HTTPS. Lượt này làm phần không cần HTTPS: tải file một lần.

Đã chốt theo lựa chọn khuyến nghị (đổi được ở API hoặc giao diện):

- **Chỉ tải file, chưa có link đăng ký.** Link đăng ký cần token bí mật trong URL, cách thu hồi và một origin HTTPS mà Google Calendar gọi tới được. Hiện chưa có môi trường nào như vậy (OPS-02 đang hoãn). File là bản chụp lúc tải, không tự cập nhật.
- **Mặc định chỉ có tiêu đề và thời gian.** Ghi chú của mục, tên tài liệu liên kết và đường dẫn tới trang chỉ có khi người dùng tích "Kèm ghi chú và tên tài liệu liên kết". File rời khỏi HUCEScholar, nên dữ liệu học tập riêng phải do người dùng chủ động đưa ra.
- **Nội dung file:**
  - Mọi lịch học, kể cả quá khứ. Chuỗi lặp ghi thành một quy tắc hằng tuần (`RRULE`); buổi đã xóa hoặc đã tách khỏi chuỗi ghi vào `EXDATE`, còn buổi tách ra là một mục riêng.
  - Việc cần làm chưa xong và có hạn, đề "Việc: …", đánh dấu rảnh (`TRANSP:TRANSPARENT`).
  - Không có: việc chưa có ngày, việc đã xong, hạn danh sách đọc (CAL-04b) và mục "Cần xem lại" (CAL-04a). Hai loại cuối không phải mục lịch của người dùng mà được suy ra từ dữ liệu khác, và có thể đổi theo giảng viên.
  - Lời nhắc (CAL-03) của mục có giờ ghi thành `VALARM`. Nhập vào lịch khác thì có thể bị bỏ qua, tùy ứng dụng.
- **Giờ ghi theo UTC.** Mục cả ngày cần ngày địa phương: chuỗi lặp dùng múi giờ đã lưu cùng chuỗi, mục lẻ dùng múi giờ hiện tại của trình duyệt gửi kèm yêu cầu, cùng giới hạn đã ghi ở CAL-01.
- **UID ổn định** (`calendar-<id>@hucescholar`), nên nhập lại file mới vào cùng một lịch thì ứng dụng hỗ trợ UID có thể cập nhật thay vì nhân đôi. Chưa thử điều này trên Google Calendar.

## Hành vi

- Trang Lịch học có thêm khung **Xuất sang lịch khác** ở cột bên: lời giải thích file có gì, ô "Kèm ghi chú và tên tài liệu liên kết" (mặc định không tích) và nút **Tải file .ics**.
- Tải xong, khung báo "Đã tạo file lịch." kèm chỗ nhập file trong Google Calendar. Mất kết nối thì báo "Chưa tải được file lịch…", không lưu trang lỗi thành file.

## API

`GET /api/v1/calendar/export?utcOffset=<phút lệch UTC>&details=<true|false>`

- Cần phiên đăng nhập; chỉ có mục của chính người gọi. `utcOffset` bắt buộc, từ −840 tới 840. `details` mặc định `false`.
- Trả `text/calendar; charset=utf-8`, tên file `hucescholar-lich-hoc.ics`, `Cache-Control: no-store` như mọi API.
- Tài liệu liên kết chỉ được ghi khi người gọi còn quyền đọc phiên bản đó, dùng chung kiểm tra quyền với `GET /calendar/items`.
- Không đổi schema.

Phần sinh file nằm ở `apps/api/src/calendar/calendar-ics.ts` (RFC 5545):
- dòng kết thúc bằng CRLF, gấp ở 75 byte mà không cắt đôi ký tự UTF-8;
- escape `\ ; ,` và xuống dòng.

Một chuỗi lặp mỗi 24 giờ tính từ buổi đầu, nên thứ trong `RRULE` là thứ theo UTC. Nếu buổi học bắt đầu trước 7:00 sáng ở Việt Nam thì thứ theo UTC lùi đi một ngày so với thứ địa phương. Ví dụ buổi thứ Hai lúc 6:30 tại Hà Nội là 23:30 Chủ nhật theo UTC. `UNTIL` là hết ngày cuối cùng theo giờ địa phương.

## Kiểm chứng

Local (Windows, Node 24.19.0, pnpm 11.25.0), database `_test` sau `pnpm test:setup`:

- Unit `calendar-ics.spec.ts` (8 ca):
  - cấu trúc file;
  - escape và gấp dòng tiếng Việt;
  - ghi chú chỉ có khi được hỏi;
  - mục cả ngày với `DTEND` loại trừ;
  - việc có giờ không có `DTEND`, có nhắc;
  - chuỗi lặp có `EXDATE`;
  - lùi thứ khi buổi học bắt đầu ở ngày UTC trước;
  - chuỗi cả ngày.

  `pnpm test`: 136 đạt.
- Integration, ca mới "CAL-05 iCalendar export":
  - Có trong file: chuỗi lặp với `RRULE` và buổi đã bỏ trong `EXDATE`, việc có hạn.
  - Không có trong file: việc đã xong, việc chưa có ngày, mục của người khác.
  - Ghi chú chỉ có khi `details=true`.
  - Header đúng.
  - Trả 400 khi thiếu offset, offset ngoài khoảng hoặc `details` sai; trả 401 khi chưa đăng nhập.

  `pnpm test:integration`: 229 đạt, 1 bỏ qua.
- Browser `tests/cal-05.spec.ts`:
  - Tải file thật qua nút: có `UID`, `RRULE`, không có ghi chú; tích ô thì có ghi chú.
  - Chặn mạng thì báo lỗi trong khung.
  - Không tràn ngang ở 320px.
- `pnpm format:check`, `pnpm check` (lint, typecheck, unit, build) đạt.
- Cả bộ e2e (`pnpm test:e2e`, một worker theo cấu hình từ PR #61): 192 đạt, 8 bỏ qua (16,6 phút).
- Ca `ux-02` (UX-02) tạo thẻ tên cố định nên lượt chạy thứ hai trùng thẻ của lượt trước. Đã sửa để mỗi lượt dùng tên riêng. Một lượt chạy riêng `ux-02` cùng `cal-05` có một ca hỏng vì `toBeVisible` hết giờ, nhưng log không giữ lại được là ca nào. Chạy lại thì 4/4 đạt, cả bộ e2e cũng đạt; chưa tìm ra nguyên nhân.
- **Chưa nhập file vào Google Calendar, Outlook hay Apple Calendar thật.** Các test chỉ kiểm định dạng file theo RFC 5545; chưa kiểm chứng cách từng ứng dụng đọc `RRULE` theo UTC, `VALARM` và UID khi nhập lại.

## Chưa làm

- Link đăng ký riêng (token, thu hồi được) để lịch ngoài tự cập nhật: cần HTTPS và OPS-02.
- Chọn khoảng thời gian hay chỉ xuất một số mục; xuất cả hạn danh sách đọc.
- Nhập ngược file `.ics` từ lịch khác vào HUCEScholar.
