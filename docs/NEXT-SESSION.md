# Next session checklist

Written 2026-09-12 at the end of the integration session. Everything here was checked against
the code on `integrate/all-parts` (commit `12cd5ff`), not assumed. Work top to bottom: the
decisions in section 1 change what gets built in sections 3–5.

## 0. Where things stand

- **Branch:** `integrate/all-parts` combines Parts 1–4, the CSV demo data, the Skill Network,
  inventory search and scheduling of reviewed AI actions. Draft PR **#7** to `main`, checks passing.
- **Open PRs, none reviewed:** #4 (Parts 2+4 into `feature/workforce-data`), #5 (`feature/workforce-data`
  → `main`), #6 (CSV data, draft), #7 (everything, draft). Merging #7 covers #4–#6.
- **Verified:** 101 backend tests; frontend lint and build clean; the demo flow clicked through in
  headless Chrome with no console errors.
- **Run it:** `npm ci --prefix backend && npm ci --prefix frontend`, stop any backend, `npm run seed:reset --prefix backend`,
  `npm start --prefix backend`, `npm run dev --prefix frontend`, open http://localhost:5173.

## 1. Decisions to make first

Each has a recommended default; say which you want before building.

- [ ] **Scope of the round.** Recommended: login + roles, in-app audit log, visual refresh, plus the
      security basics that come with login (section 3). The rest of this list follows in later rounds.
- [ ] **Login model.** Recommended: local accounts in SQLite, passwords hashed with Node's built-in
      `crypto.scrypt`, HTTP-only session cookie, seeded demo accounts per role. Alternatives: one shared
      demo password (no roles, audit cannot say who), or Microsoft/Google SSO (needs an app registration
      and internet during the demo).
- [ ] **Roles.** Recommended: **Viewer** (read everything, run Time Machine and AI drafts, save nothing),
      **HR manager** (also edit evidence, targets and save reviewed requirements), **Admin** (also manage
      users and read the audit log).
- [ ] **History log.** Recommended: new in-app **Audit log** of user actions; keep the git-commit
      "Team activity" view but move it under an Admin section. Alternative: replace the git log entirely.
- [ ] **Visual direction.** Recommended: polish Abdul's light dashboard (icons, user menu, dark mode,
      remove dev badge). Alternative: a bolder enterprise redesign. Either way, agree it with Abdul (Member 3).
- [ ] **Catalogue honesty (still open from the team checklist).** Should invented courses be
      `verified: true`? `verified` is a per-row column in `backend/data/demo/learning_resources.csv`.
- [ ] **Unused API surface.** The redesign stopped using `/api/heatmap`, `/api/critical-skills`,
      `/api/gap-analysis`, `/api/recommendations`, `/api/future-skills` and `keystoneApi.succession`/`aiStatus`.
      Decide: re-surface in the UI, or remove with their tests.

## 2. Team and process

- [ ] Get a reviewer on **#7** (or #4 → #5 → #6 in order), then merge. Merging unreviewed PRs from Claude is blocked.
- [ ] Close **#6** as superseded once #7 is merged or chosen.
- [ ] Tell **Marco** his branches are merged into #7 and the Member 1 brief is ticked on his behalf with evidence.
- [ ] Tell **Abdul** his redesign is merged into #7 (5 conflicts resolved), what was added on top, and that
      `feature/keystone-ui` should now branch from `integrate/all-parts` or `main` after merge. His
      auto-sync commits every ~5 minutes ("quiet round, log only") clutter history; ask him to stop them.
- [ ] Rehearse [DEMO.md](DEMO.md) against a freshly reset database and record the backup video.

## 3. Access and security (P0)

- [ ] **Users table** in `backend/data/schema.js`: id, email (unique), display name, role, password hash,
      salt, created/updated, disabled flag. Additive migration only.
- [ ] **Password hashing** with `crypto.scrypt` + per-user salt, constant-time compare (`crypto.timingSafeEqual`).
- [ ] **Sessions:** random 32-byte token, stored hashed in a `sessions` table with expiry; HTTP-only,
      `SameSite=Lax`, `Secure` when served over HTTPS. Idle timeout (e.g. 8 h) and logout that deletes the session.
- [ ] **Endpoints:** `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`. Generic
      "invalid email or password" on failure.
- [ ] **Route protection:** every `/api/keystone/*` and legacy route requires a session (401); writes check
      role (403). Current writes: `PUT /api/keystone/employee-skills`, `POST /api/keystone/future-requirements`,
      `PUT /api/future-skills`. AI routes (`/development-plan`, `/strategy`) cost money when a key is set: limit them too.
- [ ] **Login rate limiting** per IP and per account (in-memory is fine for the demo) with a lockout message.
- [ ] **CORS:** replace `app.use(cors())` with an allowlist from an env var (`KEYSTONE_ALLOWED_ORIGINS`),
      `credentials: true`.
- [ ] **Security headers** without a new dependency: `X-Content-Type-Options`, `Referrer-Policy`,
      `X-Frame-Options`/`frame-ancestors`, a basic CSP; `app.disable('x-powered-by')`.
- [ ] **Request size limit** on `express.json` (explicit, e.g. 100 kb).
- [ ] **Seeded demo accounts** via a `users.csv` in `backend/data/demo/` with obviously demo-only passwords,
      clearly labelled, never used outside the demo; `seed:reset` recreates them.
- [ ] **Frontend:** login page, session check on load, redirect to login on 401, user menu with name, role
      and logout, hide or disable edit controls for Viewers (the backend still enforces it).
- [ ] **Tests:** login success/failure, lockout, expired session, 401 on every route, 403 per role, logout.
- [ ] **Docs:** API.md auth section, README demo accounts table, `.env.example` entries.

## 4. Audit trail (P0)

- [ ] **`audit_log` table:** id, occurred_at (UTC ISO), user_id, action, entity type, entity id,
      `before` JSON, `after` JSON, request id, IP. Append-only (no update/delete endpoints).
- [ ] **Write the entry in the same transaction as the change** for `saveEmployeeSkill`,
      `addFutureRequirement` and `replaceFutureSkillTargets` in `backend/data/queries.js`, so a change
      can never exist without its record.
- [ ] **Also record:** login success, login failure, logout, user created/disabled/role changed,
      `seed:reset` (as a system event).
- [ ] **Read-only analysis is not audited per request** (simulate, AI drafts), to keep the log meaningful;
      decide whether to log AI calls when a real key is configured (cost and data sharing).
- [ ] **`GET /api/audit`** (Admin): filter by user, action, entity, date range; newest first; paginated.
- [ ] **Audit log view:** table with who, when (local time), what, and an old → new diff; filters; CSV export.
- [ ] **Move the git "Team activity" view** under an Admin/Developer section or remove it (per decision in 1).
- [ ] **Tests:** each write produces exactly one entry with correct before/after; a failed write produces none;
      Viewers get 403 on the audit endpoint.

## 5. Visual refresh (P1)

- [ ] Replace emoji nav icons with one consistent inline-SVG icon set (no new dependency).
- [ ] Remove the developer badge "Member 3 · Auto-sync every 5 min · branch feature/keystone-ui"
      from the sidebar (`frontend/src/App.jsx`).
- [ ] Top bar: page title, search, user menu (name, role, logout), environment tag ("Demo data").
- [ ] Login page matching the dashboard.
- [ ] Dark mode: follow `prefers-color-scheme`, with a toggle; move all colours to tokens in `App.css`
      (`views.css` already uses them).
- [ ] KPI cards: consistent sizing, clear labels, optional sparkline or delta.
- [ ] Tables: sticky headers, right-aligned numbers, zebra or row hover, consistent dash for unknown.
- [ ] Loading skeletons instead of text; non-blocking toasts for "saved" and errors.
- [ ] Responsive: collapse the 236px sidebar to icons below ~900px and a menu on phones; check 375px.
- [ ] Accessibility pass: focus rings, colour contrast (AA), keyboard navigation of the network and menus.
- [ ] Favicon and page title ("Keystone"), consistent typography scale and spacing.
- [ ] Screenshot every view at 1440px and 375px after the change and compare with before.

## 6. Product gaps found while checking (P1)

- [ ] **URL routing:** the active view is component state, so refresh always returns to Overview and
      views cannot be linked. Add hash routes (`#/network`, `#/timemachine`, …) without a router dependency.
- [ ] **Evidence editing UI:** `PUT /api/keystone/employee-skills` and `keystoneApi.saveEmployeeSkill` exist,
      but no screen calls them. Add an edit form (level, evidence source, verified date) for HR managers.
- [ ] **Hiring targets editing** was lost in the redesign (the old Gap Analysis panel called
      `PUT /api/future-skills`). Re-add or remove the endpoint (decision in 1).
- [ ] **Succession view:** `GET /api/keystone/succession` is unused; People & Risk shows successors per
      person only. Consider a per-role succession table.
- [ ] **AI status indicator:** `aiStatus` is unused; show "Live AI" vs "Demo rules" in the AI Advisor header.
- [ ] Confirmation before saving reviewed requirements; show what was saved and by whom (ties into audit).
- [ ] Scheduled Time Machine scenarios are lost on refresh; decide whether to save named scenarios.

## 7. Data and operations (P2)

- [ ] CSV **export** of inventory, risks and audit log.
- [ ] CSV **import** in the app (Admin) reusing `backend/data/dataset.js` validation, with a preview and
      file:line errors before anything is written.
- [ ] **Backups:** script to copy the SQLite file with a timestamp; document restore.
- [ ] **Structured logging:** one JSON line per request (method, path, status, ms, user, request id) and per
      error, instead of scattered `console.log` calls.
- [ ] **Health/readiness:** `/api/health` checks the database is reachable.
- [ ] **Performance:** `loadWorkforce()` rebuilds the snapshot on every request; cache and invalidate on writes.
- [ ] **Deployment:** Dockerfile + compose (backend serves the built frontend), env documentation, and a
      target (decide where it runs for judging).
- [ ] Note the path from SQLite to Postgres if more than one server instance is needed.

## 8. Quality (P2)

- [ ] Frontend has **no tests**. Add component tests for login, role-gated controls, network selection and
      scheduling (decide on Vitest + Testing Library; adds dev dependencies).
- [ ] Commit a browser **smoke test** of the demo flow (the headless-Chrome DevTools script used on
      2026-09-12 lived in a scratch folder and was deleted) and run it in CI.
- [ ] Keep the CSV demo dataset and `docs/samples/*.json` in sync (a test, or regenerate in CI).

## 9. Privacy and responsible use (P2)

- [ ] Skill and dependency data about named people is personal data: access by role, retention policy,
      and export/delete for one employee.
- [ ] Keep the "organizational dependency, not a departure prediction" wording on every score.
- [ ] AI data sharing notice when a provider key is set (requests already use `store: false`).

## Definition of done for the next round

- [ ] Decisions in section 1 recorded in this file.
- [ ] Sections 3–5 done (or the agreed scope), each with tests, docs and screenshots.
- [ ] 101+ backend tests, new auth/audit tests, lint and build clean, CI green.
- [ ] Demo run sheet updated for login and re-verified in the browser.
