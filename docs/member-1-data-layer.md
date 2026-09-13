# Member 1 — the data layer, explained

This is the handoff document for Member 1's work: what it is, where the data lives,
where it comes from, how it reaches the rest of the app, and every step that was taken
to build it. It is written so that someone who did not build it can understand, defend,
and change it. The authoritative checklist is `member-1-data.md`; the HTTP contract is
`API.md`. This document explains the *why* behind both.

---

## 1. What Member 1 owns, in one paragraph

Keystone answers "whose departure would leave a critical knowledge hole?" Every other
part of the app — Member 2's risk scores, Member 3's screens, Member 4's AI — reads one
thing to answer that: the **workforce snapshot**. Member 1 owns everything that produces
that snapshot: the database, the tables, the demo data that fills them, the rules that
stop bad data getting in, the function that assembles the snapshot, and the document
that tells teammates what shape it has. If the snapshot is wrong, everything downstream
is wrong with it.

---

## 2. Where the data is stored

**One SQLite file.** Path: `backend/skillsight.db`. SQLite is a database that lives in
a single file on disk — no server to run, no login. The Node process opens it directly
using the `sqlite3` package. There is no ORM (no Prisma, no Sequelize); the code writes
plain SQL.

- The file is **gitignored** (`backend/*.db`), so it is never committed. Every developer
  and every CI run gets its own.
- It is **created automatically** the first time the backend starts, if it does not exist.
- You can point the backend at a different file with the `DB_PATH` environment variable.
  This is how tests and sample generation avoid touching your real data:
  `DB_PATH=/tmp/fresh.db npm start --prefix backend`.
- A subtle trap that was avoided: the default path is built from `__dirname` inside
  `backend/data/db.js`, so it is written as `path.join(__dirname, '..', 'skillsight.db')`.
  Without the `'..'` it would silently point at `backend/data/skillsight.db`, a new empty
  file, and every existing database would appear to vanish.

---

## 3. Where the data comes from

**All of it is fictional demo data, and every row says so.** There is no real company
and no real people. The source is **seven CSV files in `backend/data/demo/`**, one per
table, described in `backend/data/demo/README.md`:

| File | Holds |
|---|---|
| `employees.csv` | name, role, department, mentoring hours (blank = never recorded) |
| `skills.csv` | name, criticality, target proficiency, required holders, legacy demand target, source |
| `roles.csv` | the critical roles and their criticality |
| `role_requirements.csv` | what a successor must already hold, per role |
| `employee_skills.csv` | the matrix: who holds what at which level, with evidence and verification date |
| `learning_resources.csv` | the catalogue, with a `verified` flag and provenance |
| `future_requirements.csv` | requirements that start applying at a future month |

The current dataset is **44 employees, 22 skills, 21 roles and 226 skill records**. The
demo story is intact — **Liam Chen at 5** and **Mason Green at 2** on Legacy Billing
Recovery, with Liam carrying 4 recorded mentoring hours a month so that mentoring Mason
by month 6 keeps coverage when Liam leaves in month 9 — and two more stories were added:
Payments Compliance and Cybersecurity each rest on one person, and AI Governance has no
holder at the target level and no ready successor for the AI Specialist role.

Three design choices in these files protect the rules in section 9:

- **Rows reference each other by name, never by id.** `employee_skills.csv` says
  `Liam Chen,Legacy Billing Recovery,5,…`. SQLite allocates the integer ids on import, so
  no id ever appears in a CSV and nobody can accidentally hardcode one.
- **A blank cell means unknown, never zero.** Blank mentoring hours, blank verification
  date, blank demand target — all stay `NULL` in the database.
- **Everything is validated before anything is written.** `backend/data/dataset.js` reads
  all seven files, checks every reference resolves and every number is in range, and if
  one row is wrong the whole seed fails with the file and line
  (`employees.csv:4: unknown role "Backend Enginer"`). The import then runs in a single
  transaction, so a database is either fully seeded or untouched.

This replaced an earlier version where the same data lived as JavaScript arrays inside
`seed.js` (20 employees, with proficiencies generated from a per-role profile). Moving it
to CSV means a non-developer can review or edit the dataset in a spreadsheet, and a
different organisation can be seeded by pointing `KEYSTONE_SEED_DIR` at a folder with the
same seven files.

Seeding only runs when the `employees` table is **empty**. A database that already has
data is never re-seeded, so nothing you edit is overwritten on restart. That is the
"edits survive restart" acceptance criterion from the brief. To rebuild from the CSVs
after editing them, stop the backend and run `npm run seed:reset --prefix backend`.

**Provenance is stored, not implied.** Every table that carries a judgement — criticality,
a coverage requirement, a catalogue entry, a proficiency rating — also carries a text
column saying where that value came from. Seeded values say `'fictional demo default'`,
`'fictional demo entry'` or `'fictional seed'`. A value someone types in later carries
whatever source they gave. This is what lets the UI show a badge saying "this is demo
data" and what keeps the demo honest in front of a judge.

---

## 4. The files

Everything lives in `backend/data/`. Before this work, all of it — schema, seed, queries,
the snapshot function — was inside a 496-line `backend/index.js`, mixed in with the
Express routes. It was moved so that the data layer has a single owner and teammates can
change routes without touching data code, or the reverse.

| File | What it does |
|---|---|
| `db.js` | Opens the SQLite file. Wraps the callback-style `sqlite3` API in three Promise helpers: `run` (write), `all` (read many rows), `get` (read one row). Turns on `PRAGMA foreign_keys = ON` as the first statement on the connection. |
| `schema.js` | `CREATE TABLE IF NOT EXISTS` for every table, plus `migrate()` which adds columns to tables that already exist, plus `backfillDefaults()` which fills new columns with sensible values on an older database. |
| `csv.js` | A small CSV parser (quoted fields, blank cells). |
| `dataset.js` | Reads the seven CSVs from `demo/` (or `KEYSTONE_SEED_DIR`), resolves every name reference, validates every value, and fails with file and line on the first bad row. |
| `seed.js` | `importDataset()` writes a validated dataset in one transaction, allocating integer ids; `seedDemoData()` calls it only if the database is empty. |
| `demo/*.csv` | The fictional dataset itself. See section 3. |
| `queries.js` | Every read and write the app performs, with validation. Nothing outside this folder writes SQL. |
| `workforce.js` | `loadWorkforce()` — assembles the snapshot that every other module consumes. |
| `fixture.js` | `createWorkforceFixture()` — a small hand-written snapshot for unit tests, so tests do not need a database. |
| `index.js` | The public face of the folder. Exports `initializeDatabase()` and everything above. `backend/index.js` imports only this. |

`backend/routes/workforce-data.js` holds the three HTTP routes Member 1 owns. It is a
separate router so that `backend/index.js` gains one line (`app.use(...)`) rather than
route bodies, which keeps merges with teammates small.

`backend/scripts/reset-demo-data.js` (run as `npm run seed:reset --prefix backend`)
deletes the database file and re-seeds it from the CSVs. Stop the backend first — Windows
will not delete a file another process has open, and the script says so if it hits that.

`backend/tests/data.test.js` is the test suite for all of the above, and
`backend/tests/seed-csv.test.js` covers the CSV loader and its validation messages. Both
point `DB_PATH` at a throwaway file before requiring the data layer, so they can never
touch a real database.

---

## 5. What happens at startup

`backend/index.js` calls `initializeDatabase()` before listening on a port. That runs
these steps in this exact order. The order matters.

1. **`dropSupersededResources()`** — the `resources` table existed for one commit with a
   different shape (a single `skill_id` column and no `slug`). If a database still has
   that old shape, it is dropped so step 2 can recreate it. It only ever held seed rows,
   so nothing is lost. Runs first because `CREATE TABLE IF NOT EXISTS` would otherwise
   leave the old shape in place.
2. **`createTables()`** — creates any table that does not exist. Safe to run every time.
3. **`migrate()`** — adds columns to tables that already existed before those columns did
   (`evidence_source`, `last_verified_at`, `mentoring_hours_per_month`, `future_only`,
   `criticality` on future requirements). Checks `PRAGMA table_info` first so it is
   idempotent — running it twice does nothing the second time. This is what lets an old
   database upgrade in place instead of being deleted.
4. **`seedDemoData()`** — **only if `employees` is empty**, reads and validates the seven
   CSVs and writes everything — employees, skills, the matrix, roles, role requirements,
   the catalogue, future requirements — in one transaction. Because the CSVs carry roles,
   catalogue entries and mentoring hours directly, there is nothing left to derive.
5. **`backfillDefaults()`** — for a database created *before* the persisted columns
   existed: sets `evidence_source = 'fictional seed'` where null and inserts a
   `skill_requirements` row for any skill lacking one, using the rule the old in-memory
   code used (criticality 5 for Legacy Billing Recovery, 3 otherwise). On a database
   seeded from CSV this finds nothing to do. It stays so an old database still upgrades
   in place.

Earlier versions had three more steps here — `backfillRoles`, `backfillResources` and
`backfillMentoringCapacity` — that *derived* roles from employee roles, inserted the
catalogue from a JavaScript array, and computed mentoring hours from a rule (two or more
skills at level 5). They were removed when the data moved to CSV, because each of those
values is now stated explicitly in a file rather than inferred. Section 11 records them.

---

## 6. The tables

Proficiency everywhere is an integer **1–5**. 3 means "can work independently";
4 or above means "can mentor". These thresholds come from the brief and must not change.
The earlier proposal's 0–4 scale is not used anywhere.

### Original tables (kept from SkillSight, unchanged in meaning)

**`employees`** — `id`, `name`, `role`, `department`. Plus, added by this work,
`mentoring_hours_per_month` (nullable integer; null = capacity never recorded).

**`skills`** — `id`, `name`. Plus `future_only` (0 or 1), added by Member 2 during
integration: a skill created from a future requirement that nobody yet holds is
`future_only = 1` and is hidden from the current inventory until the first proficiency is
recorded against it, at which point it flips to 0.

**`employee_skills`** — the matrix. `employee_id`, `skill_id`, `proficiency`. Plus, added
by this work, `evidence_source` (text, where this rating came from) and `last_verified_at`
(a `YYYY-MM-DD` date, or null meaning "never verified / unknown"). Primary key is the pair,
so each person has at most one rating per skill.

**`future_skill_targets`** — `skill_id`, `target_people`. The legacy "how many people do
we want" number, editable through `PUT /api/future-skills`. This drives the old
gap-analysis screen only.

### Tables added by Member 1

**`skill_requirements`** — one row per skill. `criticality` (1–5), `target_proficiency`
(1–5, the level that counts as a "holder"), `required_holders` (how many holders avoid a
knowledge dependency), `metadata_source` (provenance). Before this table existed these
three numbers were hardcoded inside `loadWorkforce` — criticality was literally the
expression `name === 'Legacy Billing Recovery' ? 5 : 3`. Member 2's risk score is computed
from these three numbers, so making them editable is what makes the score defensible.

**`critical_roles`** — `id`, `name` (matches `employees.role`), `criticality`,
`metadata_source`. One row per role that exists in the workforce.

**`role_skill_requirements`** — `role_id`, `skill_id`, `minimum_proficiency`. What a
person must already be able to do to step into that role. This is the succession input:
Member 2 compares candidates against it to say who is `ready` or `developable`.

**`resources`** — the learning catalogue. `id`, `slug` (a stable string handle like
`cert-billing-recovery`, kept because Member 4's code refers to entries by it), `title`,
`kind` (training / mentoring / certification / job_rotation / project_experience /
documentation), `url` (nullable), `verified` (0 or 1), `provenance`.

**`resource_skills`** — `resource_id`, `skill_id`. A catalogue entry can serve several
skills, which a single column could not express.

**`future_requirements`** — a coverage requirement that starts applying later. `skill_id`,
`required_holders`, `target_proficiency`, `criticality`, `effective_month` (0–60, matching
the simulation horizon), `status` (`proposed` or `reviewed`), `provenance`. Defaults to
`proposed` so that nothing tightens expectations until a human reviews it — this is the
mechanism behind the brief's "no future deterioration without explicit assumptions".

### Integrity rules the database itself enforces

- `CHECK` constraints on every 1–5 field and on `verified`, `status`, `kind`.
- `FOREIGN KEY` on every reference. **This was silently broken before this work.** SQLite
  ignores `FOREIGN KEY` clauses unless `PRAGMA foreign_keys = ON` is run on each
  connection, and nobody ran it. The effect was that `PUT /api/future-skills` accepted a
  skill id that did not exist, returned 200, and wrote an orphan row. It is on now, and
  a test proves an orphan insert is rejected.

---

## 7. The workforce snapshot — the contract everyone reads

`loadWorkforce()` in `workforce.js` returns one object. Its exact shape is documented
in `API.md`; this section explains what each part is for and who depends on it.

```
{
  schemaVersion: 1,
  employees:          [{ id, name, role, department, mentoringHoursPerMonth? }],
  skills:             [{ id, name, criticality, targetProficiency, requiredHolders,
                         demandTarget, metadataSource }],
  roles:              [{ id, name, criticality, metadataSource, incumbentIds,
                         requirements: [{ skillId, minimumProficiency }] }],
  learningResources:  [{ id, title, category, verified, provenance, skillIds }],
  futureRequirements: [{ id, skillId, skillName, requiredHolders, targetProficiency,
                         criticality, effectiveMonth, status, provenance }],
  matrix:             [{ employeeId, skillId, proficiency, evidenceSource, lastVerifiedAt }]
}
```

**Who reads what**

- Member 2 (`services/risk.js`, `services/simulation.js`): `skills` for criticality,
  target and required holders; `matrix` for who holds what; `roles[].requirements` for
  succession; `employees[].mentoringHoursPerMonth` for mentor capacity; `futureRequirements`
  for dated scenarios.
- Member 3 (frontend): all of it, over `GET /api/keystone/workforce`.
- Member 4 (`services/ai/grounding.js`): `learningResources` — it filters on
  `verified === true` and will only let the model cite a resource that is in this list.

**Rules baked into the snapshot**

- `requiredHolders` is **never below 1**. `services/risk.js` computes
  `gap / requiredHolders`, so a zero would publish `NaN` as the Keystone score and corrupt
  the ranking. The adapter floors it. Genuine "nobody needs this skill" is reported
  separately as `demandTarget`, which can be 0 or null.
- `demandTarget` and `requiredHolders` are **different questions**. The first is legacy
  hiring demand ("we want 10 people in Cloud Architecture"). The second is Keystone coverage
  ("we need 2 holders so one departure is not a crisis"). They used to be one field, which
  conflated them.
- `mentoringHoursPerMonth` is **omitted entirely** when capacity was never recorded.
  Consumers treat an absent key as unknown. It is never emitted as 0 or null, because
  "we do not know" and "zero hours" mean different things.
- `lastVerifiedAt` is `null` when unknown, and the UI renders a dash. It is never guessed.
- A skill with no `skill_requirements` row reports `metadataSource: 'unspecified'` rather
  than a fabricated requirement.
- `getHeatmapData()` — the query behind the legacy `/api/heatmap` — still selects the
  original four employee columns explicitly, so that endpoint's output is byte-identical
  to before this work. New fields are added only in `loadWorkforce`.

---

## 8. Endpoints Member 1 owns

In `backend/routes/workforce-data.js`, mounted under `/api/keystone`. Validation lives
in `queries.js`, not in the route, so the same rules apply to any caller.

**`PUT /api/keystone/employee-skills`** — body
`{ employeeId, skillId, proficiency, evidenceSource, lastVerifiedAt }`. Inserts or
updates one rating. Rejects with 400 if: either id is unknown (naming which), proficiency
is outside 1–5, `evidenceSource` is empty (a score has to trace to something recorded),
or `lastVerifiedAt` is not null or `YYYY-MM-DD`. Runs in a transaction. During integration
Member 2 extended it so that recording evidence against a `future_only` skill promotes it
into the current inventory.

**`GET /api/keystone/future-requirements`** — lists them ordered by effective month.

**`POST /api/keystone/future-requirements`** — creates one, returns 201. Rejects unknown
skill ids, `effectiveMonth` outside 0–60, `requiredHolders` below 1 (with a message
pointing to `demandTarget` for zero demand), a status other than `proposed`/`reviewed`,
or an empty `provenance`. During integration Member 2 extended it to accept a `skillName`
with a null or provisional negative `skillId`, so a requirement for a skill that does not
exist yet creates the skill as `future_only` and gets a real id back.

The pre-existing **`PUT /api/future-skills`** was hardened as well: it now validates
every skill id before opening the transaction and returns 400 naming the bad ones instead
of writing orphans.

---

## 9. Rules that must not be broken

These are the invariants. Every one is either enforced by the database or asserted by a
test in `data.test.js`, so breaking one fails the suite.

1. IDs are integers allocated by SQLite. Never string ids in the database. (The catalogue
   slug is a *second* handle kept for Member 4's convenience; the row still has an
   integer id.)
2. Proficiency is 1–5. Independent = 3. Mentor = 4+.
3. Absent evidence is unknown, not zero. Applies to `lastVerifiedAt`,
   `mentoringHoursPerMonth`, and a missing matrix edge.
4. Every judgement value carries provenance.
5. Foreign keys are enforced; writes validate ids before opening a transaction; a rejected
   batch leaves existing rows untouched.
6. Schema changes are additive and idempotent. An old database upgrades in place. Never
   drop a table that could hold user-entered data. (The one drop, `resources`, was
   justified because the table was one commit old and only ever held seed rows.)
7. Nothing invented: no employee ids, credentials, courses or forecasts that are not
   labelled fictional.
8. Existing fields keep their name and shape. New information is added as new fields.
   Members 2, 3 and 4 consume this snapshot; renaming a field breaks them.

---

## 10. How to do common things

**Start with fresh demo data**
Stop the backend, then `npm run seed:reset --prefix backend`. Or start against a new
file: `DB_PATH=/tmp/fresh.db npm start --prefix backend`.

**Change the demo dataset itself**
Edit the CSV in `backend/data/demo/`, then `npm run seed:reset`. Reference other rows by
name. Leave a cell blank for unknown. A bad row fails the reset with its file and line.

**Seed a different organisation**
Put the same seven CSV files in a folder and run with `KEYSTONE_SEED_DIR=that/folder`
and a fresh `DB_PATH`.

**Record or change someone's proficiency in a running app**
`PUT /api/keystone/employee-skills` with an `evidenceSource`. This changes the database,
not the CSV — a later `seed:reset` would discard it, so put durable changes in the CSV.

**Change a skill's criticality or coverage requirement**
Update the row in `skill_requirements` and set `metadata_source` to say who decided.
There is no HTTP endpoint for this yet; it is a reasonable next addition.

**Add a catalogue entry**
Add a row to `learning_resources.csv` with a unique `slug`, `;`-separated skill names,
`verified` set to `true` only if a person has confirmed it exists, and a `provenance`
naming who. Then `seed:reset`.

**Add a future requirement**
`POST /api/keystone/future-requirements`. Leave `status` as `proposed` until reviewed.

**Write a test without a database**
`const { createWorkforceFixture } = require('../data/fixture')`. Returns a fresh deep copy
each call. A test in `data.test.js` asserts the fixture's shape matches the live snapshot,
so if the contract changes and the fixture is not updated, the suite fails rather than
drifting quietly.

**Prove a change to the data layer is safe**
Snapshot every endpoint's JSON before touching code, make the change, snapshot again,
diff. This is how every commit in section 11 was verified. The data layer had zero test
coverage when this work began (the original 7 tests covered only `services/`), so the
suite alone could not prove a refactor was safe. Endpoints to capture: `/api/health`,
`/api/heatmap`, `/api/critical-skills`, `/api/gap-analysis`, `/api/recommendations`,
`/api/future-skills`, `/api/keystone/workforce`, `/api/keystone/risks`,
`/api/keystone/development-plan`.

---

## 11. Every step taken, in order

All on branch `feature/workforce-data`, 2026-09-12. Each was pushed as soon as it was
verified, so nothing was ever held only on one machine.

**1. `16ea164` — Extract workforce data layer into `backend/data`.**
Pure move, no behaviour change. `index.js` went from 496 to 85 lines. Verified by
snapshotting all 9 endpoints before and after: byte-identical. The `DB_PATH` trap in
section 2 was caught here.

**2. `4a3f482` — Enforce foreign keys and validate skill ids before writes.**
Turned on `PRAGMA foreign_keys`. Confirmed no orphan rows existed first, so enabling it
was safe on existing data. Added id validation before the transaction in
`PUT /api/future-skills`. First eight data-layer tests. Done before adding any new tables
so they would be correct from birth rather than retrofitted.

**3. `9c9bf82` — Persist skill requirements, evidence and mentoring availability.**
Created `skill_requirements`; added `evidence_source` and `last_verified_at` to the matrix.
The backfill reproduces the old hardcoded values exactly, verified by diff: `busFactor`,
`keystoneScore`, `gap` and `explanation` unchanged. Only `metadataSource` changed value,
from a TODO placeholder to real provenance.

**4. `2dcc2c5` — Separate legacy demand from Keystone coverage requirements.**
Introduced `demandTarget`, floored `requiredHolders` at 1. A test runs Member 2's actual
`analyze()` over a snapshot with `required_holders = 0` in the database and asserts every
score is finite.

**5. `40c1ceb` — Add critical roles and succession skill requirements.**
`critical_roles` and `role_skill_requirements`, derived from the existing role profiles
rather than invented. `roles` added to the snapshot; `risks` payload unchanged.

**6. `f5bf879` — Add resource catalogue with explicit verification status.**
First version of `resources`. Deliberately seeded no certification entries, on the grounds
that naming one would invent a credential. (Superseded in step 9.)

**7. `cb1b8f4` — Add validated skill edits and effective-dated future requirements.**
`future_requirements` table, the three routes in `workforce-data.js`. Verified over HTTP
that a valid edit returns 200, unknown ids and missing evidence return 400, and both
survive a server restart.

**8. `094bbde` — Publish shared workforce fixture and sample payloads.**
`fixture.js`, `docs/samples/`, and the shape-lock test. Done last so teammates would not
build against a shape that then changed.

**9. `d0927fe` — Merge main, reconciling the duplicated catalogue and mentoring capacity.**
While the above was happening, `main` gained 10 commits from Members 2 and 4, including
placeholders for exactly this work: an in-memory `learningCatalog` in `index.js` whose
comment said "Member 1 would persist this with an editable verified flag", and a derived
`mentoringHoursPerMonth`. Both were folded into the persisted layer with their published
shapes kept identical. `mentoringAvailable` (from step 3) was dropped in favour of their
better-grounded field. The `resources` table was rebuilt with `slug` and a join table.
Combined suite: 72 tests.

**10. `9073fd1` — Correct docs that predated the persisted data layer.**
README, a stale comment in `risk.js`, and the sample regeneration command.

**11. `ac7720b` (on `fix/docs-sync`) — Record verified checklist state.**
The team checklist in `INTEGRATION.md` marked with what was verified from a clean install
and what is still open.

**12. `26d485a` (on `fix/docs-sync`) — Document the data layer.**
The first version of this document.

**13. `67af2e8` and `c221ca2` (on `integrate/parts-1-2-4-csv`, by a teammate) — Seed from CSV.**
Described in section 12. Verified from a clean install: 101 tests, lint and build clean,
boots serving 44 employees. This document was then updated to match — sections 3, 4, 5
and 10 describe the CSV layout; the earlier `seed.js` description is kept only as history.

---

## 12. What teammates changed in this layer during integration

On `integrate/parts-2-4-data`, Member 2 built directly on the above and made these
changes to Member 1's files. They are improvements and were kept.

- `saveEmployeeSkill` now runs in an explicit transaction and, on first evidence, flips a
  `future_only` skill into the current inventory and gives it a `skill_requirements` row.
- `addFutureRequirement` accepts `skillName` with a null or negative `skillId`, creating
  the skill as `future_only = 1`. This closes the handoff `API.md` described as "Member 1
  allocates persistent IDs on save".
- `future_requirements` gained a `criticality` column.
- `getHeatmapData` filters `future_only = 0` so forecast-only skills stay out of the
  inventory until someone actually holds them.
- `getFutureRequirements` applies the same `MAX(1, …)` floor to `requiredHolders`.

`workforce.js` — the snapshot itself — was not modified by anyone else. The published
contract is exactly as documented in section 7.

### Second integration: the dataset moved to CSV

On `integrate/parts-1-2-4-csv` (commit `67af2e8`), a teammate replaced the JavaScript
seed arrays with the seven CSV files described in section 3, added `csv.js` and
`dataset.js`, cut `seed.js` from ~450 lines to ~110, and removed the three derivation
steps from startup. The dataset grew from 20 to 44 employees and gained two more demo
stories. They also added `scripts/reset-demo-data.js`, `tests/seed-csv.test.js` and
`tests/integration.test.js`, taking the suite to 101 tests.

This was checked against the rules in section 9 before being accepted into this document:
ids are still allocated by SQLite (CSVs reference by name), blank still means unknown,
evidence is still required on every matrix row, provenance is still on every judgement
value, and `loadWorkforce` was not touched — so nothing any consumer reads changed shape.
The Liam/Mason story is preserved with the same values. A follow-up commit (`c221ca2`)
made the legacy heat-map panels agree with Keystone risk, which is frontend work outside
this layer.

---

## 13. Open items, honestly

- **`verified: true` on fictional credentials.** The nine seeded catalogue entries have
  invented course and credential names, each suffixed "(fictional)", stored with
  `verified = 1` because Member 4's grounding requires it to offer certification actions.
  The label is the mitigation. Whether that reads honestly to a judge is a team decision
  that has not been made yet.
- **No endpoint to edit `skill_requirements` or `critical_roles`.** They are editable in
  the database but not over HTTP. Adding `PUT` routes for them follows the same pattern
  as `employee-skills`.
- **`requiredHolders` floor.** If Member 2 ever guards the division in `risk.js`, the floor
  in `workforce.js` can be removed and true zeroes published.
