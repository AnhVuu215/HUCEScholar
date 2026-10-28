# COURSE-01 — Danh sách đọc theo môn

Ngày 21/10/2026. Nhánh `codex/course-01-reading-lists`, xây trên `main` sau PR #23.

## Mô hình đã chốt

Roadmap ghi mục này cần xác nhận mô hình trước. Chủ dự án bảo triển khai theo phương án đề xuất, nên lượt này chốt như sau. Mỗi điểm có thể đổi lại ở API:

- **Chủ danh sách:** mỗi giảng viên có **một danh sách riêng cho mỗi môn** đang được phân công (`UNIQUE (course_id, owner_id)`). Môn có nhiều giảng viên thì có nhiều danh sách, mỗi danh sách ghi tên người soạn. Không ai sửa được danh sách của người khác.
- **Phiên bản:** mỗi mục giữ **đúng phiên bản giảng viên chọn**. Khi tài liệu có bản hiện hành mới hơn mà người xem đọc được, mục hiện "Đã có bản mới hơn" kèm link, nhưng không tự đổi.
- **Người xem:** ai đăng nhập và đọc được kho đều xem được danh sách **đã công bố** của môn đang hoạt động. Không tạo hệ quyền lớp hay đăng ký môn mới.

## Hành vi

- Giảng viên vào "Soạn danh sách đọc" và chọn môn được phân công. Trong đó có thể:
  - đặt tên danh sách
  - tìm tài liệu **đã công bố của chính môn đó** để thêm
  - ghi "tuần hoặc chủ đề" và ghi chú ngắn cho từng mục; sắp lại bằng nút Lên/Xuống, bỏ mục
  - lưu dạng nháp, hoặc bật "công bố"
- Lưu là thay **toàn bộ** danh sách trong một transaction, có kiểm `revision` (0 khi tạo mới). Lưu trùng lượt nhận `409 STALE_REVISION`. Tối đa 100 mục, không trùng phiên bản.
- API chỉ nhận phiên bản thuộc môn và người đọc của môn đang đọc được: APPROVED, file SAFE, tài liệu VISIBLE, còn hạn quyền. Nếu không thì trả `409 ITEM_UNAVAILABLE`.
- Người đọc vào "Danh sách đọc" (mục mới trong nhóm Học tập) và chọn môn; môn được giữ trong `?courseId=`. Trang hiện các danh sách đã công bố, mục nhóm theo tuần/chủ đề, link mở đúng phiên bản.
- Tài liệu sau đó bị ẩn hoặc không còn an toàn: mục vẫn nằm trong danh sách nhưng hiện "không còn khả dụng", **không lộ tiêu đề hay tác giả**. Áp dụng cho cả giảng viên soạn.
- Giảng viên bị thu hồi phân công: danh sách thôi hiện với người đọc nhưng không bị xóa. Giảng viên không mở lại được cho tới khi được phân công lại.
- Mỗi lần lưu ghi `audit_events` (`READING_LIST_CREATED` / `READING_LIST_UPDATED`), không chép nội dung.

## API

- `GET /api/v1/courses/:courseId/reading-lists`: danh sách đã công bố của môn, cho mọi người dùng đang hoạt động.
- `GET /api/v1/courses/:courseId/reading-lists/mine`: danh sách của chính giảng viên (cả bản nháp), hoặc `{ item: null }`.
- `PUT /api/v1/courses/:courseId/reading-lists/mine`: `{ title, published, revision, items: [{ section, versionId, note }] }`, qua CSRF.

## Schema

Migration `202610210003_reading_lists` (SQL thuần):

- `reading_lists`: CHECK tiêu đề không rỗng và miền `revision`; UNIQUE theo môn + người soạn; index một phần cho danh sách đã công bố.
- `reading_list_items`: khóa `(list_id, position)`, `position` 1–100, FK tới phiên bản (RESTRICT), index theo phiên bản.

Test schema: 29 bảng, 60 FK, 85 CHECK, 10 index một phần.

## Kiểm chứng

Local (Windows, Node 24.19.0, pnpm 11.25.0), database `_test` và Redis DB 15:

- Integration, 1 ca mới:
  - sinh viên 403; giảng viên không được phân công nhận `ASSIGNMENT_REQUIRED`; thiếu CSRF 403
  - tạo bản nháp, người đọc chưa thấy; lưu bằng revision cũ → `STALE_REVISION`
  - công bố, người đọc thấy đúng thứ tự, phần, ghi chú, phiên bản
  - trùng mục → `DUPLICATE_ITEM`; bản nháp chưa duyệt → `ITEM_UNAVAILABLE`
  - ẩn tài liệu → mục còn nhưng `material: null`
  - thu hồi phân công → danh sách biến mất với người đọc; phân công lại thì hiện lại
- Browser `tests/course-01.spec.ts`: admin tạo môn và phân công; hai tài liệu được duyệt. Giảng viên tìm, thêm, sắp lại, ghi tuần và ghi chú, lưu nháp rồi công bố. Sinh viên thấy hai tuần theo đúng thứ tự và mở đúng phiên bản; 320px không tràn ngang.
- `workspace-ui.spec.ts`: số link điều hướng nay là admin 9, giảng viên 6, sinh viên 4.
- Gợi ý "bản mới hơn" mới kiểm qua đọc code, chưa có ca test tạo bản kế tiếp.
- Bộ đầy đủ:
  - `pnpm format:check`, `pnpm check` (lint, typecheck, 104 unit, build): đạt.
  - `pnpm test:integration`: 200 passed, 1 skipped.
  - `pnpm test:e2e --workers=1`: 165 passed, 8 skipped (7,2 phút; 2 ca bỏ qua là PERF-01 tùy chọn).
- Chưa kiểm trên điện thoại thật hay Safari.

## Chưa làm

- Kéo thả để sắp xếp, sao chép danh sách từ học kỳ trước, nhiều danh sách mỗi môn.
- Đánh dấu đã đọc từng mục đã có ở [COURSE-02](2026-10-28-reading-marks.md). Chưa nối với "Học tiếp" ở trang đầu.
- Thông báo cho người đọc khi danh sách đổi (NOTIFY-01 chưa có loại này).
