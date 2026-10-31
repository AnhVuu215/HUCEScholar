# CAL-04b — Hạn danh sách đọc trên lịch học

Ngày 28/10/2026. Nhánh `codex/cal-04b-reading-list-deadlines`, xây trên `main` sau PR #51.

[Mốc CAL-04a](2026-10-25-calendar-review-later.md) để lại câu hỏi: ai thấy hạn của môn nào, khi sản phẩm chưa có danh sách lớp hay đăng ký môn. Lượt này chốt theo phương án khuyến nghị (đổi được ở API):

- **Hạn là một ngày**, không có giờ (`date`), đặt cho **từng mục** của danh sách đọc. Không bắt buộc. Ngày theo lịch nên không lệch theo múi giờ máy như sự kiện cả ngày của CAL-01.
- **Người đọc tự chọn theo dõi môn.** Trên trang "Danh sách đọc", mỗi môn có ô "Hiện hạn đọc của môn này trên Lịch học". Lựa chọn riêng của từng người, không phải đăng ký môn, không ai khác thấy, và không mở thêm quyền đọc nào.
- **Hạn chỉ để xem.** Hạn hiện trên lịch như một mục chỉ đọc, không tick, không kéo thả, không nhắc. Người đọc muốn nhắc thì tự tạo lịch học hoặc việc của mình.
- Hạn chỉ hiện khi mục **còn đọc được** (cùng điều kiện `available()` của kho) và danh sách **đang hiện với người đọc** (đã công bố, giảng viên còn hoạt động và còn được phân công môn, môn và khoa còn hoạt động). Tài liệu bị ẩn thì hạn biến mất mà không lộ tiêu đề; hiện lại thì hạn quay lại.

## Hành vi

- **Giảng viên** (Soạn danh sách đọc): mỗi mục có thêm ô "Hạn đọc (không bắt buộc)". Xóa ô là bỏ hạn.
- **Người đọc** (Danh sách đọc): mục có hạn hiện "Hạn đọc: d/m/yyyy". Ô theo dõi đổi ngay khi bấm; lưu lỗi thì trả lại trạng thái cũ và báo lỗi. Kèm link "Mở Lịch học".
- **Lịch học**:
  - Tuần: hạn nằm ở dải "Cả ngày" của đúng ngày.
  - Tháng: hạn đứng trước các mục khác trong ô ngày và tính chung vào giới hạn 3 mục, phần còn lại vào "+n mục nữa".
  - Lịch biểu: "Hạn đọc: <tài liệu>", dòng "<mã môn> · <tên danh sách> · <tuần/chủ đề>" và link "Xem danh sách đọc".
  - Mục hạn có viền nét đứt đỏ, bấm vào mở trang tài liệu đúng phiên bản giảng viên chọn.
  - Hạn tải riêng với lịch: lỗi tải hạn chỉ hiện "Chưa tải được hạn danh sách đọc." kèm "Thử lại", lịch vẫn dùng được.

## API

- `PUT /api/v1/courses/:courseId/reading-lists/mine`: mỗi mục nhận thêm `dueOn: "YYYY-MM-DD" | null`. Thiếu trường thì là `null`, nên client cũ vẫn lưu được (và bỏ hạn). Ngày không có thật hoặc ngoài 2000-01-01…2100-12-31 → 400 `READING_LIST_INVALID`.
- `GET /api/v1/courses/:courseId/reading-lists` và `/mine`: mỗi mục có `dueOn`. Danh sách công bố có thêm `following: boolean` của người đang xem.
- `PUT /api/v1/courses/:courseId/reading-lists/follow` `{ following }` → `{ following }`, qua CSRF. Bật cho môn không tồn tại hoặc ngừng hoạt động → 404. Gọi lại cùng giá trị không đổi gì.
- `GET /api/v1/calendar/reading-deadlines?from=YYYY-MM-DD&to=YYYY-MM-DD` (`to` không tính, tối đa 62 ngày) →

```json
{
  "items": [
    {
      "dueOn": "2026-11-03",
      "listId": "…",
      "listTitle": "…",
      "course": { "id": "…", "code": "…", "name": "…" },
      "position": 1,
      "section": "Tuần 1",
      "versionId": "…",
      "title": "…"
    }
  ],
  "truncated": false
}
```

- Tối đa 500 mục mỗi khoảng. Thứ tự theo ngày, danh sách, vị trí. Tài khoản khóa hoặc chưa xác minh → 403, chưa đăng nhập → 401.

## Schema

Migration `202610280001_reading_list_deadlines` (SQL thuần):

- `reading_list_items.due_on date NULL`, CHECK `ck_reading_item_due` (2000–2100); index một phần `ix_reading_item_due` trên các mục có hạn.
- Bảng `reading_list_follows (user_id, course_id, created_at)`, khóa chính `(user_id, course_id)`, FK tới `users` và `courses` (CASCADE).

Test schema: 34 bảng, 69 FK, 108 CHECK, 16 index một phần.

## Kiểm chứng

Local (Windows, Node 24.19.0, pnpm 11.25.0), database `_test` và Redis DB 15:

- Integration, 1 ca mới trong `materials.integration.spec.ts`:
  - hạn sai (30/2, năm 1999, sai định dạng) → 400; lưu và đọc lại đúng ngày; bỏ trường thì hạn về `null`
  - chưa theo dõi: lịch không có hạn, `following: false`; thiếu CSRF → 403; theo dõi hai lần đều 200
  - có theo dõi: đúng nội dung từng mục; `to` không tính; giảng viên không theo dõi thì không thấy
  - ẩn tài liệu thì hạn biến mất, hiện lại thì quay lại; bỏ công bố hoặc thu hồi phân công thì hạn biến mất
  - khoảng sai (rỗng, quá 62 ngày, ngày không có thật, sai định dạng) → 400; môn không tồn tại → 404; chưa đăng nhập → 401; bỏ theo dõi thì hạn biến mất
- Ca COURSE-01 cũ cập nhật thêm `dueOn: null`.
- Browser, ca mới trong `tests/course-01.spec.ts`: giảng viên đặt hạn và công bố. Sinh viên thấy "Hạn đọc" trong danh sách. Chưa theo dõi thì lịch không có hạn; theo dõi xong thì Lịch biểu và Tháng có hạn, link đúng. 320px và 1440px không tràn ngang. Bấm hạn mở đúng tài liệu; bỏ theo dõi thì hạn biến mất. Lượt đầu tìm ra ô theo dõi chỉ đổi sau khi máy chủ trả lời; đã sửa để đổi ngay.
- `cal-01`, `cal-04` chạy lại: đạt.
- Bộ đầy đủ: `pnpm format:check` và `pnpm check` (lint, typecheck, 126 unit, build) đạt; `pnpm test:integration` 223 đạt, 1 bỏ qua; `pnpm test:e2e --workers=1`: xem mục bộ đầy đủ trong PR.
- Chưa kiểm production, thiết bị thật hay Safari (đang hoãn).

## Chưa làm

- Hạn có giờ, nhắc trước hạn, thông báo khi giảng viên đổi hạn, danh sách môn đang theo dõi ở một chỗ và xuất hạn ra `.ics` đã có ở [CAL-07](2026-10-31-calendar-complete.md).
