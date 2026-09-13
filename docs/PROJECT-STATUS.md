# Keystone — project status and completion checklist

One page that answers "what is done, what is missing, who owns it, and what is deliberately
out of scope." Updated 2026-09-12. Every claim below was verified against the code on the
most complete branch (`fix/docs-sync`, which contains `integrate/parts-1-2-4-csv` plus
documentation), not taken from commit messages.

If you only read one section, read **§2** (what blocks submission) and **§7** (what not to
build).

---

## 1. Where to find everything

| Question | Document |
|---|---|
| How do I run it? | `README.md` → *Start here* |
| What does each endpoint return? | `docs/API.md` |
| Worked JSON examples | `docs/samples/` |
| How the data layer works, table by table | `docs/member-1-data-layer.md` |
| The demo dataset and how to edit it | `backend/data/demo/README.md` |
| AI setup, provider, fallback behaviour | `docs/AI-INTEGRATION.md` |
| Each member's assignment and checklist | `docs/member-1-data.md` … `docs/member-4-ai.md` |
| Team workflow, milestones, final checklist | `docs/INTEGRATION.md` |
| This page | `docs/PROJECT-STATUS.md` |

---

## 2. What blocks submission — in order

These are the only things standing between the current code and a submittable product.
Everything in §5 and §6 is polish; everything in §7 is out of scope.

| # | Item | Owner | Status |
|---|---|---|---|
| 1 | Merge the integration branch to `main` | whoever runs integration | **not started** — `main` still has none of Parts 1, 2 or 4 |
| 2 | Merge `main` (or the integration branch) into `feature/keystone-ui`, then test the UI against a live backend | Member 3 | **not started** — the UI branch is cut from old `main` and cannot run end-to-end |
| 3 | Merge `feature/keystone-ui` to `main` | Member 3 | blocked by 2 |
| 4 | Decide the `verified: true` question on fictional credentials (§6) | team, 5 minutes | **open** |
| 5 | Rehearse the three-minute demo; record a backup | Member 3 leads, everyone attends | **not started** |
| 6 | Re-run the final checklist in `docs/INTEGRATION.md` on `main` after 1–3 | anyone | after 3 |

Item 1 is the bottleneck. Three branches carry 101 passing tests and none of it is on `main`.

---

## 3. The five questions the demo must answer

The brief requires all five to be *shown*, not just served. Status of each:

| Question | Served by | Rendered by | Status |
|---|---|---|---|
| Inventory — who knows what | `GET /api/keystone/workforce` | `WorkforceSnapshot.jsx`, heat map | served ✅ · rendered on `feature/keystone-ui` only |
| Concentration — where is knowledge dangerously thin | `GET /api/keystone/risks` | `KeystoneStarter.jsx` | served ✅ · rendered ✅ |
| Gaps and succession — who could step in | `GET /api/keystone/employee-risks` | `KeystonePeople.jsx` | served ✅ · rendered on `feature/keystone-ui` |
| Development — what would close the gap | `POST /api/keystone/development-plan` | `AIWorkbench.jsx` | served ✅ · rendered ✅ |
| Future strategy — what will we need | `POST /api/keystone/strategy`, `/strategy/preview` | `AIWorkbench.jsx` | served ✅ · rendered ✅ |

All five answer correctly **with no AI key set** (`ai-status` reports
`configured:false, reason:missing_api_key`; development and strategy return labelled
`demo-fallback` results). Verified from a clean install.

---

## 4. Status by member

### Member 1 — data and contracts · **complete**

All nine checklist items done, verified, and documented in `docs/member-1-data-layer.md`.
The dataset now lives in seven validated CSV files (`backend/data/demo/`) with 44
employees, 22 skills, 21 roles and 226 skill records. 101 backend tests pass.

Nothing remaining. Two optional follow-ups if time allows (§5).

### Member 2 — risk and Time Machine · **complete**

All nine checklist items ticked in `docs/member-2-risk.md`. Employee Keystone Score,
successor matching against persisted role requirements, mentor capacity scheduling,
approved future requirements, and baseline/no-intervention/intervention comparison are
implemented and tested.

Nothing remaining.

### Member 4 — AI and strategy · **complete**

All checklist items ticked in `docs/member-4-ai.md`. Grounded development plans, reviewed
strategy previews, structured-output validation, and labelled offline fallback are
implemented. Live provider path verified. Works without credentials.

Nothing remaining, except the team decision in §6.

### Member 3 — frontend and integration · **mostly built, not yet integrated**

Their branch `feature/keystone-ui` has 8 components (~800 lines). Checked against their
eleven checklist items by reading the code — **not by running it in a browser**, which
only Member 3 can confirm:

| Checklist item | Evidence in code | Assessment |
|---|---|---|
| Employee-skill **network** with selection, filters, legend, evidence panel | 3 references | **thin or absent** — likely the biggest remaining UI item |
| Searchable inventory table, unknown = dash | 9 search/filter refs, 47 dash/unknown refs | built |
| Dependency cards and succession details | 14 refs; tolerates both `successors`/`skillBackups` shapes | built |
| Event dates, horizons, intervention editor, reset, blocked feedback | 45 refs in `TimeMachine.jsx` (188 lines) | built |
| Compare baseline / no-intervention / intervention visually | 11 refs | built |
| Render five action categories and verification milestones | 4 refs | **thin** — verify all five categories appear |
| Schedule reviewed recommendations, not "complete on creation" | in `AIWorkbench.jsx` | verify behaviour |
| Strategy input → proposed → edit/review/accept → gap view | 8 refs | built, verify full flow |
| Loading, failures, stale results, labelled offline fallback | 36 refs; `demoMode` from vendored samples | built |
| Secrets backend-only, no `VITE_*KEY`, no browser storage | **0 hits** | ✅ confirmed clean |
| Rehearse three-minute demo; backup recording | — | **not started** |

Also on their branch: a dashboard shell with sidebar navigation and KPI cards, provenance
badges on every fictional value, and an auto-generated team activity log.

**The integration problem:** `feature/keystone-ui` was branched from `main` before Parts
1, 2 and 4 existed there. Member 3 adapted to the new contract by reading it, so the UI
references fields and endpoints their own branch does not serve. It has not been run
against a real backend. This is item 2 in §2.

---

## 5. Polish — what turns "working" into "10/10"

None of these are required by the brief. Ordered by value per hour.

1. **Interactive network** (Member 3). It is named in the brief's Milestone 6 and in the
   README's *Remaining*, and is the one visual a judge will remember. Even a simple SVG of
   employees and skills with the sole-holder edges highlighted answers "where is the
   dependency" at a glance. If time is short, scope it down rather than drop it.
2. **A written demo script** (`docs/DEMO.md`). The brief's acceptance path is exact:
   *inspect Legacy Billing Recovery → remove Liam in month 9 → schedule Mason's verified
   mentoring completion at month 6 → compare coverage.* Write it as numbered clicks with
   the expected number at each step, so anyone on the team can drive it. Add the two
   secondary stories (Payments Compliance, AI Governance) as backup material.
3. **Backup recording** of that script, in case the live demo fails.
4. **Screenshots in the README** — three images: inventory, Time Machine comparison,
   development plan. Judges reading the repo afterwards see the product without running it.
5. **README quickstart at the top** — the three commands to run it, before any explanation.
   Currently they are present but below the fold.
6. **Endpoints to edit `skill_requirements` and `critical_roles` over HTTP** (Member 1).
   They are editable in the database only. Same pattern as `PUT /employee-skills`, one
   hour of work, makes criticality demonstrably editable on stage.
7. ~~Real health check and error alerting~~ — **done.** `/api/health` verifies database, schema, seed and AI state and returns 503 naming the failing component; every 5xx is POSTed to `KEYSTONE_ALERT_WEBHOOK_URL` if set. See `docs/API.md`.
8. **Run `npm audit`** on both packages and note the result. Cheap credibility.
9. **Delete stale branches** after merging (`copilot/…`, `feature/ai-recommendations`,
   `fix/review-risk-ai` if absorbed). A judge browsing the repo should see three or four
   branches, not nine.

---

## 6. Decisions the team has not made yet

**`verified: true` on fictional credentials.** The catalogue seeds sixteen entries with
invented course and credential names, each suffixed "(fictional)", stored with `verified`
true because the AI will only offer a certification it can cite. The brief says *no
invented credentials*. The label is the mitigation. Options: rename the flag to something
like `inCatalogue`; add a visible "fictional catalogue" banner; or accept the label as
sufficient. Five-minute decision; should not be made by default.

**Scope of the interactive network.** Full graph with filters and an evidence panel, or a
minimal SVG highlighting sole-holder edges? Decide before Member 3 starts it.

---

## 7. Out of scope — do not build these

Each of these has been suggested and each would make the project worse for this brief.

**Login, sign-up, accounts, roles and permissions.** Not mentioned anywhere in the brief,
the README, or any member spec. A hackathon judge evaluates the five questions above, not
an auth flow; an auth flow adds a failure mode to the live demo and hours of work that
displaces the network graph. If a judge asks, the honest answer is "single-tenant demo;
auth is the first thing we would add for production."

**Scoring based on tenure, years of experience, or "time in the company".** This is the
most important one to understand, because it sounds reasonable and is explicitly wrong for
this product. See §8.

**A Python or Streamlit frontend.** The README says the earlier proposal is superseded.

**A second scoring implementation in the frontend.** Member 3's brief says *never duplicate
scores*. The UI renders what the API returns.

---

## 8. How the Bus Factor and Keystone Score actually work

This answers a question that comes up repeatedly: *does an admin update the score, or does
an algorithm update it from tenure and experience?* **Neither.** It is a deterministic
formula recomputed from recorded evidence on every request. It is never stored.

**Bus Factor** for a skill = the number of employees whose *recorded* proficiency in that
skill is at or above the skill's `targetProficiency` (3 by default). One holder means one
departure removes all coverage. Zero means it is already uncovered.

**Keystone Score** for a skill:

```
gap      = max(0, requiredHolders − busFactor)
shortage = gap / requiredHolders
score    = round( 100 × criticality/5 × ( 0.6 / max(1, busFactor) + 0.4 × shortage ) )
```

The 0.6 term punishes having few holders; the 0.4 term punishes being short of the
required number; criticality scales the whole thing. Legacy Billing Recovery scores 80:
one holder, two required, criticality 5.

**Employee Keystone Score** = for each skill where this person is a recorded holder at
target, how much worse the skill's score becomes if they are removed, summed and capped at
100. It is the answer to "how much do we depend on this person."

**What makes a score change:**

- Someone records or changes a proficiency (`PUT /api/keystone/employee-skills`, evidence
  required). This is the *only* manual input, and it is an input, not the score.
- Someone changes a skill's criticality, target, or required holders in `skill_requirements`.
- A reviewed future requirement reaches its effective month in a simulation.
- In the Time Machine, a departure or a completed verified intervention — but that changes
  the *projected* score only; the baseline is never mutated.

**Why tenure and experience are deliberately excluded.** The brief says, in the README and
in Member 2's acceptance criteria: *"Scores measure organizational dependency, not
likelihood of departure."* Tenure, age, satisfaction and market demand are inputs to a
*departure-probability* model. Building one would (a) violate the brief's "no forecasts"
rule, (b) require personal data the product does not hold, and (c) invite exactly the
question a judge should not be able to ask — "so you are predicting who will quit?" The
product's honest claim is narrower and stronger: *if this person left tomorrow, for any
reason, here is what breaks.* Years of service do not change that answer.

---

## 9. Verification record

Every "✅" above was checked, not assumed. Method: clean `npm ci` on both packages, full
test suite, lint, build, both servers started, every endpoint probed with no API key in
the environment. Results on `fix/docs-sync` at `f662c7c`:

- Backend: 108 tests, 0 failures
- Frontend: lint exit 0 (one pre-existing warning in `App.jsx`), build exit 0
- Both servers up; `/api/health` → `{"status":"ok"}`; frontend HTTP 200
- Fresh database seeds 44 employees, 22 skills, 21 roles, 226 records, 16 catalogue entries
- All nine legacy endpoints byte-identical to the pre-refactor baseline captured before
  any data-layer work began
