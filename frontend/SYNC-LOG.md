# Member 3 Sync Log

## 2026-09-12 (14:46 CDT, second run)

**(a) What teammates changed**

- `origin/main` unchanged since last run — merge was a no-op, no conflicts.
- `feature/workforce-data` (Member 1) added commit `9073fd1` "Correct docs that predated the persisted data layer": comment-only change in `backend/services/risk.js` plus README/sample-doc corrections. No API shape change.
- New branch `fix/review-risk-ai` (one commit, `bd6c883`) appended an "Identity and scheduling validation" section to `docs/API.md`: simulator returns HTTP 400 for unknown skill IDs / conflicting names / duplicate normalized skills; mentoring capacity counted per occupied month; if both AI output and deterministic fallback fail validation, responses stay `demo-fallback` with `fallbackReason: "fallback_invalid"` (strategy returns no requirements, development returns five inactive unassigned categories). Behavior clarifications only — no new or renamed endpoints.

**(b) What I adapted**

- No changes needed. Existing error handling already covers the clarified behavior: Time Machine surfaces simulator 400 messages verbatim, and AIWorkbench renders the fallback mode label plus the backend's `message`, so a `fallback_invalid` response displays its review-request message instead of a plan. All consumed shapes unchanged.
- Build: `npm.cmd run build` passes (vite, 22 modules, no errors).
- Invariants re-verified: unknowns render as dashes, no Keystone score recomputation in the frontend, no secrets in frontend code, demo fallback stays labeled.

**(c) Group chat message**

> Member 3 sync ✅ Nothing to change on my side this round — main is quiet, and both @Member1's doc corrections and the new fix/review-risk-ai validation notes are backend-internal. I double-checked: the simulator's new 400s already show up as plain error text in the Time Machine, and if the AI fallback ever comes back `fallback_invalid` the UI shows your review message instead of a plan. Build green, branch pushed. Ping me when workforce-data merges so I can wire up the evidence-edit and future-requirements screens! 🛠️

## 2026-09-12 (14:36 CDT)

**(a) What teammates changed**

- `origin/main` was already fully merged into `feature/keystone-ui` — the merge was a no-op, no conflicts.
- `feature/ai-recommendations` has no commits beyond `main` (already merged).
- `feature/workforce-data` (Member 1, not yet merged into main) extended the API contract in `docs/API.md`:
  - `GET /api/keystone/workforce` now also returns `roles`, `learningResources`, and `futureRequirements`; employees may carry optional `mentoringHoursPerMonth` (omitted when unknown); skills gain `demandTarget` (legacy hiring demand, separate from `requiredHolders` coverage).
  - New endpoints: `PUT /api/keystone/employee-skills` (record one proficiency with required `evidenceSource`; `lastVerifiedAt` null = unknown) and `GET`/`POST /api/keystone/future-requirements` (status defaults to `proposed` until reviewed).
  - All changes are additive — no endpoint paths, field names, or response shapes the UI uses today were removed or renamed, and legacy endpoints (`/api/heatmap`, `/api/gap-analysis`, etc.) remain compatible.

**(b) What I adapted**

- `frontend/src/api/keystone.js`: added a `method` parameter to the request helper and three new wrappers — `saveEmployeeSkill(entry)` (PUT), `futureRequirements()` (GET), `addFutureRequirement(requirement)` (POST) — matching Member 1's new contract. Noted in a comment that `lastVerifiedAt: null` must render as a dash.
- No component changes needed: nothing the UI consumes changed shape, and the new snapshot fields (`roles`, `learningResources`, `futureRequirements`, `mentoringHoursPerMonth`, `demandTarget`) are additive extras we can surface when Member 2's successor/gap work lands.
- Invariants verified: unknowns render as dashes, no Keystone score recomputation in the frontend, no secrets in frontend code, demo/offline fallback labeling untouched.
- Build: `npm.cmd run build` passes (vite, 22 modules, no errors).

**(c) Group chat message**

> Hey team — Member 3 sync done ✅ Pulled latest main (no conflicts). @Member1 I saw the workforce-data contract updates — frontend API client now has wrappers for PUT /employee-skills and GET/POST /future-requirements, ready to wire into the UI once your branch merges to main. Everything additive so nothing broke; build is green. One thing I noted: `lastVerifiedAt` comes back null when verification is unknown — I'll render that as a dash per the contract. Let me know if the response shapes change again before the merge! 🚀
