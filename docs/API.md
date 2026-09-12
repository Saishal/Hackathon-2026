# Keystone HTTP JSON contract v1

Backend: JavaScript/CommonJS. Frontend: JavaScript/JSX ES modules. Stable integer IDs come from SQLite. Errors: HTTP 400 with `{error:message}` for invalid input, 500 for unexpected failure. Use `frontend/src/api/keystone.js` from React.

## GET /api/keystone/workforce

Returns `{schemaVersion:1, employees, skills, matrix}`.

- employees: `{id,name,role,department}`.
- skills: `{id,name,criticality,targetProficiency,requiredHolders,metadataSource}`.
- matrix: `{employeeId,skillId,proficiency,evidenceSource,lastVerifiedAt}`.

Recorded proficiency 1–5; absent edge means unknown. Criticality 1–5, requiredHolders >=1. Metadata currently uses labeled demo defaults; Member 1 owns persistence. Legacy targetPeople=0 is clamped to 1 by the Keystone adapter; Member 1 must reconcile zero-demand semantics in a unified requirements model.

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

Body `{skillId:1}`. Returns `{mode,skillId,actions}` where mode is `live-ai` or `demo-fallback`; includes `fallbackReason` and `reviewStatus`. Five categories: training, mentoring, certification, job_rotation, project_experience. Action fields: category, employeeId, mentorId, status, targetProficiency, rationale, action, verificationMethod, assumptions. IDs may be null if evidence cannot support a participant. No course/credential/date is invented. Matias implemented live AI integration and local validation; see [full output fields and setup](AI-INTEGRATION.md).

## POST /api/keystone/strategy

Body `{direction:'We are expanding into e-commerce'}`, 1–2000 characters. Returns `{mode,direction,requirements,message,reviewStatus,persisted:false}`. Requirements include matched skill ID or null for a new name, rationale, targetProficiency, requiredHolders, criticality, effectiveMonth, sourcing, sourcingRationale, assumptions, requirementId, and deterministic coverage. User reviews before activation; Member 1 allocates new skill IDs, Member 2 calculates gaps.

Legacy endpoints remain compatible: /api/heatmap, /api/critical-skills, /api/gap-analysis, /api/recommendations, GET/PUT /api/future-skills. Member 3 migrates views progressively.

## AI status and reviewed preview

GET /api/keystone/ai-status reports configuration without credentials. POST /api/keystone/strategy/preview accepts reviewed:true, horizonMonths, and requirements; it computes read-only gaps through the existing risk engine. Remove response-only coverage and requirementId fields before submitting. See [AI contract details](AI-INTEGRATION.md).
