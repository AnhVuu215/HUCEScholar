# PWA Foundation Implementation Plan

> **For agentic workers:** Execute inline using executing-plans; one independent review at the end.

**Goal:** Hoàn thiện nền tảng cài PWA và mất mạng công khai, không lưu tài liệu/tài khoản offline.
**Architecture:** Worker TypeScript build thành script cùng origin. Cache allowlist static, không runtime caching. Trang hướng dẫn kế thừa UI; registration không gây reload.
**Tech Stack:** Next16.4.0, React19.3.0, TypeScript5.9.3, pnpm11.25.0, Node24.19.0, Playwright hiện có; không dependency mới.
**Spec:** ../specs/2026-10-15-pwa-foundation-design.md

## Global Constraints

- Không cache authenticated request, PDF, note hoặc signed URL. Không đổi schema/API/role/luồng tự công bố.
- Không tự bật notification, background sync, credentials hoặc deploy HTTPS.
- Không sửa prototype/design hoặc đổi bộ nhận diện. Base e1fada0, branch codex/pwa-foundation.

## Review Focus

- Query/token hoặc API navigation không được trả offline HTML hay cache response; browser offline fetch phải thất bại.
- HTTP401/404/500 đi nguyên trạng; không giả thành trang mất mạng.
- Install fetch redirect/failure không làm worker active với fallback thiếu.
- Update không reload tab còn bản soạn; xóa cache chỉ prefix do ứng dụng sở hữu.
- Prompt hủy/lỗi và standalone không hiện thành công giả hoặc làm nút bị kẹt.

## Task1: Worker, icons và cache contract

Files: scripts/pwa-worker.ts, scripts/pwa-assets.mjs, scripts/tsconfig.pwa.json; apps/web/public/offline.html, icons/*.png; app/manifest.ts, app/layout.tsx, next.config.ts, package scripts; tests/pwa.spec.ts.

- [x] RED browser: `expect(manifest.icons).toEqual(expect.arrayContaining([{src:'/icons/icon-192.png',sizes:'192x192',type:'image/png',purpose:'any'}]))`; `await page.goto('/'); await expect.poll(()=>page.evaluate(()=>!!navigator.serviceWorker.controller)).toBe(true)`; offline navigation shows generic heading, API offline fails, cache keys exactly static allowlist.
- [x] Run `pnpm test:e2e tests/pwa.spec.ts --workers=1`, preserve RED log under .local.
- [x] Implement install/activate/fetch with exact allowlist, network-only authenticated traffic, static offline fallback. Generate icons from authored H geometry; worker assets build before dev/build, worker typecheck in root typecheck. Header sw.js no-store/CSP/nosniff; PNG Apple metadata.
- [x] GREEN same focused browser command; no codegen overlaps browser.

## Task2: Install help and regression

Files: components/pwa/registration.tsx and install-guide.tsx, app/install/page.tsx and DESIGN_BRIEF.md; landing/login/workspace/project copy; tests/pwa.spec.ts.

- [x] RED: `/install` shows heading and fallback instructions, simulated prompt produces button and accepted/dismissed/error states, standalone suppresses install button; screenshot and overflow assertions360/768/1440.
- [x] Implement guide using existing auth-layout/controls; no initial modal/banner, auto prompt or forced refresh. Root registration uses secure context and production/dev opt-in.
- [x] GREEN focused suite; format/check, full e2e workers2 sequentially. API integration only if API changes (none planned).

## Task3: Review, local preview and documentation

- [x] Independent security/correctness review of full diff. Fix important findings with RED→GREEN; defer small unrelated polish.
- [x] Build/runtime smoke SW headers, manifest and public fallback. Restart only preview process verified by PID/command; preserve local services and data. Browser demo screenshot and deliverable tab.
- [x] Update PRODUCT/README/tech-stack and implementation evidence with precise local/HTTPS/device boundaries. Secret/diff check; local checkpoint only, no inherited permission to push this new task.

## Execution ledger

- Preflight: product purpose and PWA limits already selected in tech-stack/roadmap. User delegates next task and AGENTS instructs autonomous execution of discoverable scope; proceed with this bounded milestone without another approval cycle. Current checkout clean, use new feature branch in place to preserve configured local preview/dependencies. No concurrent implementers.
- Initial RED2/2: missing PNG manifest entries and install route404. GREEN2/2 confirmed real worker/cache/offline/reconnect and public help. Install event race RED verified: appinstalled was overwritten by late accepted; terminal installed/standalone state retained by functional update.
- `pnpm check` passed lint/types,50unit and API/web build before review fix. No API implementation/schema change, so no new integration run needed; full browser regression pending.
- Independent review found prompt lost on landing→install SPA navigation or leaving help. Requires persistent root capture; navigation regression added before fix. No other actionable cache-security/API finding. Native installer/HTTPS/real devices remain unverified, as specified.
- Startup diagnostic: two browser invocations timed out before tests at60s. DEBUG pw:webserver showed Prisma generated, Nest watch compilation ran14:20:03→14:20:48 and found zero errors, then process terminated at14:20:53 before listening. Increase only harness API startup budget to120s; no product request/render timeout change. Docker services healthy, no reset/migration/data changes.
- Review RED reached missing install button after opening the FAQ and navigating via actual Link (initial probe missed opening details and was corrected). Fix captures offers/status in root InstallProvider, keeps UI on install page and guards duplicate prompt. No second review required; final browser includes this regression.
- Local verification optimization: subsequent browser runs may use ignored `.local/pwa-built-api.config.ts`, which changes only API startup from Nest watch to the already checked build, retaining exact test env/DB/Redis/ports and Next dev server. Avoid repeated codegen/watch compilation during frontend validation; no server reuse or local-data override.
- Final browser evidence: full65/68 with all15new cases green; three existing cold-start/render timeouts passed unchanged in serial recheck3/3. No claim of single green full run. Built web/local API PWA suite then passed15/15 (28.4s), including real worker install failure/update/cache and synthetic native UI outcomes. Independent review finding RED→GREEN in these suites; no re-review.
- Screenshot round:1440/768/360 help and1440/360offline, no document overflow; H icon reviewed. Detector once20advisories against prototype ramp; preserved existing product UI. Preview/install handoff verified in IAB. No HTTPS/native-device claims.
- Security correction: raw test error context revealed a fixture password while diagnosing timeout; test setup rotated credentials only in hucescholar_test DB/test.env. No local demo credential changed. Subsequent log reads redact credentials. Secret and diff checks required for checkpoint.
- Checkpoint2e3a6c0 saved35files after staged-secret/diff checks. Resumed runtime smoke initially found API proxy500 because Docker daemon had stopped; reopened existing Docker services and started only API on vacant3001. Final asserted smoke200health/401auth, both no-store, and public PWA200/private workspace200. No product code change or data reset required. Documentation checkpoint records this separately.
