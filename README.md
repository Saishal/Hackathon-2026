# Keystone — shared team backbone

**Find your keystones before they walk out the door.**

Keystone identifies critical knowledge dependencies and simulates whether development reduces them. This backbone preserves the existing SkillSight implementation below and adds a Keystone service layer and starter UI.

## Start here

Use **Node.js 24 LTS**, JavaScript throughout: React/Vite frontend, Express/CommonJS backend, SQLite. The earlier Python/Streamlit proposal referred to a separate prototype and is superseded by this repository's existing stack.

From repository root:

```sh
npm ci --prefix backend
npm ci --prefix frontend
npm start --prefix backend
```

In a second terminal: `npm run dev --prefix frontend`. Open http://localhost:5173; API health is http://localhost:4000/api/health — it returns 503 and names the failing component if the database, schema or seed is broken, so it can be polled by an uptime monitor.

Copy `backend/.env.example` to `backend/.env` to configure a local environment. A fresh demo database is seeded from the CSV files in [`backend/data/demo/`](backend/data/demo/README.md): 80 fictional employees in 11 departments across 21 roles, 22 skills, 425 skill records at every level from 1 to 5 and a 16-entry learning catalogue, including Legacy Billing Recovery (Liam Chen expert, Mason Green learner). Existing databases are upgraded in place; after editing seed CSV, stop the backend and run `npm run seed:reset --prefix backend`.

For a realistic load, seed the **enterprise dataset** instead: stop the backend and run `npm run seed:enterprise --prefix backend`. It is a generated, deterministic superset of the demo organization ([`backend/data/enterprise/`](backend/data/enterprise/README.md)): 316 people in 13 departments, 68 skills, 62 roles, 1,568 evidence records with a realistic share of unverified and stale evidence, 44 catalogue entries, 12 future requirements and 11 sign-in accounts (the four below plus a director, two department heads, a second HR partner, two employees and a second admin, all with the same demo password). The demo story is preserved, so Legacy Billing Recovery, Payments Compliance, Cybersecurity and AI Governance keep the same holders. `npm run dataset:enterprise --prefix backend` regenerates the CSV files.

Keystone restores valid sessions automatically. New sign-ins open the calm, role-aware **Home** workspace. In the default `demo` environment, use one of these development-only accounts with your configured `KEYSTONE_DEMO_PASSWORD` (local demo fallback is defined in `backend/config.js`):

| Account | Role | Typical use |
|---|---|---|
| `admin@keystone.demo` | Admin | Configuration, approvals, audit and user management |
| `hr@keystone.demo` | HR / People Leader | Organization-wide risk, reviews and data quality |
| `manager@keystone.demo` | Manager | Team-scoped workforce and risk insights |
| `employee@keystone.demo` | Employee | Personal profile and evidence submissions |

In the app, press **?** on any page (or the Help button) for an explanation of that screen, and open **How Keystone works** in the sidebar for the full glossary and step-by-step guides. Every metric with a small ? beside it opens help for that term.

See [enterprise governance](docs/ENTERPRISE-GOVERNANCE.md) for sessions, permissions, review workflow, data-quality rules, migrations and security assumptions. The API base remains `http://localhost:4000`; use `VITE_API_BASE_URL` in `frontend/.env.local` only when the frontend must call a different backend.

Optional environment: backend `PORT`, `DB_PATH`, `KEYSTONE_SEED_DIR`, `KEYSTONE_ALERT_WEBHOOK_URL` (POSTs every 5xx to a Discord or Slack webhook; see `docs/API.md`); frontend `VITE_API_BASE_URL` in `frontend/.env.local`. No API credentials are needed for the starter.

## Four member assignments

1. [Data and shared contracts](docs/member-1-data.md) — explained in [the data layer handoff](docs/member-1-data-layer.md)
2. [Risk, succession, Time Machine](docs/member-2-risk.md)
3. [Frontend and integration](docs/member-3-frontend.md)
4. [Matias: AI and strategic skill needs](docs/member-4-ai.md)

Read [API contracts](docs/API.md) and [integration workflow](docs/INTEGRATION.md) before changing shared interfaces. For what is done, what is missing and what is out of scope, see [project status](docs/PROJECT-STATUS.md).

## Implemented vs remaining

Working: existing heat map/gaps/targets, new workforce/risk APIs, explainable skill Bus Factor and Keystone Score, dated departure and verified-intervention simulation, starter departure UI, and explicit development fallback. Development and strategy now support configurable OpenAI integration with validated structured output and labeled offline fallbacks. See [AI setup and handoff](docs/AI-INTEGRATION.md).

The workforce inventory is persisted rather than derived in memory: skill criticality and coverage requirements, per-edge evidence source and verification date, critical roles with succession skill requirements, the learning catalogue with an editable verified flag, recorded mentoring capacity, and effective-dated future requirements. Foreign keys are enforced and writes validate references first. See [API contracts](docs/API.md) and [sample payloads](docs/samples/README.md).

Succession matching now compares candidates against the persisted role requirements rather than recorded skill evidence alone.

The dashboard includes risk and succession analysis, a skill map, Time Machine, AI advisor, data and evidence, audit history, data quality, review queue, personal profile and user/settings views. Reviewed development actions can be scheduled into Time Machine, reviewed strategy requirements are saved with stable IDs and applied at their effective month, and pending proposals stay outside the official baseline until an authorized reviewer approves them.

Remaining: decide whether invented catalogue entries should be marked verified (see [integration checklist](docs/INTEGRATION.md)), then rehearse the [three-minute demo](docs/DEMO.md) and record a backup.

The enterprise trust layer adds password-hashed server-side sessions, backend-enforced role permissions, append-only audit history, deterministic data-quality warnings, approval workflows, risk ownership and role-scoped CSV exports. See [enterprise governance](docs/ENTERPRISE-GOVERNANCE.md) and the [governance API reference](docs/API.md#enterprise-governance-api).

Proficiency stays compatible with existing data: 1–5, independent threshold 3, mentor minimum 4. Missing relationships are unknown, displayed as a dash. Do not mix in the earlier proposed 0–4 scale. Scores measure organizational dependency, not likelihood of departure.

Verify: `npm test --prefix backend`, `npm run lint --prefix frontend`, `npm run build --prefix frontend`.

## Original foundation notes (historical)

SkillSight is a hackathon web app that helps teams understand current skill coverage and future readiness.

## Features

- **Skills heat map**: employees × skills matrix with color-coded proficiency (0-5)
- **Critical skills at risk**: flags skills held by fewer than 2 people at intermediate+ level
- **Gap analysis**: compares current capability with configurable future skill targets
- **Recommendations**: suggests training, mentoring, and certification actions to close key gaps

The backend seeds SQLite with realistic demo data for **20 employees** and **15 skills** on first run.

## Tech Stack

- Frontend: React + Vite
- Backend: Node.js + Express
- Database: SQLite

## Project Structure

- `/frontend` — React dashboard UI
- `/backend` — Express API and SQLite seed logic

## Setup

### 1) Install dependencies

From the repository root:

```bash
npm ci --prefix frontend
npm ci --prefix backend
```

### 2) Run backend API

```bash
npm start --prefix backend
```

Backend runs on `http://localhost:4000`.

### 3) Run frontend

```bash
npm run dev --prefix frontend
```

Frontend runs on `http://localhost:5173` and calls the backend at `http://localhost:4000` by default.

If needed, override API URL:

```bash
VITE_API_BASE_URL=http://localhost:4000 npm run dev
```

## API Endpoints

The maintained API contract is in [docs/API.md](docs/API.md). It documents workforce scoring, simulation, AI, authentication, governance, approvals, audit history and exports. Legacy endpoints remain available for compatibility.

## Notes

- SQLite DB file is created automatically at `/backend/skillsight.db` and is gitignored.
- Validate the current app with `npm test --prefix backend`, `npm run lint --prefix frontend`, and `npm run build --prefix frontend`.

## September 13 workspace update

Home welcomes each person with permitted shortcuts and compact coverage signals. The detailed Overview remains available. Skill Map keeps Network, Matrix and Charts and adds a department coverage **Heat map**, shared filters and a backend-generated **Download CSV** action. The Help Center searches the glossary, guides, FAQs and page descriptions. **Keystone Assistant** provides local, curated help and permission-aware shortcuts; it never sends questions to an AI service.

Sign-in offers **Keep me signed in**, selected by default in demo. HTTP-only cookies, idle/absolute expiration, revocation and rate limits still apply. An unselected checkbox uses a browser-session cookie with a shorter maximum lifetime. The Caps Lock warning uses browser keyboard modifier information. Sign out revokes the server session; failed sign-out offers a retry.

Read the [User guide](docs/USER_GUIDE.md), [Admin guide](docs/ADMIN_GUIDE.md), [Architecture](docs/ARCHITECTURE.md), [Changelog](docs/CHANGELOG.md) and the [Presentation guide](docs/PRESENTATION.md) (pitch, slide script, demo script, judge Q&A, Gemini prompt) and the [Devpost kit](docs/DEVPOST.md). Existing theme, language, search, notifications, governance and review controls remain available.

### Judge walkthrough

1. Sign in with a demo admin account using your configured demo password; leave **Keep me signed in** selected.
2. Start at **Home**. Follow **Open detailed overview** when you want the operational dashboard.
3. Open **Skill map**.
4. Choose **Heat map**.
5. Search for a skill, choose a department and set the minimum proficiency. Check the legend and organization-target explanation.
6. Choose **Download CSV**. Import the UTF-8 file in Excel or Power BI.
7. Open **Keystone Assistant** and ask “Where do I manage users?” Follow **Open Users & settings**. Repeat as an employee to see the restricted-page explanation.
8. Open **How Keystone works** and search “heat map” or “session”.

### Validation

Use Node.js 24 LTS. Run `npm test --prefix backend`, `npm test --prefix frontend`, `npm run lint --prefix frontend`, `npm run build --prefix frontend`, and `git diff --check` from the repository root. See the dated changelog for validation results and limits. Tests use temporary databases and local fixtures; the navigation assistant requires no API key. Frontend UI tests use development-only Testing Library and jsdom dependencies.
