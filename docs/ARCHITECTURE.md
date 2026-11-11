# Kiến trúc HUCEScholar

Tài liệu này dành cho người mới vào dự án. Đọc xong bạn sẽ biết hệ thống gồm những phần nào, một request đi qua đâu, code của từng tính năng nằm ở thư mục nào và những quy ước chung cần giữ. Quy tắc nghiệp vụ nằm ở [quy tắc nghiệp vụ](HUCEScholar-quy-tac-nghiep-vu.md); lý do chọn công nghệ ở [tech stack](HUCEScholar-tech-stack.md).

## 1. Tổng quan

HUCEScholar là kho học liệu điện tử. Hệ thống có hai vai trò:

- **Sinh viên** tìm, đọc PDF, ghi chú, tô sáng, làm thẻ ôn tập, theo dõi danh sách đọc và lịch học. Sinh viên cũng tải tài liệu (PDF/Word) lên để đóng góp.
- **Quản trị viên** quản lý tài khoản và danh mục, duyệt mọi tài liệu trước khi công bố, ẩn/khôi phục tài liệu, xử lý báo cáo và soạn danh sách đọc theo môn.

```text
Trình duyệt
   │  HTTPS (local: HTTP)
   ▼
Next.js web (apps/web) ── rewrite /api/* ──►  NestJS API (apps/api)  ──► PostgreSQL (dữ liệu, ràng buộc, trigger)
   giao diện, không chứa nghiệp vụ                │                      Redis (rate limit, hàng đợi BullMQ)
                                                  │                      Kho file riêng tư (local hoặc S3)
                                                  ▼
                                       File worker (apps/api/src/file-worker.ts)
                                       quét ClamAV, đọc PDF bằng Poppler, chuyển Word → PDF,
                                       nhắc lịch / nhắc thẻ ôn, dọn thùng rác vở ghi
```

| Thành phần | Thư mục | Vai trò |
|---|---|---|
| Web | `apps/web` | Next.js App Router, React, giao diện tiếng Việt. Chỉ hiển thị và gọi API, không tự quyết quyền. |
| API | `apps/api` | NestJS REST `/api/v1`. Mọi kiểm tra quyền, trạng thái và giao dịch nằm ở đây. |
| Worker | `apps/api/src/file-worker.ts` | Cùng mã nguồn với API, chạy riêng trong container; xử lý hàng đợi và các việc định kỳ. |
| Database | `apps/api/prisma` | Prisma schema và migration SQL viết tay (giữ CHECK, trigger, partial index). |
| Hạ tầng local | `infra/` | Docker Compose: PostgreSQL, Redis, ClamAV, docx-converter, file worker. |
| Test | `apps/api/test`, `tests/` | Jest (unit + tích hợp với DB thật) và Playwright (e2e trên Chrome). |

## 2. Một request đi qua đâu

Ví dụ sinh viên lưu một ghi chú:

1. **Web**: component gọi hàm trong `apps/web/lib/*.ts` (ví dụ `lib/reading.ts`). Hàm này gắn CSRF token, gọi `/api/v1/...` và **kiểm tra hình dạng dữ liệu trả về** trước khi đưa cho component.
2. **Next rewrite** chuyển `/api/*` sang NestJS (`API_PROXY_TARGET`).
3. **Middleware chung** (`configure-application.ts`): gắn `X-Request-Id`, `Cache-Control: no-store`, helmet, cookie parser, giới hạn kích thước body.
4. **Guard**:
   - `CsrfGuard` (toàn cục): mọi request ghi phải có Origin đúng và CSRF token khớp cookie.
   - `SessionGuard`: đọc cookie phiên, tìm phiên còn hiệu lực trong `auth_sessions` (chỉ lưu hash).
   - `RolesGuard` + `@Roles('ADMIN')`: chặn theo vai trò.
5. **ValidationPipe**: DTO (`*.dto.ts`, class-validator) bỏ qua giá trị không hợp lệ và **từ chối mọi field không khai báo**.
6. **Controller** chỉ đọc request và gọi service.
7. **Service** chứa nghiệp vụ: mở transaction Prisma, khóa hàng/khóa advisory khi cần, kiểm tra lại quyền đọc tài liệu, kiểm tra `revision`, ghi audit và thông báo trong **cùng transaction**.
8. **PostgreSQL** là chốt chặn cuối: CHECK, FK, unique, trigger bảo vệ phiên bản đã công bố.

Lỗi nghiệp vụ trả về `{ code, message }` (ví dụ `409 STALE_REVISION`). Web dịch `code` thành câu tiếng Việt cho người dùng.

## 3. Bản đồ module

### API (`apps/api/src`)

| Thư mục | Nội dung |
|---|---|
| `auth/` | Đăng nhập, phiên, CSRF, rate limit, tự đăng ký, khôi phục mật khẩu, mailer |
| `account/` | Hồ sơ và cài đặt của chính người dùng |
| `users/` | Admin quản lý tài khoản |
| `academic/` | Danh mục khoa, ngành, môn |
| `drafts/` | Tài liệu của sinh viên: bản nháp, upload PDF/Word, gửi/rút duyệt, phiên bản kế tiếp. `material-draft-core.module.ts` là phần dùng chung với file worker (kiểm tra chủ sở hữu, chuyển Word sang PDF) |
| `library/` | Kho học liệu: danh mục, tìm kiếm không dấu, đọc/tải PDF theo quyền. `available()` là điều kiện "người đọc mở được" mà nhiều module khác dùng |
| `moderation/` | Admin duyệt phiên bản đã gửi; ẩn/khôi phục toàn tài liệu (`lifecycle.*`) |
| `reports/` | Người đọc báo cáo tài liệu; admin xử lý, có thể ẩn tài liệu |
| `reading/` | Dữ liệu đọc riêng: ghi chú trang, tô sáng, tiến độ, thư viện cá nhân, tìm và xuất ghi chú |
| `study/` | Thẻ ôn tập: lịch ôn, thống kê, xuất thẻ, nhắc buổi sáng |
| `files/` | Nhận upload, kho file riêng tư, hàng đợi quét/chuyển đổi, đọc chữ PDF |
| `reading-lists/` | Danh sách đọc theo môn, hạn đọc, theo dõi môn, dấu "đã đọc" |
| `calendar/` | Lịch học riêng, lặp lịch, nhắc lịch, nhập/xuất iCalendar |
| `notebooks/` | Vở ghi (canvas), ảnh trong vở |
| `notifications/` | Thông báo trong ứng dụng; `notify.ts` ghi thông báo trong transaction của người gọi |
| `ops/` | Request id, kiểm tra sẵn sàng (`/health/ready`) |
| `database/` | PrismaClient dùng chung |
| `common/` | Helper dùng chung: `parseId`, `requireActiveUser`, `lockCatalog`/`lockKey`, `conflict` |

Mỗi thư mục là một module NestJS (`*.module.ts`) gồm controller, service và DTO. Các module tài liệu phụ thuộc theo một chiều, không vòng: lõi `drafts/material-draft-core` ← `library` ← `drafts`, `reading`, `study`, `reports`; lõi ← `moderation` ← `reports`.

### Web (`apps/web`)

| Thư mục | Nội dung |
|---|---|
| `app/` | Route Next.js. `app/workspace/...` là phần sau đăng nhập; `admin/` và `student/` theo vai trò |
| `components/<tính năng>/` | Component theo tính năng (`library`, `materials`, `study`, `calendar`, `notes`...) |
| `components/ui/` | Thành phần giao diện dùng chung |
| `lib/<tính năng>.ts` | Gọi API, kiểm tra dữ liệu trả về, nhãn và câu lỗi tiếng Việt |
| `lib/auth.ts` | `apiRequest`, `csrfToken`, `ApiError`, vai trò |

Quy tắc: component không gọi `fetch` trực tiếp mà luôn đi qua `lib/`.

## 4. Mô hình dữ liệu cốt lõi

- **Tài liệu** (`documents`) là danh tính ổn định; mỗi lần sửa nội dung là một **phiên bản** (`document_versions`). Phiên bản đã duyệt **bất biến** (trigger chặn sửa); muốn đổi thì tạo phiên bản kế tiếp.
- Ba trục trạng thái **độc lập**, không gộp thành một cờ:
  - **Quét file** (`files.scan_status`): CHECKING → SAFE / FAILED.
  - **Kiểm duyệt** (`document_versions.review_status`): DRAFT → SUBMITTED → APPROVED / CHANGES_REQUIRED / REJECTED.
  - **Hiển thị** (`documents.visibility`): VISIBLE / HIDDEN.
  Người đọc chỉ thấy phiên bản APPROVED + file SAFE + tài liệu VISIBLE + còn hạn quyền.
- **Dữ liệu học tập riêng** (ghi chú, tô sáng, tiến độ, thẻ ôn, vở ghi, lịch) gắn với **người dùng và đúng phiên bản/trang**. Không ai khác xem được, kể cả admin.

Chi tiết bảng: `apps/api/prisma/schema.prisma` và [thiết kế dữ liệu](database/README.md).

## 5. Xử lý file

1. API nhận file trực tiếp (không qua JSON), kiểm tra kích thước/định dạng, lưu vào kho riêng tư và ghi trạng thái CHECKING.
2. API đẩy job vào BullMQ (Redis).
3. Worker quét ClamAV, đọc số trang/lớp chữ bằng Poppler; với Word thì quét nguồn, chuyển sang PDF rồi quét bản PDF.
4. Worker ghi kết quả và gửi thông báo cho người tải lên. Nếu job bị mất, worker tự đối soát lại theo chu kỳ.

File không bao giờ nằm trong webroot. Người đọc chỉ nhận file qua API sau khi được kiểm tra quyền ở mỗi request.

## 6. Quy ước chung

| Quy ước | Cách làm |
|---|---|
| Chống ghi đè | Bản ghi sửa được có cột `revision`. Client gửi revision đang thấy; khác thì `409 STALE_REVISION`, giao diện giữ nội dung đang nhập và cho tải bản mới để đối chiếu. |
| Thử lại an toàn | Thao tác tạo mới có `requestId` (UUID); gửi lại cùng id không tạo bản thứ hai. |
| Đồng thời | Khóa hàng (`FOR UPDATE`/`FOR SHARE`) hoặc khóa advisory theo tên (`lockKey`, `lockCatalog` trong `common/locks.ts`) trong transaction. |
| Kiểm tra quyền | Luôn ở API, ở mỗi request. Trong transaction ghi, gọi `requireActiveUser` để kiểm tra lại tài khoản. Tài liệu không còn đọc được thì trả 404 như không tồn tại. |
| Audit và thông báo | Ghi trong cùng transaction với thay đổi trạng thái. |
| Ngày giờ | Ngày học tập (hạn đọc, lịch ôn) tính theo giờ Việt Nam. |
| Lỗi | API trả `code` ổn định; web đổi sang câu tiếng Việt, không hiện thông tin kỹ thuật. |
| Bí mật | Không commit secret; không cache request có đăng nhập, PDF, ghi chú trong service worker. |
| Migration | Viết SQL migration bằng tay trong `prisma/migrations`, không dùng `db push`. |

## 7. Kiểm thử

| Lớp | Lệnh | Kiểm tra gì |
|---|---|---|
| Unit | `pnpm test` | Hàm thuần: lặp lịch, escape xuất file, cấu hình... |
| Tích hợp | `pnpm test:integration` | API thật với PostgreSQL/Redis test: quyền, transaction, ràng buộc DB |
| E2E | `pnpm test:e2e` | Hành trình người dùng trên Chrome |
| Tĩnh | `pnpm check` | Lint, typecheck, unit, build |

## 8. Thêm một tính năng mới

1. Ghi quyết định nghiệp vụ vào [quy tắc nghiệp vụ](HUCEScholar-quy-tac-nghiep-vu.md) hoặc PRODUCT.md nếu thay đổi chính sách.
2. Migration SQL mới (ràng buộc ở DB), cập nhật `schema.prisma`.
3. API: DTO → controller → service (transaction, quyền, revision/requestId) → test tích hợp.
4. Web: hàm trong `lib/` (gọi API + kiểm tra dữ liệu trả về) → component → route.
5. Test e2e cho hành trình chính.
6. Ghi chú triển khai trong `docs/implementation/YYYY-MM-DD-<tên>.md`: đã chốt gì, hành vi, kiểm chứng, giới hạn.

## 9. Nợ kỹ thuật đã biết

Đánh giá ngày 11/11/2026; sửa dần theo từng PR nhỏ, không đổi hành vi. Đã xong: helper dùng chung `common/` (PR #80) và tách module `materials` cũ thành `drafts`, `library`, `moderation`, `reports`, `reading`, `study`. Còn lại:

- Web tự viết lại cùng một kiểu tải dữ liệu (`useEffect` + `AbortController`) và gắn CSRF ở nhiều chỗ.
- Một số file lớn: `calendar.service.ts`, `notebooks.service.ts`, `note-editor.tsx`, `calendar-board.tsx`, `apps/api/test/materials.integration.spec.ts`.
