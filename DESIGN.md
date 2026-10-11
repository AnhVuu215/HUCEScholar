---
name: "HUCEScholar wireframe v2"
description: "Navy learning workspace proposal; not brand approved; scoped only to design/wireframe"
colors:
  navy: "#001e42"
  navy-soft: "#153b68"
  ink: "#172b45"
  muted: "#52647a"
  paper: "#fff"
  ground: "#f3f6fa"
  line: "#dce4ef"
  accent: "#0056a6"
  accent-soft: "#e8f1fb"
  accent-hover: "#003d7a"
  secondary-line: "#c8d5e5"
  secondary-hover: "#edf3fb"
  focus: "#3379be"
  field-line: "#b8c9de"
  field-placeholder: "#5e7085"
  nav-ink: "#c4d5e9"
  nav-active: "#164a80"
  nav-secondary: "#b6cbe3"
  badge-line: "#d2dfef"
  blue: "#245a88"
  blue-bg: "#edf4fc"
  warn: "#725318"
  warn-bg: "#f9f2e2"
  danger: "#943a32"
  danger-bg: "#fbefed"
  danger-hover: "#762b25"
  cover: "#07396b"
  cover-2: "#245f86"
  cover-3: "#775b39"
  cover-4: "#466478"
  cover-ink: "#d3e4f8"
  reader-stage: "#e3e9f1"
  document-ink: "#263347"
  highlight: "#f6e6a1"
typography:
  body:
    fontFamily: '"Segoe UI", Arial, sans-serif'
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.55
  headline:
    fontFamily: '"Segoe UI", Arial, sans-serif'
    fontSize: "30px"
    fontWeight: 650
    lineHeight: 1.25
    letterSpacing: "-.025em"
  catalog-headline:
    fontFamily: '"Segoe UI", Arial, sans-serif'
    fontSize: "38px"
    fontWeight: 650
    lineHeight: 1.18
    letterSpacing: "-.03em"
  title:
    fontFamily: '"Segoe UI", Arial, sans-serif'
    fontSize: "20px"
    fontWeight: 650
    lineHeight: 1.35
  label:
    fontFamily: '"Segoe UI", Arial, sans-serif'
    fontSize: "13px"
    fontWeight: 600
    lineHeight: 1.55
  cover-title:
    fontFamily: '"Segoe UI", Arial, sans-serif'
    fontSize: "16px"
    fontWeight: 600
    lineHeight: 1.35
    letterSpacing: "-.02em"
  document-body:
    fontFamily: '"Times New Roman", Times, serif'
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.85
  document-title:
    fontFamily: '"Times New Roman", Times, serif'
    fontSize: "22px"
    fontWeight: 650
    lineHeight: 1.4
rounded:
  container: "12px"
  button: "8px"
  field: "6px"
  badge: "4px"
  outline-item: "5px"
  notice: "7px"
  cover: "2px 6px 6px 2px"
spacing:
  gap-4: "4px"
  gap-6: "6px"
  gap-8: "8px"
  gap-10: "10px"
  gap-12: "12px"
  gap-14: "14px"
  gap-16: "16px"
  gap-18: "18px"
  gap-20: "20px"
  gap-22: "22px"
  gap-24: "24px"
  gap-28: "28px"
  gap-30: "30px"
  gap-32: "32px"
  gap-36: "36px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.paper}"
    typography: "{typography.label}"
    rounded: "{rounded.button}"
    padding: "10px 17px"
  button-primary-hover:
    backgroundColor: "{colors.accent-hover}"
  button-secondary:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.button}"
    padding: "10px 17px"
  button-secondary-hover:
    backgroundColor: "{colors.secondary-hover}"
  button-danger:
    backgroundColor: "{colors.danger}"
    textColor: "{colors.paper}"
    typography: "{typography.label}"
    rounded: "{rounded.button}"
    padding: "10px 17px"
  button-danger-hover:
    backgroundColor: "{colors.danger-hover}"
  button-text:
    backgroundColor: "transparent"
    textColor: "{colors.accent}"
    padding: "6px 4px"
  field:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.field}"
    padding: "10px 12px"
    width: "100%"
  navigation-item:
    backgroundColor: "transparent"
    textColor: "{colors.nav-ink}"
    rounded: "{rounded.button}"
    padding: "12px"
  navigation-item-current:
    backgroundColor: "{colors.nav-active}"
    textColor: "{colors.paper}"
  badge:
    backgroundColor: "{colors.blue-bg}"
    textColor: "{colors.blue}"
    rounded: "{rounded.badge}"
    padding: "3px 8px"
  panel:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.container}"
    padding: "24px"
  learning-card:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.container}"
    padding: "22px"
  study-cover:
    backgroundColor: "{colors.cover}"
    textColor: "{colors.paper}"
    rounded: "{rounded.cover}"
    padding: "15px 13px"
    width: "106px"
  continue-reading:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.navy}"
    rounded: "{rounded.container}"
    padding: "20px 22px"
  reader-paper:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.document-ink}"
    typography: "{typography.document-body}"
    padding: "44px 36px 30px"
    width: "100%"
---

# Design System: HUCEScholar wireframe v2

## Overview

**Status: wireframe proposal, not brand approved. Scope: `design/wireframe` only.** This extraction records the finished navy v2 static prototype. Tokens are normative for reproducing this proposal, not an official HUCE identity or a production application specification.

**Creative North Star: "Không gian học tập HUCE".** The direction contract establishes a learning workspace with navy navigation, a horizontal learning shelf, white content surfaces, and a focused reading page. NEU Reader informs recognition of books and learning material; the HUCE website informs the observed navy. Composition, HTML/CSS cover artwork, and product organization belong to this prototype.

`PRODUCT.md` owns product truth and the confirmed HUCEScholar name. `design/wireframe/DESIGN_BRIEF.md` owns the chosen surface direction; `design/wireframe/styles.css` owns exact visual values, including its final overrides; `design/wireframe/app.js` owns rendered markup and in-memory interactions. `.impeccable/design.json` extends these tokens with component samples and responsive/elevation metadata. No approved logo, official palette, or student/lecturer usability validation is established.

**Key Characteristics:**

- Dark navy navigation beside a light Vietnamese learning workspace.
- Horizontal learning cards with decorative cover typography and source/version context outside the artwork.
- A resume panel that opens the version and page held in the current prototype session.
- System sans-serif tools surrounding an illustrative serif reading page.
- Responsive reflow, visible keyboard focus, and status text alongside color.

## Colors

The palette combines institutional navy, blue actions, cool paper surfaces, and restrained semantic states. Frontmatter contains the extracted values; these names describe implemented roles.

### Primary

- **Navigation navy** (`navy`): sidebar, catalog/detail headings, reader headings, authentication story, and toast background. The brief records the live HUCE navigation color observed on 11 October 2026.
- **Action blue** (`accent`): primary actions, links, selection context, and the catalog heading's second line. This accent is our prototype adaptation, not an observed official HUCE brand token.
- **Soft action surface** (`accent-soft`): resume panel and active outline item. Darker blue treatments distinguish navigation hover and current page.

### Secondary

- **Illustrative covers** (`cover`, `cover-2`, `cover-3`, `cover-4`): four local artwork colors for recognizing course cards. The fourth tone also appears on alternating external-book covers. These are not category/status meanings or an official brand palette.

### Neutral

- **Workspace and paper** (`ground`, `paper`): cool background and white content surfaces, separated by `line`.
- **Primary and supporting text** (`ink`, `muted`): tool labels/content and secondary context. Pale navigation text is purpose-specific to the dark sidebar.
- **Reader stage and document ink** (`reader-stage`, `document-ink`): stage around the paper and text inside the illustrative page.

Warning, danger, information, and neutral badges pair their tint with explicit text. The warm document highlight is a simulated reading annotation, separate from those statuses.

**The Status Text Rule.** Keep explicit status text alongside warning, danger, information, and neutral treatments; color alone does not express state.

## Typography

The interface uses Segoe UI with Arial/sans-serif fallbacks for Vietnamese. The final illustrative reader uses Times New Roman with Times/serif fallbacks to keep Vietnamese glyph spacing consistent; the separate external-book cover uses Georgia. No web font is loaded.

- **Catalog headline:** its frontmatter role is distinct from default h1; it reduces to 34px at 1200px and 31px at 650px. The second line is blue, with 19ch desktop/20ch phone maximum width.
- **Default headlines and section titles:** h1 uses the `headline` role, reducing to 26px on phones; local detail, reader, authentication, panel, and dialog headings override it. Detail titles are 32px/28px; reader titles are 22px/20px. Panel titles are 18px.
- **Learning-card titles:** 17px, weight 650, line-height 1.45; 15px on phones. Metadata is 12px/11px. Final source overrides keep shelf badges and navigation section labels at 11px, including phones.
- **Decorative cover type:** the `cover-title` role reduces to 14px on phones. Small cover labels use 8px/7px. Catalog cover markup is `aria-hidden="true"`; authoritative title, course, source, version, and rights remain outside it. The phone catalog hides the duplicated course metadata because the title/context remains available.
- **Body and labels:** standard body uses the frontmatter role with paragraph maximum width 72ch. Form/action labels use 13px semibold; supporting text uses 12–13px. Tabular numerals appear where the `.mono` treatment is used.
- **Illustrative paper:** body reduces to 14px and h2 to 20px on phones. Running header/footer use system sans-serif at 10px (running header 9px on phones), with the header uppercase and .07em letter spacing.

## Layout

Desktop uses a 244px persistent sidebar plus flexible workspace. The sidebar has 30px 18px padding and 36px section gaps. The prototype bar has a 44px minimum height; existing shell/sidebar height calculations still subtract 48px. The topbar is 76px high. Main content caps at 1480px and uses 34px 36px 40px padding.

The catalog introduction pairs flexible heading content with a 300px resume panel and 36px gap. Search follows in a bordered white panel; filters wrap. The shelf uses two equal columns with 18px gaps. A card pairs a 106px cover with flexible metadata; actions sit below metadata in column two. The cover spans both rows. Library document rows share the card layout but retain their existing small thumbnail instead of catalog artwork.

Reader defaults to 156px outline + flexible stage + 284px notes with 16px gaps. The stage scrolls internally, with a 550px minimum height and `calc(100vh - 240px)` height cap. The paper's base minimum height is 680px. The rendered paper has inline width from the zoom selection and `max-width:none`, overriding the stylesheet's wide-screen 720px cap; do not describe that cap as effective runtime behavior.

| Breakpoint | Implemented changes |
|---|---|
| `min-width: 1500px` | Reader columns become 176px / flexible / 300px; paper padding is 48px 58px. The later reader-content rule keeps its outer padding at 24px. |
| `max-width: 1200px` | Main content padding is 28px; catalog resume column becomes 260px with 24px gap and 34px headline. Shelf and external-book grid become one column. Reader outline hides; notes/detail action columns are 270px. Reader padding is 20px. |
| `max-width: 900px` | Persistent sidebar hides; menu opens a fixed 270px sidebar. Topbar becomes 66px, content padding 26px 22px. Reader heading/controls stack. |
| `max-width: 650px` | Catalog, detail, forms, reader, authentication, and screen map become one column. Content padding is 24px 16px; reader padding is 18px 12px. Notes follow the page. Search button spans full width; the two filter fields remain side by side when space permits. Cards use 84px covers and 16px padding; actions span the full row. Stage padding is 14px with no height cap/minimum; paper padding is 28px 22px and minimum height 560px. |

The phone search button remains at least 48px high because the earlier, more-specific rule wins over the later 46px declaration. Phone prototype selectors retain 110px role/120px scenario widths and one-row controls. Prototype controls are demo chrome. Print rules remove navigation/demo chrome, convert the shelf to block rows, hide resume, and avoid breaks within cards/panels.

## Elevation & Depth

Most surfaces are flat, separated by cool backgrounds and 1px borders. The final shared elevation is `0 12px 32px rgba(17,24,39,.16)` for dialogs, toast, and the open mobile sidebar. The paper uses `0 4px 15px #11182712`. The dialog backdrop remains `rgba(0,30,66,.45)`. Earlier navy shadow declarations are superseded by final neutral shadow overrides.

No motion or animation token scale exists. Reduced-motion CSS removes transitions/animations and resets smooth scrolling when requested. Do not synthesize a motion vocabulary or tonal ramp during documentation.

## Shapes

Containers, panels, shelf cards, resume, reader panels/stage, tables, and dialogs use 12px corners. Standard buttons, icons, navigation, selects, and textareas use 8px corners; ordinary text inputs retain 6px corners because the earlier `input:not([type=checkbox])` selector outranks the later generic input rule. Status badges use 4px. The cover silhouette uses asymmetric 2px 6px 6px 2px corners and a thin inset spine line. Sidebar avatar corners are 10px; the generic avatar remains circular elsewhere. The illustrative paper remains rectangular.

Borders/dividers are predominantly 1px; tabs use a 2px selected underline. Keyboard focus uses the `focus` color as a 3px outline with 3px offset. Route-focused headings (`h1[tabindex="-1"]`) instead use a 2px outline, 6px offset, and 2px corners. The abstract book mark is illustrative and does not establish an official logo.

## Components

- **Buttons:** primary blue, outlined secondary, red destructive, compact, text, and icon variants exist. Standard buttons are at least 44px tall with 10px 17px padding. The more-specific compact variant retains its 34px minimum height, 6px 10px padding, and 12px text; context-specific document/reader rules can override it. Primary hover is darker blue; secondary hover is pale blue; destructive hover is explicitly darker red. Icons are 42px desktop/44px phone. Disabled controls use .5 opacity and a not-allowed cursor. Text actions retain 32px desktop/40px phone minimum height, except prototype controls at 30px.
- **Fields/search:** bordered white fields with 6px text-input corners, 8px select/textarea corners, and 10px 12px padding inherit the UI font. Search has a pale local fill, distinct border, 48px minimum height, and 44px left icon inset. Textareas resize vertically and default to 110px minimum height/1.6 line-height; note input uses 105px. Invalid fields use danger borders and accompanying error text. Keyboard focus follows the global outline.
- **Navigation:** sidebar links use 14px text, 12px padding, 46px minimum height, pale resting text, navy hover fill, and a lighter blue current-page fill with white semibold text. Current state uses `aria-current=page`. The mobile overlay is a prototype navigation pattern; styles alone do not prove complete accessibility.
- **Badges/notices:** status badges have 11px semibold text, with 3px 8px padding normally and 2px 6px inside document rows. Phone generic badges are 10px; shelf badges remain 11px. Warning/danger/information/neutral variants retain labels. Inline notices combine icon and explanatory text. Some utility surfaces retain local legacy neutral/greenish values, such as upload-area and default notice styles; the navy system does not claim every one-off color was replaced.
- **Panels/tables:** panels use 24px padding, dropping to 20px on phones. Tables scroll in an overflow wrapper; final header cells use a cool pale fill. Empty/loading/error surfaces are separate and include recovery text/actions. Static skeleton bars do not imply a backend request.
- **Learning shelf:** catalog cards are horizontal at all sizes, with course artwork, external source/version badges, title link, author/rights metadata, a detail action, and a labeled save icon with `aria-pressed`. Artwork is decorative and explicitly labeled illustrative; it is neither a PDF thumbnail nor an authentic book cover.
- **Resume:** the catalog panel uses in-memory role progress, selecting an available published/visible document entry in reverse object-entry order. Its route carries the stored version and page; it does not force the latest version. Without progress it links to the personal library. This is not durable persistence or a timestamp-based recency algorithm.
- **Reader:** light outline/notes containers flank a cool paper stage. Tools are 42px minimum height on desktop and 44px on phones. Version and page context accompany private notes and honest save/error feedback. Notes remain tied to their original role/document/version/page. This is HTML simulation, not a real PDF renderer, backend permission check, or validated annotation anchoring system.
- **Dialogs/toast:** dialogs cap at `min(600px,calc(100vw - 32px))` width and 85vh height, with divided header/body/actions. Toast is fixed bottom-center on navy. These styles do not establish full keyboard/screen-reader verification.

## Do's and Don'ts

### Do:

- **Do** reproduce the final cascade in `design/wireframe/styles.css` and rendered markup in `design/wireframe/app.js` when extending this proposal.
- **Do** preserve source/version/rights context outside decorative cover artwork, text status labels, and the prototype disclosure.
- **Do** open resume links at their stored version and page and keep notes tied to their original version.
- **Do** preserve visible keyboard focus, reduced-motion preference, and mobile reflow.
- **Do** obtain product-owner review before treating the proposal as a production visual specification.

### Don't:

- **Don't** present the adapted palette, illustrative book mark, or cover artwork as approved HUCE branding or official school material.
- **Don't** copy NEU landing composition, logos, imagery, or book content into this distinct learning workspace.
- **Don't** infer production authentication, permissions, upload safety, persistence, PDF rendering, or annotation accuracy from the static prototype.
- **Don't** invent tonal ramps, fonts, animation tokens, or component variants while documenting the current CSS.
- **Don't** apply this file as design authority outside `design/wireframe` without an explicit scope decision.
