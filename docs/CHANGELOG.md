# Keystone changelog

## 2026-09-13 — Collapsible sidebar

Branch: `feature/ux-personalization`.

### Added

- **Collapse sidebar** button beside the Keystone logo (desktop and tablet widths above 900px). The sidebar shrinks to a 68px icon rail so pages get more room, and the content width limit grows from 1240px to 1480px. Page names remain as hover titles and screen-reader labels, and the choice is remembered in this browser (`keystone.sidebarCollapsed`). Phones keep the existing one-line top navigation.

### Fixed

- Time Machine is only mounted for roles with `scenario.run`. Previously it loaded hidden for every role, so each manager and employee sign-in sent two refused `GET /api/keystone/scenarios` requests (403) and logged console errors.

## 2026-09-13 — Calmer workspace, heat map, export, remember-me and local assistant

Branch: `feature/ux-personalization`.

### Added

- **Home** is the first page after sign-in. It greets the user by display name, explains Keystone in one sentence, shows large role-aware navigation cards and a compact "At a glance" summary (skills with no qualified person, skills covered by one person, open data-quality issues). Each signal links to the filtered detail page. **Open detailed overview** keeps the existing operational dashboard one click away.
- **Skill map heat map**: a fourth view beside Network, Matrix and Charts. Rows are skills, columns are visible departments, cells show qualified holders / organization target with a text state (Critical, At risk, Watch, Healthy, Unknown), a legend, tooltips and accessible labels. Sort by dependency score, name, criticality or gap. Selecting a cell narrows the map to that department and skill.
- **Skill map CSV export**: `GET /api/keystone/exports/skill-map.csv`, generated on the server, limited to `workforce.read.all` / `workforce.read.team`, applying the same search, department, minimum-proficiency and at-risk filters as the screen. Dated file name, `Cache-Control: no-store`, audited as `export.generated` with actor, row count, visibility and a filter summary (search text and exported rows are never stored). Empty results return `422 empty_export`.
- **Keep me signed in** on the login form (selected by default in demo). Persistent sessions keep the configured idle/absolute limits; unselected sessions use a browser-session cookie capped by `KEYSTONE_SESSION_SHORT_HOURS` (default 8). Invalid saved cookies are cleared and produce a friendly "session ended" notice.
- **Help Center search** now also covers a curated topic catalog (overview, skill/heat map, key people, Time Machine, AI advisor, data quality, reviews, audit, users and roles, exports, notifications, language/theme, sessions, assistant). Topics are linkable with `#/help?topic=<id>`; `#/help?search=1` focuses the search box.
- **Keystone Assistant** in the top bar: a local, rule-based navigation helper with six quick prompts, synonym matching and permission-aware shortcut buttons. Unsupported, specific or decision-type questions get a fixed Help Center fallback. Nothing is sent to an AI service, stored or logged.
- Frontend test runner (`npm test --prefix frontend`) with jsdom/Testing Library (development-only) and `shared/skill-map.mjs`, the filter and heat-map model used by both the frontend and the export endpoint.

### Changed

- Login attaches a translated **Caps Lock is on.** warning (added in the previous commit) through a tested helper, and also checks on focus.
- A new sign-in replaces the browser's previous server session. A failed sign-out now shows a retry instead of claiming the session was cleared.
- Secondary pages are lazy-loaded to keep the initial bundle below Vite's size warning.
- README no longer prints the demo password.

### Validation (run 2026-09-13, Node 24.19.0)

| Command | Result |
|---|---|
| `npm test --prefix backend` | 181 passed, 0 failed |
| `npm test --prefix frontend` | 9 passed, 0 failed |
| `npm run lint --prefix frontend` | 0 errors; 15 warnings, all on lines that predate this change |
| `npm run build --prefix frontend` | Built; largest chunk 404 kB (119 kB gzip) |
| `git diff --check` | Clean |
| English/Spanish key parity | 467 / 467 keys |

Live-server HTTP smoke test (backend on a throwaway database, Vite dev server running):

| Check | Result |
|---|---|
| Keep me signed in selected | Cookie has `Max-Age`/`Expires`, `HttpOnly`, `SameSite`; `/auth/me` restores (200) |
| Keep me signed in cleared | Browser-session cookie (no `Max-Age`/`Expires`); `/auth/me` restores (200) |
| Sign out, then reuse old cookie | 204, then 401 `session_ended` |
| Admin export, min level 4 + at-risk only | 200, `keystone-skill-map-2026-09-13.csv`, 3 rows |
| Export with a search that matches nothing | 422 |
| Manager export | 200, team-scoped (51 rows) |
| Employee export | 403 |
| Audit history | One `export.generated` entry per export with rows, visibility and filter summary; no search text or data |

### Known limitations

- Departments have no persisted coverage targets, so heat-map cells compare a department's holders with the organization-wide target.
- The assistant and long-form help content are English only; surrounding controls are translated.
- Browser session-restore features may keep a "session-only" cookie alive; shared-device users should always sign out.
- Caps Lock detection depends on the browser reporting the modifier state.
- A manual click-through in a real browser was not part of this validation run.
