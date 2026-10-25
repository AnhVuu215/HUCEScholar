# OPS-01 — Readiness và log phục vụ xử lý sự cố

Ngày 20/10/2026. Nhánh `codex/ops-01-readiness-logging`, xây trên `main` sau PR #14. Phạm vi là OPS-01 (đợt C) trong [roadmap](../roadmap/2026-10-17-web-improvement-roadmap.md). Không đổi API nghiệp vụ, schema hay quyền.

## Dependency quan trọng

| Thành phần | Mức | Lý do |
| --- | --- | --- |
| PostgreSQL | Bắt buộc | Phiên, quyền, dữ liệu học liệu và ghi chú |
| Redis | Bắt buộc | Giới hạn đăng nhập (fail closed khi Redis lỗi), hàng đợi quét/chuyển đổi |
| Kho file riêng tư (local hoặc S3) | Bắt buộc | Đọc PDF, upload |
| File worker (ClamAV/Poppler/DOCX) | Báo riêng | Đọc vẫn hoạt động; upload mới đứng ở “đang kiểm tra” |

## Hành vi

- `GET /api/v1/health` giữ nguyên là **liveness**: không kiểm dependency.
- `GET /api/v1/health/ready` là **readiness**, không cần phiên, `no-store`. Kiểm DB (`SELECT 1`), Redis (`PING`) và kho file (local: thư mục gốc tồn tại và ghi được; S3: `HeadBucket`) song song, mỗi bước timeout 1 giây. Trả `{ service, status, checks }`:
  - `ready` (200): ba dependency bắt buộc ổn, worker có heartbeat mới và trình quét `ok`.
  - `degraded` (200): dependency bắt buộc ổn nhưng worker `absent`/`stale`/`unknown` hoặc trình quét `fail`/`unknown`.
  - `not_ready` (503): ít nhất một dependency bắt buộc lỗi hoặc quá hạn.
  - Mỗi check chỉ có `status` và `ms` (worker: `status`, `ageSeconds`; scanner: `status`). Không trả thông điệp lỗi của driver vì có thể chứa host, query hoặc thông tin đăng nhập.
- File worker ghi `hs:worker:heartbeat` (thời điểm, TTL 60 giây) vào Redis mỗi 15 giây; quá 45 giây coi là `stale`, hết TTL coi là `absent`. Worker xóa key khi tắt bình thường. Nhiều worker cùng chạy dùng chung một key: một worker tắt có thể làm readiness báo `absent` tới lượt ghi kế tiếp của worker còn lại (≤ 15 giây).
- **Trình quét** (thêm ngày 24/10): ClamAV chỉ nghe trong mạng của worker, API không gọi được. Mỗi nhịp heartbeat, worker gửi `zPING` tới clamd (timeout 2 giây) và ghi `hs:worker:scanner` = `ok`/`fail` (TTL 60 giây) cùng heartbeat trong một `MULTI`. Readiness chỉ tin key này khi worker `ok`; worker cũ/mất hoặc key chưa có → `unknown`. clamd không nhận kết nối khi đang nạp dữ liệu virus, nên lúc mới khởi động báo `fail` cho tới khi quét được thật.
- Mọi phản hồi có `X-Request-Id`: giữ id do proxy phía trước gửi nếu khớp `[A-Za-z0-9._-]{8,64}`, nếu không thì tạo UUID. Id đi theo request qua `AsyncLocalStorage`.
- Log truy cập một dòng mỗi request: `METHOD /đường-dẫn STATUS Nms id=...`. **Không** có query string, cookie, header, body, PDF, nội dung ghi chú hay mật khẩu. Bỏ qua `/api/v1/health*` để probe không làm ngập log. Tắt khi `NODE_ENV=test`, header vẫn có.
- `SafeLogger` vẫn thay thông điệp lỗi bằng câu chung, nay kèm `(request <id>)` để nối lỗi với dòng log truy cập và phản hồi người dùng nhận được.

## Kiểm chứng

Local (Windows, Node 24.19.0, pnpm 11.25.0), database `_test` và Redis DB 15:

- `pnpm format:check`, `pnpm check` (lint, typecheck, 97 unit, build): đạt. Unit mới `test/ops.spec.ts` (6 ca): sinh id, giữ id hợp lệ, thay id không an toàn; dòng log không có query string, cookie hay tên cookie, bỏ qua health; lỗi chung kèm request id và không lộ SQL; ready/degraded theo heartbeat mới/không có/cũ; DB lỗi → `not_ready` mà không lộ chuỗi lỗi; Redis lỗi → `not_ready`, worker `unknown`; check treo bị cắt sau khoảng 1 giây.
- `pnpm test:integration`: 188 passed, 1 skipped. Mới `test/readiness.integration.spec.ts` (2 ca) với DB/Redis/kho local thật: `degraded` khi chưa có heartbeat, `ready` khi có, `stale` khi cũ; liveness giữ nguyên; `X-Request-Id` có trên phản hồi 200 và 401; phản hồi readiness không chứa chuỗi kết nối.
- `pnpm test:e2e --workers=1`: 157 passed, 1 skipped, 1 failed. Lượt này chậm bất thường (11,9 phút so với khoảng 7 phút); `reports.spec.ts` (REPORT-01) chờ “Đã gửi báo cáo.” quá 5 giây trong khi form còn “Đang gửi…”. Chạy riêng đạt (12,9 và 11,3 giây). Các bước chờ server ghi của ca này nâng lên 15 giây như fixture reader; chạy lại đạt.

Trình quét (24/10, `codex/ops-scanner-readiness`): `pnpm check` đạt (126 unit; mới: `clamPing` chỉ nhận `PONG` đúng, câu trả lời khác hoặc clamd treo → `false` trong timeout, cổng đóng → `false`; readiness `degraded` khi scanner `fail`, `unknown` khi chưa có key hoặc worker cũ). `pnpm test:integration`: 219 passed, 1 skipped (readiness thêm `scanner` vào `checks`, `ready` khi `ok`, `degraded` khi `fail`). App dev với image worker mới: tắt ClamAV → `degraded`, `scanner=fail` trong một nhịp; bật lại → `ready` sau khoảng 45 giây, lúc ClamAV nạp xong.

## Còn lại

- Chưa gắn readiness vào healthcheck của Docker Compose/Caddy hay cảnh báo tự động; cần chọn môi trường (OPS-02).
- Log ra stdout dạng dòng chữ; chưa có JSON log hay nơi lưu tập trung.
- QA-01 và OPS-02 còn lại trong đợt C.
