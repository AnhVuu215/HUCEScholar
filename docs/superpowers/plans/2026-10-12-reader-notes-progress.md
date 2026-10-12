# Reader Notes and Progress Implementation Plan

**Goal:** Ghi chú theo trang và mở lại đúng trang đọc, riêng tư theo người/phiên bản.
**Architecture:** Mở rộng Materials và reader hiện hữu; reuse LibraryService cho quyền, PostgreSQL cho notes/progress; client state tách panel và progress hook.
**Tech Stack:** TypeScript, NestJS, Prisma/PostgreSQL migrations, Next.js, PDF.js, Jest/Supertest, Playwright; không thêm dependency.
**Spec:** ../specs/2026-10-12-reader-notes-progress-design.md

## Global constraints

Ba role chỉ dữ liệu riêng; no-store, CSRF, không log content; không offline/localStorage. Giữ độc lập scan/review/visibility. Giữ SQL CHECK/trigger/index. 4000 ký tự/note; cursor 30; tiến độ theo trang, offset=0. Không highlight/export PDF/native trong mốc này. Giữ giao diện sản phẩm và wireframe riêng.

## Review focus

Mất response sau commit không nhân đôi note; note ID/cursor không lộ người khác; tab cũ không ghi đè revision mới; chuyển trang/zoom nhanh không lưu trang chưa render; lỗi tiến độ không tự reset trang cũ. Mỗi điều kiện phải có test ở task sở hữu.

## Tasks

- [x] API RED: mở rộng materials integration fixture/cleanup; thêm tests CRUD owner/CSRF/idempotency/page validation, cursor, quyền cũ/thu hồi, progress CAS/concurrent writes. Chạy `pnpm --filter @hucescholar/api test:integration --testPathPatterns=materials.integration --no-cache`, quan sát route mới 404.
- [x] API GREEN: `prisma/migrations/202610120001_annotation_request_id/migration.sql`, schema request_id; `materials/reading.dto.ts`, controller/service; LibraryService shared access transaction; module registration. GET notes, POST notes, PATCH/DELETE notes/:noteId; GET/PUT progress dưới `/library/versions/:id`. Deploy migration test bằng test:setup và main local qua Prisma migrate deploy; generate client. Chạy integration/typecheck/unit, commit API.
- [x] Web notes RED/GREEN: thêm hành trình trong `tests/materials.spec.ts` dùng PDF fixture hiện có; `lib/reading.ts`, `components/library/reader-notes.tsx`, unsaved guard; kết nối reader, CSS scoped. Request UUID giữ khi retry; revision conflict không tự overwrite; cursor/load-more; nội dung vẫn gắn trang cũ khi đổi trang. Browser verifies response loss/reload/CRUD/conflict; commit ghi chú.
- [x] Web progress RED/GREEN: `components/library/use-reading-progress.ts`, reader load/resume + on-render save. GET cần thành công trước ghi; serial debounce, retry/409 rõ. Browser verifies resume, network failure và tab conflict. Chụp desktop/tablet/mobile cùng vòng, sửa bounded rồi xác nhận tối đa vòng nữa; commit tiến độ.
- [x] Final: format/lint/types/50+ unit/integration/browser/build, review toàn nhánh và UI finish/documenter theo skill; update PRODUCT/README/tech-stack/surface brief + implementation evidence. Push nhánh `codex/reader-notes-progress`, không tự merge main.

## Execution ledger

- Baseline: main c44f80e, nhánh mới codex/reader-notes-progress, 50 unit đạt, working tree sạch.
- Ruling: làm trong checkout hiện tại trên nhánh riêng để giữ runtime/dependencies local và phạm vi workspace; user đã yêu cầu triển khai tự chủ, không tạo worktree mới.
- Ruling: page notes + page progress là mốc độc lập hoàn chỉnh; text highlight/offset và thư viện cá nhân ở mốc sau, không giả lập.
- API b17040d: privacy/CSRF/page/cursor/idempotency/CAS RED → GREEN, 47 materials integration; test migration deploy. Web notes 4dc6604: lost response/retry, stale edit, page pin và PDF error giữ draft đã đạt.
- Review fix d8c8e0d: actor UPDATE có thể đảo khóa với moderation; chuyển advisory owner + actor SHARE. Regression NOWAIT RED đúng lỗi khóa users, GREEN trong full suite. Không yếu hóa guard SQL.
- Progress 977ff00: restore trước render, serial debounce, truthful acknowledgement, network retry/conflict reload, skip GET failure không ghi. PDF load độc lập progress reload để tránh reuse proxy bị destroy. Stale-delete reload hủy xác nhận cũ.
- Giới hạn navigation: app link/logout/unload có guard; Back/Forward SPA chưa chặn, hiện lời nhắc lưu trong editor và tài liệu. Reviewer ghi nhận documented/deferred, không coi là đã sửa kỹ thuật.
- Validation cuối: format + lint + typecheck + 50 unit + API/web build đạt; full integration **114 đạt, 1 opt-in scanner skip**. Browser full run **48 đạt/1 assertion copy cũ thất bại**; cập nhật assertion, `--last-failed` **1 đạt**. Tổng 49 hành trình được xác nhận; không mô tả full run ban đầu là xanh.
- UI: hai vòng capture 1440/768/360, chờ canvas đúng width và overflow check; detector một lần `[]`. Finish reviewer ship, verdict cuối cho save hint vẫn ship. Documenter xác nhận docs/screenshot đã cập nhật và giữ DESIGN/sidecar wireframe. Không raster/dependency mới.
- Local migration deploy thành công: 23 tables, 47 FK, 61 CHECK, 7 partial indexes, 6 user triggers; request UUID NOT NULL + owner/request index tồn tại.
- Restart bản build cuối ở 3000/3001. HTTP health/home/login/library/PDF worker 200; unauth notes/progress 401 no-store. Runtime chỉ chứng minh local, không thay thế production/thiết bị thật.
- Integration policy: nhánh `codex/reader-notes-progress`, commit nhỏ theo chức năng và push origin; không merge main ở mốc này. Không tạo/xóa worktree.
