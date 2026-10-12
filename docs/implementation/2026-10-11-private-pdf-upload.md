# Upload PDF riêng tư và kiểm tra nền

Mốc kế tiếp bản nháp metadata. LECTURER/STUDENT gắn/thay PDF của bản DRAFT do mình quản lý; giảng viên cần phân công hiện hành. ADMIN không biên soạn. Chưa gửi duyệt, công bố, đọc hoặc tải PDF.

## Sử dụng

Lưu metadata trước, mở lại bản nháp, chọn PDF tối đa **25 MiB**, bấm **Tải PDF lên**. File mới thay đính kèm hiện tại và được kiểm tra lại. Chỉ bỏ file đã chọn khi bấm nút tương ứng; chọn file chưa phải là lưu. **Cập nhật trạng thái** lấy dữ liệu hiện hành từ máy chủ và đồng bộ cả metadata/revision khi form sạch. Khi mất xác nhận upload, kiểm tra lại trước retry. Không lưu file hoặc metadata vào localStorage.

- MISSING: chưa có PDF.
- CHECKING: đã lưu riêng tư, đang chờ/đang kiểm tra.
- SAFE: đã qua kiểm tra kỹ thuật; chưa được duyệt/công bố.
- FAILED: PDF lỗi, mã hóa, scanner/parser không sẵn sàng hoặc kiểm tra không đạt. Kiểm tra tài liệu/dịch vụ trước khi tải lại.

## API và tính nhất quán

`POST /api/v1/material-drafts/:id/pdf`: body nhị phân `application/pdf`, `If-Match: "<revision>"`, `X-File-Name` dùng encodeURIComponent. Session/role/CSRF bắt buộc; không trả object key, URL hoặc checksum. JSON metadata giữ giới hạn 16 KiB cũ; bytes PDF có giới hạn riêng mặc định 25 MiB, API cho phép cấu hình 1 KiB–50 MiB. UI giới hạn 25 MiB trong mốc này. Next proxy buffer tối đa 50 MiB, timeout 120 giây; khi triển khai Caddy cần cấu hình giới hạn tương ứng.

Kiểm tra owner/quyền/revision trước nhận bytes và kiểm tra lại khi gắn file trong transaction. Receive stream tính SHA256/kích thước, kiểm chữ ký, timeout 60 giây; mỗi API process có tối đa hai upload và một upload/actor. Transaction tạo files CHECKING, gắn version, tăng revision document/version và audit. Không giữ transaction lúc truyền bytes. Temp và đối tượng chưa gắn được dọn khi xác định rollback; kết quả COMMIT chưa rõ thì giữ bytes để tránh xóa file đã được gắn. Cần vận hành dọn orphan sau crash/commit không xác định; không xóa tự động theo tuổi khi chưa đối soát.

Kho local ở `.local/files`, test ở `.local/files-test`, ngoài webroot; không có route static/đọc/tải. Production bắt buộc `FILE_STORAGE=s3`, bucket private do operator cấu hình, AWS SDK credential chain; chưa tạo bucket hoặc kiểm chứng AWS thật. S3 object key UUID mới, `IfNoneMatch:*`; không tái sử dụng key. File cũ giữ nguyên để tránh race và bảo toàn snapshot; cần lifecycle retention/quota trước pilot nhiều người dùng.

## Worker

BullMQ dùng Redis đã cấu hình, job ID `file-<id>`, ba attempts với backoff. Enqueue chờ tối đa ba giây; lỗi sau commit vẫn giữ CHECKING. Worker đối soát PostgreSQL mỗi 30 giây, phục hồi job bị mất/enqueue lỗi, ghi FAILED khi hết retry/stalled. Cursor đi qua mọi batch CHECKING; callback idempotent, cập nhật chỉ khi file còn CHECKING. Job file cũ không sửa file mới của version.

Worker đọc bytes riêng, đối chiếu hash/kích thước, quét ClamAV INSTREAM rồi chạy `pdfinfo` và `pdftotext` không shell. Scanner timeout 60 giây; mỗi parser timeout 30 giây, pdfinfo output tối đa 32 KiB, pdftotext chỉ giữ cờ có chữ. Từ chối file mã hóa, số trang ngoài 1–10.000, parser/scanner lỗi. SAFE luôn có checked_at, page_count và has_text_layer; không đổi review_status hoặc visibility. Không thêm migration: 23 bảng, 61 CHECK hiện hữu đáp ứng mốc này.

## Chạy local

Sau `pnpm setup:local`, bật PostgreSQL/Redis rồi chạy:

```powershell
docker compose --env-file infra/.env -f infra/compose.yaml --profile files up -d --build clamav file-worker
pnpm dev
```

Profile `files` dành cho development, dùng bind `.local/files` chung với API, worker Node 24/Poppler và ClamAV 1.4.6 pin digest. ClamAV cần definitions được cập nhật; health chưa sẵn sàng thì worker chưa khởi động. Worker giới hạn CPU/RAM/process, chạy user node; scanner không expose port ra host. Không tái sử dụng Compose local làm production. Khi chạy worker trực tiếp bằng `pnpm --filter @hucescholar/api worker:files`, cần cài Poppler và cấu hình CLAMAV_HOST/PORT; xem `.env.example`.

## Kiểm chứng

Unit/integration kiểm tra streaming limits, header/path, owner/RBAC/CSRF, checksum, revision, rollback/commit acknowledgment, lỗi queue, idempotency, scanner/parser lỗi và reconciliation. Mock scanner được ghi rõ trong tên test; không coi đó là bằng chứng quét thực.

Test opt-in `test/pdf-worker.real.integration.spec.ts` đã chạy với ClamAV và Poppler thực trong Docker, chỉ nối `hucescholar_test`/Redis 15: upload PDF synthetic hợp lệ thành SAFE (một trang, có text layer), PDF hỏng thành FAILED. Worker test đã dừng sau ca thử; worker local dùng database chính và Redis 0 riêng. Không có tài liệu HUCE hoặc fixture được seed vào local chính.

Checkpoint hoàn tất đêm 11–12/10/2026: **50 unit + 87 integration + 35 browser + 1 real-scanner = 173 ca đạt**. Ca real-scanner mặc định skip, được chạy opt-in riêng trên Docker image cuối. Sau sửa UI cuối, chạy lại cả năm ca browser học liệu và format/lint/type/unit/build đều đạt. Sáu capture desktop/tablet/mobile của CHECKING và retry được review; verdict ship, đối soát design không cần đổi hệ thống hiện hữu. Đã bổ sung hồi quy cho refresh lệch metadata/revision, bỏ/chọn lại file sau lỗi kết nối, directory stale, timeout enqueue và COMMIT mất acknowledgment. Có cảnh báo deprecation `pg` về concurrent query; chưa ảnh hưởng kết quả, cần xử lý trước nâng major pg.

API/web bản build mới chạy local, health và các route học liệu trả 200; worker báo ready, PostgreSQL/Redis/ClamAV healthy. Database chính còn năm migrations, 61 CHECK, một ADMIN; catalog, phân công, documents, versions và files đều bằng 0. Đây là kiểm chứng runtime local và dịch vụ scanner thật, chưa phải deployment production.

Tham chiếu kỹ thuật: [BullMQ job IDs](https://docs.bullmq.io/guide/jobs/job-ids), [retry](https://docs.bullmq.io/guide/retrying-failing-jobs), [ClamD INSTREAM](https://docs.clamav.net/manual/Usage/ClamdProtocol.html), [ClamAV Docker](https://docs.clamav.net/manual/Installing/Docker.html), [AWS PutObject](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/s3/command/PutObjectCommand/). Next proxy đối chiếu tài liệu bundled đúng bản cài.

Chưa kiểm chứng S3/IAM thật, deployment HTTPS, quota/retention vận hành hoặc thiết bị vật lý. Quét kỹ thuật không chứng minh quyền nguồn/nội dung; kiểm duyệt là mốc kế tiếp.
