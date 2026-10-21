# NOTIFY-01 — Thông báo trong ứng dụng (lát đầu)

Ngày 21/10/2026. Nhánh `codex/notify-01-in-app-notifications`, xây trên `main` sau PR #20. Trước đây người tải lên phải tự mở lại bản nháp mới biết PDF đạt hay không, hoặc yêu cầu duyệt đã có kết quả chưa.

## Hành vi

Thông báo chỉ gửi cho người liên quan và chỉ người đó xem được:

| Sự kiện | Người nhận | Nội dung | Link |
| --- | --- | --- | --- |
| PDF đạt / không đạt kiểm tra | Người tải PDF | Tiêu đề; khi lỗi kèm nhãn lý do của [UPLOAD-03](2026-10-21-file-check-reasons.md) | Bản nháp |
| Bản đọc từ Word sẵn sàng / không tạo được | Người tải Word | Tiêu đề | Bản nháp |
| Yêu cầu duyệt: duyệt, cần sửa, không duyệt | Người gửi yêu cầu | Tiêu đề; "xem lý do trong bản nháp" | Bản nháp |
| Báo cáo được xử lý / đóng | Người báo cáo | Tiêu đề | Trang đọc tài liệu |

- Thông báo được ghi trong **cùng transaction** với lúc trạng thái đổi: rollback thì không có thông báo, commit thì có. Chưa dùng outbox hay hàng đợi.
- `event_key` duy nhất theo người nhận (`file:<id>`, `request:<id>`, `report:<id>`), nên job chạy lại không tạo trùng. Nguồn Word được thử lại sau khi lỗi, nên mỗi vòng có số riêng (`source:<id>:<n>`). Điều kiện "chỉ đổi khi còn ở trạng thái cũ" vẫn là chốt chính.
- Chỉ lưu tiêu đề phiên bản tại thời điểm sự kiện và mã lý do. Không lưu lý do admin tự viết, kết quả xử lý báo cáo, nội dung ghi chú hay thông điệp của ClamAV/Poppler. Người nhận đọc lý do ở chỗ gốc (bản nháp, reader), nơi quyền được kiểm lại.
- Admin tự công bố hoặc giảng viên tự công bố không tạo thông báo, vì chính họ vừa thao tác. Báo cáo chuyển sang "đang xem xét" cũng không tạo thông báo.
- Web:
  - Chuông ở thanh trên mọi trang workspace, `aria-label` có số chưa đọc. Chỉ kiểm khi tab đang hiện: lúc mở trang, khi tab hiện lại và mỗi 60 giây. Lỗi mạng giữ số cũ, không báo "không có gì mới".
  - Trang `/workspace/notifications`: tất cả / chỉ chưa đọc, đánh dấu từng mục hoặc tất cả, phân trang 20.
  - Bấm link đánh dấu đã đọc rồi mở trang đích. Link bản nháp là `/workspace/<vai trò>/materials?draft=<id>`; editor tải bản nháp qua API có kiểm chủ sở hữu, và tham số được xóa khi đóng editor.
- Service worker không đổi: API và HTML workspace vẫn chỉ đi mạng, không cache.

## API

Tất cả cần phiên đăng nhập; các POST qua CSRF như mọi API ghi.

- `GET /api/v1/notifications?page=&limit=(≤50)&filter=unread` → `{ items, total, unread, page, limit }`
- `GET /api/v1/notifications/unread` → `{ unread }`
- `POST /api/v1/notifications/:id/read` → `{ unread }`. Thông báo của người khác trả 404 như không tồn tại.
- `POST /api/v1/notifications/read-all` → `{ unread: 0 }`

## Schema

Migration `202610210002_notifications` (SQL thuần), bảng `notifications`:

- `kind` có CHECK theo 9 loại
- `event_key` có CHECK định dạng, `UNIQUE (user_id, event_key)`
- `detail` chỉ là mã chữ hoa
- `title` không rỗng
- FK `(document_id, version_id)` → `document_versions(document_id, id)`, nên thông báo luôn trỏ đúng phiên bản của đúng tài liệu
- index theo người nhận + thời gian, và index một phần cho thông báo chưa đọc

Xóa người dùng thì xóa thông báo của họ; tài liệu và phiên bản không bị xóa (RESTRICT). Test schema: 27 bảng, 56 FK, 82 CHECK, 9 index một phần.

## Kiểm chứng

Local (Windows, Node 24.19.0, pnpm 11.25.0), database `_test` và Redis DB 15:

- Integration (4 ca mới trong `materials.integration.spec.ts`):
  - PDF SAFE qua `ScanProcessor` tạo đúng một thông báo dù xử lý hai lần
  - người khác không thấy, đánh dấu được trả 404; thiếu CSRF bị 403
  - đọc từng mục, lọc chưa đọc, đọc tất cả; `limit=51` bị 400
  - PDF có mật khẩu: `FILE_FAILED` với `detail = PASSWORD_PROTECTED`
  - yêu cầu sửa: `REVIEW_CHANGES_REQUIRED`, không chứa lý do của admin
  - báo cáo: "đang xem xét" không thông báo; "đóng" tạo `REPORT_DISMISSED`, không chứa kết quả admin viết
  - Word lỗi `INVALID_DOCX`, sau đó hết lượt khi reconcile: hai thông báo riêng
- Browser `tests/notify-01.spec.ts`:
  - admin yêu cầu sửa qua API thật → chuông hiện số chưa đọc → trang thông báo không có lý do admin → "Mở bản nháp" mở đúng editor → mục chuyển "Đã đọc"
  - "Đánh dấu tất cả" làm trống bộ lọc chưa đọc và bỏ số trên chuông
  - không tràn ngang ở 320px
- Bộ đầy đủ:
  - `pnpm format:check`, `pnpm check` (lint, typecheck, 101 unit, build): đạt.
  - `pnpm test:integration`: 198 passed, 1 skipped.
  - `pnpm test:e2e --workers=1`: 163 passed, 6 skipped (6,1 phút).
- Bước dọn dữ liệu của `materials.integration.spec.ts` và `pdf-worker.real.integration.spec.ts` nay xóa thông báo trước khi xóa phiên bản. Nếu không, FK RESTRICT chặn bước dọn và jest không thoát.
- Chưa kiểm trên S3, HTTPS hay thiết bị thật.

## Chưa làm

- Email, push hay thông báo "có bản mới của tài liệu bạn đang đọc"; tùy chọn tắt từng loại.
- Thông báo cho giảng viên nhận bàn giao tài liệu, hay cho admin khi có yêu cầu duyệt mới (admin đã có hàng chờ).
- Cập nhật tức thời (SSE/WebSocket); hiện chuông kiểm mỗi 60 giây khi tab đang hiện.
- Dọn thông báo cũ theo thời hạn.
