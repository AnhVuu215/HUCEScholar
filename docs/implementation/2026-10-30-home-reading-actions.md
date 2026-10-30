# COURSE-02c — Đánh dấu đã đọc và sắp theo hạn ở trang đầu

Ngày 30/10/2026. Nhánh `codex/home-reading-progress-actions`, xây trên `main` sau PR #58 (COURSE-02b).

[COURSE-02b](2026-10-29-followed-reading-progress.md) còn hai việc chưa làm: phải mở trang Danh sách đọc mới đánh dấu được, và các môn xếp theo mã môn nên môn sắp tới hạn có thể nằm dưới cùng. Lượt này làm cả hai.

Đã chốt theo lựa chọn khuyến nghị (đổi được ở API hoặc giao diện):

- **Sắp các môn ở API, không ở trình duyệt**, để mọi nơi gọi `GET /api/v1/reading-lists/following` nhận cùng một thứ tự. Thứ tự: môn có hạn gần nhất chưa đọc đi trước, xếp theo ngày tăng dần, nên môn quá hạn luôn đứng đầu. Sau đó tới các môn không còn hạn nào chưa đọc. Cùng ngày, hoặc cùng không có hạn, thì giữ thứ tự mã môn.
- **Chỉ đánh dấu tài liệu ở dòng hạn gần nhất.** Trang đầu không liệt kê cả danh sách; muốn đánh dấu mục khác hay bỏ dấu thì vẫn vào trang Danh sách đọc. Không có nút bỏ dấu ở trang đầu.
- **Dùng lại API đánh dấu của COURSE-02** (`PUT /courses/:courseId/reading-lists/read/:versionId`) với cùng kiểm quyền; không thêm endpoint và không đổi schema.
- Lưu xong thì tải lại mục này mà vẫn giữ dữ liệu cũ trên màn hình, để không nhấp nháy "Đang tải…". Môn có thể đổi chỗ sau khi tải lại, vì hạn gần nhất đã đổi.

## Hành vi

- Dòng "Hạn gần nhất …" hoặc "Quá hạn …" của mỗi môn có nút **Đánh dấu đã đọc**, tên cho trình đọc màn hình là "Đánh dấu đã đọc: tên tài liệu". Trong lúc lưu, nút hiện "Đang lưu…", và mọi nút đánh dấu trong mục đều tạm khóa.
- Lưu được thì mục báo "Đã đánh dấu đã đọc: tên tài liệu." và tiến độ, hạn kế tiếp, thứ tự các môn được cập nhật.
- Lưu lỗi thì mục báo lỗi (ví dụ "Chưa kết nối được máy chủ…") và tiến độ giữ nguyên; bấm lại để thử lần nữa.

## Kiểm chứng

Local (Windows, Node 24.19.0, pnpm 11.25.0), database `_test`:

- Integration, ca mới: hai môn đã theo dõi, môn có mã sau nhưng hạn sớm hơn đứng trước; đọc xong tài liệu đó thì môn này không còn hạn và xuống sau; khi cả hai không còn hạn thì về thứ tự mã môn. Ca COURSE-02b cũ vẫn đạt.
- Browser, `tests/course-01.spec.ts`: lần lưu đầu bị chặn mạng thì báo lỗi và vẫn 0/2; bấm lại thì báo đã đánh dấu, 1/2, và hạn chuyển sang tài liệu kế; trang Danh sách đọc thấy ô đã đọc được tích. Cả bốn ca trong file đạt. Các spec có trang đầu (`auth`, `ui-refinements`, `ux-01`, `workspace-ui`) đạt 27/27.
- `pnpm check` (lint, typecheck, unit, build) đạt; `pnpm test:integration` 227 đạt, 1 bỏ qua. Chưa chạy lại cả bộ e2e, chỉ các spec kể trên.
- Chưa thử trên điện thoại thật hay trình đọc màn hình.

## Chưa làm

- Bỏ dấu đã đọc hoặc đánh dấu mục không phải hạn gần nhất ngay ở trang đầu.
