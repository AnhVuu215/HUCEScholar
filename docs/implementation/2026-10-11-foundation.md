# HUCEScholar — Mốc 1: repository và nền tảng web/API

Ngày: 11/10/2026. Phạm vi: phát triển local, chưa triển khai vận hành.

## Đã triển khai

- GitHub repository private `AnhVuu215/HUCEScholar`. Baseline tài liệu/thiết kế ở `main` (commit `2fc1d8c`); phần ứng dụng ở `codex/bootstrap`.
- pnpm workspace với Next.js 16.4 / React 19.3 / Tailwind 4.3 và NestJS 11.2, TypeScript 5.9. Pin package trực tiếp và lockfile; Node 24.19 LTS / pnpm 11.25.
- NestJS dùng compiler TypeScript qua Nest CLI để giữ decorator metadata khi chạy dev/build. Cấu hình startup kiểm tra PORT/NODE_ENV/HOST, bind loopback mặc định; Helmet và API prefix thống nhất.
- `GET /api/v1/health`: `{ "status": "ok", "service": "hucescholar-api" }`, `Cache-Control: no-store`. Đây là **liveness**, không phải readiness của database/storage/queue.
- Next.js chuyển tiếp `/api/v1/*` đến API cùng origin trình duyệt, chưa bật CORS. Đích proxy là biến server, không được đưa secret vào `NEXT_PUBLIC_*`.
- Trang khởi tạo tiếng Việt theo navy v2, có kiểm tra API thật, trạng thái chờ/lỗi/thành công, timeout 8 giây và thử lại. Không giả lập đăng nhập hoặc kho học liệu.
- Manifest/icon cơ bản chuẩn bị PWA; không service worker/cache/offline.
- Compose local cho PostgreSQL/Redis với password bắt buộc, cổng loopback, healthchecks và named volumes; chưa tự chạy SQL tham chiếu.
- Workflow CI pin action commit SHA, cài frozen lockfile, format, lint/typecheck/Jest/build và Playwright.

## Quyết định triển khai

Mốc đầu không cài sẵn ORM/worker/S3/PDF.js khi chưa có luồng sử dụng được kiểm chứng. Các phần đó giữ nguyên trong stack đã chốt và được đưa vào các mốc sau. Không chuyển schema thành ORM bằng cách bỏ CHECK, index hoặc trigger.

Node trên PATH cá nhân là 22, nhưng pnpm của môi trường chạy Node 24.19. Vì vậy dự án ghi rõ Node 24.19, không dựa vào PATH cá nhân. ESLint 10 dùng trực tiếp plugin Next và React Hooks tương thích; `eslint-config-next` có peer dependency chưa hỗ trợ ESLint 10 nên không dùng cấu hình đó.

Tài liệu thiết kế gốc, Word/ZIP/PNG và SQL giữ nguyên nội dung. Root `DESIGN.md` vẫn mô tả wireframe; phạm vi trang khởi tạo nằm trong `apps/web/DESIGN_BRIEF.md`.

## Bằng chứng đã kiểm tra

| Kiểm tra | Kết quả local |
|---|---|
| Jest cấu hình và HTTP | 23 test đạt; đã quan sát thất bại trước khi tạo implementation |
| Lint + TypeScript | Đạt |
| Production build Next.js/NestJS | Đạt |
| Production runtime local | Web `/`, API qua proxy và manifest đều phản hồi HTTP 200; health giữ `no-store` |
| Playwright Chrome headless | 7 test đạt; web/API thực tế + lỗi/phản hồi sai/loading/retry |
| Responsive | 360×800, 768×1024, 1440×1000 không tràn ngang; ảnh được xem trực tiếp |
| Format | Đạt |
| pnpm peer dependencies | Không có xung đột |
| Docker Compose | `config --quiet` đạt với password giả chỉ trong process kiểm tra |

Playwright chạy server dev ở 3100/3101 và tự dừng. Ảnh QA ở `.local/`, không đưa vào source. Ảnh đầu sau anchor-scroll gây sai vị trí fixed element trong full-page screenshot; đã chụp lại từ đầu trang và xác nhận nội dung. Badge Next.js devtools trong ảnh là công cụ development, không có trong production build.

Detector giao diện chỉ đưa advisory về một số cỡ chữ/màu ngoài schema wireframe; không có lỗi cơ học bắt buộc. Đây là mở rộng có phạm vi cho trang development, không sửa hệ thống token gốc chỉ để xóa cảnh báo.

Rà soát code độc lập trên commit `dc5944e`: không có actionable findings, bao phủ 29/29 file được chọn cùng các env/test/docs và lockfile importers liên quan. Review giao diện độc lập: **disposition: ship**, không có material fixes, chỉ áp dụng cho trang foundation và bốn ảnh desktop/mobile/tablet/error. Documentation pass: **No changes**; giữ nguyên hệ thống wireframe, xác nhận các token/breakpoint bổ sung chỉ thuộc phạm vi `apps/web`.

GitHub Actions đã chạy thành công trên Linux ở commit `dc5944e`: [Foundation checks — run 38128517037](https://github.com/AnhVuu215/HUCEScholar/actions/runs/38128517037). Đây là bằng chứng clean-checkout/frozen install, kiểm tra code, production build và Playwright trên runner GitHub, độc lập với kết quả Windows local. Phần khởi tạo được đưa vào [PR nháp #1](https://github.com/AnhVuu215/HUCEScholar/pull/1); chưa merge vào `main`.

## Giới hạn hiện tại

- Docker daemon chưa chạy: chưa pull/start hoặc kiểm thử runtime hai container. Chưa có database dữ liệu ứng dụng.
- Chưa có tài khoản, session, phân quyền, Prisma migration, upload/scan, kiểm duyệt, PDF reader, ghi chú hoặc sách thật.
- Chưa kiểm tra cài PWA trên Android/iOS hoặc đọc trên thiết bị vật lý. Test viewport không thay thế device testing.
- Chưa có container web/API, Caddy, HTTPS hoặc deployment cloud. Compose hiện chỉ chuẩn bị dịch vụ phụ local.

## Mốc 2

1. Chạy PostgreSQL sạch, tạo Prisma mapping và migration SQL giữ nguyên 23 bảng cùng ràng buộc hiện có.
2. Kiểm thử migration/schema, không dùng `db push` và không coi fixture rollback là seed dữ liệu.
3. Đăng nhập tài khoản do admin cấp: Argon2id, opaque session cookie lưu hash trong database, CSRF/origin và revoke.
4. Nối màn hình đăng nhập vào API thật, kiểm thử ba role trước khi mở luồng học liệu.
