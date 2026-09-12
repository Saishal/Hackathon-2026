# Keystone HTTP JSON contract v1

Backend: JavaScript/CommonJS. Frontend: JavaScript/JSX ES modules. Stable integer IDs come from SQLite. Errors: HTTP 400 with `{error:message}` for invalid input, 500 for unexpected failure. Use `frontend/src/api/keystone.js` from React.

## GET /api/keystone/workforce

Returns `{schemaVersion:1, employees, skills, matrix}`.

- employees: `{id,name,role,department,mentoringAvailable}`.
- skills: `{id,name,criticality,targetProficiency,requiredHolders,metadataSource}`.
- matrix: `{employeeId,skillId,proficiency,evidenceSource,lastVerifiedAt}`.

Recorded proficiency 1–5; absent edge means unknown. Criticality 1–5, requiredHolders >=1. Legacy targetPeople=0 is clamped to 1 by the Keystone adapter; Member 1 must reconcile zero-demand semantics in a unified requirements model.

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

## Data integrity

`PRAGMA foreign_keys` is enabled per connection, so declared references are enforced. Writes validate referenced IDs first: `PUT /api/future-skills` returns HTTP 400 `{"error":"Unknown skill id(s): 9999"}` for an unknown skill and applies nothing, rather than writing an orphan row. Batches are transactional, so a rejected batch leaves existing rows untouched.

## Fresh demo data

Schema upgrades are additive and existing rows are preserved, so an existing `backend/skillsight.db` keeps working. To get a clean seed, point `DB_PATH` at a new file (`DB_PATH=/tmp/fresh.db npm start --prefix backend`) or delete `backend/skillsight.db`; seeding only runs when the employees table is empty.
