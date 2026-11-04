# OPS-02 — diễn tập S3, HTTPS và phục hồi trên máy local

Ngày 04/11/2026. Nhánh `codex/ops-02-s3-https-recovery`, xây trên `main` `026b8ba`. Chủ dự án yêu cầu làm OPS-02 và bỏ hẳn phần Safari, thiết bị cảm ứng.

**Đây là bằng chứng local, chưa phải production.** Chưa mua AWS, domain hay máy chủ. Garage đứng thay S3 và CA nội bộ của Caddy đứng thay chứng chỉ thật, nên OPS-02 mới xong phần làm được mà không tốn tiền.

## Đã chốt

- **Chạy local trước:** không tốn chi phí, và script, cấu hình, bài kiểm tra dùng lại được khi có môi trường thật.
- **Garage v2.1.0 thay cho MinIO.** Image MinIO không kéo được: Docker Hub báo không có repository, `quay.io` trả 401. Không dùng image do bên thứ ba đăng lại.
- **Next chạy trên máy host** vì máy ảo Docker chỉ có 3 GB. Caddy chuyển `/api` thẳng vào Nest như README yêu cầu, phần còn lại vào Next.

## Đã có

- `S3_ENDPOINT` (không bắt buộc): trỏ API và worker sang dịch vụ tương thích S3. Để trống là AWS. URL có credential bị từ chối khi khởi động.
- `infra/compose.rehearsal.yaml`: stack `NODE_ENV=production` tách khỏi dev, gồm Postgres, Redis, Garage, ClamAV, API, worker, Caddy. Secret ngẫu nhiên nằm trong `infra/.env.rehearsal` (đã ignore).
- `doctor:files` nay kiểm cả ảnh Vở ghi và ảnh thu nhỏ. Trước đây nó chỉ kiểm PDF và Word, nên có thể báo đủ dù ảnh đã mất.

## Lỗi diễn tập tìm ra

Upload PDF trả `503 UPLOAD_UNCERTAIN` dù readiness báo `ready`. Ở chế độ S3, API và worker vẫn ghi file tạm vào `FILE_LOCAL_ROOT/tmp`. Giá trị mặc định nằm trong thư mục mà user `node` của container không ghi được. Lỗi này sẽ xảy ra ở production.

- Readiness nay kiểm cả thư mục tạm ở chế độ S3. Với cấu hình lỗi, `/health/ready` trả 503 và `storage: fail`.
- Lỗi upload PDF và Word nay ghi log tên lỗi. Trước đây lỗi bị đổi thành 503 mà không để lại dấu vết.
- **Khi triển khai thật:** phải đặt `FILE_LOCAL_ROOT` vào thư mục ghi được, kể cả khi dùng S3.

## Cách chạy

```powershell
pnpm rehearsal:env
docker compose --env-file infra/.env.rehearsal -f infra/compose.rehearsal.yaml up -d --no-deps garage postgres redis clamav
pnpm rehearsal:init
# Đặt DATABASE_URL về cổng 55532 rồi chạy: pnpm --filter @hucescholar/api exec prisma migrate deploy
docker compose --env-file infra/.env.rehearsal -f infra/compose.rehearsal.yaml up -d --build --no-deps api file-worker caddy
pnpm --filter @hucescholar/web build
pnpm --filter @hucescholar/web start   # terminal riêng
pnpm rehearsal:check flow
pnpm rehearsal:recovery backup
pnpm rehearsal:recovery wipe           # xóa volume Postgres và Garage của diễn tập
pnpm rehearsal:recovery restore
docker compose --env-file infra/.env.rehearsal -f infra/compose.rehearsal.yaml up -d --no-deps api file-worker
pnpm rehearsal:check verify
docker compose --env-file infra/.env.rehearsal -f infra/compose.rehearsal.yaml exec -T api node dist/scripts/doctor-files.js
```

Tắt ClamAV của dev trước khi chạy, vì máy ảo không đủ RAM cho hai bản. Backup diễn tập nằm ở `.local/rehearsal-backups`, tách khỏi `.local/backups`.

## Kết quả

Windows, Docker Desktop, máy ảo 3 GB, Node 24.19.0, ngày 04/11/2026.

**Luồng qua HTTPS, 12/12 đạt:**

- Cookie `__Host-`, `Secure`, `HttpOnly`, phiên có `SameSite=Lax`.
- Upload PDF lên S3, worker quét object bằng ClamAV và Poppler thật ra `SAFE`, giảng viên công bố.
- Sinh viên đọc đúng byte, Range trả 206 đúng đoạn, ghi chú riêng lưu được.
- Người chưa đăng nhập bị 401. Bucket từ chối truy cập ẩn danh (403).
- Gửi `X-Forwarded-For` giả khác nhau mỗi lần vẫn bị giới hạn: 429 ở lần thứ 11.

**Phục hồi sau khi xóa hẳn volume Postgres và Garage:**

| Đối chiếu với lúc backup | Kết quả |
| --- | --- |
| Constraint / index / partial index / trigger | 554 / 116 / 21 / 10, khớp |
| Bảng / tổng số dòng | 39 / 31, khớp |
| Object | 1, khớp hash |
| Đăng nhập, PDF, Range, ghi chú trên dữ liệu phục hồi | 4/4 đạt |

**Ca ngược:** xóa một object thì `doctor:files` nêu đúng tài liệu và thoát mã 2, reader trả 410. Đặt lại từ backup thì `doctor:files` và `verify` đạt trở lại.

## Chưa kiểm chứng

- **`If-None-Match: *`:** Garage v2.1.0 bỏ qua header này, lần ghi thứ hai đã đè object cũ. Khóa object là UUID ngẫu nhiên nên luồng thường không phụ thuộc vào nó, nhưng cơ chế chống ghi đè phải thử trên S3 thật.
- **Dữ liệu diễn tập rất nhỏ:** chỉ 1 object và 31 dòng, chưa đo thời gian phục hồi với dữ liệu lớn.
- **Backup không nhất quán tuyệt đối khi có người đang ghi:** script chạy khi không có tải. Object tạo sau lúc dump sẽ thừa, nhưng không thiếu.
- **Ảnh Vở ghi trên S3:** nhánh kiểm ảnh của `doctor:files` có unit test với kho local, luồng diễn tập chưa tải ảnh.
- **Word (DOCX) trên S3:** diễn tập không bật bộ chuyển đổi.
- **S3 thật, domain và chứng chỉ thật, IAM của AWS, SMTP thật, backup định kỳ và cảnh báo tự động:** chưa làm, cần chủ dự án chọn môi trường và ngân sách.
