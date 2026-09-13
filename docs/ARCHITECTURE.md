# Keystone architecture

## Application and routing

React 19 and Vite provide the hash-routed frontend; Express and SQLite provide the backend. `App.jsx` bootstraps with credentialed `/api/auth/me` before rendering protected content, listens for session-end events, and uses the existing view capability catalog. Home is the first allowed route and explicit successful sign-in destination. Restored sessions retain valid deep links. Existing Overview remains intact. `KeystoneStarter` loads authorized data and preserves Time Machine/AI advisor state across navigation. Secondary views are lazy-loaded with Suspense to keep the initial production chunk below the default warning threshold.

New `Home.jsx` uses only authorized cards and existing risk/data-quality summaries. Employee development links focus the existing personal suggestions section. New labels use the existing English/Spanish dictionaries and CSS theme tokens. The Help Center extends the existing glossary and task guide with a curated catalog; matching uses escaped React text and no HTML injection. Hash query parameters provide stable topic and search-focus links. New help tasks do not expose unauthorized page links.

## Shared skill-map model and export

`shared/skill-map.mjs` contains pure filtering and heat-map calculations used by both Vite and the Node 24 backend. The existing skill-map model re-exports its filtering function. Filters are skill-name/category search, one department or all, minimum proficiency, and organization-wide concentrated-skill selection. Search is ephemeral rather than saved as a browser preference. Existing Network, Matrix and Charts remain; the new HeatMapView uses semantic table headers, a scrollable region, labeled buttons and a text legend. Evidence detail uses filtered edges.

Heat-map rows group scoped records by skill and visible department. Qualification uses max(selected minimum, target proficiency). Recorded evidence still drives the unchanged official risk engine; missing verification does not silently change official scores. A cell is Unknown if its target is unavailable/nonpositive, records have no verification, or any qualifying record lacks verification. Otherwise zero = Critical; one = At risk; two or more below 80% = At risk; at least 80% but below target = Watch; meeting target with two or more = Healthy. Targets and dependency scores retain explicit organization scope, because department-specific targets do not exist in this schema.

`GET /api/keystone/exports/skill-map.csv` requires workforce.read.all or workforce.read.team, validates query scalar types/ranges, scopes people/evidence on the server, and applies the shared filter model. It emits BOM-prefixed UTF-8 RFC 4180 CSV through the existing formula-escaping serializer, Content-Disposition with a dated filename, and Cache-Control: no-store. CORS already exposes Content-Disposition. The API client downloads a blob and revokes its object URL. Empty results return 422 with `empty_export`; no empty report is audited as a successful export. Invalid query values return 400.

The output grain is employee–skill evidence. Holder counts aggregate the filtered scope; target and dependency score are organization-wide. Scope columns prevent conflating these measures. CSV risk level describes the aggregate filtered scope, rather than each heat-map department cell. The server records `export.generated` with actor context, report ID/type, row count, visibility and filter summary. Search text and exported records are excluded from audit metadata.

## Authentication

The existing schema adds optional boolean `keepSignedIn` to login. Omitted values retain demo persistence and opt out in production. HTTP-only, SameSite=Lax and production Secure policies remain. Persistent cookie Max-Age matches the configured absolute session cap; idle expiry remains enforced server-side. Browser-only sessions omit persistence attributes and get an absolute cap of min(short hours, configured absolute hours). No session schema migration is needed: existing absolute_expires_at stores the chosen limit and sliding idle expiry is always capped by it.

Session tokens remain random 256-bit values, with only SHA-256 hashes in SQLite. A new login destroys the browser’s previous authenticated row. Logout destroys the active row and clears the cookie. Failed sign-out remains an explicit error with retry, avoiding a false claim of revocation. Invalid cookies are cleared by session middleware and `/auth/me` can report `session_ended` without exposing token details. Caps Lock state is a pure helper over getModifierState; unsupported events preserve last-known state and blur resets the warning. No credential persistence was added to JavaScript storage.

## Local navigation assistant

`help/assistant.js` is an ordered deterministic intent catalog. Basic navigation/definition wording, a bounded vocabulary and decision/sensitive-question exclusions are checked before synonym matching. Unknown or overly specific questions use the fixed Help Center fallback. Links are chosen from the same VIEWS capability checks; restricted destinations are replaced with allowed Help Center links. Employee evidence requests point to My profile. Curated answers never inspect employee/workforce datasets.

`KeystoneAssistant.jsx` places a small control in the top bar and reuses Dialog for focus trapping, Escape, close and focus return. Question/answer state exists only while open and is cleared on close. No networking, analytics logging, external model invocation or browser storage occurs in this assistant. Existing AI advisor integration remains separate. Curated answers and long-form help remain English; surrounding controls follow the selected language.

## Tests

Backend tests use separate temporary SQLite databases and in-process HTTP servers with demo-only providers. New integration coverage checks cookie attributes, persistence opt-out, restoration, revocation, expiration, production Secure settings, export role guards, exact shared-filter parity, empty results, query validation, manager scope and audited metadata. Existing governance/scoring/AI tests continue to run.

Frontend tests use Node’s test runner for pure help/assistant/model helpers. Login component tests use Testing Library, jsdom and Vite SSR module loading; they mock the auth API and verify demo/production defaults, boolean submission, masked password, Caps Lock accessibility, key-up/blur clearing and failed-login password clearing. Those dependencies are development-only. Browser walkthroughs separately exercise real local APIs. No secrets or workforce fixtures from real organizations are used.
