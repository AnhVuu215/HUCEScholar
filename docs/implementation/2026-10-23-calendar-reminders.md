# CAL-03 — Nhắc trước giờ học

Ngày 23/10/2026. Nhánh `codex/cal-03-reminders`, xây trên `main` sau PR #33 (CAL-02).

Thiết kế ở [đặc tả, mục CAL-03](../superpowers/specs/2026-10-22-study-calendar.md#cal-03--nhắc-trước-giờ-học). Các mặc định đã chốt theo lựa chọn khuyến nghị, đổi được ở API:

- mỗi mục có tối đa một lời nhắc: lúc bắt đầu, trước 5/10/15/30 phút, 1 giờ, 2 giờ hoặc 1 ngày
- chỉ mục có ngày và giờ mới nhắc được: lịch học có giờ và việc có hạn kèm giờ. Lịch cả ngày và việc chưa có ngày thì không.
- nhắc hiện ở chuông thông báo (NOTIFY-01); email là tùy chọn riêng từng mục, mặc định tắt
- không nhắc việc đã hoàn thành
- mỗi buổi của chuỗi lặp được nhắc riêng; buổi đã bỏ thì không nhắc

## Hành vi

**Form lịch học / việc cần làm:**

- Ô **Nhắc** (mặc định "Không nhắc") hiện khi mục có giờ. Bật **Cả ngày** hoặc xóa ngày hạn thì ô này ẩn đi, và lưu sẽ bỏ lời nhắc.
- Chọn giờ nhắc thì hiện **Gửi cả email**, kèm dòng: "Thông báo hiện ở chuông và gửi tới email tài khoản. Thư chỉ có tiêu đề, không có ghi chú."
- "Chỉ buổi này" của chuỗi giữ lời nhắc của chuỗi cho mục tách ra.

**Trên lịch:**

- `title` của khối có "Nhắc: trước 15 phút".
- Lịch biểu có dòng "Nhắc: … · có email". Panel việc cần làm có dòng "Nhắc: …".
- Kéo việc về panel (bỏ ngày) hoặc kéo sang dải cả ngày thì lời nhắc cũng bị bỏ. Trình duyệt bỏ nó trước khi gửi, để API không trả 400.
- `/workspace/calendar?at=<thời điểm>` mở đúng tuần (hoặc tháng) chứa thời điểm đó, tính theo giờ của máy.

**Thông báo:**

- "Nhắc lịch học: “…” bắt đầu lúc 14:00 Th 3, 27/10/2026." hoặc "Nhắc việc: “…” đến hạn lúc …", theo giờ của máy đang xem.
- Nút **Mở lịch** đánh dấu đã đọc rồi mở `/workspace/calendar?at=…`.
- Xóa mục lịch thì xóa luôn lời nhắc của nó (ON DELETE CASCADE).

**Email** (khi mục bật "Gửi cả email", máy chủ có `MAIL_TRANSPORT`, tài khoản `ACTIVE`):

- Tiêu đề "Nhắc lịch: <tiêu đề mục>". Nội dung ghi giờ tương đối ("bắt đầu sau 15 phút") và link `APP_ORIGIN/workspace/calendar?at=…`.
- Không ghi giờ cụ thể, vì với mục đơn máy chủ không biết múi giờ của người dùng. Không có ghi chú của mục.
- Gửi nhiều nhất một lần: chỉ worker nào ghi được thông báo (khóa `event_key` duy nhất) mới gửi thư. Gửi lỗi thì không gửi lại, chỉ ghi log chung chung.

## Worker

- `file-worker.ts` gọi `CalendarReminders.dispatch()` lúc khởi động và mỗi 60 giây, chung tiến trình với worker PDF. Không cần thêm hàng đợi.
- Một lời nhắc đến hạn khi `giờ bắt đầu − số phút` rơi vào khoảng (now − 10 phút, now]:
  - Worker ngừng dưới 10 phút: lời nhắc vẫn được gửi khi chạy lại.
  - Worker ngừng lâu hơn: bỏ lời nhắc, không gửi muộn.
  - Tạo mục mà giờ nhắc vừa qua chưa tới 10 phút: nhắc ngay.
- `event_key = reminder:<mục>:<giờ bắt đầu tính bằng giây>`: mỗi buổi chỉ được nhắc một lần, dù chạy nhiều worker hay quét chồng nhau. Đổi giờ thì buổi mới có khóa mới. Đổi số phút sau khi đã nhắc thì không nhắc lại buổi đó.
- Mỗi lượt quét tối đa 1000 mục đơn và 1000 chuỗi, có partial index cho từng loại. Mục còn lại được quét ở lượt sau, vì cửa sổ 10 phút chồng lên nhau.
- Phần tính lời nhắc nào đến hạn là hàm thuần `dueStarts` trong `apps/api/src/calendar/calendar-reminders.ts`.

## API và schema

- `POST`/`PATCH /calendar/items` và `/detach` nhận thêm:
  - `remindMinutes`: `null` hoặc một trong 0, 5, 10, 15, 30, 60, 120, 1440; thiếu là `null`
  - `remindEmail`: thiếu là `false`
- Nhắc mục cả ngày hoặc chưa có ngày, hay bật email mà không có giờ nhắc → 400 `CALENDAR_INVALID`.
- Mục trả về có `reminder: { minutes, email } | null`.
- `GET /notifications` trả thêm `calendarItemId` và `eventAt` (null với các loại cũ). `documentId`/`versionId` là null với `CALENDAR_REMINDER`.

Migration `202610230002_calendar_reminders` (SQL thuần):

- `calendar_items`:
  - thêm `remind_minutes smallint` và `remind_email boolean NOT NULL DEFAULT false`
  - CHECK `ck_calendar_remind`: miền giá trị, có `starts_at`, không phải cả ngày
  - CHECK `ck_calendar_remind_email`: email cần có giờ nhắc
  - partial index `ix_calendar_remind_single (starts_at)` cho mục đơn chưa xong; `ix_calendar_remind_series (repeat_until)` cho chuỗi
- `notifications`:
  - thêm loại `CALENDAR_REMINDER` vào `ck_notification_kind`
  - `document_id`/`version_id` thành nullable; thêm `calendar_item_id` (FK, ON DELETE CASCADE, có index) và `event_at`
  - CHECK `ck_notification_target`: lời nhắc chỉ trỏ tới mục lịch, mọi loại khác vẫn bắt buộc trỏ tới phiên bản tài liệu

Test schema: 33 bảng, 67 FK, 106 CHECK, 14 partial index.

## Kiểm chứng

Chạy trên máy local (Windows, Node 24.19, PostgreSQL/Redis trong Docker). Đây là bằng chứng local, chưa phải CI hay thiết bị thật.

- `pnpm format:check`, `pnpm check` (lint, typecheck, 119 unit test API, build): đạt.
  - Lần đầu `next build` dừng ở thông báo "Next.js có lỗ hổng bảo mật đã biết" của chính Next. Chạy lại thì build đạt. `next dev` trong e2e cũng dừng như vậy hai lần trước khi chạy.
- Unit test mới `calendar-reminders.spec.ts` (5 ca):
  - đến hạn đúng ở mép cửa sổ (khoảng nửa mở)
  - nhắc lúc bắt đầu
  - chuỗi nhắc đúng buổi, không phải buổi đầu
  - bỏ buổi đã bỏ và buổi sau ngày cuối
  - khóa `event_key` khớp CHECK
- `pnpm test:integration`: 216 đạt, 1 bỏ qua (có sẵn). Ca mới "CAL-03 reminders" trong `materials.integration.spec.ts`:
  - 4 kiểu dữ liệu sai → 400
  - CHECK `ck_calendar_remind` và `ck_notification_target` chặn ghi thẳng vào DB
  - với giờ cố định:
    - lịch học nhắc trước 15 phút đúng một lần
    - việc đã xong không nhắc
    - buổi thứ Tư đã bỏ không nhắc
    - buổi thứ Hai tuần sau nhắc trước 1 giờ
    - quá 10 phút thì bỏ
  - thư (mailer giả) gửi đúng một lần, có giờ tương đối và link, không có ghi chú
  - tài khoản khác không thấy lời nhắc; xóa mục thì xóa lời nhắc
  - ca thông báo cũ cập nhật hình dạng (thêm hai trường null)
- `tests/cal-03.spec.ts` (tài khoản `cal3`, dọn lịch trước khi chạy):
  - tạo lịch học nhắc trước 15 phút + email qua form
  - lời nhắc ghi vào DB test (như `notify-01`); trang thông báo hiện giờ địa phương; "Mở lịch" mở đúng tuần và chuyển sang "Đã đọc"
  - form hiện lại lựa chọn đã lưu; bật "Cả ngày" ẩn ô Nhắc và lưu thành không nhắc
  - kéo việc có nhắc về panel: bỏ ngày và bỏ nhắc
  - không tràn ngang ở 1440/390/320px
- `cal-01`, `cal-02`, `notify-01` vẫn đạt.
- `pnpm test:e2e --workers=1`: 170 đạt, 8 bỏ qua, 2 lỗi, đều là test PWA, không liên quan CAL-03.
  - `pwa.spec.ts` (trang mất kết nối): chạy lại riêng thì đạt.
  - `pwa-install.spec.ts › mobile: install help…`: lỗi ổn định, kể cả trên `main` khi bỏ hết thay đổi của nhánh này. Bấm link "Cài ứng dụng trên thiết bị" ở 360px hết 30 giây, có lẽ vì nút báo lỗi của Next dev che link. Nút này mới hiện từ khi Next báo "phiên bản có lỗ hổng bảo mật đã biết".
  - Lượt đầu, `next dev` dừng ngay lúc khởi động để hiện thông báo đó, nên gần như mọi test bị từ chối kết nối. Thông báo này cứ một lần chạy lại dừng một lần.

Worker thật (`worker:files`) chưa chạy cùng SMTP thật. Lời nhắc đã kiểm bằng cách gọi `dispatch` với giờ cố định, thư kiểm bằng mailer giả.

## Chưa làm

- Nhiều lời nhắc cho một mục; lời nhắc cho mục cả ngày (ví dụ 8:00 sáng ngày đó), vì cần biết múi giờ người dùng.
- Thông báo đẩy của trình duyệt / Web Push. Chuông vẫn kiểm mỗi 60 giây khi tab đang hiện.
- Tùy chọn tắt email cho cả tài khoản; hiện bật/tắt theo từng mục.
- Hạn danh sách đọc trong lịch (CAL-04), xuất `.ics` (CAL-05) đã có ở [mốc CAL-05](2026-10-31-calendar-ics-export.md).
