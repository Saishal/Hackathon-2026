# Keystone HTTP JSON contract v1

Backend: JavaScript/CommonJS. Frontend: JavaScript/JSX ES modules. Stable integer IDs come from SQLite. Errors: HTTP 400 with `{error:message}` for invalid input, 500 for unexpected failure. Use `frontend/src/api/keystone.js` from React.

Worked examples live in [`docs/samples/`](samples/README.md). For unit tests, import `createWorkforceFixture()` from `backend/data/fixture.js` rather than touching SQLite — it returns a fresh deep copy each call, and the test suite fails if its shape drifts from this contract.

## GET /api/keystone/workforce

Returns `{schemaVersion:1, employees, skills, roles, learningResources, futureRequirements, matrix}`.

- employees: `{id,name,role,department,mentoringHoursPerMonth?}`. `mentoringHoursPerMonth` is **omitted entirely** when capacity was never recorded — absent means unknown, which is not the same as zero.
- skills: `{id,name,criticality,targetProficiency,requiredHolders,demandTarget,metadataSource}`.
- roles: `{id,name,criticality,metadataSource,incumbentIds,requirements}`, where requirements is `[{skillId,minimumProficiency}]`.
- matrix: `{employeeId,skillId,proficiency,evidenceSource,lastVerifiedAt}`.

- learningResources: `{id,title,category,verified,provenance,skillIds}`. `id` is a stable slug such as `cert-billing-recovery`. category is one of training, mentoring, certification, job_rotation, project_experience, documentation. `skillIds` lists every skill the entry serves.

The catalogue is now **persisted** in `resources` and `resource_skills` rather than held in memory, which is what the in-code comment asked Member 1 to do. `verified` is a stored column meaning "this entry exists in our catalogue" — AI grounding filters on `verified === true`, and **no model can set that flag for itself**. `provenance` records where an entry came from. The demo catalogue is seeded from `backend/data/demo/learning_resources.csv`: titles read as internal programmes, every row's provenance is `'Fictional demo dataset'`, and no row has a URL or a real credential name. Add genuine entries by inserting with `verified` 1 and a provenance naming who confirmed them.

Roles carry the succession inputs: `incumbentIds` are the employees currently in the role and `requirements` are the skills a successor must already hold. Roles, their criticality and their requirements are seeded from `roles.csv` and `role_requirements.csv`; the demo values are illustrative and meant to be edited rather than read as a finding. Deciding who actually qualifies as a successor is Member 2's calculation, not a stored value.

Recorded proficiency 1–5; absent edge means unknown. Criticality 1–5, requiredHolders >=1.

**Demand and coverage are separate questions.** `demandTarget` is legacy future hiring demand from `future_skill_targets` and may be 0 or null; it drives `/api/gap-analysis` only. `requiredHolders` is the Keystone coverage requirement — the holders needed to avoid a knowledge dependency — and is never below 1, because `services/risk.js` computes `gap / requiredHolders` and a 0 would publish `NaN` as `keystoneScore` and corrupt the ranking. A skill with zero hiring demand can still require coverage, so the two are reported independently rather than one being clamped into the other.

Skill metadata is persisted in `skill_requirements` and read per request, so criticality, targetProficiency and requiredHolders are editable rather than hardcoded. Seeded rows report the `source` column of `skills.csv` as `metadataSource` (`'Fictional demo dataset'` in the demo); a skill with no requirements row reports `'unspecified'` instead of a fabricated requirement. Evidence lives on `employee_skills`: `evidenceSource` labels provenance and `lastVerifiedAt` is null when verification is unknown. Mentoring capacity is recorded on `employees`, not recomputed per request; mentor eligibility also still requires baseline proficiency >=4.

## GET /api/keystone/risks

Returns `{skills,uncovered,singleHolder,methodology}`. Each skill adds `{holderIds,busFactor,gap,keystoneScore,explanation}`.

Bus Factor = recorded holders meeting targetProficiency. gap = max(0,requiredHolders-busFactor).

score = round(100 * criticality/5 * (0.6/max(1,busFactor) + 0.4*gap/requiredHolders)). This is a demo prioritization heuristic, not a probability.

## GET /api/keystone/employee-risks

Returns `{employees, soleCoverageHolders, methodology}`. Additive; `analyze(workforce)` and `GET /risks` are unchanged.

Each employee: `{id,name,role,department,keystoneScore,capped,recordedSkills,newlyUncovered,affectedSkills,explanation}`, sorted by score then id.

score = min(100, round(100 * Σ over affected skills of `criticality/5 * (0.6*becomesUncovered + 0.4*(gapAfter-gapBefore)/requiredHolders)`)). An affected skill is one where this person is a recorded holder at or above target, so removing them lowers its Bus Factor. The sum means sole coverage of several critical skills scores higher than one; `capped` is true if the uncapped value exceeded 100. Same 0.6/0.4 weighting as the skill score so the two read consistently.

Each entry in `affectedSkills` carries `{id,name,criticality,targetProficiency,requiredHolders,busFactorBefore,busFactorAfter,gapBefore,gapAfter,becomesUncovered,skillBackups}`.

`skillBackups` lists up to three other employees with recorded proficiency in that individual skill, ranked by proficiency. The employee-level `successors` field is separate: it compares candidates with every persisted requirement in the employee's role and reports `ready`, `developable`, `evidence_missing`, or `unknown`. Each candidate includes requirement-level recorded proficiency and shortfall. Missing evidence is never presented as proof that nobody is capable.

This scores organizational dependency on a person. It is not a prediction that anyone will leave, and it must not be presented as one.

## GET /api/keystone/succession

Returns role-level succession readiness from `roles[].requirements`, including current incumbents, their top candidates, the non-incumbent pipeline, and `rolesWithoutReadyNonIncumbent`. A candidate is ready only when recorded evidence meets every requirement. A missing matrix edge is counted as unknown; a recorded proficiency below the minimum is counted as a shortfall.

## POST /api/keystone/simulate

```json
{
  "horizonMonths": 12,
  "departures": [{"employeeId": 1, "month": 9}],
  "interventions": [{"employeeId": 2, "skillId": 1, "mentorId": 1, "completionMonth": 6, "targetProficiency": 3, "assumeVerified": true}]
}
```

IDs above are illustrative: select actual IDs from workforce. Horizons 0/12/36/60; event months integers 0–60. mentorId optional; if present, mentor must have baseline proficiency >=max(4,targetProficiency) and remain available through completion. Learner must remain available through completion. Same-month departure blocks transfer conservatively. Only completed assumed-verified actions affect projected proficiency.

Returns `{horizonMonths,baseline,noIntervention,projected,requirementsSource,blocked,capacityWarnings,requirementsApplied,assumptions}`. Three analyses use one calculation. Baseline is never mutated. When the request omits `requirements`, the simulator loads only saved requirements whose status is `reviewed`; if several reviewed rows exist for one skill, the latest one due at the selected horizon wins. An explicit array remains a scenario-only override.

**Mentor capacity.** An intervention may carry an optional `startMonth` (integer 0–60, not after `completionMonth`, default 0); mentor and learner are occupied across `[startMonth, completionMonth]`. A mentor with recorded `mentoringHoursPerMonth` supports `floor(hours / 2)` concurrent engagements — one engagement is assumed to cost 2 hours per month, a stated planning constant rather than a measurement. Overlapping engagements beyond that are blocked with the capacity reason; a mentor whose recorded hours cannot fund one engagement is blocked rather than silently scheduled. A mentor with **no** recorded capacity is not blocked — absent evidence is not evidence of absence — but produces an entry in `capacityWarnings` so a reviewer confirms availability before relying on the plan. Non-overlapping engagements do not compete.

**Approved future requirements.** The scenario may carry `requirements: [{skillId,skillName,targetProficiency,requiredHolders,criticality,effectiveMonth}]`. `skillId` null means a new skill and then `skillName` is required. Requirements whose `effectiveMonth` is at or before the horizon apply to `noIntervention` and `projected` and **never to `baseline`**, which stays today's picture — so the comparison separates "what changed about us" from "what changed about the requirement". Applied entries are echoed in `requirementsApplied`. Unsaved skills use provisional negative IDs inside the scenario. Saved future skills keep a stable positive ID while remaining outside today's inventory until evidence promotes them.

## POST /api/keystone/development-plan

Body `{skillId:1}`. Returns `{mode,skillId,actions}` where mode is `live-ai` or `demo-fallback`; includes `fallbackReason` and `reviewStatus`. Five categories: training, mentoring, certification, job_rotation, project_experience. Action fields: category, employeeId, mentorId, status, targetProficiency, rationale, action, verificationMethod, assumptions. IDs may be null if evidence cannot support a participant. No course/credential/date is invented. Matias implemented live AI integration and local validation; see [full output fields and setup](AI-INTEGRATION.md).

## POST /api/keystone/strategy

Body `{direction:'We are expanding into e-commerce'}`, 1–2000 characters. Returns `{mode,direction,requirements,message,reviewStatus,persisted:false}`. Requirements include matched skill ID or null for a new name, rationale, targetProficiency, requiredHolders, criticality, effectiveMonth, sourcing, sourcingRationale, assumptions, requirementId, and deterministic coverage. User reviews before activation; Member 1 allocates new skill IDs, Member 2 calculates gaps.

Legacy endpoints remain compatible: /api/heatmap, /api/critical-skills, /api/gap-analysis, /api/recommendations, GET/PUT /api/future-skills. Member 3 migrates views progressively.

## PUT /api/keystone/employee-skills

Body `{employeeId, skillId, proficiency, evidenceSource, lastVerifiedAt}`. Inserts or updates one recorded proficiency and returns the stored row. `evidenceSource` is required and non-empty, because a score has to trace back to something recorded. `lastVerifiedAt` is either null or `YYYY-MM-DD`; null means verification is unknown and is displayed as a dash, never guessed. Unknown `employeeId` or `skillId` returns 400 naming the bad id, and proficiency outside 1–5 is rejected.

## GET, POST /api/keystone/future-requirements

`GET` returns `[{id,skillId,skillName,requiredHolders,targetProficiency,criticality,effectiveMonth,status,provenance}]` ordered by effective month. `POST` creates one and returns 201. It accepts an existing positive `skillId`, or a null/provisional negative ID with `skillName`; a new name receives a stable positive skill ID in the response.

`effectiveMonth` is 0–60, matching the simulation horizon. `status` is `proposed` or `reviewed` and **defaults to `proposed`**, so a requirement does not tighten coverage expectations until a person reviews it — this is what keeps "no future deterioration without explicit assumptions" true. `provenance` is required and records where the requirement came from. Time Machine automatically applies only `reviewed` entries when callers omit a scenario requirements array.

## Data integrity

`PRAGMA foreign_keys` is enabled per connection, so declared references are enforced. Writes validate referenced IDs first: `PUT /api/future-skills` returns HTTP 400 `{"error":"Unknown skill id(s): 9999"}` for an unknown skill and applies nothing, rather than writing an orphan row. Batches are transactional, so a rejected batch leaves existing rows untouched.

## Fresh demo data

Schema upgrades are additive and existing rows are preserved, so an existing `backend/skillsight.db` keeps working. To get a clean seed, point `DB_PATH` at a new file (`DB_PATH=/tmp/fresh.db npm start --prefix backend`) or delete `backend/skillsight.db`; seeding only runs when the employees table is empty.

## Employee directory (admin)

All under `/api/keystone`, all requiring `employee.edit`. Archived employees keep their record, evidence and audit history but are excluded from the workforce snapshot, so they hold no coverage, appear in no team or scope, and are not succession candidates.

- `GET /employees` — every employee including archived, each with `employmentStatus`, `archivedAt`, `startDate`, `managerName`, `directReports` (active only), `recordedSkills`, and `account` (`{id,email,disabled}` or null).
- `POST /employees` — body `{name, role, department, managerId?, reportsExternally?, mentoringHoursPerMonth?, startDate?}`. Role must be a defined role; manager must be an active employee; start date cannot be in the future. Duplicate name returns 409 `duplicate_name`. Audited as `employee.created`. Returns 201.
- `PATCH /employees/:id` — any subset of the same fields. Refuses self-management, reporting loops and archived managers. Audited as `employee.updated` with changed fields.
- `GET /employees/:id/impact` — what archiving would change: `directReports` (active people who report to them), `account` (the linked sign-in, if any) and `coverage` (`keystoneScore`, `newlyUncovered` skill names, and `affectedSkills` with Bus Factor before/after), computed with the same engine as `/employee-risks`.
- `POST /employees/:id/archive` — body `{reassignReportsTo?}`. If the person has active direct reports, `reassignReportsTo` is required and must be a different active employee; reports are moved in the same transaction and each move is audited. A linked account is disabled and its sessions destroyed. Audited as `employee.archived` (high signal). 409 if already archived.
- `POST /employees/:id/restore` — reactivates. Does **not** re-enable a disabled account; the response says so with `accountStillDisabled`. Audited as `employee.restored`.

Migration `governance-006-employment` adds `employment_status`, `archived_at` and `start_date` to `employees`; existing rows default to active.
## GET /api/health

Returns `{status, failing, checks, checkedAt}` with **HTTP 200** when healthy and **HTTP 503** when any component fails, so an uptime monitor can poll it directly.

- `checks.database` — the SQLite file answers a query.
- `checks.schema` — every table the snapshot reads exists; on failure `missing` names them.
- `checks.seed` — at least one employee exists; on failure the reason says to run `npm run seed:reset`.
- `checks.ai` — `{provider, configured, reason}`. Demo mode is by design and never fails the check.

`failing` lists the failed component names so a dashboard can show which one without parsing the rest.

## Error alerting

If `KEYSTONE_ALERT_WEBHOOK_URL` is set in `backend/.env`, every unexpected server error (HTTP 5xx) is POSTed to it as JSON containing `content` (Discord), `text` (Slack) — both the same one-line summary with status, method, path and message — plus `error.message`, `error.stack`, `context` and `at`. Either webhook type works unchanged. Client errors (4xx) are never sent. Delivery is fire-and-forget with a 5 s timeout and can never delay or fail the response that triggered it. Unset means disabled; `/api/health` does not depend on it.
## AI status and reviewed preview

GET /api/keystone/ai-status reports configuration without credentials. POST /api/keystone/strategy/preview accepts reviewed:true, horizonMonths, and requirements; it computes read-only gaps through the existing risk engine. Remove response-only coverage and requirementId fields before submitting. See [AI contract details](AI-INTEGRATION.md).

## Identity and scheduling validation

- AI proposals and simulations share `services/skill-identity.js`. Case/whitespace and explicit aliases such as Node.js/Node JS normalize; meaningful punctuation stays intact, so C, C++, and C# are different skills.
- Non-null future skill IDs must exist. Supplied names must agree with IDs. A name-only requirement matching a catalog skill uses that existing ID. An unmatched name remains a new proposed skill. Unknown IDs, conflicting names, and duplicate normalized skills return HTTP 400 in the simulator. Each scenario accepts one target per skill; send the reviewed target for the selected planning scenario rather than multiple competing targets.
- Mentoring capacity is counted for each occupied month, including start and completion. Separate earlier bookings that each overlap a longer engagement do not imply they overlap one another. Real peak occupancy must remain within the recorded capacity.
- If both AI output and the deterministic fallback fail validation, the response stays `demo-fallback` with `fallbackReason: "fallback_invalid"` and an explicit unavailable message. Strategy returns no requirements; development returns five inactive, unassigned categories. No invalid recommendations are returned.

## Enterprise governance API

All endpoints in this section require a valid `keystone_session` HTTP-only cookie unless marked public. The server, rather than the browser, enforces every permission and data scope. Errors use the form `{error, code, details?}`; validation failures use `code: "validation_failed"` and `details: [{field, code, message}]`.

### Authentication

- `GET /api/auth/environment` is public and returns the environment label for the sign-in screen.
- `POST /api/auth/login` accepts `{email,password}` and returns the signed-in user plus capabilities while setting the session cookie.
- `POST /api/auth/logout` revokes the current server-side session.
- `GET /api/auth/session` returns the current user and capabilities, or 401 when signed out.

### Organization, audit, and data quality

- `GET /api/governance/organization`; `PATCH /api/governance/organization` (admin) read or update tenant settings.
- `GET /api/governance/audit-log` supports `page`, `pageSize`, `from`, `to`, `actorUserId`, `action`, `entityType`, `q`, and `highSignal`; `GET /api/governance/audit-log/:id` returns one immutable entry.
- `GET /api/governance/data-quality` supports `status`, `severity`, `ruleCode`, and `q`. `POST /api/governance/data-quality/:fingerprint/acknowledge` accepts `{note}`; `POST /api/governance/data-quality/:fingerprint/reopen` restores an acknowledged issue to open.

### Change review and risk ownership

- `GET /api/governance/change-requests` supports `status`, `type`, `mine`, and pagination. `POST /api/governance/change-requests` creates a draft. `PATCH /api/governance/change-requests/:id`, `/submit`, and `/cancel` respectively edit, submit, and cancel a draft.
- `POST /api/governance/change-requests/:id/approve` accepts an optional `{comment}`. `POST /api/governance/change-requests/:id/reject` requires `{comment}`. Approval writes the official record and its audit events atomically.
- `GET /api/governance/risk-acknowledgements`, `POST /api/governance/risk-acknowledgements`, `PATCH /api/governance/risk-acknowledgements/:id`, and `POST /api/governance/risk-acknowledgements/:id/close` manage risk ownership without changing the score.

### Planning, reports, and user administration

- `GET|POST /api/governance/scenarios`, `PATCH|DELETE /api/governance/scenarios/:id` save and manage authorized Time Machine scenarios.
- `POST /api/governance/ai-recommendation-decisions` records a reviewed, dismissed, or scheduled AI action against grounded records only.
- `GET /api/governance/exports/risks.csv` and `GET /api/governance/exports/data-quality.csv` produce permission-scoped, formula-safe CSV exports and record the export in audit history.
- `GET|POST /api/governance/users`, `PATCH /api/governance/users/:id`, and `POST /api/governance/users/:id/reset-password` are admin-only user administration endpoints. `GET /api/governance/users/assignable-owners` returns valid risk owners.
- Admin-only official-data routes include `DELETE /api/governance/employee-skills/:employeeId/:skillId`, `PATCH /api/governance/employees/:id`, `PATCH|DELETE /api/governance/future-requirements/:id`, `PUT /api/governance/resources/:slug`, and `PUT|DELETE /api/governance/roles/:roleId/requirements/:skillId`. Each is validated and audited.
