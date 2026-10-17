# Giảng viên tự công bố — implementation ledger

Spec: ../specs/2026-10-14-lecturer-self-publication-design.md. Base b3cefe9. Thực hiện inline trên codex/lecturer-self-publication theo yêu cầu tự chủ của người dùng; không yêu cầu duyệt lại cùng quyết định đã chốt trong chat.

## Tasks

- [x] API RED: năm test mới thất bại400/404 trước triển khai; nguồn tùy chọn lecturer/student vẫn bắt buộc, publishSAFE/current/audit/no-request, quyền/CSRF, CHECKING/FAILED, revision/concurrency, hidden, successor và restore.
- [x] Schema/API GREEN: migration publication_method; DTO default empty + server-role validation; endpoint publish/transaction + source-aware restore. Test migrated seven migrations and integration134pass/1skip. Giữ submit legacy và mọi guard.
- [x] Browser RED: tạo không nguồn/quyền bị required UI chặn lưu. Logs self-publish-browser-red.
- [x] UI GREEN: role-aware editor, publish/recovery/labels, history, workspace/client. Focused new flow1pass, includes lost response and library read. Styling preserved.
- [x] Validation: format/check trước integration/browser; suites tuần tự, bounded capture và independent review. Migrate local/rebuild/restart verified processes, thử upload/quét thật/tự công bố trên tab demo. Kết quả browser cuối và recheck phân biệt bên dưới.
- [x] Docs: cập nhật A02/ma trận/trạng thái, PRODUCT/README/tech-stack và implementation; giữ bản Word/prototype lịch sử. Local checkpoint; không push/merge.

## Shared interfaces / rulings

- publication_method serialized as publicationMethod: ADMIN_REVIEW|LECTURER_SELF on draft/version; old data default ADMIN_REVIEW. Các client không suy ra admin duyệt từ APPROVED đơn lẻ.
- Empty sourceReference/rightsBasis allowed only lecturer, no invented strings. Student validation remains API-side.
- Assignment restrictions retained: current request changes content origin and publication approval; does not revoke course assignments/ownership controls. PDF type and scan retained.
- APPROVED remains terminal/readable, publicationMethod records how it became published. No fabricated publication request/history. Audit MATERIAL_SELF_PUBLISHED records actual lecturer actor.
- Hidden document remains hidden after new self-publication; restore reuses availability and does not demand optional source text.
- Verification ordering: codegen/migrations/build before browser, never concurrent with watch server.

## Review focus

Student bypass via publish endpoint or empty fields; lost-response/double publish; hidden/new-version metadata; revoked actor/assignment race; terminal snapshot/source changes; no fabricated admin decision or lost old-version notes. Tests belong to API/browser tasks above.

## Execution evidence

- Docker stopped during test setup. Actual backend logs show WSL bootstrap/precondition errors while live wsl--version works3.0.3. Stopped only this task's hung test-environment process; official docker desktop restart restored existing healthy services/volumes. No WSL update/reset or data deletion.
- Independent review: no confirmed API bypass. P2 older request history hidden for self-published versions and stale lecturer legacy test fixtures/expectations. P3 old review label in personal library/status filter. Addressed in one pass.
- P2 history RED: adapted legacy CHANGES_REQUIRED→reopen→selfpublish→v2 test reached missing older-history button and timed out. Fix always retains history action; selfpublished label neutral, actual prior requests still queried by original versionId. GREEN/full suite result pending.
- P2 history GREEN: whole browser53/53 passed; integration final134/134+scanner skip. This also validates corrected legacy fixtures/expectations.
- Fixture fix seeds real legacy source/rights through API before legacy submit; new lecturer UI deliberately has no rights field. Legacy change-request browser now selfpublishes after reopen and verifies older history after next version.
- Final format/check passed, including50unit/build, before adding capture-only test code. Extra test lint + tools tsc run before final integration/browser. No codegen overlaps browser. Detector one pass returned[]. Final logs under .local/self-publish-*.
- Visual finding: version-history list stayed DRAFT after successful publish/refresh. New focused assertion RED confirms stale label. Root cause is missing current.revision effect dependency; fixed both version list and selected request-history reload. Final web lint/types/build and whole browser rerun sequentially; no API changes after final134pass.
- Post-fix browser: new selfpublish/history regressions passed. Last full run52/53; one initial reader render exceeded5s in dev (snapshot still loading PDF). Set only initial readiness assertions to15s; the remaining test recheck passed1/1. Reader reload test now waits acknowledged page2 save and expects resume2. Do not present combined runs as one clean full run.
- Local proof: migration007 deployed to guarded local hucescholar DB; verified preview PIDs restarted. Lecturer demo uploaded original synthetic two-page PDF with blank source/rights, real worker markedSAFE, explicit selfpublish succeeded with no review request. Version-history label immediately APPROVED/selfpublished; clean published list left open and captured in .local/self-publish-demo-published.png.
