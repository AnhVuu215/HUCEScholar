# UI Control Inventory — initial (auto-created)

Date: 2026-10-19
Author: Copilot (draft)

Mục tiêu: liệt kê tất cả controls (buttons/selects/inputs) theo surface để quyết định migration priority cho UI-01.

Surfaces:
- Library (apps/web/app/workspace/library)
  - Controls:
    - Search input (native input) — state: native, height: 44px
    - Source select (select) — state: native currently
    - Action buttons: "Tải xuống", "Lưu" (primary/secondary) — state: custom classes `.primary-button`, `.secondary-button`
- Reader (reader-toolbar, reader-highlights)
  - Controls:
    - Zoom input (native input, width fixed) — native
    - Page selector (select) — native
    - Highlight color (select) — native
    - Toolbar action buttons (download/rotate) — custom `.primary-button`/`.secondary-button`
- Upload (upload forms)
  - Controls:
    - File input (native) — keep native
    - Submit (primary) — `.primary-button`
    - Form fields (inputs, textarea) — form-height 48px
- Users / Admin / Catalog / Moderation
  - Controls:
    - Filters (selects) — mostly native `<select>` and some custom triggers
    - Action buttons (create/edit/delete) — `.primary-button`, `.danger-button`, `.secondary-button`
    - Table actions (text-button) — `.text-button` (icon-like)
- Shared shell / header
  - Controls:
    - Account menu trigger (Button component — workspace-account-trigger)
    - Sidebar toggles (workspace-menu-toggle) — .primary/quiet buttons

Migration notes / actions:
- Priority: (1) button primitive + tokens (this PR), (2) SelectField component (UI-02), (3) migrate short selects in library/reader, (4) replace native where beneficial.
- Keep native file/date inputs.
- Replace per-button margin-top with `.form-actions` containers.
- Add Playwright checks for each surface: geometry (height/top), accessibility role, and zoom 200% snapshot.

Checklist (initial)
- [ ] Library: audit selects/inputs and mark replace candidates
- [ ] Reader: audit toolbar controls for SelectField migration
- [ ] Upload: ensure form-actions wrappers around submit buttons
- [ ] Users/Admin: mark long selects for future migration
- [ ] Header/account: ensure Button primitive used and has ref support
