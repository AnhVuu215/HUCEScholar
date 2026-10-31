# CAL-07 — Hoàn thiện Lịch học

Ngày 31/10/2026. Nhánh `codex/calendar-complete`, xây trên `main` `9cd4361` (sau PR #65).

Lịch học đã đi qua CAL-01 tới CAL-05, và mỗi mốc để lại một danh sách "Chưa làm". Theo yêu cầu làm xong hẳn từng tính năng, lượt này gom **mọi** khoảng trống phía web của Lịch học và đóng trong một PR.

| Khoảng trống | Ghi ở | Lượt này |
| --- | --- | --- |
| Danh sách việc đã xong trên giao diện | CAL-01 | "Xem việc đã xong" dưới danh sách việc; bỏ tích để mở lại |
| Ô chọn tài liệu trong form lịch | CAL-01 | "Gắn tài liệu": tìm trong kho học liệu, chọn, đặt trang |
| Đánh dấu đã đọc ngay trên lịch | CAL-04c | Ô "Đã đọc" trên mỗi hạn đọc (tuần, tháng, lịch biểu) |
| Lọc ẩn hạn đã đọc | CAL-04c | Ô "Ẩn hạn đọc đã đọc" |
| Danh sách các môn đang theo dõi ở một chỗ | CAL-04b | Khung "Môn đang theo dõi": tiến độ, nhắc hạn, bỏ theo dõi |
| Hạn có giờ, nhắc trước hạn | CAL-04b | Giảng viên đặt giờ hạn; người theo dõi chọn nhắc trước 1 giờ, 3 giờ, 1 ngày hoặc 2 ngày |
| Báo cho người theo dõi khi giảng viên đổi hạn | CAL-04b | Thông báo khi hạn được thêm, đổi hoặc bỏ trên danh sách đã công bố |
| Lặp mỗi N tuần, sau N lần, theo tháng | CAL-02 | Có đủ ba kiểu |
| "Buổi này và các buổi sau" | CAL-02 | Sửa thì tách thành chuỗi mới từ buổi đó; xóa thì cắt chuỗi |
| Lặp cho việc cần làm | CAL-02 | Việc có hạn lặp được; mỗi lần tích xong riêng |
| Nhiều lời nhắc cho một mục | CAL-03 | Tối đa 3 |
| Lời nhắc cho mục cả ngày | CAL-03 | 8:00 hôm đó, 20:00 hôm trước, 8:00 hôm trước |
| Tắt email nhắc cho cả tài khoản | CAL-03 | Ô trong Cài đặt |
| Xuất cả hạn danh sách đọc; chọn khoảng thời gian | CAL-05 | Hai tùy chọn trong khung "Xuất sang lịch khác" |
| Nhập file `.ics` từ lịch khác | CAL-05 | Khung "Nhập từ lịch khác" |

**Không làm**, kèm lý do:

| Việc | Lý do |
| --- | --- |
| Kéo thả trên màn hình cảm ứng | Ngoài phạm vi; chủ dự án chốt làm bản web cho chuột trước |
| Thông báo đẩy của trình duyệt (Web Push) | Cần HTTPS và service worker cho thông báo; AGENTS.md không cho cache dữ liệu đăng nhập trong service worker; OPS-02 đang hoãn |
| Link đăng ký `.ics` tự cập nhật | Cần HTTPS và OPS-02 |
| Buổi lệch 1 giờ quanh mốc đổi giờ mùa hè | Việt Nam không đổi giờ; đây là giới hạn đã ghi trong đặc tả, không phải việc còn thiếu |
| Mục cả ngày lệch ngày khi đổi múi giờ máy | Như trên |
| Giảng viên xem tiến độ đọc của lớp | Cần mô hình lớp và sự đồng ý của người học; chủ dự án quyết định |

## Đã chốt theo lựa chọn khuyến nghị

- **Giờ hạn là giờ Việt Nam** (UTC+7, không đổi giờ). Không có giờ thì hạn là 23:59 ngày đó, kể cả khi sắp xếp và khi nhắc.
- **Nhắc hạn đọc theo từng môn**, đặt ở khung "Môn đang theo dõi"; chỉ nhắc tài liệu chưa đánh dấu đã đọc. Chỉ có thông báo trong ứng dụng, không gửi email.
- **Thông báo đổi hạn** chỉ gửi khi danh sách đã công bố và vẫn công bố sau lần lưu. Danh sách mới, hoặc danh sách vừa được công bố lần đầu, không tính là "đổi". Mỗi lần lưu, mỗi tài liệu đổi hạn tạo đúng một thông báo cho mỗi người theo dõi; người sở hữu danh sách không nhận.
- **Lặp theo tháng** dùng ngày trong tháng của lần đầu; tháng không có ngày đó (ví dụ ngày 31) thì bỏ qua, như Google Calendar.
- **"Sau N lần"**: server tính ngày của lần thứ N và lưu cả hai giá trị; mọi chuỗi vẫn có ngày cuối, vẫn tối đa 366 ngày và 400 lần.
- **Việc cần làm lặp lại**:
  - Mỗi lần xong được ghi ở bảng `calendar_item_done`.
  - Danh sách việc hiện lần gần nhất chưa xong (quá hạn vẫn đứng đầu).
  - Danh sách việc đã xong có một dòng cho mỗi lần đã xong.
- **"Buổi này và các buổi sau"**:
  - Sửa: chuỗi cũ kết thúc ngày trước buổi đó; tạo chuỗi mới từ buổi đó với các trường mới.
  - Xóa: chỉ cắt chuỗi.
  - Ở buổi đầu tiên không có lựa chọn này, vì nó chính là "Cả chuỗi".
- **Lời nhắc thêm** nằm ở mảng `remind_more`; lời nhắc đầu tiên giữ ở cột cũ, nên các index của worker và thông báo đã gửi không đổi. Mục cả ngày bắt đầu lúc 0:00 giờ máy, nên lời nhắc lúc 8:00 hôm đó được lưu là −480 phút.
- **Xuất `.ics`**:
  - Lặp mỗi 1 tuần vẫn ghi dạng `RRULE`.
  - Mỗi N tuần, theo tháng và việc lặp ghi danh sách ngày (`RDATE`), vì một quy tắc tính theo UTC sẽ đặt buổi trước 7:00 sáng Việt Nam vào sai tuần hoặc sai ngày.
  - Mọi lời nhắc đều được ghi thành `VALARM`.
- **Nhập `.ics`**:
  - Nhận nội dung `text/calendar`, tối đa 512 KB và 500 mục.
  - Đọc `VEVENT` thành lịch học và `VTODO` thành việc cần làm; giờ có thể là UTC, theo `TZID`, hoặc giờ máy.
  - Lặp: nhận `WEEKLY`, `MONTHLY`, và `DAILY` mỗi 1 ngày (chuyển thành hằng tuần đủ bảy ngày); kèm `EXDATE` và một `VALARM`.
  - Kiểu lặp khác thì chỉ nhập lần đầu và ghi rõ trong kết quả; chuỗi quá 366 ngày bị rút ngắn, cũng ghi rõ.
  - Buổi sửa riêng (`RECURRENCE-ID`), `RDATE`, mục dài quá 14 ngày và múi giờ lạ bị bỏ qua, kèm lý do.
  - Mục nhập vào có màu xám. Mỗi UID có một `requestId` cố định theo chủ và UID, nên nhập lại cùng file không tạo bản trùng.
- **Ô chọn tài liệu** tìm bằng API kho học liệu có sẵn; API lịch kiểm lại quyền đọc khi lưu, như trước.

## Schema

Ba migration SQL, không dùng `db push`:

- **`202610310001_reading_deadline_times`**
  - `reading_list_items.due_time`: CHECK chỉ có khi có `due_on`.
  - `reading_list_follows.remind_minutes`: chỉ nhận 60, 180, 1440 hoặc 2880.
  - Hai loại thông báo mới `READING_DEADLINE_SOON` và `READING_DEADLINE_CHANGED`. Ràng buộc `ck_notification_target` viết lại theo từng loại; `event_key` được thêm một số thứ ba.
- **`202610310002_calendar_repeat_rules`**
  - Thêm `repeat_freq`, `repeat_interval`, `repeat_count`.
  - Viết lại hai CHECK hình dạng và ngày bắt đầu. Mọi vế đều ghi `IS NOT NULL` tường minh, vì CHECK nhận kết quả NULL là đạt. Lỗi này lộ ra trong integration test và đã sửa trước khi commit.
  - Dựng lại ba partial index theo `repeat_freq`.
  - Thêm bảng `calendar_item_done`, và CHECK chuỗi lặp không dùng `done_at`.
  - Chuỗi cũ được chuyển thành hằng tuần, mỗi 1 tuần.
- **`202610310003_calendar_reminder_options`**
  - `calendar_items.remind_more`: tối đa 2 phần tử, khác nhau, khác lời nhắc đầu, đúng tập giá trị cho mục có giờ hoặc mục cả ngày.
  - Mở rộng `ck_calendar_remind` cho mục cả ngày.
  - `user_preferences.reminder_email`, mặc định bật.

Kiểm tra schema: 36 bảng, 72 khóa ngoại, 112 CHECK, 16 partial index.

## API mới hoặc đổi

| Endpoint | Thay đổi |
| --- | --- |
| `GET /calendar/tasks?status=done` | Đã có; nay gồm cả các lần đã xong của việc lặp |
| `PUT /calendar/items/:id/done` | Nhận `occurrenceStart` (bắt buộc với việc lặp) |
| `POST /calendar/items/:id/split`, `POST /calendar/items/:id/truncate` | "Buổi này và các buổi sau" |
| `repeat` trong body tạo/sửa | `{ freq, interval, weekdays, until \| count, utcOffset }` |
| `remindMore` trong body tạo/sửa | Mảng tối đa 2 lời nhắc thêm |
| `GET /calendar/export` | Thêm `deadlines`, `from`, `to` |
| `POST /calendar/import?utcOffset=` | Body là file `.ics`; trả `{ created, existing, skippedCount, skipped, notes }` |
| `PUT /courses/:id/reading-lists/follow` | Nhận `remindMinutes`; `GET /reading-lists/following` trả nó |
| Danh sách đọc | Mục có thêm `dueTime` |
| `account/preferences` | Có thêm `reminderEmail` |

Đổi hành vi so với trước:
- Việc cần làm có hạn lặp lại được.
- Mục cả ngày nay có ô nhắc; lời nhắc theo phút của mục có giờ bị bỏ khi chuyển sang cả ngày.

## Kiểm chứng

Local (Windows, Node 24.19.0, pnpm 11.25.0), database `_test` dựng lại từ đầu bằng `pnpm test:setup`:

- **Unit:**
  - `calendar-repeat`: mỗi 2 tuần, theo tháng bỏ tháng thiếu ngày, sau N lần, khoảng lặp ngoài 1–12.
  - `calendar-ics`: `RDATE`/`EXDATE`, lời nhắc mục cả ngày.
  - `calendar-ics-import`, file mới: múi giờ, giờ máy, ngày; các kiểu lặp; việc cần làm; các mục bị bỏ qua; `requestId` cố định.
  - `annotation-export` vẫn đạt.

  `pnpm test` đạt.
- **Integration**, ca mới:
  - "CAL-07: due times, change notices…": giờ hạn; nhắc theo môn; thông báo đổi hạn tới mọi người theo dõi trừ người sở hữu, không lặp khi lưu lại cùng hạn; nhắc đúng một lần, không nhắc tài liệu đã đọc.
  - Khối "CAL-07 repeat rules" (3 ca): theo tháng, mỗi 2 tuần sau 3 lần, CHECK của database; việc lặp xong theo từng lần; tách và cắt chuỗi.
  - "CAL-07: up to three reminders…": ba lời nhắc của mục có giờ, hai lời nhắc của mục cả ngày, tắt email cho cả tài khoản.
  - "CAL-07: imports an .ics file once…": nhập, nhập lại không trùng; 415, 413, 403; xuất theo khoảng ngày kèm hạn đọc.

  Các ca cũ cập nhật vì phản hồi có thêm trường. `pnpm test:integration`: 237 đạt, 1 bỏ qua.
- **Browser:**
  - `cal-06` (mới, tài khoản `cal6`), 3 ca: việc đã xong và ô chọn tài liệu; lặp mỗi 2 tuần sau 3 lần, tách rồi cắt chuỗi, việc lặp; lời nhắc mục cả ngày, tối đa 3 lời nhắc, công tắc email trong Cài đặt.
  - `course-01` "CAL-07" (tài khoản `course4`): giờ hạn trong form giảng viên; nhãn trên lịch; chọn nhắc; đánh dấu đã đọc và ẩn hạn đã đọc; tiến độ trong khung môn; thông báo đổi giờ hạn; bỏ theo dõi.
  - `cal-05`, ca mới: nhập file, nhập lại, xuất một ngày.
  - Spec cũ đổi theo hành vi mới: `cal-02` (nhãn "Lặp lại"), `cal-03` (mục cả ngày có ô nhắc).
  - **Cả bộ e2e chưa chạy xong**: lượt `pnpm test:e2e` sau khi gộp đủ sáu phần bị Claude Code dừng ngay ở ca 1/208 vì máy thiếu bộ nhớ, nên chưa có kết quả. Các spec liên quan tới lịch, danh sách đọc, thông báo, trang đầu, cài đặt và UX-02 đã chạy riêng và đạt. Cần chạy lại cả bộ trước khi gộp.
- `pnpm format:check`, `pnpm check` (lint, typecheck, unit, build) đạt.
- **Chưa thử:** nhập file thật xuất từ Google Calendar hay Outlook, và nhập file `.ics` xuất từ đây vào các ứng dụng đó; chưa thử với trình đọc màn hình.

## Còn lại

Không còn việc nào phía web của Lịch học trong các mốc CAL-01…05. Những việc trong bảng "Không làm" cần HTTPS, thiết bị cảm ứng, hoặc quyết định của chủ dự án.
