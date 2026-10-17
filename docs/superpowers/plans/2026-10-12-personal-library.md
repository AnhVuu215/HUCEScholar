# Personal library implementation plan

Goal: riêng tư theo owner, lưu document hiện hành và mở lại version/page đã đọc. Spec ../specs/2026-10-12-personal-library-design.md. Stack Nest/Prisma/PostgreSQL, Next/TS/pnpm.

## Constraints and interfaces

Không migration/dependency/real external data. Reuse LibraryService availability/serialize/access, saved_documents và reading_progress. Client typed entries nullable material; saved target document vs recent target version phải phân biệt rõ. Không cache authenticated data.

## Tasks

- [x] API TDD RED→GREEN: PersonalLibraryController/Service, batch readable mapping, save status/write/list/recent; privacy, unavailable retention, current/old, concurrency/CSRF/pagination. Commit API `0a91eaf`.
- [x] UI: personal library route/list, SaveMaterial reader control, navigation; lost-response refresh, confirm unsave, recent exact version. Existing RED→GREEN evidence recorded in implementation note; reconfirmed on 14/10.
- [x] Verify format/check/integration, bounded captures1440/768/360, one detector, independent code review and direct visual inspection. Final browser suite52/52 passed in one serial run.
- [x] Docs and production-build local runtime smoke. No merge or deployment.
- [x] Final whole-browser confirmation and local Git checkpoint (this ledger is included in the milestone commit).
- [ ] Remote push: deferred; this continuation finishes and validates the local checkout, leaving integration/publishing for a separate step.

## Ledger

- Baseline d4571ac clean/pushed. Branch codex/personal-library stacked on material-lifecycle. Main untouched.
- Ruling: autonomous inline execution per user instructions; use same checkout/new branch to preserve runtime/dependencies. No additional worktree or approval stage.
- Ruling: this milestone implements personal saved/recent library; external books remain separate until authorized sources/rights. Existing schema supports both personal flows, no speculative collections.
- Pre-flight: API entries material:null contract consumed by UI; saved document/current and recent version/page intentionally different. Save status GET failure must never become false/unlocked mutation.
- Resume 14/10: use existing branch/checkout and preserve all uncommitted UI work; no reimplementation of completed API. Docker services healthy. Node24 runtime required because initial PATH resolves Node22.
- Verification: format/check pass (50 unit + builds), integration 129 pass/1 scanner skip. Fixed preexisting test assumption about first page of oldest-first global moderation queue: document-specific owner history is the authoritative target. Failure reproduced before fix; whole integration suite green after fix.
- Browser: initial GET status failure + repeated failed refresh now asserted; existing save/unsave lost-response, recent page2, pagination focus/retry remain covered. Initial full run 51 pass/1 reader render timeout5s; isolated retry passes without code changes. Do not describe this as a proven performance fix.
- Verification ordering correction: typecheck/codegen overlapped the next browser run and rewrote Prisma source, restarting Nest watch (PID31336→30664), causing PDF ECONNRESET. Rerun browser only after codegen/typecheck finish; do not infer a production stream regression from this contaminated run. README records this dependency.
- Final review: independent reviewer read 25 files, no blocking correctness/security findings. Deferred minor P3: canceling unsave unmounts the focused button without returning focus. Empty-last-page and delayed tab responses were inspected but lack separate browser cases. Preexisting SPA Back/Forward draft guard remains documented.
- Visual: current saved-list captures inspected at1440/768/360 and reader360. Detector18 advisory values are preexisting, outside new CSS and compare against prototype-only DESIGN.md; no global redesign. Local smoke validates200 app shells/health and401 no-store for unauthenticated saved/recent/PDF requests.
- Detailed evidence and next milestones: ../../implementation/2026-10-14-project-status.md. Logs ignored under .local/resume-*.
- Final14/10: pnpm test:e2e --workers=2 →52/52 pass without overlapping codegen; format/lint/typecheck final pass. Milestone21files secret/artifact scan and diff-check pass, including the existing personal-library surface brief. Checkpoint remains local; no merge/push/deploy. Preview3000/3001 live, fresh health200 no-store.
