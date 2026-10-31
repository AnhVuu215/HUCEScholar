# CAL — Lịch học và việc cần làm

Trạng thái: thiết kế ngày 22/10/2026. CAL-01 đã vào `main` (PR #29), xem [mốc CAL-01](../../implementation/2026-10-22-study-calendar.md). Thiết kế CAL-02 chốt ở [mục riêng](#cal-02--lặp-lại-kéo-thả-phím-tắt), kết quả ở [mốc CAL-02](../../implementation/2026-10-22-calendar-repeat-drag.md). CAL-03 chốt ở [mục riêng](#cal-03--nhắc-trước-giờ-học), kết quả ở [mốc CAL-03](../../implementation/2026-10-23-calendar-reminders.md); Phần "Cần xem lại" của CAL-04 (gọi là CAL-04a) ở [mốc CAL-04a](../../implementation/2026-10-25-calendar-review-later.md); hạn danh sách đọc (CAL-04b) ở [mốc CAL-04b](../../implementation/2026-10-28-reading-list-deadlines.md); CAL-05 làm phần tải file `.ics` một lần ở [mốc CAL-05](../../implementation/2026-10-31-calendar-ics-export.md); link đăng ký vẫn chờ HTTPS. Mọi phần còn lại phía web (lặp mở rộng, nhiều lời nhắc, hạn có giờ, nhập `.ics`…) đã đóng ở [mốc CAL-07](../../implementation/2026-10-31-calendar-complete.md).

## Mục tiêu

Chủ dự án muốn tích hợp lịch vào HUCEScholar để lên lịch học và lập kế hoạch việc cần làm, lấy ý tưởng từ Google Calendar và Notion Calendar rồi làm hoàn thiện hơn. Lịch phải nối vào vòng học tập của sản phẩm: **tìm tài liệu → đọc → ghi lại → quay lại ôn tập**. Một buổi học trong lịch nên mở thẳng đúng tài liệu/trang, giống nguyên tắc "mỗi điều đã học luôn quay lại được đúng nguồn" ở roadmap.

## Ý tưởng lấy từ hai sản phẩm tham chiếu

| Lấy từ          | Ý tưởng                                                                      | Áp dụng                                                         |
| --------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Google Calendar | Ba chế độ Tuần / Tháng / Lịch biểu; nút Hôm nay và mũi tên                   | CAL-01                                                          |
| Google Calendar | Lưới giờ, sự kiện xếp theo độ dài, trùng giờ thì chia cột, vạch giờ hiện tại | CAL-01                                                          |
| Google Calendar | Tasks có hạn hiện cùng sự kiện, tick hoàn thành ngay trên lịch               | CAL-01                                                          |
| Notion Calendar | Ô nhập nhanh việc chưa có ngày (inbox), xếp lên lịch sau                     | CAL-01 (thêm nhanh), CAL-02 (kéo thả lên lịch)                  |
| Notion Calendar | Sự kiện gắn với trang/tài liệu                                               | CAL-01: gắn phiên bản học liệu + số trang, mở reader đúng trang |
| Notion Calendar | Phím tắt (T: hôm nay, W/M: chế độ, mũi tên)                                  | CAL-02                                                          |
| Cả hai          | Lặp lại hằng tuần, nhắc trước giờ học                                        | CAL-02 lặp, CAL-03 nhắc                                         |
| Cả hai          | Đồng bộ lịch ngoài                                                           | CAL-05, xem điều kiện                                           |

Phần "hoàn thiện hơn" riêng cho người học: lên lịch đọc từ reader, buổi học mở thẳng đúng trang, CAL-04 đưa hạn của danh sách đọc (COURSE-01) và mục "Cần xem lại" (LEARN-02) vào lịch.

## Quyết định mặc định đã chốt

Chủ dự án muốn tiếp tục bằng lựa chọn khuyến nghị và ghi lại; các quyết định dưới đây đổi được ở các lát sau.

- **Lịch riêng tư từng người**, như ghi chú. Admin không xem hay sửa lịch người khác. Không có lịch chung của lớp trong CAL-01 vì sản phẩm chưa có danh sách lớp (roadmap: không tự tạo hệ quyền lớp).
- **Không đồng bộ Google Calendar trong CAL-01.** Đồng bộ hai chiều cần OAuth với dịch vụ ngoài và gửi dữ liệu học tập ra ngoài, nên cần đồng ý riêng.
- **Múi giờ:** lưu `timestamptz` (UTC). Trình duyệt hiển thị theo giờ máy; mặc định của người dùng HUCE là Asia/Ho_Chi_Minh. Sự kiện cả ngày lưu mốc nửa đêm theo giờ máy lúc tạo. Đổi múi giờ máy có thể làm sự kiện cả ngày lệch ngày; ghi nhận là giới hạn đã biết.
- **Tuần bắt đầu thứ Hai**, nhãn tiếng Việt (Th 2 … CN).
- **Hai loại mục:**
  - _Lịch học_ (`EVENT`): có giờ bắt đầu/kết thúc hoặc cả ngày, tối đa 14 ngày
  - _Việc cần làm_ (`TASK`): có hạn hoặc chưa có ngày; tick hoàn thành
- **Gắn học liệu:** chỉ chọn phiên bản đang đọc được, kiểm lại ở API. Khi tài liệu mất quyền đọc, mục lịch vẫn còn nhưng link ẩn và ghi "Tài liệu không còn khả dụng", không lộ tiêu đề.

## Lộ trình

| Mã         | Phạm vi                                                                                                                                           | Phụ thuộc                      |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| **CAL-01** | Bảng `calendar_items`; API CRUD có revision; Tuần/Tháng/Lịch biểu; panel việc cần làm và thêm nhanh; gắn học liệu/trang; "Lên lịch đọc" từ reader | —                              |
| **CAL-02** | Lặp lại hằng tuần (tập con RRULE: theo thứ, đến ngày); kéo thả đổi giờ và kéo việc chưa có ngày lên lịch; phím tắt                                | CAL-01                         |
| **CAL-03** | Nhắc trước giờ học bằng thông báo trong ứng dụng (NOTIFY-01); email tùy chọn qua mailer AUTH-03                                                   | CAL-01, worker hẹn giờ         |
| CAL-04     | **04a (đã làm):** mục "Cần xem lại" trong lịch, tạo buổi ôn từ mục đó. **04b (đã làm):** hạn danh sách đọc                                 | CAL-01, COURSE-01, LEARN-02    |
| CAL-05     | **Tải `.ics` (đã làm).** Link đăng ký riêng (token, thu hồi được) để xem trong Google Calendar: chưa làm                                                            | Đồng ý chia sẻ ra ngoài; HTTPS |

## CAL-02 — lặp lại, kéo thả, phím tắt

Chủ dự án chọn làm CAL-02 theo lựa chọn khuyến nghị. Các quyết định dưới đây đổi được ở lát sau.

### Lặp lại hằng tuần

- **Chỉ lịch học (`EVENT`) mới lặp.** Việc cần làm không lặp trong CAL-02.
- Tập con RRULE: `FREQ=WEEKLY`, mỗi tuần, chọn một hoặc nhiều thứ, **bắt buộc có "đến ngày"**, tối đa 366 ngày sau ngày bắt đầu (một năm học). Không có "mỗi 2 tuần", "sau N lần" hay lặp theo tháng.
- Ngày bắt đầu phải thuộc các thứ đã chọn, để buổi đầu luôn là buổi đầu của chuỗi. Form tự đánh dấu thứ của ngày bắt đầu.
- **Thứ và "đến ngày" tính theo độ lệch giờ của máy lúc lưu** (`utcOffset`, phút). Các buổi cách buổi đầu đúng bội số 24 giờ. Việt Nam không đổi giờ mùa hè nên giờ học không lệch; ở vùng có giờ mùa hè, buổi sau mốc đổi giờ lệch 1 giờ. Đây là giới hạn đã biết, cùng loại với giới hạn của sự kiện cả ngày.
- API trả **từng buổi** trong khoảng xem. Mỗi buổi giữ `id` của chuỗi và có thêm:
  - `occurrenceStart`: giờ bắt đầu gốc của buổi
  - `repeat`: thứ, đến ngày, giờ bắt đầu/kết thúc của buổi đầu
- Mục không lặp có `repeat: null`, `occurrenceStart: null`.

### Sửa và xóa một buổi trong chuỗi

Mở một buổi của chuỗi, form hỏi **Áp dụng cho**:

- **Chỉ buổi này** (mặc định):
  - Lưu sẽ **tách** buổi đó thành một mục riêng không lặp. Cùng một transaction, API đánh dấu bỏ buổi gốc và tạo mục mới.
  - Xóa chỉ **bỏ** buổi đó.
- **Cả chuỗi:** form hiện ngày giờ của buổi đầu. Lưu sửa cả chuỗi; xóa xóa cả chuỗi.
  - Nếu đổi giờ, thứ hoặc "đến ngày", danh sách buổi đã bỏ bị xóa vì có thể không còn khớp.
  - Buổi đã tách vẫn là mục riêng, không bị ảnh hưởng.

Không có kiểu "buổi này và các buổi sau". Muốn dừng chuỗi từ một ngày thì sửa "đến ngày" của cả chuỗi.

### Kéo thả

- **Chỉ làm cho bản web dùng chuột hoặc bàn di**, theo quyết định của chủ dự án: làm xong bản web trước. Kéo thả trên màn hình cảm ứng không nằm trong CAL-02. Form sửa vẫn làm được mọi việc bằng bàn phím.
- **Lịch học trên lưới giờ:**
  - kéo sang giờ hoặc ngày khác, giữ thời lượng, bước 15 phút
  - thả vào dải "Cả ngày" hoặc ô của chế độ Tháng: giữ giờ, đổi ngày
  - lịch cả ngày thả vào lưới giờ thành lịch học 1 giờ
- **Việc cần làm** (từ panel hoặc trên lịch):
  - thả vào lưới giờ: hạn đúng giờ đó
  - thả vào dải "Cả ngày" hoặc ô tháng: đổi ngày, giữ giờ hạn nếu có, còn không thì hạn cả ngày
  - việc chưa có ngày kéo lên lịch như vậy
- Kéo một buổi của chuỗi chỉ dời buổi đó (tách), như "Chỉ buổi này".
- **Kéo cạnh dưới** của lịch học trên lưới giờ để đổi giờ kết thúc (bước 15 phút, ít nhất 15 phút, tối đa 14 ngày). Với lịch qua đêm, chỉ khúc chứa giờ kết thúc mới có cạnh kéo.
- **Kéo việc có hạn từ lịch về panel** "Việc cần làm" để bỏ ngày. Kéo trong panel rồi thả lại panel thì không đổi gì.

### Phím tắt

| Phím           | Tác dụng                    |
| -------------- | --------------------------- |
| `T`            | Hôm nay                     |
| `W`, `M`, `A`  | Tuần, Tháng, Lịch biểu      |
| `←`, `→`       | Khoảng trước, khoảng sau    |
| `N`            | Thêm lịch học               |

Phím tắt:

- bị bỏ qua khi đang gõ trong ô nhập hoặc trong form, và khi giữ Ctrl/Alt/⌘
- được khai báo bằng `aria-keyshortcuts` trên nút tương ứng, và ghi dưới thanh công cụ

### API bổ sung

| Endpoint                              | Ghi chú                                                                                                       |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `POST`/`PATCH /calendar/items`        | Thêm `repeat: { weekdays: [1–7], until: "YYYY-MM-DD", utcOffset } \| null`; thiếu là `null`. 1 = thứ Hai      |
| `POST /calendar/items/:id/skip`       | `{ revision, occurrenceStart }` → 204. Buổi phải có thật trong chuỗi; bỏ lại buổi đã bỏ là không đổi gì       |
| `POST /calendar/items/:id/detach`     | `{ revision, occurrenceStart, requestId, …trường như POST, repeat: null }` → 201 mục mới; `keepSource` như PATCH |

Bỏ buổi và tách buổi đều tăng `revision` của chuỗi.

Schema:

- `calendar_items` thêm `repeat_days` (bitmask 7 bit), `repeat_until` (ngày), `repeat_utc_offset` (phút)
- CHECK: đủ cả ba hoặc không có; chỉ `EVENT`; ngày bắt đầu thuộc thứ đã chọn; "đến ngày" trong 366 ngày
- partial index cho chuỗi lặp
- bảng `calendar_item_skips` (khóa chính mục + giờ buổi, FK CASCADE)

## Hợp đồng API của CAL-01

Tất cả cần phiên đăng nhập; ghi cần CSRF (guard toàn cục). Chỉ chủ đọc/ghi; id của người khác trả 404.

| Endpoint                         | Ghi chú                                                                               |
| -------------------------------- | ------------------------------------------------------------------------------------- |
| `GET /calendar/items?from&to`    | Mục có giờ giao với khoảng [from, to), khoảng ≤ 62 ngày, tối đa 500 mục (`truncated`) |
| `GET /calendar/tasks?page&limit` | Việc chưa xong: quá hạn và có hạn trước, chưa có ngày sau cùng                        |
| `POST /calendar/items`           | `requestId` chống tạo đôi khi gửi lại                                                 |
| `PATCH /calendar/items/:id`      | Thay toàn bộ trường, có `revision`; xung đột → 409 `CALENDAR_CONFLICT`; `keepSource: true` giữ liên kết đang lưu (kể cả liên kết đã ẩn)                |
| `PUT /calendar/items/:id/done`   | `{ done }` đặt giá trị, không tăng revision (như LEARN-02)                            |
| `DELETE /calendar/items/:id`     | Có `revision`                                                                         |

Ràng buộc nằm cả trong DTO lẫn CHECK của PostgreSQL:

- tiêu đề 1–200 ký tự, ghi chú ≤ 2000
- EVENT bắt buộc có giờ bắt đầu và kết thúc, kết thúc sau bắt đầu, kéo dài ≤ 14 ngày
- TASK không có giờ kết thúc; chỉ TASK mới có `done_at`
- phiên bản và số trang đi cùng nhau; trang ≥ 1 và không quá số trang của phiên bản
- màu thuộc bảng 6 màu

## CAL-03 — nhắc trước giờ học

Chọn theo lựa chọn khuyến nghị; đổi được ở lát sau.

- **Một lời nhắc mỗi mục**, chọn trong 0/5/10/15/30/60/120/1440 phút. Chỉ mục có ngày và giờ (không phải cả ngày) mới nhắc được, vì máy chủ không biết múi giờ của mục đơn.
- **Thông báo trong ứng dụng là mặc định; email bật riêng từng mục.** Thư chỉ có tiêu đề và giờ tương đối, không có ghi chú.
- **Worker PDF quét mỗi 60 giây**, cửa sổ nhìn lại 10 phút. Lâu hơn thì bỏ lời nhắc, không gửi muộn. `event_key` theo mục và giờ bắt đầu, nên mỗi buổi chỉ được nhắc một lần.
- Lời nhắc trỏ tới mục lịch, không tới tài liệu: `notifications` có `calendar_item_id` và `event_at`, CHECK `ck_notification_target` tách hai dạng.

## Ngoài phạm vi CAL-01 đến CAL-03

Nhiều lời nhắc cho một mục, chia sẻ/mời người khác, lịch lớp do giảng viên công bố, đồng bộ hoặc xuất ra lịch ngoài, nhiều lịch con. Không cache lịch trong service worker (AGENTS.md).
