# Member 1 — data and contracts

Handoff and full explanation of how this was built: [member-1-data-layer.md](member-1-data-layer.md).

**Prompt:** Build Keystone's workforce inventory in JavaScript/CommonJS, Express, SQLite. Start at backend/index.js; extract schema, seed, queries, and loadWorkforce into backend/data without breaking existing routes. Own docs/API.md and coordinate changes before teammates consume them.

- [x] Persist criticality, proficiency thresholds, required holders, evidence/date, mentoring availability.
- [x] Add critical roles and skill requirements for succession.
- [x] Add validated employee-skill edits and effective-dated future requirements.
- [x] Keep integer IDs and proficiency 1–5. Absent evidence is unknown.
- [x] Add verified resource catalog; label fictional demo entries. Labelled through `provenance`; whether invented courses should be `verified` is still a team decision (see INTEGRATION.md).
- [x] Enforce foreign keys and validate IDs before transactional writes.
- [x] Preserve existing data during schema upgrades; document fresh seed workflow. The demo seed is the CSV files in `backend/data/demo/`; `npm run seed:reset --prefix backend` rebuilds from them.
- [x] Reconcile zero-demand legacy targets with positive Keystone coverage requirements.
- [x] Supply a stable fixture and sample API payloads to all teammates.

Ticked on 2026-09-12 after checking each item against `backend/tests/data.test.js`, `seed-csv.test.js` and `integration.test.js` on `integrate/all-parts`.

**Integration:** loadWorkforce remains async and returns v1 snapshot. Member 2 consumes it for calculations; Member 3 through HTTP; Matias for grounding. Coordinate shared index.js/routes edits. Acceptance: invalid references rejected, edits survive restart, same IDs across all modules.

**Branch:** feature/workforce-data. **Ownership:** backend data layer, workforce adapter, shared contracts, data tests.
