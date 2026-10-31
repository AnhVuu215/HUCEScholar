# CAL-04a — "Cần xem lại" trong lịch học

Ngày 25/10/2026. Nhánh `codex/cal-04-review-later`, xây trên `main` sau PR #41.

[Đặc tả lịch học](../superpowers/specs/2026-10-22-study-calendar.md) ghi CAL-04 gồm hai phần: đưa mục "Cần xem lại" (LEARN-02) và hạn của danh sách đọc (COURSE-01) vào lịch. Lượt này chỉ làm phần đầu, gọi là **CAL-04a**. Phần hạn danh sách đọc (CAL-04b) để lát sau, vì mục của danh sách đọc hiện chưa có trường hạn, chỉ có "tuần hoặc chủ đề" dạng chữ.

Đã chốt theo lựa chọn khuyến nghị (đổi được ở API):

- Danh sách chỉ gồm dấu "Cần xem lại" của **chính người dùng**, trên các phiên bản **còn đọc được**. Tài liệu bị ẩn, hết hạn quyền hoặc file không còn SAFE thì mục không hiện, nhưng dấu vẫn được giữ như LEARN-02; tài liệu hiện lại thì mục quay lại.
- Thứ tự: phiên bản mới nhất trước, trong mỗi phiên bản theo trang rồi theo id. Phân trang theo số trang, 12 mục mỗi lần.
- Buổi ôn là một **lịch học thường** (`EVENT`, màu cam) có tiêu đề "Ôn: <tài liệu> (trang N)" và gắn phiên bản/trang. Không nối ngược về ghi chú: bỏ dấu "Cần xem lại" không xóa buổi ôn đã đặt, và sửa hay xóa buổi ôn không đổi dấu.

## Hành vi

- Trang **Lịch học** có thêm khung **Cần xem lại** dưới khung **Việc cần làm** (màn hẹp: dưới lịch). Mỗi mục có:
  - tên tài liệu, "Ghi chú · Trang N" hoặc "Đoạn tô · Trang N"
  - đoạn trích: nội dung ghi chú, hoặc câu đã tô nếu ghi chú trống; tối đa 160 ký tự, trên màn hình cắt còn 3 dòng
  - link **Mở trang N**, mở reader đúng trang
  - nút **Lên lịch ôn**: form ngày, giờ bắt đầu, thời lượng (mặc định ngày mai 19:00, 60 phút). Lưu xong, lịch tải lại và hiện "Đã thêm buổi ôn vào lịch."
- Chưa có mục nào: "Chưa có mục nào. Trong trình đọc, mở sổ ghi chú và chọn “Đánh dấu cần xem lại”."
- Lỗi tải: "Chưa tải được mục cần xem lại." kèm nút **Thử lại**. Còn mục chưa hiện: nút **Xem thêm (n)**.
- Form "Lên lịch ôn" dùng lại component "Lên lịch đọc" của reader (`ScheduleReading`, thêm `purpose="review"`). Id của các ô nay sinh bằng `useId`, vì trên lịch có thể mở nhiều form cùng lúc. Gửi lại khi mạng lỗi vẫn dùng cùng `requestId`, nên không tạo buổi trùng.

## API

`GET /api/v1/personal-library/review-later?page&limit` (cần phiên; `limit` 1–100, mặc định 12):

```json
{
  "items": [
    {
      "id": "…",
      "versionId": "…",
      "pageNumber": 2,
      "kind": "TEXT_HIGHLIGHT",
      "excerpt": "…",
      "color": "#A5D6A7",
      "material": { "…": "như các danh sách khác của thư viện cá nhân" }
    }
  ],
  "total": 3,
  "page": 1,
  "limit": 12
}
```

- `color` chỉ có với đoạn tô. Không trả `anchor`, `revision` hay toàn bộ nội dung ghi chú.
- Tài khoản bị khóa hoặc chưa xác minh: 403, như "Đã lưu" và "Đọc gần đây".
- Lọc quyền đọc bằng cùng điều kiện `available()` của kho học liệu, ngay trong truy vấn, nên `total` khớp với các trang.
- Không đổi schema: dùng partial index `ix_annotation_review_later` sẵn có.

## Kiểm chứng

Local (Windows, Node 24.19.0, pnpm 11.25.0), database `_test` và Redis DB 15:

- Integration, 1 ca mới trong `materials.integration.spec.ts`:
  - ghi chú và đoạn tô đã đánh dấu ở hai tài liệu hiện đúng thứ tự; mục chưa đánh dấu không hiện
  - đoạn trích: câu đã tô khi ghi chú trống; gộp khoảng trắng; cắt 160 ký tự có "…"
  - người khác và admin không thấy; chưa đăng nhập 401; `limit`/`page` sai 400
  - ẩn tài liệu thì mục biến mất, hiện lại thì quay lại; bỏ dấu thì mục biến mất
- Browser `tests/cal-04.spec.ts` (tài khoản riêng `cal4`): mục hiện trên lịch với tên tài liệu, trang và link đúng; đặt buổi ôn, buổi hiện trong Lịch biểu với tiêu đề "Ôn: … (trang 2)", màu cam, link về trang 2; 320px và 1440px không tràn ngang; bỏ dấu thì mục rời khung nhưng buổi ôn vẫn còn.
- `cal-01` (dùng chung `ScheduleReading`) và `learn-02` chạy lại: đạt.
- Bộ đầy đủ: `pnpm format:check` và `pnpm check` (lint, typecheck, 124 unit, build) đạt; `pnpm test:integration` 220 đạt, 1 bỏ qua; `pnpm test:e2e --workers=1` 180 đạt, 8 bỏ qua (7,2 phút).
- Chưa kiểm trên điện thoại thật hay Safari (đang hoãn).

## Chưa làm

- **CAL-04b:** hạn cho từng mục danh sách đọc và hiện hạn đó trong lịch. Cần chốt trước: ai thấy hạn của môn nào, khi sản phẩm chưa có danh sách lớp hay đăng ký môn.
- Lên lịch ôn trong sổ ghi chú của reader và lọc khung theo môn/tài liệu: đã có ở [hoàn thiện "Cần xem lại"](2026-10-31-review-later-complete.md).
