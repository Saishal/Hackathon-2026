# Team integration workflow

Current state of every part, what blocks submission, and what is out of scope: [PROJECT-STATUS.md](PROJECT-STATUS.md).

Clone main after backbone publication, then create your assigned branch:

```sh
git clone https://github.com/Saishal/Hackathon-2026.git
cd Hackathon-2026
git switch -c feature/YOUR-ASSIGNED-AREA
```

Branch names appear in each member specification. All four use the same JS stack and API. Keep logic in owned files; coordinate index.js and routes edits. Member 1 owns contract changes, Member 3 integration/dependencies. Send small PRs to main after checks. Do not force-push shared branches.

## Milestones

1. Shared seed -> one risk -> UI (included).
2. Liam departure -> zero billing coverage (API/basic UI included).
3. Mason mentoring -> backup (API and intervention UI included; AI actions can be scheduled into it once reviewed).
4. Grounded actions (OpenAI integration and labeled fallback implemented; live path verified on gpt-4.1-mini).
5. Strategy -> reviewed requirements -> saved with stable IDs -> applied by Time Machine at their effective month (included).
6. Network, evidence, succession and capacity included; rehearsing and recording the presentation remains ([DEMO.md](DEMO.md)).

## Final checklist

Verified on this branch from a clean install on 2026-09-12. Re-run before submitting.

- [x] Tests/lint/build pass; both servers run from clean install. 101 tests pass (including `integration.test.js`, which runs Parts 1, 2 and 4 against the CSV-seeded database), lint and build exit 0, backend answers `/api/health`, frontend serves on 5173.
- [x] All five brief questions shown: inventory (Workforce Data, Skill Network), concentration (Overview, People & Risk), gaps/succession (People & Risk, Time Machine), development (AI Advisor, scheduled into Time Machine), future strategy (AI Advisor). Checked on `integrate/all-parts`, which combines Parts 1–4.
- [x] Scores trace to recorded evidence and explicit requirements. Every risk entry carries `explanation`; recording a proficiency requires a non-empty `evidenceSource`.
- [x] Actual and simulated evidence stay separate. Simulation never mutates baseline, asserted by test.
- [x] No future deterioration without explicit assumptions. Future requirements default to `proposed` and only apply when explicitly supplied to a scenario.
- [ ] No invented employee IDs, credentials, courses, forecasts. IDs and forecasts are clean. **Open question: the learning catalogue contains invented course and credential names** stored with `verified: true`. Titles no longer carry a "(fictional)" suffix; instead every row's `provenance` is `Fictional demo dataset` and `backend/data/demo/README.md` states the whole dataset is invented. `verified` is now a per-row CSV column, so it can be switched off, but AI plans then offer no course or certification. The team should decide before submitting.
- [x] Demo works without AI credentials. Confirmed with no key set: `ai-status` reports `configured:false, reason:missing_api_key`, and development and strategy both return labelled `demo-fallback` results.
