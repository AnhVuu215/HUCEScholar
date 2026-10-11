# Database and authentication implementation plan

> Use executing-plans inline, test-driven-development for behavior and one independent code/security review at completion.

**Goal:** Persistent PostgreSQL schema and real cookie-session login/logout for ADMIN, LECTURER and STUDENT, connected to responsive web screens.

**Architecture:** Keep the Next.js/NestJS workspace and feature branch. Prisma 7 with PostgreSQL adapter maps the 23 existing tables; custom SQL migrations preserve database-specific constraints. Nest owns authentication, CSRF and role checks. Redis provides atomic login throttling; sessions remain in PostgreSQL.

**Tech Stack:** Existing Node 24 / Nest 11 / Next 16, Prisma 7.10, pg adapter, Argon2id, Redis, Jest/Supertest/Playwright.

**Spec:** PRODUCT.md, docs/HUCEScholar-tech-stack.md section 4, docs/database/HUCEScholar_schema_postgresql.sql; user approved the four-step database/login milestone directly.

## Global constraints

- ADMIN, LECTURER, STUDENT only; no public signup/SSO, SMTP reset or account-management UI in this milestone.
- No secrets/passwords/session tokens committed or logged. Bootstrap is explicit CLI; local secrets generated into ignored files.
- Opaque 32-byte session tokens; only SHA-256 hashes stored, HttpOnly/SameSite=Lax cookies, Secure and host-prefixed under production HTTPS.
- Mutations require exact configured Origin and CSRF tied to the browser seed and session. Login rate limiting fails closed when Redis is unavailable.
- Sessions expire and are invalidated on lock/password/role/verification changes. All authenticated responses are no-store; bigint IDs are JSON strings.
- Existing SQL is copied verbatim into baseline migration. No db push or implicit reset of application data.
- Unit tests require no database. Integration and browser tests use a separate database ending `_test` and isolated Redis database 15.

## Review focus

1. Wrong password, unknown, locked and pending users return the same public login error.
2. Forged/missing CSRF or Origin cannot log in or log out another browser.
3. Expired/revoked/locked-user sessions fail even with a formerly valid cookie; unlock must not resurrect sessions.
4. Duplicate/terminal schema constraints and partial indexes/triggers survive migration and database restart.
5. Clean checkout and CI generate Prisma client and run all checks without real credentials; no browser trace or screenshot captures passwords.

## Task 1: Database and Prisma mapping

**Files:** apps/api/prisma/schema.prisma, prisma/migrations/*/migration.sql, prisma.config.ts; scripts/local-environment.mjs; infra env/config; apps/api/src/database/*; integration setup.

**Interfaces:** DatabaseService extends generated PrismaClient with pg adapter and explicit connect/disconnect. All models use hucescholar schema; migration bookkeeping remains public. DATABASE_URL and REDIS_URL are server-only.

- [x] Generate ignored local environment secrets, inspect target database and container ownership, start only this project's PostgreSQL/Redis.
- [x] Apply verbatim baseline to an empty database through Prisma migrate deploy, then introspect the complete 23-table mapping.
- [x] Add SQL migration revoking sessions after status/password/role/verification changes, without changing existing data model.
- [x] Test original reference validation SQL on isolated migrated database; compare table/FK/CHECK/index/function/trigger definitions against the baseline.
- [x] Verify ORM read/write and persisted account row across PostgreSQL container restart; keep app database separate from tests.

## Task 2: Session authentication and protected API

**Files:** apps/api/src/auth/*, src/database/*, src/workspace/*; test/auth.integration.spec.ts, test/auth-config.spec.ts; scripts/bootstrap-admin.ts.

**Interfaces:** GET /auth/csrf → {csrfToken}; POST /auth/login {email,password} → {user:{id,email,displayName,role}} plus cookie; GET /auth/me → {user}; POST /auth/logout →204; GET /workspace/{admin,lecturer,student} requires exact role. All routes prefixed /api/v1.

- [x] Write failing configuration and HTTP integration cases for each role, generic credential errors, normalized email, logout, token hashing, expired/revoked/locked/unverified users, role denial, CSRF/Origin and throttling.
- [x] Observe failures before implementation, then implement Argon2id passwords and transactional login with row lock/recheck to prevent lock/reset races.
- [x] Implement DB-backed cookie guards, session-bound CSRF and Redis fixed-window atomic login limits (IP and hashed email).
- [x] Provide first-admin bootstrap requiring password via environment; never overwrite existing credentials or print passwords.
- [x] Run unit/integration suites and verify last-admin protection is not claimed until account-management mutation exists.

## Task 3: Real login and role workspaces

**Files:** apps/web/app/login/page.tsx, app/workspace/[role]/page.tsx, components/auth/*, styles; tests/auth.spec.ts; scripts/test-environment.mjs; playwright config; CI.

**Interfaces:** Fetch same-origin endpoints with cookies and no-store; fetch CSRF before login/logout. Session determines role; URL/UI never grants permission. Root foundation page remains available with accurate status and a working login link.

- [x] Write browser tests first: successful three-role login, wrong-password recovery, session restored after reload, wrong-role URL blocked, logout/back protection, mobile form and keyboard behavior.
- [x] Implement existing navy login composition and three truthful workspace shells. No fake materials, disabled dead navigation or simulated upload.
- [x] Check loading/network/auth-expiry feedback and prevent credentials/private responses from entering caches, URLs, traces or screenshots.
- [x] Run format/lint/typecheck/unit/integration/build/browser checks, inspect desktop/mobile/tablet once, then independent code/security and UI reviews.
- [ ] Update README, API/implementation notes, bootstrap instructions and current milestone status; commit/push to current PR, update PR scope and verify GitHub CI. Local documentation is ready; GitHub verification follows push.

## Execution ruling

Continue in the existing clean `codex/bootstrap` checkout and draft PR #1, using separate commits for this milestone. The user's explicit instruction to implement authorizes routine setup and the agreed auth scope; no new design approval round is needed. Do not merge or deploy cloud infrastructure.
