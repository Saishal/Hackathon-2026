# Member 1 — data and contracts

Handoff and full explanation of how this was built: [member-1-data-layer.md](member-1-data-layer.md).

**Prompt:** Build Keystone's workforce inventory in JavaScript/CommonJS, Express, SQLite. Start at backend/index.js; extract schema, seed, queries, and loadWorkforce into backend/data without breaking existing routes. Own docs/API.md and coordinate changes before teammates consume them.

- [ ] Persist criticality, proficiency thresholds, required holders, evidence/date, mentoring availability.
- [ ] Add critical roles and skill requirements for succession.
- [ ] Add validated employee-skill edits and effective-dated future requirements.
- [ ] Keep integer IDs and proficiency 1–5. Absent evidence is unknown.
- [ ] Add verified resource catalog; label fictional demo entries.
- [ ] Enforce foreign keys and validate IDs before transactional writes.
- [ ] Preserve existing data during schema upgrades; document fresh seed workflow.
- [ ] Reconcile zero-demand legacy targets with positive Keystone coverage requirements.
- [ ] Supply a stable fixture and sample API payloads to all teammates.

**Integration:** loadWorkforce remains async and returns v1 snapshot. Member 2 consumes it for calculations; Member 3 through HTTP; Matias for grounding. Coordinate shared index.js/routes edits. Acceptance: invalid references rejected, edits survive restart, same IDs across all modules.

**Branch:** feature/workforce-data. **Ownership:** backend data layer, workforce adapter, shared contracts, data tests.
