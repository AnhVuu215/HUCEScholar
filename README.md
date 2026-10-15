# HUCEScholar

**Cập nhật14/10/2026:** giảng viên upload PDF từ nguồn tự chọn và tự công bố khi file quét đạt; nguồn tham khảo tùy chọn, không bắt buộc căn cứ quyền hoặc admin duyệt. Tài liệu sinh viên vẫn dùng quy trình kiểm duyệt.

Nền tảng học liệu điện tử dành cho cộng đồng HUCE, theo hướng web responsive + PWA. Ba vai trò: quản trị viên, giảng viên và sinh viên. Dự án độc lập đang phát triển; chưa phải hệ thống chính thức của trường.

Đã có PostgreSQL/Prisma migration, đăng nhập/đăng xuất thật, cookie phiên, phân quyền ba vai trò, quản lý tài khoản, danh mục khoa/ngành/môn và phân công giảng viên. Giảng viên/sinh viên tạo bản nháp riêng, upload PDF private, gửi/rút và xem lịch sử. Admin xem PDF SAFE, yêu cầu sửa, từ chối hoặc duyệt bản hiện hành; chủ mở lại bản được yêu cầu sửa. Đã có kho học liệu, reader PDF.js, tải bản gốc theo quyền, ghi chú riêng theo trang và lưu tiến độ đọc. Giao diện responsive cho desktop, điện thoại và tablet. **Chưa có học liệu trường được cấp quyền thật, highlight, đọc offline hoặc triển khai vận hành.** Prototype trong `design/` vẫn dùng dữ liệu minh họa.

Trang chủ `/` là landing giới thiệu, chủ đề minh họa và hướng dẫn theo vai trò. Trang tiến độ cùng kiểm tra kết nối API nằm ở `/project`. Bìa minh họa không phải học liệu đã được công bố. Chi tiết: [landing page](docs/implementation/2026-10-12-landing-page.md).

## Tài liệu

- [Tech stack và kiến trúc MVP](docs/HUCEScholar-tech-stack.md)
- [Mô hình dữ liệu và SQL tham chiếu](docs/database/README.md)
- [Kết quả mốc database/auth, API và ranh giới bảo mật](docs/implementation/2026-10-11-database-auth.md)
- [Quản lý tài khoản và giới hạn hiện tại](docs/implementation/2026-10-11-account-management.md)
- [Danh mục đào tạo và phân công](docs/implementation/2026-10-11-academic-catalog.md)
- [Bản nháp học liệu](docs/implementation/2026-10-11-material-drafts.md)
- [Upload PDF riêng tư, worker và cách chạy](docs/implementation/2026-10-11-private-pdf-upload.md)
- [Gửi/rút yêu cầu duyệt và lịch sử](docs/implementation/2026-10-12-publication-requests.md)
- [Admin kiểm duyệt và bản hiện hành](docs/implementation/2026-10-12-admin-moderation.md)
- [Kho học liệu, trình đọc và quyền tải](docs/implementation/2026-10-12-learning-library.md)
- [Ghi chú riêng và tiến độ đọc](docs/implementation/2026-10-12-reader-notes-progress.md)
- [Phiên bản, bàn giao và ẩn/khôi phục](docs/implementation/2026-10-12-material-lifecycle.md)
- [Thư viện cá nhân](docs/implementation/2026-10-12-personal-library.md)
- [Giảng viên upload và tự công bố](docs/implementation/2026-10-14-lecturer-self-publication.md)
- [Tiến độ và phần còn lại ngày 14/10/2026](docs/implementation/2026-10-14-project-status.md)
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

Mở [http://127.0.0.1:3000/](http://127.0.0.1:3000/) rồi đăng nhập. API health ở `http://127.0.0.1:3001/api/v1/health`. Dừng web/API bằng `Ctrl+C`. Trang tiến độ dự án và kiểm tra API nằm ở `/project`.

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

CLI tạo account ACTIVE/verified và audit trong transaction; gọi lại không ghi đè tài khoản/mật khẩu. Đây chỉ là bootstrap ADMIN đầu tiên. Sau khi đăng nhập Admin, mở `/workspace/admin/users` để cấp tài khoản giảng viên/sinh viên. Admin nhập mật khẩu khởi tạo 16–128 ký tự và xác nhận đã đối chiếu danh sách hợp lệ; chuyển thông tin qua kênh riêng. Chưa có gửi email, reset hoặc buộc đổi mật khẩu. Tài khoản E2E ở database test không dùng để đăng nhập ứng dụng local.

Danh sách hỗ trợ tìm tên/email, lọc vai trò/trạng thái và phân trang. Sửa tên/email, khóa/mở khóa sử dụng revision chống ghi đè. Xung đột cho tải thông tin mới để đối chiếu trong khi giữ nội dung đang nhập. Khóa hoặc đổi email thu hồi mọi phiên của tài khoản; mở khóa không phục hồi cookie cũ. Role của tài khoản được giữ nguyên; ADMIN chỉ đọc ở chức năng này. Không xóa tài khoản.

## Danh mục và phân công

Admin mở `/workspace/admin/catalog/faculties`, tạo khoa → ngành/môn thuộc khoa, rồi chọn các ngành sử dụng môn. Môn có thể dùng chung khác khoa. Khoa phụ trách giữ cố định sau khi tạo; ngừng sử dụng giữ lịch sử. Không thể ngừng khoa còn ngành/môn hoạt động hoặc ngừng môn còn phân công hiện hành.

Tại `/workspace/admin/assignments`, chọn giảng viên hoạt động/đã xác minh và môn, cấp phân công hoặc thu hồi kèm lý do. Giảng viên mở `/workspace/lecturer/assignments` xem phân công riêng. Thu hồi chặn sửa bản nháp nhưng không xóa học liệu hoặc tự bàn giao. Danh mục local để trống, không tự nhập mã/sách HUCE giả.

## Bản nháp học liệu

Giảng viên mở `/workspace/lecturer/materials`, sinh viên mở `/workspace/student/materials` hoặc chọn **Học liệu của tôi**. Tạo bản nháp, nhập tiêu đề/loại, thêm 1–20 môn rồi lưu. Tác giả/mô tả có thể để trống. **Giảng viên không cần tài liệu HUCE, nguồn tham khảo tùy chọn và không bắt buộc khai báo căn cứ quyền.** Sinh viên vẫn cần nguồn/căn cứ quyền cho tài liệu bổ sung và không sửa học liệu giảng viên; Admin không biên soạn ở luồng này.

Giảng viên cần còn phân công ở tất cả môn hiện tại và môn mới để lưu. Khi mất phân công, metadata vẫn được giữ để xem và đối chiếu. Lỗi/xung đột giữ nội dung nhập; chỉ bỏ thay đổi khi xác nhận. Metadata được lưu riêng trước upload: `file_id` null chỉ ở DRAFT, không tạo file giả. Bản đã lưu có thể gắn/thay PDF tối đa25MiB, xem CHECKING/SAFE/FAILED bằng **Cập nhật trạng thái**. Khi SAFE, giảng viên chọn **Công bố** rồi xác nhận: tài liệu xuất hiện trong kho nếu đang hiển thị, không qua admin duyệt. Mất phản hồi dùng **Tải trạng thái công bố** trước retry. Lựa chọn tải PDF có hiệu lực sau công bố. Xem [giảng viên tự công bố](docs/implementation/2026-10-14-lecturer-self-publication.md).

Sinh viên chọn **Gửi duyệt** khi PDF SAFE rồi xác nhận phiên bản/lần lưu. Bản SUBMITTED khóa metadata/PDF; nhập lý do rồi **Rút về nháp** để sửa. Nếu lỗi hoặc chưa rõ kết quả, bấm **Tải trạng thái duyệt** trước retry. Yêu cầu giảng viên cũ vẫn được rút/mở lại; sau đó dùng Công bố. CHANGES_REQUIRED có **Mở lại để chỉnh sửa**. APPROVED/REJECTED giữ nguyên; **Tạo phiên bản kế tiếp** copy thông tin/môn sang nháp mới, cần PDF mới và chọn lại quyền tải. Giảng viên tự công bố lại, sinh viên gửi duyệt lại. Bản công bố và ghi chú cũ giữ nguyên; **Lịch sử phiên bản** giữ các yêu cầu/ quyết định trước đó.

Admin mở **Kiểm duyệt học liệu** ở `/workspace/admin/moderation`, lọc yêu cầu và mở chi tiết. Chỉ PDF SAFE với snapshot còn khớp được mở ở tab mới. Chọn quyết định, nhập lý do, duyệt cần xác nhận đã kiểm tra nội dung/quyền; xác nhận inline để lưu. Duyệt đặt bản hiện hành, không tự mở tài liệu HIDDEN. Khi mất kết nối, **Tải trạng thái yêu cầu** trước retry.

Ba vai trò mở **Kho học liệu** ở `/workspace/library`, tìm tiêu đề/tác giả, lọc môn/loại/nguồn và chọn **Đọc tài liệu**. Reader chuyển trang, zoom, xoay và chọn chữ nếu PDF có text layer. Nguồn/quyền nằm trong phần mở rộng inline; **Tải PDF gốc** chỉ xuất hiện khi được phép. Mỗi lượt metadata/file kiểm tra APPROVED + VISIBLE + SAFE + hạn quyền; admin không vượt điều kiện này. Ghi chú riêng gắn phiên bản/trang, có tạo/sửa/xóa; lỗi lưu giữ bản soạn, retry tạo giữ request ID để tránh nhân đôi. Lưu trước khi dùng Back/Forward của trình duyệt: cảnh báo rời trang hiện chỉ bao phủ link trong app, đăng xuất và đóng/tải lại trang. Tiến độ chỉ lưu trang render thành công, mở lại sau khi máy chủ xác nhận; xung đột tab yêu cầu tải lại. Khi lỗi tải tiến độ có thể đọc từ trang 1 mà không ghi. Chưa có highlight hoặc PDF offline. Chi tiết: [ghi chú và tiến độ](docs/implementation/2026-10-12-reader-notes-progress.md). `dev`/`build` chuẩn bị worker, CMaps, font và wasm PDF.js cùng version vào public; không dùng CDN.

Để chạy kiểm tra file local, bật profile Docker riêng: `docker compose --env-file infra/.env -f infra/compose.yaml --profile files up -d --build clamav file-worker`. API và worker dùng chung `.local/files` ngoài webroot. Production yêu cầu S3 private; chưa tạo dịch vụ cloud. Hướng dẫn, giới hạn và bằng chứng quét thật ở tài liệu upload phía trên.

## Kiểm tra

```powershell
pnpm format:check
pnpm check
pnpm test:setup
pnpm test:integration
pnpm exec playwright install chromium
pnpm test:e2e
```

`pnpm check` chạy lint, typecheck, unit Jest và build; không cần kết nối DB để chạy unit/build. Prisma client được sinh trước typecheck/build/dev và không commit. `test:setup` cần PostgreSQL/Redis đang chạy, tạo/migrate **hucescholar_test**, cập nhật các account tổng hợp `e2e-*@example.test` theo từng suite với mật khẩu ngẫu nhiên, ghi env bị Git bỏ qua vào `.local/test.env`. Không dùng credential thật trong kiểm thử.

Integration và browser dùng riêng database `_test` + Redis **DB 15**, không chạy đồng thời vì suite reset vùng rate-limit test. Browser global setup flush DB 15 dành riêng cho dự án; không dùng DB 15 này cho việc khác. Test setup không drop database. Ca kiểm tra schema SQL dùng rollback; fixture API được dọn sau suite; dữ liệu synthetic do Playwright tạo chỉ tồn tại trong database test. Playwright tự chạy web/API ở 3100/3101 rồi dừng; giữ hai cổng trống. Trace tắt để tránh ghi lại mật khẩu/cookie.

Chạy xong `check`/typecheck/build và Prisma generate **trước** browser; các lệnh này có thể sửa source sinh tự động, khiến API test chạy `--watch` khởi động lại giữa request PDF. Khi máy tải cao có thể dùng `pnpm test:e2e --workers=2`; không chạy codegen song song với bộ browser.

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

Admin mở **Quản lý học liệu** tại `/workspace/admin/materials` để tìm/lọc, bàn giao giáo trình giảng viên hoặc ẩn/khôi phục toàn tài liệu. Người nhận phải hoạt động, đã xác minh và có phân công ở mọi môn trong lịch sử. Bàn giao rút yêu cầu đang chờ về nháp nguyên tử; giữ bản công bố, tác giả và ghi chú. Ẩn chặn lượt đọc/tải mới ở mọi version; khôi phục cần bản hiện hành đã duyệt, PDF SAFE, quyền còn hiệu lực và xác nhận lý do ẩn đã giải quyết. Lỗi/xung đột giữ lý do, bắt tải trạng thái trước thử lại. Xem [vòng đời học liệu](docs/implementation/2026-10-12-material-lifecycle.md).

## Lộ trình còn lại

1. Nguồn sách được cấp quyền.
2. Môi trường pilot: S3 private, HTTPS, backup/phục hồi và kiểm thử trên thiết bị thật.

Mỗi mốc có kiểm chứng riêng; không cam kết đọc PDF offline trong MVP.

## PWA

Mở `/install` từ trang chủ, đăng nhập hoặc menu không gian để xem hướng dẫn cài. Nút **Cài ứng dụng** chỉ xuất hiện khi trình duyệt cung cấp prompt; Safari/iOS dùng hướng dẫn menu. Chưa kiểm chứng cài trên thiết bị thật hoặc domain HTTPS.

Production đăng ký worker khi trình duyệt hỗ trợ secure context. Dev mặc định không đăng ký; bật thử bằng PowerShell `$env:NEXT_PUBLIC_ENABLE_PWA = '1'` trước `pnpm --filter @hucescholar/web dev`. Bỏ biến chỉ ngừng đăng ký mới; worker đã cài vẫn tồn tại theo vòng đời browser, có thể gỡ trong DevTools → Application → Service Workers khi kết thúc thử nghiệm. Biến được Next đọc lúc build; không thay thế HTTPS khi triển khai.

`scripts/pwa-assets.mjs` chạy trước dev/build, sinh icon PNG từ monogram H riêng và compile `scripts/pwa-worker.ts` thành `public/sw.js` (bị Git bỏ qua). Worker được typecheck với WebWorker lib; không thêm dependency. Khi sửa tài nguyên precache, tăng phiên bản cache trong worker. Bản cập nhật chờ đóng các tab cũ, không tự reload làm mất bản soạn.

Worker chỉ giữ sáu asset public cố định: offline HTML tự chứa và icon. Không cache HTML/RSC/Next chunks, API, cookie phiên, PDF, ghi chú, URL có query/token hoặc nguồn ngoài. Khi hard navigation trong app thất bại do mạng, hiện trang mất kết nối chung; HTTP401/404/500 giữ nguyên. Mất mạng không thể đọc PDF hoặc lưu ghi chú, không có background sync. Chi tiết: [mốc PWA](docs/implementation/2026-10-15-pwa-foundation.md).

Ba vai trò mở **Thư viện của tôi** ở `/workspace/personal-library`. Trong reader chọn **Lưu tài liệu**; **Đã lưu** mở bản công bố hiện hành, **Đọc gần đây** mở đúng phiên bản/trang đã lưu tiến độ. Bỏ lưu cần xác nhận và giữ ghi chú/tiến độ. Mục bị ẩn, hết hạn quyền hoặc PDF không SAFE chỉ hiện thông báo không khả dụng; vẫn bỏ được liên kết đã lưu. Khi mất phản hồi, **Tải trạng thái lưu** đối chiếu server trước thử lại. Xem [thư viện cá nhân](docs/implementation/2026-10-12-personal-library.md).

```text
apps/web/       Next.js App Router, login, tài khoản, danh mục, phân công và bản nháp/PDF
apps/api/       NestJS, Prisma, auth guards, Users/Academic/Materials và PDF worker
scripts/        Cấu hình local và database/test fixture riêng
apps/api/prisma SQL migrations và mapping 23 model
infra/          PostgreSQL/Redis local và profile ClamAV/Poppler worker
tests/          Hành trình Playwright (không ghi credential vào trace)
design/         Prototype được giữ riêng
docs/           Proposal, use case, schema và nhật ký triển khai
```
