# Notebook fonts (CANVAS-01)

Fonts a user can pick for typed text in "Vở ghi". Downloaded on 2 November 2026 from the Google Fonts
CSS API (`fonts.googleapis.com/css2`, Chrome user agent), keeping only the `vietnamese`, `latin-ext`
and `latin` subsets as WOFF2. `apps/web/app/notes-fonts.css` declares them with their
`unicode-range`, so a browser fetches a file only when a page uses that font and those characters.
No request goes to Google when the app runs.

| Family         | Weights  | Upstream                                          |
| -------------- | -------- | ------------------------------------------------- |
| Be Vietnam Pro | 400, 700 | https://github.com/bettergui/BeVietnamPro         |
| Inter          | 400, 700 | https://github.com/rsms/inter                     |
| Noto Serif     | 400, 700 | https://github.com/notofonts/latin-greek-cyrillic |
| Lora           | 400, 700 | https://github.com/cyrealtype/Lora-Cyrillic       |
| Patrick Hand   | 400      | https://fonts.google.com/specimen/Patrick+Hand    |
| Dancing Script | 400, 700 | https://github.com/googlefonts/DancingScript      |
| Roboto Mono    | 400, 700 | https://github.com/googlefonts/robotomono         |

All seven are licensed under the SIL Open Font License 1.1 (checked against the `ofl/` folders of
https://github.com/google/fonts). The copyright notices and the license text are in `OFL.txt`.
