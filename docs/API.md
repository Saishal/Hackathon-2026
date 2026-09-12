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

The catalogue is now **persisted** in `resources` and `resource_skills` rather than held in memory, which is what the in-code comment asked Member 1 to do. `verified` is a stored column meaning "this entry exists in our catalogue" — AI grounding filters on `verified === true`, and **no model can set that flag for itself**. `provenance` records where an entry came from; every seeded entry is `'fictional demo entry'` and its title carries "(fictional)", with no URL and no real credential name. Add genuine entries by inserting with `verified` 1 and a provenance naming who confirmed them.

Roles carry the succession inputs: `incumbentIds` are the employees currently in the role and `requirements` are the skills a successor must already hold. Roles and their requirements are derived from the fictional demo role profiles, so criticality starts at a neutral 3 and is meant to be edited rather than read as a finding. Deciding who actually qualifies as a successor is Member 2's calculation, not a stored value.

Recorded proficiency 1–5; absent edge means unknown. Criticality 1–5, requiredHolders >=1.

**Demand and coverage are separate questions.** `demandTarget` is legacy future hiring demand from `future_skill_targets` and may be 0 or null; it drives `/api/gap-analysis` only. `requiredHolders` is the Keystone coverage requirement — the holders needed to avoid a knowledge dependency — and is never below 1, because `services/risk.js` computes `gap / requiredHolders` and a 0 would publish `NaN` as `keystoneScore` and corrupt the ranking. A skill with zero hiring demand can still require coverage, so the two are reported independently rather than one being clamped into the other.

Skill metadata is persisted in `skill_requirements` and read per request, so criticality, targetProficiency and requiredHolders are editable rather than hardcoded. Seeded rows report `metadataSource:'fictional demo default'`; a skill with no requirements row reports `'unspecified'` instead of a fabricated requirement. Evidence lives on `employee_skills`: `evidenceSource` labels provenance and `lastVerifiedAt` is null when verification is unknown. Mentoring capacity is recorded on `employees`, not recomputed per request; mentor eligibility also still requires baseline proficiency >=4.

## GET /api/keystone/risks

Returns `{skills,uncovered,singleHolder,methodology}`. Each skill adds `{holderIds,busFactor,gap,keystoneScore,explanation}`.

Bus Factor = recorded holders meeting targetProficiency. gap = max(0,requiredHolders-busFactor).

score = round(100 * criticality/5 * (0.6/max(1,busFactor) + 0.4*gap/requiredHolders)). This is a demo prioritization heuristic, not a probability.

## GET /api/keystone/employee-risks

Returns `{employees, soleCoverageHolders, methodology}`. Additive; `analyze(workforce)` and `GET /risks` are unchanged.

Each employee: `{id,name,role,department,keystoneScore,capped,recordedSkills,newlyUncovered,affectedSkills,explanation}`, sorted by score then id.

score = min(100, round(100 * Σ over affected skills of `criticality/5 * (0.6*becomesUncovered + 0.4*(gapAfter-gapBefore)/requiredHolders)`)). An affected skill is one where this person is a recorded holder at or above target, so removing them lowers its Bus Factor. The sum means sole coverage of several critical skills scores higher than one; `capped` is true if the uncapped value exceeded 100. Same 0.6/0.4 weighting as the skill score so the two read consistently.

Each entry in `affectedSkills` carries `{id,name,criticality,targetProficiency,requiredHolders,busFactorBefore,busFactorAfter,gapBefore,gapAfter,becomesUncovered,successors}`.

`successors` lists up to three other employees with recorded proficiency in that skill, ranked by proficiency, each `{employeeId,name,proficiency,shortfall,status}` where status is `ready` (already at target without this person) or `developable`. **Matching currently uses recorded skill evidence as a stand-in.** Role requirements now exist on the snapshot as `roles[].requirements`, so this can switch to them when Member 2 is ready. An empty `successors` array means no evidence on file — never proof that nobody else is capable.

This scores organizational dependency on a person. It is not a prediction that anyone will leave, and it must not be presented as one.

## POST /api/keystone/simulate

```json
{
  "horizonMonths": 12,
  "departures": [{"employeeId": 1, "month": 9}],
  "interventions": [{"employeeId": 2, "skillId": 1, "mentorId": 1, "completionMonth": 6, "targetProficiency": 3, "assumeVerified": true}]
}
```

IDs above are illustrative: select actual IDs from workforce. Horizons 0/12/36/60; event months integers 0–60. mentorId optional; if present, mentor must have baseline proficiency >=max(4,targetProficiency) and remain available through completion. Learner must remain available through completion. Same-month departure blocks transfer conservatively. Only completed assumed-verified actions affect projected proficiency.

Returns `{horizonMonths,baseline,noIntervention,projected,blocked,capacityWarnings,requirementsApplied,assumptions}`. Three analyses use one calculation. Baseline is never mutated.

**Mentor capacity.** An intervention may carry an optional `startMonth` (integer 0–60, not after `completionMonth`, default 0); mentor and learner are occupied across `[startMonth, completionMonth]`. A mentor with recorded `mentoringHoursPerMonth` supports `floor(hours / 2)` concurrent engagements — one engagement is assumed to cost 2 hours per month, a stated planning constant rather than a measurement. Overlapping engagements beyond that are blocked with the capacity reason; a mentor whose recorded hours cannot fund one engagement is blocked rather than silently scheduled. A mentor with **no** recorded capacity is not blocked — absent evidence is not evidence of absence — but produces an entry in `capacityWarnings` so a reviewer confirms availability before relying on the plan. Non-overlapping engagements do not compete.

**Approved future requirements.** The scenario may carry `requirements: [{skillId,skillName,targetProficiency,requiredHolders,criticality,effectiveMonth}]`. `skillId` null means a new skill and then `skillName` is required. Requirements whose `effectiveMonth` is at or before the horizon apply to `noIntervention` and `projected` and **never to `baseline`**, which stays today's picture — so the comparison separates "what changed about us" from "what changed about the requirement". Applied entries are echoed in `requirementsApplied`. New skills take provisional negative IDs valid only inside the scenario; Member 1 allocates persistent IDs on save. This is the path by which reviewed strategy requirements reach a dated simulation.

## POST /api/keystone/development-plan

Body `{skillId:1}`. Returns `{mode,skillId,actions}` where mode is `live-ai` or `demo-fallback`; includes `fallbackReason` and `reviewStatus`. Five categories: training, mentoring, certification, job_rotation, project_experience. Action fields: category, employeeId, mentorId, status, targetProficiency, rationale, action, verificationMethod, assumptions. IDs may be null if evidence cannot support a participant. No course/credential/date is invented. Matias implemented live AI integration and local validation; see [full output fields and setup](AI-INTEGRATION.md).

## POST /api/keystone/strategy

Body `{direction:'We are expanding into e-commerce'}`, 1–2000 characters. Returns `{mode,direction,requirements,message,reviewStatus,persisted:false}`. Requirements include matched skill ID or null for a new name, rationale, targetProficiency, requiredHolders, criticality, effectiveMonth, sourcing, sourcingRationale, assumptions, requirementId, and deterministic coverage. User reviews before activation; Member 1 allocates new skill IDs, Member 2 calculates gaps.

Legacy endpoints remain compatible: /api/heatmap, /api/critical-skills, /api/gap-analysis, /api/recommendations, GET/PUT /api/future-skills. Member 3 migrates views progressively.

## PUT /api/keystone/employee-skills

Body `{employeeId, skillId, proficiency, evidenceSource, lastVerifiedAt}`. Inserts or updates one recorded proficiency and returns the stored row. `evidenceSource` is required and non-empty, because a score has to trace back to something recorded. `lastVerifiedAt` is either null or `YYYY-MM-DD`; null means verification is unknown and is displayed as a dash, never guessed. Unknown `employeeId` or `skillId` returns 400 naming the bad id, and proficiency outside 1–5 is rejected.

## GET, POST /api/keystone/future-requirements

`GET` returns `[{id,skillId,skillName,requiredHolders,targetProficiency,effectiveMonth,status,provenance}]` ordered by effective month. `POST` creates one and returns 201.

`effectiveMonth` is 0–60, matching the simulation horizon. `status` is `proposed` or `reviewed` and **defaults to `proposed`**, so a requirement does not tighten coverage expectations until a person reviews it — this is what keeps "no future deterioration without explicit assumptions" true. `provenance` is required and records where the requirement came from. Member 2 should treat only `reviewed` entries as active when calculating future gaps.

## Data integrity

`PRAGMA foreign_keys` is enabled per connection, so declared references are enforced. Writes validate referenced IDs first: `PUT /api/future-skills` returns HTTP 400 `{"error":"Unknown skill id(s): 9999"}` for an unknown skill and applies nothing, rather than writing an orphan row. Batches are transactional, so a rejected batch leaves existing rows untouched.

## Fresh demo data

Schema upgrades are additive and existing rows are preserved, so an existing `backend/skillsight.db` keeps working. To get a clean seed, point `DB_PATH` at a new file (`DB_PATH=/tmp/fresh.db npm start --prefix backend`) or delete `backend/skillsight.db`; seeding only runs when the employees table is empty.

## AI status and reviewed preview

GET /api/keystone/ai-status reports configuration without credentials. POST /api/keystone/strategy/preview accepts reviewed:true, horizonMonths, and requirements; it computes read-only gaps through the existing risk engine. Remove response-only coverage and requirementId fields before submitting. See [AI contract details](AI-INTEGRATION.md).

## Identity and scheduling validation

- AI proposals and simulations share `services/skill-identity.js`. Case/whitespace and explicit aliases such as Node.js/Node JS normalize; meaningful punctuation stays intact, so C, C++, and C# are different skills.
- Non-null future skill IDs must exist. Supplied names must agree with IDs. A name-only requirement matching a catalog skill uses that existing ID. An unmatched name remains a new proposed skill. Unknown IDs, conflicting names, and duplicate normalized skills return HTTP 400 in the simulator. Each scenario accepts one target per skill; send the reviewed target for the selected planning scenario rather than multiple competing targets.
- Mentoring capacity is counted for each occupied month, including start and completion. Separate earlier bookings that each overlap a longer engagement do not imply they overlap one another. Real peak occupancy must remain within the recorded capacity.
- If both AI output and the deterministic fallback fail validation, the response stays `demo-fallback` with `fallbackReason: "fallback_invalid"` and an explicit unavailable message. Strategy returns no requirements; development returns five inactive, unassigned categories. No invalid recommendations are returned.
