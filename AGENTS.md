# HUCEScholar engineering guidance

- Read `PRODUCT.md`, `docs/HUCEScholar-tech-stack.md`, and relevant business/schema documents before changing behavior.
- Preserve the existing design and document deliverables. `design/wireframe/` remains a mock prototype, not the production app.
- Use TypeScript, pnpm, Next.js App Router and NestJS. Keep business rules and authorization in the API.
- Roles are ADMIN, LECTURER and STUDENT. STUDENT and LECTURER may self-register by email (AUTH-04); ADMIN accounts are only issued by an admin. No SSO in MVP.
- Notes are private to their owner and pinned to a document version/page. Never infer access from the frontend.
- File scan state, moderation state and visibility are independent. Do not simplify them into one boolean.
- PostgreSQL-specific constraints, partial indexes and triggers must survive Prisma migrations. Never use `db push` as the migration workflow.
- No real HUCE data, library API, official branding or content rights are assumed.
- Keep secrets out of source control. Do not cache authenticated requests, PDFs, notes or signed URLs in a PWA service worker.
- Run the applicable lint, typecheck, tests and build. Distinguish local evidence from production and device verification.
- Keep changes small and document what is functional versus planned. Use `codex/` for implementation branches.
