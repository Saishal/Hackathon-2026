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

In a second terminal: `npm run dev --prefix frontend`. Open http://localhost:5173; API health is http://localhost:4000/api/health.

Copy `backend/.env.example` to `backend/.env` to configure a local environment. A fresh demo database is seeded from the CSV files in [`backend/data/demo/`](backend/data/demo/README.md): 44 fictional employees across 21 roles, 22 skills and a 16-entry learning catalogue, including Legacy Billing Recovery (Liam Chen expert, Mason Green learner). Existing databases are upgraded in place; after editing seed CSV, stop the backend and run `npm run seed:reset --prefix backend`.

Keystone now starts at a sign-in screen. In the default `demo` environment, use one of these development-only accounts with password `Keystone-Demo-2026!` (or the configured `KEYSTONE_DEMO_PASSWORD`):

| Account | Role | Typical use |
|---|---|---|
| `admin@keystone.demo` | Admin | Configuration, approvals, audit and user management |
| `hr@keystone.demo` | HR / People Leader | Organization-wide risk, reviews and data quality |
| `manager@keystone.demo` | Manager | Team-scoped workforce and risk insights |
| `employee@keystone.demo` | Employee | Personal profile and evidence submissions |

See [enterprise governance](docs/ENTERPRISE-GOVERNANCE.md) for sessions, permissions, review workflow, data-quality rules, migrations and security assumptions. The API base remains `http://localhost:4000`; use `VITE_API_BASE_URL` in `frontend/.env.local` only when the frontend must call a different backend.

## Four member assignments

1. [Data and shared contracts](docs/member-1-data.md) — explained in [the data layer handoff](docs/member-1-data-layer.md)
2. [Risk, succession, Time Machine](docs/member-2-risk.md)
3. [Frontend and integration](docs/member-3-frontend.md)
4. [Matias: AI and strategic skill needs](docs/member-4-ai.md)

Read [API contracts](docs/API.md) and [integration workflow](docs/INTEGRATION.md) before changing shared interfaces.

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

```bash
cd /home/runner/work/Hackathon-2026/Hackathon-2026/frontend && npm install
cd /home/runner/work/Hackathon-2026/Hackathon-2026/backend && npm install
```

### 2) Run backend API

```bash
cd /home/runner/work/Hackathon-2026/Hackathon-2026/backend
npm run start
```

Backend runs on `http://localhost:4000`.

### 3) Run frontend

```bash
cd /home/runner/work/Hackathon-2026/Hackathon-2026/frontend
npm run dev
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
