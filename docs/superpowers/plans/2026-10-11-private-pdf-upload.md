# Private PDF Upload Implementation Plan

> **For agentic workers:** Use executing-plans inline; one fresh whole-change review at completion. User authorized continuing implementation; preserve small functional commits.

**Goal:** Attach private PDF bytes to owned drafts and process technical safety independently of moderation.
**Architecture:** Stream upload outside DB transactions, immutable private object, atomic attach, BullMQ worker with PostgreSQL reconciliation. Development local store; production S3.
**Tech Stack:** NestJS/Node 24, Prisma/PostgreSQL, BullMQ/Redis, AWS SDK S3, ClamAV INSTREAM, Poppler, Next.js.
**Spec:** ../specs/2026-10-11-private-pdf-upload-design.md

## Global constraints

- Session/role/CSRF and current owner/course assignment required on each write; DRAFT only.
- No public object URL, fake SAFE result, secret in logs or real HUCE data.
- Default 25 MiB; maximum 50 MiB; receive 60 seconds; one per actor, two per API process.
- No unrelated schema/design rewrite; metadata must survive failure; build/test before push.

## Review focus

- Revocation/revision changes while receiving bytes: rollback attachment and remove new object.
- Queue failure after DB commit: upload remains CHECKING and reconciles.
- Malformed/encrypted PDFs or unavailable tools: fail closed, never SAFE.
- Replaced file's late job: update only its own file ID.
- Upload response lost: explicitly reload before retry, avoid silent overwrite.

## Tasks

### 1. Private upload API

Files: `apps/api/src/files/{files.config,private-store,receive-pdf,files.module}.ts`, `materials/draft-pdf.service.ts`, materials controller/service/module; `test/materials.integration.spec.ts`, `test/pdf-tools.spec.ts`.

- [x] Write and run failing integration tests: CSRF/owner/role, PDF signature/type/size/name, revision/assignment, persisted checksum/CHECKING, no private key in response, rollback cleanup.
- [x] Implement local/S3 private store and bounded receive stream; reuse material locking through `MaterialsService.lockDraft(tx, actor, id, revision)`.
- [x] Verify API integration and type checks; package upload and worker together because attachment uses the queue provider.

### 2. Worker and reconciliation

Files: `apps/api/src/files/{scan-queue,pdf-scanner,scan-processor}.ts`, `src/file-worker.ts`, Docker worker/profile, env examples/package scripts; `test/pdf-tools.spec.ts`, `test/pdf-queue.spec.ts`, `test/materials.integration.spec.ts`, `test/pdf-worker.real.integration.spec.ts`.

- [x] Run failing tests for checksum mismatch, scanner error, encrypted PDF, bounded command output, SAFE metadata and idempotency.
- [x] Queue job `file-<id>` with three attempts; reconcile CHECKING when job missing/terminal; execute scanner and conditionally persist SAFE/FAILED.
- [x] Provide Docker profile/runtime instructions; verify real ClamAV/Poppler; package Docker runtime separately from API/worker code.

### 3. Draft PDF interface

Files: `apps/web/components/materials/draft-pdf.tsx`, material editor/list, lib/materials.ts; `tests/materials.spec.ts`.

- [x] Run failing browser test: save metadata → upload synthetic PDF → CHECKING/revision refresh, no read link; failed response retains form; mobile layout.
- [x] Add plain inherited form/status UI, manual refresh and metadata dirty/pending guard.
- [x] Run full format/lint/type/unit/integration/build/browser checks and fresh review; fix concrete findings.
- [x] Update implementation/README/PRODUCT and restart local build. Commit UI/docs and push as final checkpoint.

## Ledger

- Initial: clean `codex/bootstrap`, previous 152 tests passed. Working in existing checkout to preserve the running local project and authorized incremental workflow. No cloud provisioning.
- Completed overnight 11–12/10/2026: 50 unit, 87 integration, 35 full browser tests passed; real scanner opt-in test passed separately against the final Docker image. Five material browser tests rerun after final UI fixes, then format/lint/type/unit/build passed again.
- Review fixes verified with regressions: refresh synchronizes metadata and revision; selected file can be cleared after metadata edits; ambiguous COMMIT retains attached bytes; queue enqueue is bounded; directory status updates immediately; uncertain-upload guidance survives clear/reselect. Code review resolved, UI verdict ship, documenter no changes.
- Fresh API/web health/routes return 200. Local database: five migrations, 61 CHECK constraints, one ADMIN, zero catalog/assignment/document/version/file fixtures. PostgreSQL/Redis/ClamAV healthy; final file-worker image running. Cloud S3 and real devices remain unverified.
