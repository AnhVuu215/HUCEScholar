# Login and role workspace extension

Mode: Operate. Routes: `/login`, `/workspace/{admin,lecturer,student}`. The user explicitly approved implementing real authentication on the established design; this is a scoped extension of `huce-neu-reference-v2`, with no new identity or concept round.

THESIS: A clear, calm entrance to an account provisioned by the administrator, with the actual role shown after authentication.

OWN-WORLD: Inherit navy #001e42, blue #0056a6, cool ground #f3f6fa, Segoe UI/Arial, outlined fields and 44px minimum controls from the existing wireframe/foundation. No official school logo, raster artwork, motion or material effects are needed.

STORY: Login introduces the learning goal, discloses the current development scope, accepts email/password and opens the role returned by the API. Failure preserves form content and names recovery. Workspace shows real account data and clearly describes future work; logout returns to login. No signup, reset email action, mock catalog or dead business navigation.

FIRST VIEWPORT: On desktop, navy introduction on the left and a focused white login form on the right, following `design/wireframe/app.js` auth composition. At widths up to900px, login keeps a compact navy brand header and puts the form first; long introduction/development copy remains desktop-only. Install keeps its own introduction. Workspace inherits the navy sidebar and light content field; on phone/tablet its navigation opens with an explicit Menu button, supports Escape/focus return and closes after following a link. Desktop navigation stays visible. Use workspace-prefixed classes to avoid collisions with PDF.js viewer styles.

FORM: `huce-neu-reference-v2`, inherited code-led extension. Adapt prototype copy to real login and remove simulated reset/signup/role selectors. These changes follow approved product truth rather than introducing a replacement visual world.

States: blank form, browser field validation, submitting, generic credential failure, CSRF recovery, throttling, network failure; workspace loading, real account, forbidden role, network retry and logout error. API is the authorization authority. Private API responses are no-store, credentials stay in form memory/HttpOnly cookies, and screenshots show only blank credentials or labeled test accounts.

Verification is recorded in `docs/implementation/2026-10-11-database-auth.md`. Root DESIGN.md remains scoped to the prototype.
