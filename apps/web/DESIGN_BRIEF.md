# Foundation entry page

Mode: Read, with an operational API connection check. Route: `/`.

This temporary development entry point communicates the actual foundation state. It is not the approved student catalog or a login simulation. The user requested starting implementation of the approved stack and design; preserve the wireframe's navy visual grammar for this scoped page.

- Inherit navy #001e42, accent #0056a6, ground #f3f6fa, Segoe UI/Arial, 244px sidebar and mobile reflow from the v2 wireframe. This is an explicit scope extension for the foundation, not a replacement identity.
- Heading, connection status, truthful current scope, then next milestone. No book data, fake login or official HUCE marks.
- Connection has loading, healthy, failure and retry states. Text accompanies color. Retry is keyboard accessible; request is bounded to 8 seconds and cancelled on unmount.
- Only the API process is checked. No claim of database, storage, mail, queue or whole-product readiness.
- No animation is needed for a status/check page. No raster assets are shipped. The simple H mark is authored SVG/text, not the HUCE logo.
- Root manifest is groundwork only. No service worker, offline cache or installability guarantee at this milestone.

Verification and finish findings are recorded in `docs/implementation/2026-10-11-foundation.md` after the checks run.
