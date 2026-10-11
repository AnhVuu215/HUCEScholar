# HUCEScholar

Nền tảng học liệu điện tử dành cho sinh viên HUCE, phát triển theo hướng web responsive và PWA. Ba vai trò: quản trị viên, giảng viên và sinh viên.

Dự án độc lập đang phát triển; chưa phải hệ thống chính thức của trường. Chưa có dữ liệu học liệu thật hoặc tích hợp thư viện trường.

## Tài liệu

- [Tech stack và kiến trúc MVP](docs/HUCEScholar-tech-stack.md)
- [Mô hình dữ liệu và SQL tham chiếu](docs/database/README.md)
- [Prototype thiết kế](design/wireframe/README.md)
- [Proposal, use case và bộ tài liệu bàn giao](docs/deliverables/)
- [Quy tắc sản phẩm](PRODUCT.md)
- [Thiết kế giao diện hiện có](DESIGN.md)

HTML trong `design/` và `docs/deliverables/` là prototype dùng dữ liệu minh họa. Không dùng prototype để chứng minh chức năng đăng nhập, phân quyền, PDF hoặc lưu dữ liệu đã hoạt động.

## Lộ trình triển khai

1. Repository, workspace Next.js/NestJS, cấu hình local và CI.
2. Migration PostgreSQL giữ nguyên ràng buộc; tài khoản và phiên đăng nhập.
3. Catalog, upload, kiểm tra file và kiểm duyệt.
4. PDF reader, ghi chú riêng, tiến độ đọc và kiểm tra trên nhiều thiết bị.
5. PWA, kiểm thử hành trình và triển khai HTTPS.

Mỗi mốc có kiểm tra riêng trước khi chuyển tiếp. Không cam kết đọc offline trong MVP.

## Chạy trên Windows / PowerShell

Yêu cầu **Node.js 24.19.x LTS** và **pnpm 11.25.0**. Phiên bản runtime nằm trong `.node-version`; package được pin và có `pnpm-lock.yaml`. Không cần Docker để chạy mốc khởi tạo.

```powershell
pnpm install --frozen-lockfile
pnpm dev
```

Mở **http://127.0.0.1:3000**. API ở `http://127.0.0.1:3001/api/v1/health`. Dừng cả hai bằng `Ctrl+C`.

Trang đầu là **trang khởi tạo dành cho phát triển**, kiểm tra kết nối web–API thực tế. Chưa có đăng nhập, dữ liệu học liệu, migration, upload hoặc reader thật. Manifest là bước chuẩn bị PWA; chưa có service worker hay xác nhận cài đặt trên thiết bị.

Mặc định dùng loopback, không mở ra mạng LAN. Nếu cần cấu hình khác:

```powershell
Copy-Item apps/api/.env.example apps/api/.env
Copy-Item apps/web/.env.example apps/web/.env.local
```

Sửa `PORT`/`HOST` của API và `API_PROXY_TARGET` của web cho khớp. `API_PROXY_TARGET` là cấu hình server, được đọc cả khi build; thay đổi đích API sau build cần build lại. Không đặt secret trong biến `NEXT_PUBLIC_*`.

## Kiểm tra và production build local

```powershell
pnpm format:check
pnpm check
pnpm exec playwright install chromium
pnpm test:e2e
```

`pnpm check` chạy lint, typecheck, Jest và build hai ứng dụng. Playwright tự chạy web/API ở cổng 3100/3101 rồi dừng; cần giữ hai cổng này trống. Có thể dùng Chrome đã cài bằng biến `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` trỏ tới executable của Chrome.

Sau `pnpm build`, mở hai terminal riêng:

```powershell
# Terminal 1
pnpm --filter @hucescholar/api start

# Terminal 2
pnpm --filter @hucescholar/web start
```

Đây là kiểm tra build local, chưa phải cấu hình triển khai production/HTTPS. CI trong `.github/workflows/ci.yml` chạy trên push vào `main`, `codex/**` và pull request.

## Dịch vụ phụ local (mốc database tiếp theo)

`infra/compose.yaml` chuẩn bị PostgreSQL 18.6 và Redis 8.8.3, pin tag từ image chính thức. Chưa có Prisma migration hoặc tự tạo bảng. Web/API hiện tại chưa sử dụng hai dịch vụ này.

Khi Docker Desktop đã chạy:

```powershell
Copy-Item infra/.env.example infra/.env
# Điền POSTGRES_PASSWORD và REDIS_PASSWORD riêng cho local trong infra/.env.
pnpm infra:up
```

Cổng database/Redis chỉ publish lên `127.0.0.1`. `pnpm infra:down` dừng dịch vụ và giữ named volumes; không thêm `-v` trừ khi muốn xóa dữ liệu local. Không dùng cấu hình Compose này như một bản triển khai production đã được kiểm chứng.

## Cấu trúc

```text
apps/web/       Next.js App Router, giao diện và manifest
apps/api/       NestJS, cấu hình startup và HTTP health
tests/          Hành trình web/API bằng Playwright
infra/          Dịch vụ PostgreSQL/Redis local
design/         Prototype và công cụ thiết kế được giữ nguyên
docs/           Proposal, use case, nghiệp vụ, schema và nhật ký triển khai
```

[Kết quả mốc khởi tạo](docs/implementation/2026-10-11-foundation.md).
