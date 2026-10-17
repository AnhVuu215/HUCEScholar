# Lecturer PDF/DOCX Upload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Đây là kế hoạch để người dùng xem trước; chưa sửa code chức năng, chạy migration, cài converter hoặc thay dữ liệu.

**Trạng thái thực thi17/10:** đã triển khai các task1–6 trên nhánh `codex/lecturer-docx-upload`; xem [bằng chứng và giới hạn](../../implementation/2026-10-17-lecturer-pdf-docx-upload.md). Checklist phía dưới giữ baseline plan để đối chiếu; các quyết định khác plan: converter entry MJS + validator Python stdlib cách ly thay dependency npm; lease10phút thay5phút; real-tool proof đi trong ca Playwright opt-in với worker Docker `_test`. Bản DOCX có thể lệch công thức/bố cục, cần xem trước. Chưa kiểm chứng S3/production/thiết bị thật hoặc runtime DB role tách riêng.

**Goal:** Giảng viên chọn PDF/DOCX và điền thông tin trên cùng form; sinh viên đọc/ghi chú bản PDF của DOCX và tải Word gốc theo quyền.

**Architecture:** Giữ `files`/reader PDF hiện hữu. Thêm nguồn DOCX bất biến gắn version, job quét/chuyển đổi bất đồng bộ và converter cách ly; chỉ gắn PDF thật sau khi kiểm tra đạt. UI điều phối lưu metadata/upload với khôi phục lỗi, không buộc đóng/mở lại bản nháp.

**Tech Stack:** Next.js/React/TypeScript, NestJS, PostgreSQL/Prisma migrations SQL, BullMQ/Redis, ClamAV/Poppler, LibreOffice headless trong container riêng; kiểm thử Jest/Supertest/Playwright.

**Spec:** [Luồng, schema và hợp đồng PDF/DOCX](../specs/2026-10-17-lecturer-pdf-docx-upload.md). Người dùng đã chọn hướng DOCX → PDF + giữ Word gốc; các chi tiết kỹ thuật dưới đây là đề xuất cần kiểm chứng khi triển khai.

## Global Constraints

- Chỉ giảng viên thêm DOCX; sinh viên vẫn PDF. Chỉ một file nguồn cho một version; nguồn giảng viên tùy chọn, không admin duyệt.
- Input PDF/DOCX tối đa 25 MiB, output PDF tối đa 25 MiB; các giới hạn converter/ZIP khác theo spec phải được đo ở Task 1 trước khi bật tính năng.
- Không thay CHECK `files.mime_type='application/pdf'` hoặc trigger bất biến bytes; không fake PDF file trước chuyển đổi; không `db push`.
- Giữ session/CSRF, ownership, phân công, CAS/revision, scan, moderation, visibility riêng biệt; ghi chú owner/version/page không đổi.
- Không chuyển tài liệu lên dịch vụ ngoài, không cài Office vào máy Windows, không đưa Docker socket/secrets DB/S3 vào converter.
- Chưa cài PWA; không cache file/note/token; không commit tài liệu hoặc credential thật.

## Review Focus

1. Word mới đang xử lý nhưng bản nháp có PDF cũ: clear pointer PDF dưới khóa; publish không dùng file cũ — Task 2/3.
2. Worker trùng, lease hết hạn, upload thay thế, metadata sửa hoặc bàn giao giữa chừng: worker cũ không attach, không ghi đè — Task 3.
3. ZIP giả/bomb, tài nguyên liên kết, macro, tool treo hoặc exit 0 không output: bị chặn và dọn process/profile — Task 1/3.
4. Hai request UI không nguyên tử: không tạo lại metadata khi upload lỗi, không tự replay POST tạo metadata khi kết quả chưa rõ — Task 5.
5. Download Word khác quyền reader hoặc PDF tạo lại làm lệch note: dùng cùng grant version, nguồn/kết quả bất biến và test byte-identical — Task 4/6.

## Task 1 — probe chuyển đổi thực tế trong vùng cách ly

**Files:**

- Create `apps/api/src/docx-converter.ts` — entrypoint HTTP nội bộ, không import AppModule/DB.
- Create `apps/api/src/files/docx-package.ts` — kiểm package OOXML/ZIP và giới hạn stream.
- Create `apps/api/src/files/docx-converter-client.ts` — client nội bộ nhận PDF có giới hạn.
- Create `infra/docx-converter.Dockerfile`; modify `.dockerignore`, `infra/compose.yaml` để thêm service cách ly theo spec.
- Create `scripts/create-docx-test-fixtures.py` dùng zipfile stdlib tạo fixture tổng hợp, output vào `apps/api/test/fixtures/docx/`.
- Create `apps/api/test/docx-package.spec.ts`, `apps/api/test/docx-converter.real.integration.spec.ts`.

**Interfaces:**

```ts
type DocxPackageLimits = { maxEntries: number; maxUncompressedBytes: number };
declare function validateDocxPackage(path: string, limits: DocxPackageLimits): Promise<void>;
interface DocxConversionClientContract {
  convert(
    sourcePath: string,
    pdfPath: string,
    signal?: AbortSignal,
  ): Promise<{ converterBuild: string }>;
}
```

Đây là contract của code cần viết, không phải API đang tồn tại. Chọn ZIP parser stream có thể kiểm actual uncompressed bytes, xác nhận phiên bản/dependency trước khi pin trực tiếp trong `apps/api/package.json` và lockfile. Không import package từ dependency transitive của Playwright/PDF.js.

- [ ] Tạo fixture sinh tự động: Word tiếng Việt, bảng/ảnh/ngắt trang/công thức, ZIP không phải Word, DOCM đổi đuôi, XML entity, archive traversal, package mã hóa và bomb nhỏ có giới hạn kiểm thử.
- [ ] Viết RED validator với đường dẫn fixture xác định:

```ts
import { resolve } from 'node:path';
import { validateDocxPackage } from '../src/files/docx-package';
const fixture = (name: string) => resolve(__dirname, 'fixtures/docx', name);
const limits = { maxEntries: 2000, maxUncompressedBytes: 100 * 1024 * 1024 };
it('accepts a real Word package and rejects an ordinary zip', async () => {
  await expect(validateDocxPackage(fixture('vietnamese.docx'), limits)).resolves.toBeUndefined();
  await expect(validateDocxPackage(fixture('ordinary-zip.docx'), limits)).rejects.toThrow();
});
```

- [ ] Viết validator và converter: mỗi request dùng thư mục/profile riêng; spawn `soffice` bằng argument array gồm `-env:UserInstallation=<profile URI>`, `--headless`, `--norestore`, `--convert-to`, `pdf:writer_pdf_Export`, `--outdir`, đường dẫn nội bộ. Không dùng shell/nolockcheck để tránh xử lý profile đúng cách.
- [ ] Thiết lập profile macro vô hiệu và không update tài nguyên; container không Internet/secret/host mount, giới hạn tmpfs/RAM/CPU/PID, non-root/read-only. Service chỉ nghe trên network internal, không publish ra host; worker được nối thêm network này. Mạng worker còn lại để Redis/ClamAV/S3 hoạt động, không tắt network toàn worker.
- [ ] Test timeout/disconnect dừng process tree, thiếu output, output quá lớn, process khác không dùng chung profile; kiểm converter không fetch được resource ngoài hoặc metadata endpoint. Không coi `--headless` là sandbox.
- [ ] Chạy conversion thật → ClamAV/Poppler → mở PDF → kiểm chữ/trang. Lưu ảnh QA từ fixture tổng hợp, đối chiếu font/bảng/công thức, ghi converter build/font. Không ghi “giống Word 100%”.
- [ ] **Gate:** chỉ sang Task 2 khi probe đạt và có số đo/ranh giới rõ. Nếu môi trường chưa chạy được, bàn giao probe và điểm chặn, không sửa schema/UI để giả vờ đã hỗ trợ DOCX. Checkpoint commit phần converter đã test, chưa mở upload sản phẩm.

## Task 2 — migration nguồn bất biến và snapshot

**Files:** create `apps/api/prisma/migrations/202610170001_docx_sources/migration.sql`; modify `apps/api/prisma/schema.prisma`, `apps/api/test/schema.integration.spec.ts`; create `apps/api/test/docx-schema.integration.spec.ts`.

**Interfaces:** `document_source_uploads` và `document_versions.source_upload_id` theo spec; `files` vẫn PDF. Nguồn cũ null; composite FK ngăn sai version. READY, scan và PDF-result consistency có guard SQL ở trạng thái cuối transaction.

- [ ] Viết RED schema tests trên DB test: nguồn đúng/sai version, thay identity/hash/key bị từ chối, READY thiếu PDF/scan bị chặn, terminal/submitted source pointer không đổi.
- [ ] Tạo migration tiến tới, không sửa baseline; đặt tên constraint/index/trigger rõ ràng, bảo toàn partial index và trigger hiện hữu. Khi version có source, guard publish yêu cầu READY và đúng rendered_file_id. Không tăng row hoặc migrate nguồn giả cho PDF cũ.
- [ ] Chạy migrate deploy trên `_test`, regenerate Prisma và test SQL trực tiếp. Cập nhật các tổng số schema đang hard-code từ thay đổi SQL thực tế, đồng thời thêm assertion tên/ý nghĩa guard; không xóa kiểm tra constraint cũ để test qua.
- [ ] Đối chiếu migration với một DB test trống và DB test có PDF/annotations đã công bố; checksum/ID/note không đổi. Chưa chạy migration lên database demo chính ở bước plan; khi thực thi phải ghi rõ database đích trước áp dụng.
- [ ] Checkpoint commit migration sau khi các ca đạt. Rollback triển khai là giữ các bảng/cột mới để bảo toàn nguồn, tắt nhận DOCX và quay binary tương thích; không tự drop dữ liệu hoặc hạ cấp schema có file đã nhận.

## Task 3 — upload API, queue và worker attach nguyên tử

**Files:**

- Create `apps/api/src/materials/source-upload.service.ts`, `source-conversion.processor.ts`.
- Create `apps/api/src/materials/material-draft-core.module.ts` để cung cấp MaterialsService và hai service trên cho API/worker mà không kéo controller vào worker.
- Create `apps/api/src/files/source-conversion-queue.ts`; modify `files.config.ts`, `private-store.ts`, `files.module.ts`, `apps/api/src/file-worker.ts`.
- Modify `materials.controller.ts`, `materials.service.ts`, `draft-pdf.service.ts`, `materials.module.ts`, `lifecycle.service.ts`.
- Create `apps/api/test/docx-upload.integration.spec.ts`, `source-conversion.spec.ts`.

**Interfaces:**

```ts
interface SourceUploadOperations {
  upload(actor: Profile, documentId: string, request: Request): Promise<{ item: MaterialDraft }>;
  retry(
    actor: Profile,
    documentId: string,
    body: { revision: number; sourceUploadId: string },
  ): Promise<{ item: MaterialDraft }>;
}
// SourceConversionProcessor: process(sourceUploadId: string, finalAttempt: boolean): Promise<void>
// SourceConversionQueue: enqueue(sourceUploadId: string): Promise<void>
// PrivateStore: putSource(key, path, size), readSource(key, range?) theo kiểu ByteRange hiện có.
```

`Profile` là type API hiện hữu; `MaterialDraft` ở đây chỉ cấu trúc response DTO được mô tả trong spec, không import type frontend vào API. Serializer hiện hữu phải được mở rộng và dùng chung, không tạo bản copy metadata có quy tắc khác.

- [ ] RED integration: lecturer DOCX nhận 202 nhưng chưa có PDF; source pointer DRAFT; student/admin DOCX bị chặn; MIME/filename/body/revision/quyền sai không tạo nguồn. PDF route cũ vẫn đạt.
- [ ] PrivateStore thêm thao tác source riêng chỉ nhận key `sources/<UUID>.docx`, MIME DOCX khi putS3; giữ whitelist PDF cũ. Không mở rộng thành đường dẫn/đuôi tùy ý.
- [ ] Triển khai route `/file` và `/source/retry`, UUID replay theo spec. Kiểm quyền trước nhận stream và lại trong transaction attach. Quản lý object khi commit chưa rõ như DraftPdfService; không xóa nguồn có thể đã được tham chiếu.
- [ ] Lưu nguồn → commit pointer/clear PDF/revision → enqueue stable ID. Lỗi enqueue vẫn giữ nguồn để reconcile. Không tạo placeholder trong `files` hoặc set SAFE từ header.
- [ ] Tách DI core: MaterialsModule import core thay vì khai báo MaterialsService lặp lại; worker import core; FilesModule không import MaterialsModule gây vòng phụ thuộc. Export queue/converter client cần dùng qua FilesModule.
- [ ] Worker claim lease/token → xác minh nguồn/quét/validate → chuyển đổi → quét PDF → put immutable output → transaction khóa cùng thứ tự hiện hữu, kiểm pointer/token/quyền/DRAFT và attach READY. Lease đề xuất5 phút phải dài hơn timeout toàn chuỗi hoặc được gia hạn CAS; không chỉ dựa vào BullMQ jobId để ngăn job trùng.
- [ ] Sửa thay PDF trực tiếp để clear source pointer; lifecycle bàn giao/mất điều kiện xử lý nguồn pending không để job cũ attach. Version kế tiếp không copy source pointer/file.
- [ ] Test barrier: hai worker trùng, worker cũ sau lease hết, thay DOCX/PDF lúc chuyển đổi, sửa metadata, mất phân công, bàn giao, publish lúc pending, commit ack loss. Test retry 3lần/backoff/reconcile, nguồn lỗi nội dung không retry vô hạn. Không log payload/paths/secrets.
- [ ] Chạy unit/integration và checkpoint commit API/worker. Chỉ thông báo file “sẵn sàng” khi cả nguồn và bản đọc đã đạt; converter chưa cấu hình trả lỗi cụ thể, PDF vẫn hoạt động.

## Task 4 — đọc PDF và tải đúng bản gốc

**Files:** modify `apps/api/src/materials/library.controller.ts`, `library.service.ts`, `apps/web/lib/library.ts`, `apps/web/components/library/library-reader.tsx`; extend `apps/api/test/docx-upload.integration.spec.ts`.

- [ ] RED: DOCX source-download trả Word byte-identical khi đủ quyền; tắt download chặn cả Word/PDF; ẩn/khóa/mất quyền chặn request mới; PDF-only source-download 404; không nhận sourceUploadId tùy ý để tải chéo.
- [ ] Thêm source metadata an toàn vào response và source-download route dùng cùng transaction grant với reader. Kiểm source SAFE/READY, matching version/rendered file trước stream; MIME/Content-Disposition encode tên Unicode, chống header injection, no-store và Range đúng nếu hỗ trợ.
- [ ] Giữ `/pdf` và `/download` đều PDF, không đổi MIME ngầm. Reader hiển thị “Bản đọc được chuyển từ Word”, “Tải Word gốc” và “Tải bản PDF” theo dữ liệu server; PDF trực tiếp tiếp tục nhãn hiện hữu.
- [ ] Test reload/zoom/rotation/highlight/note trên PDF đã chuyển; đổi version giữ note ở file cũ. Converter build mới không được tự chạy lại PDF của version đã có note/công bố.
- [ ] Checkpoint commit sau API/browser targeted đạt.

## Task 5 — một form chọn file và nhập thông tin

**Files:** modify `apps/web/components/materials/material-editor.tsx`, `draft-pdf.tsx`, `material-management.tsx`, `publication-actions.tsx`, `apps/web/lib/materials.ts`; create `material-file-picker.tsx`; update surface brief giảng viên; CSS chỉ thêm khi chưa đủ pattern hiện hữu.

- [ ] RED Playwright: giảng viên mở form mới đã thấy file picker, chọn PDF/DOCX rồi nhập tiêu đề/môn và lưu/upload mà không đóng/mở lại. Test đổi tên gợi ý không ghi đè tiêu đề đã sửa.
- [ ] Lift selected File lên DraftForm; dùng chung picker để không có hai file selection lệch nhau. Khi đã có draft, giữ cách thay file và trạng thái cũ nhưng đổi copy theo format. Không import Word vào editor text hoặc nhét bytes vào metadataJSON.
- [ ] Nút lưu điều phối `saveDraft` → cập nhật current từ response → gửi bytes. Sau lỗi upload vẫn giữ ID/revision đã xác nhận, thông tin và file trong phiên; retry chỉ bước file. Với POST metadata chưa rõ kết quả, hiển thị recovery-list và chặn auto create/retry theo spec.
- [ ] Cho lưu metadata-only bằng “Lưu bản nháp”. Với file đã chọn dùng “Lưu và tải file lên”; chỉ bỏ bộ chọn sau server xác nhận hoặc người dùng chủ động bỏ. Bố cục cùng phong cách navy/form hiện hữu, không modal mới.
- [ ] Hiển thị riêng scan/conversion/publication, auto-poll có backoff và hạn thời gian; dừng khi tab ẩn/unmount, hủy response cũ. Poll không ghi đè metadata đang gõ: chỉ merge trạng thái file/revision tương ứng và đánh dấu cần reconcile trước mutation, không `acceptCurrent` toàn bộ làm mất bản soạn.
- [ ] Test file invalid/too-large, metadata validation, uploaded file lưu được nhưng response mất, conversion lâu/lỗi, retry và selected file khi rời trang. Guard không khóa người dùng vĩnh viễn khi server lỗi; có nút dừng chờ/bỏ chọn an toàn.
- [ ] Test 320/360/768/1440px, keyboard/focus, filename/title dài; ảnh desktop/mobile trong một đợt, sửa lỗi rồi xác nhận tối đa một đợt nữa. Không chụp credential hay tài liệu thật.
- [ ] Checkpoint commit luồng UI khi browser targeted đạt.

## Task 6 — kiểm chứng xuyên suốt và tài liệu

**Files:** create `tests/lecturer-document-upload.spec.ts`, `apps/api/test/docx-worker.real.integration.spec.ts`, `docs/implementation/2026-10-17-lecturer-pdf-docx-upload.md`; update `PRODUCT.md`, `README.md`, `docs/HUCEScholar-tech-stack.md`, nghiệp vụ, roadmap và hướng dẫn landing. Giữ Word/prototype lịch sử.

- [ ] Chạy fixture thật xuyên suốt: giảng viên tạo → upload DOCX → worker thật SAFE/READY → xem trước/công bố → sinh viên đọc/tô/note/reload → tải Word/hash bằng nguồn gốc. Không set SAFE bằng SQL rồi gọi là proof converter.
- [ ] Hồi quy PDF lecturer/student, publish không cần admin, kiểm duyệt sinh viên, phiên bản, ẩn/khôi phục, tải và private note. Cập nhật fixture account riêng, không giảm limiter.
- [ ] Đưa real conversion vào một job CI có container/tooling phù hợp hoặc ghi một lệnh opt-in thực sự đã chạy; không để tất cả ca converter bị skip mà ghi hỗ trợ đã kiểm chứng. CI hiện có giữ nguyên các check cũ.
- [ ] Chạy theo thứ tự, không build/codegen trong lúc browser test đang chạy:

```powershell
pnpm format:check
pnpm check
pnpm test:integration
pnpm test:e2e
```

- [ ] Ghi phiên bản LibreOffice/fonts/image được dùng và giới hạn định dạng đã thấy; phân biệt local filesystem/S3/production. Kiểm source content type/immutability với adapter local, S3 cần bằng chứng riêng.
- [ ] Kiểm migration/runtime roles, dung lượng hai bản/quotas/backup nguồn+PDF; không để cleanup xóa bản còn được version tham chiếu. Không deploy cloud hoặc cài PWA trong task này.
- [ ] Review quyền, ZIP/converter isolation, lease/race và UI recovery theo 5 Review Focus. Stage đúng file, không secrets/generated/log/screenshot; commit/push khi được yêu cầu.

## Cách chia đợt để review

Đợt đầu chỉ chứng minh converter thật và cách ly. Đợt thứ hai schema/API/worker. Đợt thứ ba form/reader/download và kiểm chứng xuyên suốt. Mỗi đợt có checkpoint, nhưng **không gọi hỗ trợ DOCX hoàn tất** khi mới chỉ thêm `.docx` vào file picker hoặc mới lưu Word tải về.
