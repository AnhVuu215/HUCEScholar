# CAL — Lịch học và việc cần làm

Trạng thái: thiết kế ngày 22/10/2026. CAL-01 đã triển khai trên nhánh `codex/cal-01-personal-calendar`, xem [mốc CAL-01](../../implementation/2026-10-22-study-calendar.md); CAL-02 trở đi là đề xuất, chưa làm.

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
| CAL-02     | Lặp lại hằng tuần (tập con RRULE: theo thứ, đến ngày); kéo thả đổi giờ và kéo việc chưa có ngày lên lịch; phím tắt                                | CAL-01                         |
| CAL-03     | Nhắc trước giờ học bằng thông báo trong ứng dụng (NOTIFY-01); email tùy chọn qua mailer AUTH-03                                                   | CAL-01, worker hẹn giờ         |
| CAL-04     | Hiện hạn danh sách đọc và mục "Cần xem lại" trong lịch; tạo buổi ôn từ mục "Cần xem lại"                                                          | CAL-01, COURSE-01, LEARN-02    |
| CAL-05     | Xuất `.ics` hoặc link đăng ký riêng (token, thu hồi được) để xem trong Google Calendar                                                            | Đồng ý chia sẻ ra ngoài; HTTPS |

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

## Ngoài phạm vi CAL-01

Lặp lại, nhắc, kéo thả, chia sẻ/mời người khác, lịch lớp do giảng viên công bố, đồng bộ hoặc xuất ra lịch ngoài, nhiều lịch con. Không cache lịch trong service worker (AGENTS.md).
