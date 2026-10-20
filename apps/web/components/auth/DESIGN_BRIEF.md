# Workspace shell — UI V2

Mode: Operate. Applies to `RoleWorkspace` and its navigation/header across the three roles. Preserve the existing navy/blue production identity, Segoe UI and ordinary task forms. Root DESIGN.md remains historical wireframe guidance.

Primary journey: choose a learning/work destination → complete the page task → reach account utilities without expanding the primary navigation. Sidebar groups contain 3 student, 4 lecturer or 8 admin destinations (REPORT-01 added “Báo cáo tài liệu”). Student contributions retain the familiar “Học liệu của tôi” label under “Đóng góp”. Project status lives in the page footer; install is available by direct route, outside daily workspace navigation.

Header: short role/location trail, account initials/name and a disclosure with account/logout. Keep one h1 and page description below. No dashboard metrics, settings placeholder or unfinished profile routes. On narrow screens retain the mobile Menu button and use an avatar-only account trigger with an accessible label. Sidebar uses normal text links, groups and current-page state rather than unlabeled icons.

Controls: 44px default target, 48px form/filter target, 8px control corners and 12px popup corners. Default/form variants have deliberate sizing; spacing belongs to action containers. Rounded select-only listboxes are used for short source/type/zoom/highlight options. Long academic/admin selections remain native and retain their keyboard behavior; their OS popup corners are not controlled by app CSS. No new dependencies or shipping imagery.

Interaction: Enter/Space/Arrow/Home/End/typeahead, Escape/cancel, Tab/outside close and visible focus. Listbox portal avoids clipping and follows viewport/scroll. Account is a navigation disclosure, not a select/listbox. Its hidden panel stays mounted because the material editor replays the original logout button after an explicit discard decision. Anchors and `data-workspace-logout` remain subject to document-capture draft guards.

Semantic colors continue the existing tokens. New restrained surfaces: active option `#e8f1fb`, avatar `#dceafa`, matching the production pale-blue family; both use existing ink/accent text. Border `#b8c9de` is the incumbent form border. No replacement brand palette.

Verify role-specific direct routes, 401/403/error/retry, active links, keyboard/mobile menu, long labels, reader draft cancellation/pending save, confirmed logout and logout failure recovery. Screenshots use isolated demo fixtures; browser viewport/zoom emulation does not establish physical touch-device or screen-reader support. Evidence is recorded in the V2 implementation checkpoint.
