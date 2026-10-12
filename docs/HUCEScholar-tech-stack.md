# HUCEScholar — Tech stack và kiến trúc MVP

Ngày quyết định: 11/10/2026. Trạng thái: chốt công nghệ MVP; đã có workspace Next.js/NestJS, migration PostgreSQL, đăng nhập/phân quyền, quản lý tài khoản, danh mục đào tạo, phân công, bản nháp, upload PDF riêng tư, gửi/rút, admin kiểm duyệt bản hiện hành, kho học liệu và reader PDF.js theo quyền. Chưa triển khai vận hành. Bằng chứng: [mốc khởi tạo](implementation/2026-10-11-foundation.md), [database và auth](implementation/2026-10-11-database-auth.md), [quản lý tài khoản](implementation/2026-10-11-account-management.md), [danh mục và phân công](implementation/2026-10-11-academic-catalog.md), [upload PDF](implementation/2026-10-11-private-pdf-upload.md).

Người dùng đã chọn **web responsive + PWA cho MVP**. Một giao diện dùng trên máy tính, điện thoại và máy tính bảng; có thể thêm vào màn hình chính trên thiết bị/trình duyệt hỗ trợ. Chưa phát hành ứng dụng native trên App Store/Google Play. Việc cài PWA không đồng nghĩa đọc PDF offline.

## 1. Stack đã chốt

| Phần | Lựa chọn | Vai trò trong HUCEScholar |
|---|---|---|
| Ngôn ngữ ứng dụng | TypeScript | Dùng thống nhất ở frontend, API và worker |
| Frontend | React + Next.js App Router | Giao diện responsive và PWA; giữ hướng thiết kế navy v2 |
| CSS | Tailwind CSS + CSS variables | CSS sản phẩm và surface brief là nguồn hiện hành; DESIGN.md/sidecar giữ phạm vi wireframe lịch sử |
| Backend | NestJS, REST API, OpenAPI | Auth, phân quyền, học liệu, phiên bản, kiểm duyệt, ghi chú và thư viện |
| Database | PostgreSQL | Kế thừa mô hình 23 bảng và các ràng buộc đã thiết kế |
| Truy cập dữ liệu/migration | Prisma ORM + migration SQL tùy chỉnh | Truy vấn có type; giữ nguyên CHECK, partial index, trigger và function PostgreSQL |
| PDF reader | Mozilla PDF.js (`pdfjs-dist`) | Render PDF, text layer, chuyển trang, zoom; lớp ghi chú do HUCEScholar xây riêng |
| File production | Amazon S3, bucket private | Lưu PDF theo phiên bản; PostgreSQL chỉ giữ metadata và object key |
| Tác vụ nền | BullMQ + Redis, worker từ codebase NestJS | Kiểm tra file và gửi email có retry; Redis không giữ dữ liệu học tập chính |
| Kiểm tra PDF | ClamAV + Poppler (`pdfinfo`, `pdftotext`) trong worker | Quét mã độc, xác định số trang/text layer và kiểm tra khả năng đọc file |
| Email | SMTP qua Nodemailer | Gửi hướng dẫn tài khoản/reset; tài khoản SMTP cấu hình theo môi trường |
| Kiểm thử | Jest + Supertest; Playwright | Unit/integration API và các hành trình web/PWA |
| Công cụ/môi trường | Node.js LTS, pnpm, Docker Compose, Git | Phát triển trên Windows; chạy dịch vụ phụ trong Docker/Linux |
| Triển khai ban đầu | Container Linux + reverse proxy Caddy + HTTPS | Cùng origin cho web và `/api`; chưa chọn/mua máy chủ hoặc tạo dịch vụ cloud |

Các phiên bản cụ thể được đối chiếu tương thích và pin khi scaffold, ghi trong lockfile, runtime config và image tag. Không dùng tag `latest` cho deployment hoặc tự nâng major. Chốt công nghệ không phải bằng chứng ứng dụng đã build hay chạy trên thiết bị.

## 2. Vì sao chọn hướng này

**Next.js + NestJS:** cùng TypeScript, nhưng tách giao diện khỏi nghiệp vụ. Next.js phụ trách hiển thị và PWA; NestJS là nơi duy nhất quyết định quyền, trạng thái và ghi dữ liệu. API có thể tái sử dụng nếu sau này làm app native. Đánh đổi là phải chạy frontend và backend riêng; không lặp nghiệp vụ trong Next.js Server Actions/Route Handlers.

**PostgreSQL:** phù hợp với schema hiện có, giao dịch duyệt/bàn giao và dữ liệu JSON của anchor ghi chú. Không chuyển sang MongoDB hoặc tạo lại mô hình chỉ để khớp ORM. Prisma không được coi là nguồn mô tả đầy đủ mọi ràng buộc PostgreSQL; migration phải giữ SQL đặc thù và được kiểm thử.

**Web + PWA:** một codebase giao diện cho MVP, phù hợp ba vai trò và reader dùng trong trình duyệt. React Native/Expo dành cho một quyết định phát triển native sau này; không đưa vào MVP hoặc hứa tái sử dụng nguyên xi UI web. Các phương án Laravel/Spring Boot cũng làm được nghiệp vụ, nhưng chưa có backend cũ buộc phải giữ; chọn TypeScript thống nhất để giảm số ngôn ngữ của ứng dụng.

## 3. Ranh giới kiến trúc

Backend là **modular monolith**: một ứng dụng nghiệp vụ chia module, một database. Worker chạy tiến trình riêng từ cùng codebase để tác vụ PDF không chặn API; đây không phải dự án microservices.

```text
Trình duyệt desktop / mobile / tablet / PWA đã cài
                  |
             HTTPS cùng origin
                  |
                Caddy
          /                 /api/v1
     Next.js                  NestJS
                         /       |       \
                  PostgreSQL  S3 private  Redis/BullMQ
                                            |
                                      NestJS worker
                                     /             \
                              ClamAV/Poppler       SMTP
```

Module dự kiến: Auth & Users; Academic Catalog & Assignments; Documents & Versions; Publication & Moderation; Files; Annotations & Reading Progress; Saved Library & Books; Reports; Transfers & Audit.

Phương án tổ chức tổng thể. Hiện mới có `apps/web`, `apps/api`, `tests` và `infra`; các module/worker trong cây dưới đây vẫn là kế hoạch:

```text
apps/web/       Next.js
apps/api/       NestJS HTTP API và entrypoint worker
packages/       API client/types sinh từ OpenAPI nếu cần
infra/          Compose, proxy và cấu hình môi trường mẫu
docs/           nghiệp vụ, ERD, API, quyết định kỹ thuật
design/         prototype và nguồn thiết kế đã có
```

## 4. Đăng nhập và quyền

- MVP dùng session token ngẫu nhiên trong cookie `HttpOnly`, `Secure` khi HTTPS, `SameSite=Lax`; server lưu hash trong `auth_sessions` theo schema hiện có. Không lưu token đăng nhập trong localStorage. Mật khẩu hash Argon2id.
- API kiểm tra tài khoản ACTIVE/đã xác minh, role và quyền trên từng tài nguyên; frontend ẩn nút chỉ phục vụ trải nghiệm. Ghi chú luôn lọc theo chủ sở hữu và phiên bản.
- Mutation kiểm tra CSRF và origin; auth/reset có giới hạn tần suất. Khóa tài khoản/reset/đăng xuất thu hồi session theo chính sách. Không dùng session store trong RAM cho production.
- Request/response có validation và mã lỗi thống nhất. ID bigint trả qua JSON dưới dạng chuỗi để tránh mất độ chính xác trong JavaScript. `revision` dùng để phát hiện sửa đồng thời.
- Các thao tác duyệt, rút, bàn giao, đổi hiển thị dùng transaction và kiểm tra điều kiện trên dữ liệu hiện hành; giữ quy tắc A01–A06, BR16–BR17.

## 5. Reader, ghi chú và lưu tiến độ

- PDF.js chạy ở client, worker và tài nguyên phụ được build/self-host cùng phiên bản thư viện. Chỉ render nhóm trang đang xem và lân cận để hạn chế bộ nhớ trên điện thoại.
- Ghi chú trang và highlight là dữ liệu HUCEScholar lưu bằng API, không tự có đồng bộ chỉ vì dùng PDF.js. Khóa theo người dùng + phiên bản + trang; tọa độ anchor theo hệ tọa độ PDF, chuyển qua viewport khi zoom/rotate.
- Tiến độ và ghi chú lưu PostgreSQL nên có thể mở lại khi đăng nhập trên thiết bị khác sau khi server xác nhận lưu. Đổi PDF tạo phiên bản mới; không tự chuyển anchor cũ.
- PDF scan không có text layer vẫn được đọc nếu hợp lệ, nhưng không hứa chọn chữ/highlight; giữ ghi chú theo trang. OCR chưa nằm trong MVP.
- Mất mạng hoặc lưu thất bại phải giữ nội dung đang nhập trong phiên và có retry rõ ràng; chưa làm hàng đợi chỉnh sửa offline hoặc đồng bộ xung đột đa thiết bị theo thời gian thực.

## 6. File và tác vụ nền

- File mới vào vùng quarantine private, dùng object key mới bất biến; không ghi đè file phiên bản đã công bố. Giới hạn kích thước, kiểm tra chữ ký file và MIME trước xử lý sâu.
- Worker xử lý có timeout, giới hạn tài nguyên và idempotency theo file/object key. Lỗi scanner/parser không được chuyển thành SAFE. Chỉ SAFE khi đủ bằng chứng kỹ thuật theo schema; trạng thái SAFE không thay thế việc admin duyệt quyền và nội dung.
- PostgreSQL giữ trạng thái file; Redis giữ hàng đợi. Job ID ổn định, retry có giới hạn và cơ chế đối soát file CHECKING giúp khôi phục khi enqueue thất bại hoặc worker bị dừng.
- Reader lấy stream qua API có kiểm tra quyền và hỗ trợ HTTP Range. Download là endpoint riêng, chỉ cấp khi quyền nguồn cho phép; response học liệu/ghi chú dùng cache policy private/no-store phù hợp. Bucket không public.
- “Chỉ đọc” nghĩa là không cấp tính năng tải file gốc; không phải DRM hoặc bảo đảm người đã đọc không thể sao chép nội dung.
- Local dùng private filesystem adapter cho phát triển cơ bản; integration/pilot phải kiểm tra adapter S3 thật, quyền bucket, Range và lỗi upload. Không nhúng credentials vào mã nguồn.

## 7. PWA và thiết bị

- Manifest, icon riêng và chế độ standalone; hướng dẫn cài theo khả năng trình duyệt. HTTPS khi triển khai. Service worker chỉ precache tài nguyên công khai của app shell/offline fallback; không cache API auth, metadata cá nhân, PDF, ghi chú hoặc URL có token.
- Không thêm push notification, OCR, đọc PDF offline hoặc app native chỉ vì PWA hỗ trợ một số khả năng này.
- Laptop: bảng quản trị đầy đủ và reader có vùng phụ. Tablet: hỗ trợ cảm ứng, xoay ngang/dọc, thu gọn sidebar. Điện thoại: một cột, điều khiển chạm, ghi chú theo ngữ cảnh trang. Responsive không phải thu nhỏ desktop.
- Mục tiêu kiểm chứng: Chrome/Edge desktop, Safari macOS; Chrome Android trên phone/tablet; Safari iPhone/iPad và PWA đã thêm vào màn hình chính trên thiết bị hỗ trợ. Version hỗ trợ phải ghi rõ khi thử nghiệm pilot.
- Playwright desktop/mobile/WebKit là kiểm tra tự động, không thay thế thử PDF và cảm ứng trên Android/iPhone/iPad thật.

## 8. Điều kiện trước khi xây toàn bộ ứng dụng

1. Thử kỹ thuật nhỏ với PDF thật được phép dùng: PDF nhiều trang, chữ tiếng Việt, scan, text layer, xoay trang, lựa chọn chữ/highlight và mở lại anchor sau zoom trên phone/tablet. PDF.js là lựa chọn đã chốt, độ phù hợp với bộ tài liệu thực tế còn phải chứng minh.
2. Tạo skeleton web/API và baseline migration từ SQL tham chiếu trên database trống; đối chiếu đủ 23 bảng, CHECK, FK, partial index, function/trigger và các ca kiểm tra nghiệp vụ. Không chạy `db push` để thay schema hiện có.
3. Làm một luồng xuyên suốt: tài khoản được cấp → upload → kiểm tra file → gửi/duyệt → tìm → đọc → ghi chú → mở lại trên thiết bị khác. Sau đó mới mở rộng CRUD và nghiệp vụ phụ.
4. Kiểm thử người dùng không đọc được ghi chú của người khác, không duyệt file CHECKING/FAILED, không thay phiên bản đã khóa và không đọc tài liệu bị ẩn. Kiểm tra phục hồi job, lưu ghi chú lỗi, xung đột revision, Range/zoom trên mobile và cài PWA qua HTTPS.

Chưa chọn gói cloud, domain, ngân sách hoặc tạo tài khoản/dịch vụ trả phí. Upload PDF đã chạy local với private filesystem và worker ClamAV/Poppler; Đã có gửi/rút và admin kiểm duyệt/bản hiện hành; Đã có kho học liệu, reader PDF.js và tải theo quyền; Đã có ghi chú riêng theo trang và lưu tiến độ với kiểm soát revision; highlight chưa mở. S3 thật và deploy còn ở các mốc tiếp theo. Xem [ghi chú và tiến độ](implementation/2026-10-12-reader-notes-progress.md).

## 9. Nguồn kỹ thuật chính thức đã đối chiếu

- [Next.js: Progressive Web Apps](https://nextjs.org/docs/app/guides/progressive-web-apps) — manifest, cài lên màn hình chính và hướng dẫn theo nền tảng; cài PWA không bắt buộc có chế độ offline.
- [NestJS: Authorization](https://docs.nestjs.com/security/authorization), [Session](https://docs.nestjs.com/techniques/session) — cơ chế backend và lưu ý store session production. Quyết định dùng opaque token/hash trong bảng hiện có là thiết kế của dự án, không sao chép ví dụ JWT.
- [NestJS: Queues](https://docs.nestjs.com/techniques/queues) — BullMQ/Redis và worker.
- [Prisma: Unsupported database features](https://www.prisma.io/docs/orm/v7/prisma-migrate/workflows/unsupported-database-features) — migration SQL tùy chỉnh cho chức năng không biểu diễn đầy đủ trong schema ORM.
- [Mozilla PDF.js](https://mozilla.github.io/pdf.js/getting_started/) — display/viewer/worker; annotation riêng và khả năng tương thích cần thử kỹ thuật.
- [Amazon S3: Presigned URLs](https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-presigned-url.html) — URL là quyền truy cập tạm thời, không phải cơ chế thu hồi tức thời hoặc kiểm soát riêng nút tải. MVP ưu tiên stream qua API để kiểm tra quyền hiện hành.
- [ClamAV: Scanning](https://docs.clamav.net/manual/Usage/Scanning.html) — scanner và vận hành quét file; SAFE kỹ thuật không là bảo đảm nội dung hợp pháp.

Tài liệu dự án đối chiếu: PRODUCT.md, DESIGN.md, đặc tả nghiệp vụ 1.1, docs/database/HUCEScholar_schema_postgresql.sql và design/wireframe/DESIGN_BRIEF.md.
