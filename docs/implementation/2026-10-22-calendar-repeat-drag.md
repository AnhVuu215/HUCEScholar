# CAL-02 — Lặp lại hằng tuần, kéo thả, phím tắt

Ngày 22/10/2026. Nhánh `codex/cal-02-recurrence-drag`, xây trên `main` sau PR #32 (sửa giao diện CAL-01).

Thiết kế và các quyết định mặc định ở [đặc tả, mục CAL-02](../superpowers/specs/2026-10-22-study-calendar.md#cal-02--lặp-lại-kéo-thả-phím-tắt). Tóm tắt:

- chỉ lịch học mới lặp: hằng tuần, theo thứ, có "đến ngày", tối đa 366 ngày
- thứ và ngày tính theo độ lệch giờ của máy lúc lưu
- sửa hoặc xóa một buổi: chọn "Chỉ buổi này" (tách hoặc bỏ buổi) hay "Cả chuỗi"
- kéo thả chỉ cho bản web dùng chuột (chủ dự án chốt làm xong bản web trước); phím tắt T/W/M/A/←/→/N

## Hành vi

**Form lịch học:**

- Có ô **Lặp lại hằng tuần**. Bật lên sẽ hiện:
  - nhóm **Lặp vào** (Th 2 … CN); thứ của ngày bắt đầu luôn được chọn và không bỏ được
  - **Lặp đến ngày**, mặc định 15 tuần (khoảng một học kỳ)
- Đổi ngày bắt đầu sẽ tự thêm thứ mới vào nhóm Lặp vào.
- Mở một buổi của chuỗi, form có **Áp dụng cho**:
  - **Chỉ buổi này** (mặc định): không hiện phần lặp. Lưu sẽ tách buổi thành mục riêng; nút **Xóa buổi này** chỉ bỏ buổi đó.
  - **Cả chuỗi**: form chuyển sang ngày giờ của buổi đầu. Nút **Xóa cả chuỗi**.
- Câu xác nhận xóa nói rõ đang xóa một buổi hay cả chuỗi.

**Trên lịch:**

- **Chế độ Tuần:** buổi lặp có dấu ↻ ở đầu tên. `title` của khối ghi "Lặp hằng tuần: Th 2, Th 4 · đến …".
- **Lịch biểu:** dòng "Lặp hằng tuần …" dưới giờ.
- **Kéo thả:**
  - **lịch học có giờ**:
    - kéo trên lưới giờ sang giờ hoặc ngày khác, giữ thời lượng, bước 15 phút
    - tính cả chỗ chuột đang giữ trong khối: giữ giữa khối thì giữa khối rơi vào chỗ thả
  - thả vào dải "Cả ngày" hoặc ô tháng: giữ giờ, đổi ngày
  - **lịch cả ngày** thả vào lưới giờ thành lịch học 1 giờ
  - **việc cần làm**:
    - từ panel hoặc trên lịch, kể cả việc chưa có ngày
    - thả vào lưới giờ: hạn đúng giờ đó
    - thả vào dải hoặc ô tháng: giữ giờ hạn, hoặc thành hạn cả ngày nếu chưa có giờ
  - **kéo cạnh dưới** khối lịch học để đổi giờ kết thúc, giữ giờ bắt đầu; thông báo "Đã đổi giờ: …"
  - **kéo việc có hạn từ lịch về panel** Việc cần làm để bỏ ngày; thông báo "Đã bỏ ngày: …". Việc kéo từ chính panel thả lại panel thì không đổi gì
  - kéo một buổi của chuỗi (dời hoặc đổi thời lượng) chỉ đổi buổi đó; thông báo kèm "(chỉ buổi này)"
  - vùng thả có viền nét đứt
- **Phím tắt:** T, W, M, A, ←, →, N.
  - Không chạy khi đang gõ hoặc focus trong form, và khi giữ Ctrl/Alt/⌘.
  - Các nút tương ứng có `aria-keyshortcuts`.
  - Dòng hướng dẫn nằm dưới thanh công cụ.

Sau mỗi thao tác, trang tải lại khoảng đang xem như CAL-01; chưa có cập nhật lạc quan cho kéo thả.

## API và schema

Hợp đồng ở đặc tả.

- `POST`/`PATCH /calendar/items` nhận `repeat` (thiếu là `null`).
- `GET /calendar/items` trả từng buổi, kèm `repeat` và `occurrenceStart`. Giới hạn 500 mục tính sau khi đã tách thành buổi.
- Endpoint mới:
  - `POST /calendar/items/:id/skip` → 204
  - `POST /calendar/items/:id/detach` → 201
  - Cả hai kiểm `revision` và tăng `revision` của chuỗi.
  - Tách buổi dùng `requestId` như tạo mới. Gửi lại cùng yêu cầu thì trả đúng mục đã tạo, không tách lần hai.
- Sửa cả chuỗi mà đổi giờ, thứ hoặc "đến ngày" thì xóa danh sách buổi đã bỏ. Đổi tên, màu hay ghi chú thì giữ nguyên.
- Phần tính buổi là hàm thuần trong `apps/api/src/calendar/calendar-repeat.ts`, có unit test riêng.

Migration `202610230001_calendar_repeat` (SQL thuần):

- `calendar_items` thêm `repeat_days` (bitmask, bit 0 = thứ Hai), `repeat_until` (`date`), `repeat_utc_offset` (phút)
- CHECK `ck_calendar_repeat_shape`: đủ ba cột hoặc không có cột nào; chỉ `EVENT`; miền giá trị
- CHECK `ck_calendar_repeat_start`: thứ của buổi đầu nằm trong bitmask; "đến ngày" từ ngày buổi đầu tới +366 ngày
- partial index `ix_calendar_series (user_id, repeat_until) WHERE repeat_days IS NOT NULL`
- bảng `calendar_item_skips (item_id, occurrence_start)`, khóa chính hai cột, FK tới `calendar_items` ON DELETE CASCADE

Test schema: 33 bảng, 66 FK, 103 CHECK, 12 partial index.

## Kiểm chứng

Chạy trên máy local (Windows, Node 24.19, PostgreSQL/Redis trong Docker), theo thứ tự như CI. Đây là bằng chứng local, chưa phải CI hay thiết bị thật.

- `pnpm format:check` và `pnpm check` (lint, typecheck, 114 unit test API, build): đạt. Integration chạy trước lượt kéo đổi thời lượng; lượt đó chỉ sửa web và test e2e, không đổi API. Unit test mới `calendar-repeat.spec.ts` (7 ca):
  - bitmask
  - ngày không có thật
  - thứ theo độ lệch giờ chứ không theo UTC
  - danh sách buổi tính cả "đến ngày"
  - buổi giao với khoảng xem, bỏ buổi đã bỏ
  - nhận đúng giờ của buổi
  - giới hạn 366 ngày
- `pnpm test:integration`: 215 đạt, 1 bỏ qua (có sẵn từ trước). Hai ca CAL-02 trong `materials.integration.spec.ts`:
  - Chuỗi thứ Hai + thứ Tư:
    - trả đúng 6 buổi, kể cả khi khoảng xem bắt đầu giữa chuỗi
    - tài khoản khác không thấy gì
    - 12 kiểu `repeat` sai → 400
    - 06:30 thứ Hai giờ Hà Nội (23:30 Chủ nhật UTC) được tính là thứ Hai
    - đúng 366 ngày nhận, 367 ngày từ chối
    - hai CHECK chặn ghi thẳng vào DB
  - Bỏ buổi:
    - bỏ lại buổi đã bỏ không đổi gì
    - buổi không có thật → 400
    - `revision` cũ → 409
    - người khác → 404
    - mục không lặp → 400
  - Tách buổi:
    - tạo mục riêng, bỏ buổi gốc
    - gửi lại cùng `requestId` trả đúng mục cũ
    - tách kèm `repeat` hoặc buổi không có thật → 400
    - tách buổi đã bỏ → 409
  - Sửa và xóa cả chuỗi:
    - đổi tên giữ buổi đã bỏ; đổi "đến ngày" xóa chúng
    - buổi đã tách vẫn còn
    - xóa chuỗi thì xóa luôn buổi đã bỏ
  - Ca schema: 33 bảng, 66 FK, 103 CHECK, 12 partial index.
- `pnpm test:e2e`: lượt cuối (đã có kéo đổi thời lượng và kéo về panel) 171 đạt, 8 bỏ qua, không lỗi. Lượt trước có 1 lỗi ở `upload-03` (`page.goto … ERR_ABORTED` khi `next dev` đang biên dịch), chạy lại riêng thì đạt. Ca mới `tests/cal-02.spec.ts`:
  - tạo chuỗi thứ Hai + thứ Tư qua form; thứ Hai được chọn sẵn và không bỏ được
  - phím → sang tuần sau
  - đổi tên riêng buổi thứ Tư; xóa riêng buổi thứ Hai
  - kéo buổi đã tách sang thứ Năm 9:30, giữ ở giữa khối → bắt đầu 9:00
  - kéo cạnh dưới buổi đó tới 11:00 → 9:00–11:00
  - kéo việc chưa có ngày vào thứ Sáu 10:00 → hạn 10:00; kéo chip của việc đó từ dải "Cả ngày" về panel → "Chưa có ngày"
  - gõ "m" trong ô thêm nhanh không đổi chế độ xem
  - "Cả chuỗi" hiện ngày của buổi đầu và xóa cả chuỗi
  - phím M/A/W/T
  - không tràn ngang ở 1440/390/320px
- `tests/cal-01.spec.ts` vẫn đạt.

Chưa xem bằng mắt trên trình duyệt thật ngoài các ca e2e. Chưa thử trên Safari; thiết bị cảm ứng ngoài phạm vi.

Test e2e dọn lịch của tài khoản `cal2` trước khi chạy, và đặt viewport cao 1000px để điểm thả 11:00 nằm trong màn hình. Ở viewport 720px, chuột sẽ thả ra ngoài vùng lịch. Lần chạy đầu không có bước dọn đã fail vì khối của lần trước nằm chồng lên. Chạy riêng đã xác nhận kéo thả vẫn đúng khi các khối trùng giờ hoặc khi thả lên khối khác. `cal-01` và `cal-02` chạy hai lần liên tiếp đều đạt.

## Chưa làm

- Kéo thả trên màn hình cảm ứng: ngoài phạm vi, vì chủ dự án chốt làm xong bản web trước. Bằng bàn phím thì dùng form sửa.
- Kiểu lặp khác: mỗi N tuần, sau N lần, theo tháng; "buổi này và các buổi sau".
- Lặp cho việc cần làm.
- Ở vùng có giờ mùa hè, buổi sau mốc đổi giờ lệch 1 giờ (giới hạn đã ghi trong đặc tả; Việt Nam không bị).
- Nhắc trước giờ học (CAL-03), hạn danh sách đọc trong lịch (CAL-04), xuất `.ics` (CAL-05) đã có ở [mốc CAL-05](2026-10-31-calendar-ics-export.md).
