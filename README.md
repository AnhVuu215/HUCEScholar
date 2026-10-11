# HUCEScholar

Nền tảng học liệu điện tử dành cho cộng đồng HUCE, theo hướng web responsive + PWA. Ba vai trò: quản trị viên, giảng viên và sinh viên. Dự án độc lập đang phát triển; chưa phải hệ thống chính thức của trường.

Đã có PostgreSQL/Prisma migration, đăng nhập/đăng xuất thật, cookie phiên và phân quyền ba vai trò tại API; giao diện tài khoản dùng trên desktop, điện thoại và tablet. **Chưa có học liệu thật, upload, reader, quản lý tài khoản qua UI hoặc triển khai vận hành.** Prototype trong `design/` vẫn dùng dữ liệu minh họa.

## Tài liệu

- [Tech stack và kiến trúc MVP](docs/HUCEScholar-tech-stack.md)
- [Mô hình dữ liệu và SQL tham chiếu](docs/database/README.md)
- [Kết quả mốc database/auth, API và ranh giới bảo mật](docs/implementation/2026-10-11-database-auth.md)
- [Kết quả mốc khởi tạo](docs/implementation/2026-10-11-foundation.md)
- [Prototype thiết kế](design/wireframe/README.md)
- [Proposal, use case và tài liệu bàn giao](docs/deliverables/)
- [Quy tắc sản phẩm](PRODUCT.md), [thiết kế prototype](DESIGN.md)

## Chạy local trên Windows / PowerShell

Yêu cầu **Node.js 24.19.x LTS**, **pnpm 11.25.0** và Docker Desktop đang chạy. Runtime và dependencies được pin trong repository.

```powershell
pnpm install --frozen-lockfile
pnpm setup:local
pnpm infra:up
pnpm --filter @hucescholar/api db:migrate
pnpm dev
```

Mở [http://127.0.0.1:3000/login](http://127.0.0.1:3000/login). API health ở `http://127.0.0.1:3001/api/v1/health`. Dừng web/API bằng `Ctrl+C`. Root `/` giữ trang tiến độ dự án và kiểm tra API.

`setup:local` tạo `infra/.env` và `apps/api/.env` với password/CSRF secret ngẫu nhiên, giữ nguyên file đã có và không in secret. PostgreSQL mặc định **55432**, Redis **56379**, chỉ bind `127.0.0.1`; không đụng PostgreSQL khác trên 5432. `pnpm infra:down` giữ named volumes; không thêm `-v` khi cần giữ dữ liệu.

Đổi web/API origin cần sửa `APP_ORIGIN` (origin truy cập trình duyệt) và `API_PROXY_TARGET` (server web gọi Nest). Next rewrites đọc đích API khi build; thay đích sau build cần build lại. Không đặt secret vào `NEXT_PUBLIC_*`. Mặc định phát triển local qua HTTP, không phải production HTTPS.

## Tạo quản trị viên đầu tiên

Không có đăng ký công khai hoặc mật khẩu mặc định. Chỉ làm khi database chưa có ADMIN:

```powershell
Copy-Item apps/api/.env.bootstrap.example apps/api/.env.bootstrap
# Điền BOOTSTRAP_ADMIN_EMAIL, BOOTSTRAP_ADMIN_NAME và mật khẩu riêng 16–128 ký tự.
# Không truyền mật khẩu qua command argument, không commit file thật.
pnpm --filter @hucescholar/api build
pnpm --filter @hucescholar/api db:bootstrap-admin
Remove-Item -LiteralPath apps/api/.env.bootstrap
```

CLI tạo account ACTIVE/verified và audit trong transaction; gọi lại không ghi đè tài khoản/mật khẩu. Đây chỉ là bootstrap ADMIN đầu tiên. UI cấp tài khoản giảng viên/sinh viên sẽ ở mốc tiếp theo; tài khoản E2E ở database test không dùng để đăng nhập ứng dụng local.

## Kiểm tra

```powershell
pnpm format:check
pnpm check
pnpm test:setup
pnpm test:integration
pnpm exec playwright install chromium
pnpm test:e2e
```

`pnpm check` chạy lint, typecheck, unit Jest và build; không cần kết nối DB để chạy unit/build. Prisma client được sinh trước typecheck/build/dev và không commit. `test:setup` cần PostgreSQL/Redis đang chạy, tạo/migrate **hucescholar_test**, cập nhật ba account `e2e-*@example.test` với mật khẩu ngẫu nhiên, ghi env bị Git bỏ qua vào `.local/test.env`. Không dùng credential thật trong kiểm thử.

Integration và browser dùng riêng database `_test` + Redis **DB 15**, không chạy đồng thời vì suite reset vùng rate-limit test. Browser global setup flush DB 15 dành riêng cho dự án; không dùng DB 15 này cho việc khác. Test setup không drop database; các fixture nghiệp vụ SQL kết thúc rollback. Playwright tự chạy web/API ở 3100/3101 rồi dừng; giữ hai cổng trống. Trace tắt để tránh ghi lại mật khẩu/cookie.

Có thể dùng Chrome đã cài:

```powershell
$env:PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
pnpm test:e2e
```

Browser kiểm tra reflow desktop/mobile/tablet bằng Chrome; chưa chứng minh Safari/iOS/Android hoặc cài PWA trên thiết bị thật.

## Build và chạy bản build local

```powershell
pnpm build
# Terminal 1
pnpm --filter @hucescholar/api start
# Terminal 2
pnpm --filter @hucescholar/web start
```

Bản build local dùng env phát triển hiện có. Production yêu cầu HTTPS, cookie Secure/host-prefixed, tách DB migration/runtime role và cấu hình proxy được kiểm tra. `TRUSTED_PROXY_IPS` mặc định trống. Next rewrite local dùng chung bucket IP loopback; triển khai nhiều người dùng phải route `/api` trực tiếp Caddy→Nest, ghi đè forwarded IP và chỉ tin exact IP của Caddy. Chi tiết trong nhật ký auth. Chưa deploy cloud.

CI dùng PostgreSQL/Redis ephemeral trên runner và chạy format, lint, typecheck, unit, build, integration và E2E. Không dùng trust auth của CI cho local/production.

## Lộ trình còn lại

1. Quản lý tài khoản, danh mục khoa/ngành/môn và phân công giảng viên.
2. Catalog, upload, kiểm tra file và kiểm duyệt.
3. PDF reader, ghi chú riêng theo phiên bản, tiến độ đọc.
4. PWA, kiểm thử trên thiết bị thật và triển khai HTTPS.

Mỗi mốc có kiểm chứng riêng; không cam kết đọc PDF offline trong MVP.

```text
apps/web/       Next.js App Router, login và không gian tài khoản
apps/api/       NestJS, Prisma, auth/CSRF/session/role guards
scripts/        Cấu hình local và database/test fixture riêng
apps/api/prisma SQL migrations và mapping 23 model
infra/          PostgreSQL/Redis local
tests/          Hành trình Playwright (không ghi credential vào trace)
design/         Prototype được giữ riêng
docs/           Proposal, use case, schema và nhật ký triển khai
```
