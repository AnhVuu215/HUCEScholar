# Rà soát app dev ngày 23/10 — lỗi và kế hoạch sửa

Ngày 23/10/2026, sau khi CAL-03 vào `main` (PR #34). Rà soát trên app dev đang chạy ở máy local (`pnpm dev` + `worker:files`, PostgreSQL/Redis trong Docker). Đây là bằng chứng local, không phải production.

## Cách rà soát

- **Quét trang:** script Playwright đăng nhập bằng 3 tài khoản audit (`audit-admin|lecturer|student@example.test`, chỉ có trong database dev).
  - 51 trang công khai và workspace, ở 1280px và 390px
  - ghi lỗi console, lỗi JS, request lỗi 4xx/5xx, tràn ngang, thông báo `role=alert`, badge issue của Next
  - chụp ảnh từng trang
- **Luồng tải lên:** admin tạo môn và phân công, giảng viên tạo bản nháp và tải PDF lên, theo dõi trạng thái 100 giây.
- **Log:** đọc log API, web và worker.
- **Phụ thuộc:** `pnpm audit --prod`.

Chưa rà: bấm sâu từng thao tác (ghi chú, tô màu, duyệt, báo cáo, DOCX). Các luồng này đã có trong bộ e2e (170 ca đạt trên môi trường test), nhưng chưa thử lại bằng tay trên database dev.

## Lỗi tìm thấy

| # | Mức | Nơi | Lỗi | Bằng chứng |
| --- | --- | --- | --- | --- |
| 1 | **P0** | Phụ thuộc | `next@16.4.0` dính 2 lỗ hổng **critical** (RCE ở Image Optimization với SVG; RCE ở hàm `use cache` trả typed array) và 1 lỗ hổng **high** (DoS ở Server Actions). Bản vá: 16.4.1. Dev và build còn bị Next tự dừng để báo. | `pnpm audit --prod`; log `next dev`/`next build` |
| 2 | P2 | Phụ thuộc | `mysql2@3.15.3` (high + moderate) và `deepmerge-ts@7.1.5` (high), vào qua `prisma@7.10.0` (CLI/config). Runtime dùng PostgreSQL nên rủi ro thấp. | `pnpm why` |
| 3 | **P1** | API: kiểm tra file | Trình quét ngừng vài giây là file tải lên **bị đánh lỗi vĩnh viễn**: hàng đợi thử 3 lần, cách 2s rồi 4s, sau đó ghi `FAILED / CHECK_UNAVAILABLE`. Người dùng phải tải lại file, không có nút "kiểm tra lại". | Lượt thử: FAILED sau ~6s khi ClamAV tắt (`scan-queue.ts:33`, `scan-processor.ts:62`) |
| 4 | **P1** | API + reader | PDF mất khỏi kho lưu (DB ghi SAFE nhưng object không còn): API trả **503 "Kiểm tra kết nối rồi thử lại"**, reader báo "Chưa tải được học liệu. Kiểm tra kết nối". Lời khuyên sai, và không có log nào chỉ ra file nào bị mất. | 12/12 lượt mở `/workspace/library/versions/1` và `/2`; `.local/files` không còn 2 object `quarantine/…` (`library.service.ts:315`) |
| 5 | **P1** | Môi trường dev | ClamAV, docx-converter và container `file-worker` đã dừng 45 giờ. `pnpm dev` không chạy worker nên mọi upload đều lỗi hoặc treo, Word không chuyển được, nhắc lịch (CAL-03) không chạy. Image `file-worker` build từ trước CAL-03. | `docker ps -a`; README chưa nói rõ cần chạy gì |
| 6 | P2 | Web: reader | Hai component cạnh nhau có cùng `key` khi id tài liệu trùng id phiên bản: "Encountered two children with the same key, `2`" (3 issue trên badge Next). | 20 cảnh báo trong log; `library-reader.tsx:418-419`. **Đã sửa** trong PR này (`codex/fix-reader-duplicate-keys`) |
| 7 | P2 | Web: trang đầu | Breadcrumb trang đầu của cả 3 vai trò ghi "**Tài khoản của tôi**" thay vì "Trang đầu". | Ảnh chụp `/workspace/admin`, `/student`; `role-workspace.tsx:220` lấy mặc định này |
| 8 | P2 | Web: quản lý tài khoản | Cột "Thao tác" bị lệch: "Sửa" thụt khác hai link còn lại, mỗi dòng rất cao vì ba link xếp dọc. | Ảnh chụp `/workspace/admin/users` 1280px |
| 9 | P2 | Web: học liệu của tôi | Link "Xóa tìm kiếm" nằm lơ lửng giữa form, hiện cả khi chưa tìm gì. | Ảnh chụp `/workspace/lecturer/materials`; `material-management.tsx:159` |
| 10 | P3 | API | Cảnh báo `pg`: "Calling client.query() when the client is already executing a query is deprecated… removed in pg@9". Xuất hiện ngay sau `GET /notifications/unread`. Nguyên nhân thật: Prisma chạy song song các truy vấn con của `include` trong transaction (xem Bước 6). | Log API dòng 203 |
| 11 | P3 | Dev/e2e | Badge "1 Insight" của Next che logo ở góc trái trên. Có lẽ đây cũng là lý do `pwa-install › mobile` lỗi ổn định (link bị che, bấm không được, kể cả trên `main`). | Mọi ảnh chụp; log e2e CAL-03 |

Không thấy: lỗi JS, request 5xx khác (ngoài #4), tràn ngang ở 390px, trang bị chuyển hướng sai vai trò.

## Kế hoạch sửa

Mỗi bước là một nhánh `codex/…` và một PR nhỏ, chạy đủ lint/typecheck/test/build/e2e như mọi lần. Thứ tự theo mức ưu tiên.

### Bước 1 — Vá bảo mật Next (P0) · `codex/next-16-4-1`

- Nâng `next` và `@next/eslint-plugin-next` lên `16.4.1` (bản patch). Đọc changelog 16.4.1, chạy lại toàn bộ test.
- Thêm `pnpm.overrides` cho `mysql2 >=3.23.1`. Với `deepmerge-ts`, bản 8 là major nên chỉ ép nếu `prisma generate`/`migrate` vẫn chạy; nếu không thì ghi lại và chờ Prisma nâng.
- Kỳ vọng: hết thông báo dừng của Next, có thể hết luôn #11 và lỗi `pwa-install › mobile`.
- **Đã làm** (nhánh `codex/next-16-4-1`):
  - `next` và `@next/eslint-plugin-next` 16.4.1; overrides `mysql2 3.24.6`, `deepmerge-ts 8.0.2`
  - `pnpm audit --prod`: không còn lỗ hổng
  - `prisma generate` và `migrate status` vẫn chạy với deepmerge-ts 8
  - `pnpm check` đạt: 119 unit, build không còn bị Next dừng
  - integration 216 đạt
  - e2e 167 đạt, 8 bỏ qua; `pwa-install › mobile` đã đạt. 5 ca `password-change` lỗi 401 vì lượt trước đã đổi mật khẩu tài khoản test; chạy `pnpm test:setup` rồi chạy lại thì 6/6 đạt.

### Bước 2 — Môi trường dev chạy đủ (P1, #5) · `codex/dev-full-stack`

- Script `pnpm infra:files`: `docker compose … --profile files up -d --build clamav docx-converter file-worker`.
- ~~`pnpm dev:all` chạy worker trên máy~~: bỏ. ClamAV và docx-converter không mở cổng ra máy, Windows không có Poppler, nên worker trên máy luôn đánh lỗi file và còn tranh job với worker trong container. Dùng worker trong container; image mới có luôn nhắc lịch (CAL-03).
- Worker trong container ghi thư (nhắc lịch) vào `.local/mail-outbox`. `setup:local` thêm `MAIL_TRANSPORT=file`/`MAIL_DIR` cho `apps/api/.env` mới và nhắc khi file cũ thiếu.
- README thêm mục "Chạy đầy đủ": thứ tự lệnh, build lại image sau khi đổi code, không chạy `worker:files` song song, xem mail.
- Để sau: readiness (`/health/ready`) báo riêng "scanner" khi ClamAV không phản hồi.
- **Đã làm và kiểm trên máy dev:** ClamAV healthy; giảng viên tải PDF lên thì CHECKING → SAFE dưới 10 giây (2 trang, có lớp chữ); worker container nạp `CalendarRemindersModule` và ghi đúng thư "Nhắc lịch: …" vào `.local/mail-outbox` cho một buổi học nhắc lúc bắt đầu.

### Bước 3 — Kiểm tra file bền hơn khi dịch vụ quét gián đoạn (P1, #3) · `codex/upload-scan-resilience`

- Lỗi tạm thời (`FileCheckError` retryable) **không ghi FAILED** ngay. Tăng số lần thử và giãn cách (ví dụ 8 lần, exponential từ 15 giây, khoảng 30 phút); file giữ `CHECKING`.
- Khi ClamAV chạy lại, `reconcile()` đã đưa file vào hàng đợi lại, nên không mất lượt.
- Hết lượt mới ghi `CHECK_UNAVAILABLE`. Thêm **"Kiểm tra lại"** cho file `CHECK_UNAVAILABLE`, dùng lại đúng file đã tải: endpoint `POST /material-drafts/:id/pdf/recheck` có `If-Match`, chỉ cho chủ bản nháp, đưa trạng thái về `CHECKING`. Trạng thái quét, kiểm duyệt và hiển thị vẫn tách riêng (AGENTS.md).
- Test:
  - unit: chính sách thử lại
  - integration: ClamAV giả lỗi 2 lần rồi đạt → SAFE; hết lượt → `CHECK_UNAVAILABLE`; recheck → CHECKING; người khác → 404
  - e2e: nút "Kiểm tra lại"
- **Đã làm** (nhánh `codex/upload-scan-resilience`):
  - Hàng đợi quét: 8 lần, cách 15 giây và nhân đôi (khoảng 32 phút) rồi mới ghi `CHECK_UNAVAILABLE`. Lỗi về chính file (mã độc, mật khẩu, PDF hỏng…) vẫn dừng ngay.
  - `POST /material-drafts/:id/pdf/recheck` (`revision`, 202):
    - chỉ chủ bản nháp, chỉ khi bản nháp còn là DRAFT, PDF tải trực tiếp (không phải bản dựng từ Word), đang `FAILED/CHECK_UNAVAILABLE`; ngoài ra trả 409 `PDF_NOT_RECHECKABLE`
    - đưa file về `CHECKING`, tăng revision và ghi audit `MATERIAL_PDF_RECHECKED`
    - xóa job lỗi cũ (BullMQ giữ 7 ngày) rồi đưa vào hàng đợi lại
  - Migration `202610230004_file_check_round`: `files.check_round` (CHECK 1–100). Thông báo vòng đầu giữ khóa `file:<id>`; từ vòng 2 dùng `file:<id>:<vòng>`, để kết quả lần kiểm tra lại không bị trùng khóa và mất.
  - Web: nút **Kiểm tra lại** cho sinh viên (`DraftPdf`) và giảng viên (`MaterialFileStatus`); thông báo lỗi nói rõ không cần tải lên lại.
  - Kiểm chứng local: `pnpm check` (121 unit, build); integration 218 đạt, 1 bỏ qua (ca mới: kiểm tra lại → SAFE, hai thông báo `file:<id>` và `file:<id>:2`, revision cũ 409, người khác 404, mã độc 409); e2e 174 đạt, 8 bỏ qua (ca mới trong `upload-03`). Test schema: 107 CHECK, 15 partial index.


### Bước 4 — Báo đúng khi file PDF bị mất (P1, #4) · `codex/missing-object`

- `PrivateStore` phân biệt object không tồn tại (`ENOENT`/S3 `NoSuchKey`) với lỗi kết nối.
- API trả **404 `FILE_MISSING`** cho reader, kiểm duyệt và tải bản gốc, và ghi `Logger.warn` kèm id file (không ghi đường dẫn hay nội dung).
- Reader hiện "File PDF của phiên bản này không còn trên máy chủ. Báo cho người tải lên hoặc quản trị viên." và nút "Báo cáo tài liệu" (REPORT-01), thay cho "Kiểm tra kết nối".
- Script dev `pnpm --filter api doctor:files`: liệt kê file `SAFE` mà object không còn, chỉ đọc, không tự xóa.
- Dữ liệu dev hiện tại: 2 tài liệu đã công bố bị mất PDF. Chủ dự án quyết định tải lại PDF cho 2 phiên bản đó hoặc ẩn chúng. Không tự sửa DB.
- **Đã làm** (nhánh `codex/missing-object`):
  - Mã trả về là **410** chứ không phải 404 như dự kiến: 404 đã mang nghĩa "không có quyền / không còn khả dụng", và pdf.js chỉ cho web biết mã HTTP. Ai không có quyền đọc vẫn nhận 404 như cũ.
  - `PrivateStore` ném `MissingObjectError` (local `ENOENT`, S3 `NoSuchKey`). Reader, xem trước bản nháp, PDF kiểm duyệt và tải Word gốc trả 410 `FILE_MISSING`, log `Private object missing for file <id>.`
  - Worker quét gặp file mất thì ghi FAILED ngay (`UnrecoverableError`), không thử lại 30 phút.
  - Reader báo "File PDF của phiên bản này không còn trên máy chủ…", ẩn "Thử mở lại PDF" và hiện "Báo cáo vấn đề với tài liệu".
  - `pnpm --filter @hucescholar/api doctor:files` (sau `build`): chỉ đọc; in id file/phiên bản/tài liệu, trạng thái và tiêu đề; thoát mã 2 khi có object mất.
  - Trên database dev: file 1 (phiên bản 1 “PDF demo — giảng viên tự công bố”) và file 2 (phiên bản 2 “Toán rời rạc ứng dụng trong tin học - 1”) đã mất PDF.
  - Kiểm chứng local: `pnpm check` (123 unit, gồm `private-store.spec.ts`); integration 219 đạt, 1 bỏ qua; e2e 174 đạt, 8 bỏ qua (ca mới `file-missing.spec.ts`), chạy lại `file-missing` + `upload-03` sau khi gộp bước 3: 4/4.


### Bước 5 — Sửa giao diện nhỏ (P2, #6–#9) · `codex/ui-audit-fixes`

- #6: đã sửa cùng PR kế hoạch.
- #7: trang đầu theo vai trò truyền `title="Trang đầu"` cho breadcrumb; giữ "Tài khoản của tôi" cho `/workspace/profile`.
- #8: cột thao tác dùng hàng ngang (wrap khi hẹp), canh trái đều; kiểm 1440/390/320px.
- #9: "Xóa tìm kiếm" chỉ hiện khi có từ khóa hoặc bộ lọc, đặt cạnh nút "Tìm kiếm".
- Thêm kiểm tra trong e2e: breadcrumb trang đầu; không có cảnh báo React "same key" trên reader (đọc console).
- **Đã làm** (nhánh `codex/ui-audit-fixes`):
  - #7: `RoleWorkspace` mặc định breadcrumb "Trang đầu"; chỉ trang đầu theo vai trò dùng giá trị mặc định này.
  - #8: ba nút trong `.user-row-buttons` (flex, `gap`, không xuống dòng giữa chữ). Chỉ bảng tài khoản (`.account-table`) đổi độ rộng cột (32% / 32%); bảng danh mục và báo cáo giữ nguyên.
  - #9: "Xóa tìm kiếm" cùng ô với "Tìm kiếm", chỉ hiện khi có từ khóa, bộ lọc hoặc truy vấn đang áp dụng.
  - E2e mới `tests/ui-audit.spec.ts`: breadcrumb; ba nút cùng hàng và đúng thứ tự ở 1280px, không tràn ở 390/320px; "Xóa tìm kiếm" ẩn/hiện; reader không có cảnh báo React "same key". Lượt đầu test này bắt được ba nút vẫn xếp ba dòng vì cột hẹp.
  - Kiểm chứng local: `pnpm check` (121 unit, build); e2e 177 đạt, 8 bỏ qua, 1 lỗi `reader-rotation` (hết 15 giây chờ trang hiển thị); chạy lại riêng 3 lần đều đạt.


### Bước 6 — Dọn cảnh báo pg (P3, #10) · `codex/pg-concurrent-query`

- Chạy API với `NODE_OPTIONS=--trace-deprecation` để tìm đúng chỗ.
- Đổi các `$transaction([...])` bị ảnh hưởng sang transaction tương tác (`async (tx) => { await …; await …; }`), giữ `RepeatableRead`.
- Test: integration hiện có của notifications, reader và tasks phải đạt, không còn cảnh báo trong log.
- **Kết quả điều tra** (nhánh `codex/pg-concurrent-query`): giả thuyết ban đầu sai.
  - `--trace-deprecation` khi chạy bộ integration cho thấy cảnh báo không đến từ `$transaction([...])` của mình. Nó đến từ bộ thực thi truy vấn của Prisma: nút `join` trong `@prisma/client-engine-runtime` chạy `Promise.all` các truy vấn con của một `include` nhiều quan hệ. Trong transaction tương tác, các truy vấn con này dùng chung một client `pg`.
  - `pg@8` tự xếp hàng các truy vấn nên kết quả vẫn đúng; `pg@9` sẽ từ chối.
  - Runtime của Prisma 7.10.1 (bản mới nhất, 15/10) giống hệt 7.10.0, nên nâng Prisma chưa giúp được. Tìm kiếm chưa thấy issue nào trên Prisma hay `pg` khớp đúng trường hợp này.
  - Đã chốt (đổi được về sau):
    - không vá code Prisma trong `node_modules`
    - không viết lại mọi `include` trong transaction
    - giữ `pg` ở 8.x; unit test `apps/api/test/pg-major.spec.ts` báo đỏ khi `pg` lên major 9, để người nâng phải xem lại mục này
  - Việc sau: khi Prisma có bản chạy tuần tự các truy vấn con trong transaction (hoặc có issue để theo dõi), nâng Prisma rồi mới nâng `pg`.


### Sau cùng

- Chạy lại script quét trang và luồng tải lên trên app dev. Ghi kết quả vào mốc implementation của từng bước.
- Xóa 3 tài khoản audit và bản nháp/môn "Khoa audit / Môn audit" khỏi database dev, nếu chủ dự án muốn.
- **Đã chạy lại** ngày 24/10/2026 trên `main` `aee4daf`, app dev local (`pnpm dev`, image `file-worker` build lại bằng `pnpm infra:files`). Bằng chứng local, không phải production.
  - **Quét trang** (51 trang × 1280/390px, 3 vai trò): 48 phát hiện, tất cả trên `/workspace/library/versions/1` và `/2`, đúng hai phiên bản bị mất PDF.
    - API trả 410, không còn 503 (#4).
    - Reader báo "File PDF của phiên bản này không còn trên máy chủ…".
    - Log API ghi `Private object missing for file 1.` và `… file 2.`
    - Không có cảnh báo React "same key", không có badge issue của Next, lỗi JS, tràn ngang hay chuyển hướng sai vai trò (#6, #11).
    - "networkidle >15s" trên hai trang này đã có từ lượt 23/10, không phải lỗi mới.
  - **Tải lên:** giảng viên tải PDF 2 trang, CHECKING → SAFE trong 5 giây.
  - **Trình quét gián đoạn** (#3): tắt ClamAV, tải PDF lên, 25 giây sau bật lại.
    - Worker thử lúc +8s, +27s và +57s, đều lỗi; lần cuối lỗi vì ClamAV chưa nạp xong dữ liệu.
    - File vẫn ở `CHECKING`, không bị ghi FAILED như lượt 23/10 (FAILED sau khoảng 6 giây).
    - Lần thử kế tiếp đạt: `SAFE`, vẫn `check_round` 1, không phải tải lên lại.
  - **`doctor:files`:** báo đúng file 1 và file 2 mất object, thoát mã 2.
  - **Log API:** cảnh báo `pg` "already executing a query" vẫn xuất hiện 2 lần, đúng như đã chốt ở bước 6.
  - **Còn chờ chủ dự án quyết định:**
    - tải lại PDF hay ẩn hai phiên bản mất file
    - có xóa dữ liệu audit hay không; lượt này tạo thêm hai môn "Môn audit" và hai bản nháp (draft 5, 6)

## Ghi chú

- Lỗi #3, #4, #5 cộng lại giải thích phần lớn trải nghiệm "lỗi từ FE đến BE" trên máy dev: thiếu trình quét thì tải lên luôn lỗi; mất file thì reader báo sai nguyên nhân; worker không chạy thì upload, Word và nhắc lịch đều đứng.
- Script rà soát nằm ở thư mục scratchpad của phiên làm việc, không nằm trong repo. Nếu cần chạy lại thường xuyên thì đưa vào `scripts/` ở Bước 2.
