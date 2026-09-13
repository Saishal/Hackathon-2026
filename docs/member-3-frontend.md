# Member 3 — frontend and integration

**Prompt:** Build Keystone in JavaScript/JSX, React, Vite, CSS. Own frontend and launch/dependency integration. Replace components/KeystoneStarter.jsx progressively; reuse api/keystone.js and existing heat map. No separate Python frontend.

- [x] Build employee-skill network with selection, filters, legend, evidence panel. `SkillNetwork.jsx` (Skill Network view).
- [x] Keep searchable inventory table; unknown values remain a dash. Search on the Workforce Data view.
- [x] Add dependency cards and succession details from Member 2. `KeystonePeople.jsx`, Roles & succession.
- [x] Add event dates, horizons, intervention editor, reset, blocked-action feedback. `TimeMachine.jsx`.
- [x] Compare baseline/no-intervention/intervention visually. Comparison table plus per-skill bars.
- [x] Render Matias's five action categories and verification milestones. `AIWorkbench.jsx`.
- [x] Schedule reviewed recommendations instead of marking training complete on creation. An action must be marked reviewed, then arrives in Time Machine unverified.
- [x] Add strategy input -> proposed requirements -> edit/review/accept -> gap view.
- [x] Handle loading, failures, stale results, and labeled offline fallback. Demo banner uses the vendored samples.
- [x] Keep API secrets backend-only, never VITE variables or browser storage.
- [ ] Rehearse three-minute demo and prepare a backup recording. The run sheet is [DEMO.md](DEMO.md) and was verified click by click; a person still has to rehearse it and record the backup.

Items 1–10 checked on 2026-09-12 in headless Chrome against the CSV-seeded backend on `integrate/all-parts`, with no console errors.

**Integration:** consume HTTP JSON; never duplicate scores. Coordinate backend route changes with owners. Own requirements/lockfile integration. Run lint/build and two-server smoke check.

**Acceptance/demo:** inspect Legacy Billing Recovery, remove Liam in month 9, schedule Mason's verified mentoring completion at month 6, compare coverage. Resolve employee and skill IDs from live workforce.

**Branch:** feature/keystone-ui. **Ownership:** frontend, entry-point integration, README, launch instructions.
