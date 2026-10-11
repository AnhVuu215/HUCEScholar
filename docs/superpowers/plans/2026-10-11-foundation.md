# HUCEScholar Foundation Implementation Plan

> **For agentic workers:** Use `executing-plans` to implement this plan inline, then one fresh reviewer for the complete branch. Steps use checkbox syntax.

**Goal:** Create a private GitHub repository and a reproducible web/API foundation with a real same-origin connectivity check.

**Architecture:** pnpm workspace with `apps/web` (Next.js) and `apps/api` (NestJS). Next.js proxies `/api/v1` to the local API; backend remains the business authority. Preserve the approved product/specification artifacts as the baseline.

**Tech Stack:** Node 22.21 LTS, pnpm 11.25, Next.js 16, React 19, Tailwind 4, NestJS 11, TypeScript 5.9, Jest/Supertest and Playwright. Exact package versions and dependency graph are pinned during scaffold.

**Spec:** `docs/HUCEScholar-tech-stack.md`, `PRODUCT.md`, `design/wireframe/DESIGN_BRIEF.md`.

## Global Constraints

- Web responsive + PWA for MVP; no native app or offline reading promise.
- Three roles ADMIN, LECTURER, STUDENT; no public registration or SSO.
- Do not treat prototype data or health responses as authentication, persistence, database or PDF proof.
- Preserve navy #001e42, accent #0056a6, ground #f3f6fa, Vietnamese copy and visible focus when mapping the existing visual direction into the foundation page.
- No secrets, real student records, official-school claims or paid infrastructure provisioning.
- No database schema changes in this milestone. SQL migration and Prisma mapping are the next independently testable milestone.

## Review Focus

1. Invalid PORT/NODE_ENV values must fail before the API listens; test invalid numeric formats, ranges and mode names.
2. API unavailable: web must show failure and a working retry, never a false healthy state.
3. Health endpoint is liveness only, must send `Cache-Control: no-store` and no infrastructure/secrets.
4. Mobile/tablet and keyboard users must reach the status/retry control without horizontal page overflow.
5. Clean checkout must install from the frozen lockfile and run checks without local credentials, Docker or user-specific paths.

## Task 1: Preserve the design baseline in Git

**Files:** `.gitignore`, `.gitattributes`, `README.md`, `AGENTS.md`, existing docs/design.

**Interfaces:** Produces baseline `main` commit and private origin `https://github.com/AnhVuu215/HUCEScholar.git`; implementation branch `codex/bootstrap` consumes this baseline.

- [ ] Inspect tracked candidates for credentials, generated scratch files and oversized assets. Keep approved Word/ZIP/PNG deliverables.
- [ ] Commit the baseline on `main`, push to private origin, create `codex/bootstrap` locally.
- [ ] Verify remote URL, commit SHA and private repository visibility.

## Task 2: Runnable workspace and API

**Files:** root package/config, `apps/api/package.json`, `apps/api/src/{main,app.module,health.controller,config}.ts`, API config/tests, `.github/workflows/ci.yml`.

**Interfaces:** `parseEnvironment(input: NodeJS.ProcessEnv): { host: string; port: number; nodeEnv: string }`; `GET /api/v1/health` returns `{ status: 'ok', service: 'hucescholar-api' }` with no-store. Web consumes this exact same-origin endpoint.

- [ ] Pin dependencies and workspace scripts, install and save lockfile.
- [ ] Write API tests first. Reject `PORT='1.5'`, `PORT='0'`, `PORT='65536'`, `PORT='3001oops'`, empty PORT, unsupported NODE_ENV; accept defaults and valid numeric port.
- [ ] Run Jest and observe missing configuration/controller failure.
- [ ] Implement strict startup config, loopback binding by default, Helmet and API prefix. Example behavior:
  ```ts
  expect(parseEnvironment({ PORT: '3001' }).port).toBe(3001);
  await request(app.getHttpServer()).get('/api/v1/health')
    .expect('Cache-Control', 'no-store').expect(200)
    .expect({ status: 'ok', service: 'hucescholar-api' });
  ```
- [ ] Run API tests/typecheck/build. Configure CI with the same root checks; no Docker or external credentials required.

## Task 3: Responsive foundation page and handoff

**Files:** `apps/web/app/{layout,page,globals,manifest}.tsx` (manifest uses `.ts`), `apps/web/components/api-status.tsx`, Next/ESLint/PostCSS/TS configs, SVG mark, `tests/foundation.spec.ts`, Playwright config, `infra/compose.yaml`, env examples, README and implementation status document.

**Interfaces:** `/` is an explicitly labeled development entry page, not the student workspace. A status component fetches `/api/v1/health` with `cache: 'no-store'`, times out, validates the response, and retries on demand. Manifest contains no service worker or private caching.

- [ ] Write Playwright expectations before implementation: healthy API, unavailable API with retry recovery, initial loading status, mobile/tablet no horizontal overflow. Example assertions:
  ```ts
  await expect(page.getByRole('status')).toContainText('API đang hoạt động');
  await expect(page.getByRole('button', { name: 'Thử lại' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  ```
- [ ] Build the existing navy visual grammar into a compact, truthful development page. Add working section links and status feedback; no fake login, fabricated materials or dead controls.
- [ ] Add local Postgres/Redis Compose config using required env password interpolation, loopback ports, named volumes and healthchecks. Do not start paid/external services or initialize the schema implicitly.
- [ ] Run lint, typecheck, Jest, production builds, Playwright against running web/API; inspect desktop/mobile screenshots once and address concrete defects.
- [ ] Update product/stack status and README with PowerShell setup, exact scripts, current limits, Docker status and next milestone.
- [ ] Commit changes, request one independent branch review, fix important findings, rerun affected checks and push branch.

## Execution decision

The user explicitly requested starting implementation after selecting web + PWA and approving the stack. Execute this scoped foundation directly; retain baseline docs and commit implementation on a separate branch. A worktree would omit the initially untracked artifacts, so use this existing workspace and feature branch.
