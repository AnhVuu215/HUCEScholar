# HUCEScholar

Kho học liệu điện tử cho cộng đồng sinh viên HUCE: tìm và đọc PDF ngay trên web, ghi chú riêng theo trang, tô sáng, làm thẻ ôn tập, theo dõi danh sách đọc và lịch học. Sinh viên đóng góp tài liệu; quản trị viên duyệt trước khi công bố.

> Dự án độc lập đang phát triển, **chưa phải hệ thống chính thức của trường**. Chưa có học liệu được trường cấp quyền, chưa đọc offline, chưa triển khai vận hành. Dữ liệu local và prototype trong `design/` là minh họa.

## Vai trò

| Vai trò           | Làm được gì                                                                                                                                                                   |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Sinh viên**     | Tự đăng ký bằng email. Tìm và đọc tài liệu, ghi chú, tô sáng, thẻ ôn tập, vở ghi, lịch học, theo dõi danh sách đọc. Tải PDF/Word lên kèm nguồn và căn cứ quyền rồi gửi duyệt. |
| **Quản trị viên** | Cấp tài khoản sinh viên, quản lý danh mục khoa/ngành/môn, duyệt tài liệu, ẩn/khôi phục tài liệu, xử lý báo cáo, soạn danh sách đọc cho từng môn.                              |

Tài khoản quản trị chỉ được tạo bằng script (xem bên dưới), không tự đăng ký được.

## Bắt đầu đọc từ đâu

| Muốn biết                                                       | Đọc                                                                                   |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Hệ thống gồm những phần nào, request đi qua đâu, code nằm ở đâu | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)                                          |
| Quy tắc sản phẩm và các quyết định hiện hành                    | [PRODUCT.md](PRODUCT.md)                                                              |
| Ma trận quyền, trạng thái tài liệu, luồng duyệt                 | [Quy tắc nghiệp vụ](docs/HUCEScholar-quy-tac-nghiep-vu.md)                            |
| Vì sao chọn Next.js / NestJS / PostgreSQL                       | [Tech stack](docs/HUCEScholar-tech-stack.md)                                          |
| Mô hình dữ liệu                                                 | [docs/database](docs/database/README.md) và `apps/api/prisma/schema.prisma`           |
| Từng tính năng đã làm gì, kiểm chứng ra sao                     | [docs/implementation](docs/implementation/) (một file cho mỗi mốc, đặt tên theo ngày) |
| Quy ước cho người/agent viết code                               | [AGENTS.md](AGENTS.md)                                                                |

## Cấu trúc thư mục

```text
apps/web/          Next.js (App Router): giao diện, gọi API qua lib/
apps/api/          NestJS: API /api/v1, nghiệp vụ, phân quyền; file worker cùng mã nguồn
apps/api/prisma/   Prisma schema và migration SQL
infra/             Docker Compose: PostgreSQL, Redis, ClamAV, docx-converter, file worker
scripts/           Thiết lập local, môi trường test, sinh tài nguyên PWA/PDF.js
tests/             Kiểm thử e2e Playwright
docs/              Kiến trúc, nghiệp vụ, dữ liệu, ghi chú triển khai
design/            Prototype thiết kế (mock, không phải ứng dụng thật)
```

## Chạy local (Windows / PowerShell)

Cần **Node.js 24.19.x**, **pnpm 11.25.0** và Docker Desktop đang chạy.

```powershell
pnpm install --frozen-lockfile
pnpm setup:local                              # tạo infra/.env và apps/api/.env với secret ngẫu nhiên
pnpm infra:up                                 # PostgreSQL :55432, Redis :56379 (chỉ 127.0.0.1)
pnpm --filter @hucescholar/api db:migrate
pnpm dev                                      # web :3000, API :3001
```

Mở http://127.0.0.1:3000. API: `/api/v1/health` (sống) và `/api/v1/health/ready` (DB, Redis, kho file, worker, trình quét). Mỗi phản hồi có `X-Request-Id` khớp với log.

`pnpm dev` chỉ chạy web và API. Quét file, chuyển Word sang PDF, nhắc lịch và nhắc thẻ ôn do **file worker** làm, chạy trong Docker:

```powershell
pnpm infra:files   # ClamAV, docx-converter, file-worker; lần đầu ClamAV nạp dữ liệu mất vài phút
```

- Sửa code API thì chạy lại `pnpm infra:files` để build lại worker. Không chạy thêm worker trên máy cùng lúc.
- Thư (đăng ký, khôi phục mật khẩu, nhắc) được ghi thành file trong `.local/mail-outbox`, không gửi đi.
- `pnpm infra:down` giữ dữ liệu; đừng thêm `-v` nếu muốn giữ database.

### Tạo quản trị viên đầu tiên

```powershell
Copy-Item apps/api/.env.bootstrap.example apps/api/.env.bootstrap
# Điền BOOTSTRAP_ADMIN_EMAIL, BOOTSTRAP_ADMIN_NAME và mật khẩu 16–128 ký tự. Không commit file này.
pnpm --filter @hucescholar/api build
pnpm --filter @hucescholar/api db:bootstrap-admin
Remove-Item -LiteralPath apps/api/.env.bootstrap
```

Lệnh chỉ tạo khi chưa có admin và không ghi đè tài khoản có sẵn. Sau đó đăng nhập và cấp tài khoản sinh viên ở `/workspace/admin/users`, hoặc để sinh viên tự đăng ký tại `/signup`.

## Kiểm thử

```powershell
pnpm format:check
pnpm check                         # lint, typecheck, unit test, build
pnpm test:setup                    # tạo/migrate database hucescholar_test, tài khoản e2e ngẫu nhiên
pnpm test:integration              # API với PostgreSQL/Redis test
pnpm exec playwright install chromium
pnpm test:e2e                      # Playwright, tự chạy web/API ở 3100/3101
```

- Test dùng riêng database `hucescholar_test` và Redis DB 15; không chạy integration và e2e cùng lúc.
- Chạy `pnpm test:setup` lại trước mỗi lượt e2e đầy đủ (một số spec đổi mật khẩu tài khoản test).
- Phạm vi kiểm chứng: Chrome với chuột trên desktop, tablet và điện thoại (kích thước màn hình). Safari và thiết bị cảm ứng chưa được hỗ trợ.

## Build và triển khai

```powershell
pnpm build
pnpm --filter @hucescholar/api start     # terminal 1
pnpm --filter @hucescholar/web start     # terminal 2
```

Production cần HTTPS, cookie Secure, kho file S3 riêng tư và proxy tin cậy (`TRUSTED_PROXY_IPS`). Diễn tập local S3/HTTPS/phục hồi đã đạt ([OPS-02](docs/implementation/2026-11-04-ops-02-rehearsal.md)); chưa triển khai thật. Không đặt secret vào biến `NEXT_PUBLIC_*`. PWA chỉ cache trang offline và icon, không cache dữ liệu đăng nhập, PDF hay ghi chú ([chi tiết](docs/implementation/2026-10-15-pwa-foundation.md)).

## Còn lại

1. Gửi mail bằng SMTP thật (hiện mới thử bằng transport file).
2. Nguồn nội dung có quyền sử dụng rõ ràng.
3. Triển khai trên S3, domain và chứng chỉ thật.
4. Cài PWA trên thiết bị thật và phiên dùng thử với người dùng.
5. Dọn nợ kỹ thuật đã ghi ở [ARCHITECTURE.md §9](docs/ARCHITECTURE.md#9-nợ-kỹ-thuật-đã-biết).
