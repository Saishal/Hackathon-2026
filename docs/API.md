# Keystone HTTP JSON contract v1

Backend: JavaScript/CommonJS. Frontend: JavaScript/JSX ES modules. Stable integer IDs come from SQLite. Errors: HTTP 400 with `{error:message}` for invalid input, 500 for unexpected failure. Use `frontend/src/api/keystone.js` from React.

## GET /api/keystone/workforce

Returns `{schemaVersion:1, employees, skills, roles, resources, futureRequirements, matrix}`.

- employees: `{id,name,role,department,mentoringAvailable}`.
- skills: `{id,name,criticality,targetProficiency,requiredHolders,demandTarget,metadataSource}`.
- roles: `{id,name,criticality,metadataSource,incumbentIds,requirements}`, where requirements is `[{skillId,minimumProficiency}]`.
- matrix: `{employeeId,skillId,proficiency,evidenceSource,lastVerifiedAt}`.

- resources: `{id,skillId,title,kind,url,verified,provenance}`. kind is one of training, mentoring, certification, job_rotation, project_experience, documentation. skillId is null for generally applicable entries.

The resource catalogue is what development actions cite, and `verified` defaults to false so nothing reads as a genuine course until someone confirms it and records `provenance`. Seeded entries are generic activity types labelled `'fictional demo entry'` with no URL. **No certification entries are seeded on purpose** — naming one would invent a credential, which the brief forbids. Add real entries with `verified:1` and a provenance describing who confirmed them.

Roles carry the succession inputs: `incumbentIds` are the employees currently in the role and `requirements` are the skills a successor must already hold. Roles and their requirements are derived from the fictional demo role profiles, so criticality starts at a neutral 3 and is meant to be edited rather than read as a finding. Deciding who actually qualifies as a successor is Member 2's calculation, not a stored value.

Recorded proficiency 1–5; absent edge means unknown. Criticality 1–5, requiredHolders >=1.

**Demand and coverage are separate questions.** `demandTarget` is legacy future hiring demand from `future_skill_targets` and may be 0 or null; it drives `/api/gap-analysis` only. `requiredHolders` is the Keystone coverage requirement — the holders needed to avoid a knowledge dependency — and is never below 1, because `services/risk.js` computes `gap / requiredHolders` and a 0 would publish `NaN` as `keystoneScore` and corrupt the ranking. A skill with zero hiring demand can still require coverage, so the two are reported independently rather than one being clamped into the other.

Skill metadata is persisted in `skill_requirements` and read per request, so criticality, targetProficiency and requiredHolders are editable rather than hardcoded. Seeded rows report `metadataSource:'fictional demo default'`; a skill with no requirements row reports `'unspecified'` instead of a fabricated requirement. Evidence lives on `employee_skills`: `evidenceSource` labels provenance and `lastVerifiedAt` is null when verification is unknown. `mentoringAvailable` is a boolean; mentor eligibility also still requires baseline proficiency >=4.

## GET /api/keystone/risks

Returns `{skills,uncovered,singleHolder,methodology}`. Each skill adds `{holderIds,busFactor,gap,keystoneScore,explanation}`.

Bus Factor = recorded holders meeting targetProficiency. gap = max(0,requiredHolders-busFactor).

score = round(100 * criticality/5 * (0.6/max(1,busFactor) + 0.4*gap/requiredHolders)). This is a demo prioritization heuristic, not a probability.

## POST /api/keystone/simulate

```json
{
  "horizonMonths": 12,
  "departures": [{"employeeId": 1, "month": 9}],
  "interventions": [{"employeeId": 2, "skillId": 1, "mentorId": 1, "completionMonth": 6, "targetProficiency": 3, "assumeVerified": true}]
}
```

IDs above are illustrative: select actual IDs from workforce. Horizons 0/12/36/60; event months integers 0–60. mentorId optional; if present, mentor must have baseline proficiency >=max(4,targetProficiency) and remain available through completion. Learner must remain available through completion. Same-month departure blocks transfer conservatively. Only completed assumed-verified actions affect projected proficiency.

Returns `{horizonMonths,baseline,noIntervention,projected,blocked,assumptions}`. Three analyses use one calculation. Baseline is never mutated. Capacity scheduling and approved future requirements are extension work for Member 2.

## POST /api/keystone/development-plan

Body `{skillId:1}`. Returns `{mode:'demo-fallback',skillId,actions}`. Five categories: training, mentoring, certification, job_rotation, project_experience. Action fields: category, employeeId, mentorId, status, targetProficiency, rationale, action, verificationMethod, assumptions. IDs may be null if evidence cannot support a participant. No course/credential/date is invented. Matias owns live AI integration and local validation.

## POST /api/keystone/strategy

Body `{direction:'We are expanding into e-commerce'}`, 1–2000 characters. Currently `{mode:'not-configured',direction,requirements:[],message}`. Proposed extension: matched skill ID or proposed name, rationale, proficiency, holder count, criticality, effective month, assumptions. User reviews before activation; Member 1 allocates new skill IDs, Member 2 calculates gaps.

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
