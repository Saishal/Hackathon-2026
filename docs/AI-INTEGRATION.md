# Matias's AI module — implementation and handoff

## Run

Use Node 24. Install with `npm ci --prefix backend` and `npm ci --prefix frontend`. Start the backend with `npm start --prefix backend`; start Vite with `npm run dev --prefix frontend` in a second terminal. No credentials are necessary for a complete offline demonstration.

For live AI, copy `backend/.env.example` to `backend/.env`, set `KEYSTONE_AI_PROVIDER=openai`, `OPENAI_API_KEY`, and `KEYSTONE_AI_MODEL` to a model available to your account that supports Responses structured outputs. Restart the backend. Existing process environment variables take precedence. Do not put keys in chat, frontend variables, or Git. No model is silently selected or substituted.

The OpenAI SDK uses the Responses API with strict JSON Schema and `store:false`. Local Ajv validation and grounding checks run afterward. See [official structured output documentation](https://developers.openai.com/api/docs/guides/structured-outputs). A configurable 20-second per-attempt timeout (1–60 second bounds), one SDK retry, a three-call concurrency bound, and input/output size caps constrain requests. Refusals, incomplete responses, provider errors, and invalid content use the explicit fallback. No upstream error text or key is returned.

`GET /api/keystone/ai-status` returns `{provider,configured,model,reason}`. Configuration is not proof of a successful live call. Provider is instantiated at backend startup; restart after changing configuration — and restart with `npm start`, not `node index.js`, because only the start script passes `--env-file-if-exists=.env`.

## Model selection, measured

The live path was verified on 2026-09-12. **`gpt-4.1-mini` passes**: four consecutive development plans and both harness modes returned `live-ai` with every grounding check satisfied.

**`gpt-4.1-nano` fails and must not be used.** Across repeated runs it attached participants and resources to `not_applicable` actions, emitted a duplicate category in place of a missing one, and omitted required knowledge-transfer elements from the mentoring plan. Each failure is caught and served as the labeled demo fallback, so the symptom is not an error — it is an app that looks like it works while never using the model. Prompt wording was sharpened twice against these failures; the certification rule was fixed by it, the rest were not. This is an instruction-following ceiling, not a wording problem.

Avoid o-series and gpt-5 reasoning models: reasoning tokens are drawn from the same `max_output_tokens` budget of 6000, which can return an incomplete response and fall back silently.

Run `node scripts/verify-live-ai.js` after any model change. Phase B fails loudly on a fallback rather than letting it pass as success, which is the only reliable way to tell a working live path from a convincing demo one.

## Development plan

`POST /api/keystone/development-plan` still accepts `{skillId}`. Returns the existing mode/skillId/actions plus schemaVersion, fallbackReason, reviewStatus, deterministic risk, and message. Each action includes a stable id, skillId, category, participant IDs, nullable verified resource, status, rationale, action, targetProficiency, estimatedDurationMonths, durationBasis, milestone, verificationMethod, and assumptions.

Five categories are always represented. `not_applicable` actions have no assignments, resources, or duration. Certification requires a verified catalog entry. Mentoring must reference a qualified holder with nonzero or unrecorded availability; unknown availability cannot receive `proposed` status. Learners come from recorded proficiency below the target, not guessed employees with absent evidence. Even proposed actions require human review and never establish completion.

Optional Member 1 fields consumed now:

```json
{
  "employees": [{"id": 1, "mentoringHoursPerMonth": 4}],
  "learningResources": [{"id": "resource-demo", "title": "Fictional demo resource", "category": "certification", "skillIds": [1], "verified": true}]
}
```

Existing snapshots work without those fields. A verified flag means your catalog owner has checked the resource; the model cannot set it. Resource URLs are not generated. No course title or credential should be invented in prose; prompts prohibit this, and structured resource IDs are checked. The link guard rejects full URLs, `www.` prefixes, and bare domains such as `billingcert.com` anywhere in an action or requirement. An invented credential *name* carrying no domain (`Advanced Billing Professional`) cannot be detected by pattern, so free-form factual wording still needs human review.

Mentoring actions that are not `not_applicable` must describe all four knowledge-transfer elements — documentation, shadowing, supervised practice, and an independent demonstration — across their `action` and `milestone` fields, or the response is rejected and falls back. `verificationMethod` is deliberately excluded from that scan: it is boilerplate that always mentions observing an independent demonstration, so counting it would satisfy two elements for free.

## Future strategy and review

`POST /api/keystone/strategy` accepts `{direction}` and returns `{schemaVersion,mode,fallbackReason,direction,reviewStatus,persisted,requirements,message}`.

Each requirement contains `skillId` (null for novel skills), `skillName`, `rationale`, `targetProficiency`, `requiredHolders`, `criticality`, `effectiveMonth`, `sourcing`, `sourcingRationale`, and `assumptions`. Responses also contain `requirementId` and deterministic `coverage`. Coverage measures the proposed target against today's recorded skills; it is not an attrition forecast. Existing names/aliases normalize to catalog IDs; mismatches and duplicates are rejected.

Offline strategy templates cover e-commerce, industrial automation, and AI/customer-support initiatives. A direction matching no template now falls back to `coverageFallback`, which derives up to three requirements from the capabilities the recorded evidence is thinnest in, using Member 2's `analyze`. It references existing catalog skills by their real IDs, never invents a skill, proposes `hire` when nothing is recorded and `build` otherwise, and returns nothing only when the catalog itself is empty. Because it is derived from coverage rather than from the initiative, unrelated directions produce the same requirements; each one says so in its `rationale` and carries a `Derived deterministically from recorded coverage gaps; not an AI forecast` assumption. Demo counts/dates are illustrative and prominently labeled.

`POST /api/keystone/strategy/preview` requires:

```json
{
  "reviewed": true,
  "horizonMonths": 12,
  "requirements": [{
    "skillId": null,
    "skillName": "Industrial Automation",
    "rationale": "Maintain automated production controls.",
    "targetProficiency": 3,
    "requiredHolders": 2,
    "criticality": 4,
    "effectiveMonth": 12,
    "sourcing": "build",
    "sourcingRationale": "Assess internal candidates first.",
    "assumptions": ["Illustrative requirement; scope and capacity need review."]
  }]
}
```

Strip `coverage` and `requirementId` when submitting generated requirements. The UI does this. A preview rejects missing review, invalid quantities, and conflicting ID/name pairs. It uses Member 2's existing `analyze` function on a clone. New skills use private temporary IDs that never leave the bridge; Member 1 must allocate persistent IDs for saved skills. Matching requirements replace current quantities in this preview, rather than being summed. Requirements not yet effective return `coverage:null`. Nothing is saved.

## Integration boundaries

- Member 1: pass catalog/evidence/availability fields; add explicit reviewed requirement persistence and stable new-skill IDs.
- Member 2: reuse normalized requirements in the combined departure/intervention Time Machine; add capacity scheduling. The read-only strategy preview intentionally assumes neither departures nor training gains.
- Member 3: `AIWorkbench.jsx` provides working cards, strategy input, editable planning quantities, review checkbox, and gap preview. Reuse it or move these interactions into the finished design. Editing clears review and stale results. Browser never sees credentials.
- Matias: owns `services/ai/`, recommendations facade, provider tests. Both facade functions are now async and routes await them.

## Verification and limitations

Run `npm test --prefix backend`, `npm run lint --prefix frontend`, and `npm run build --prefix frontend`. Tests use local mocks, never real account keys. The actual OpenAI SDK is exercised against a local HTTP server including retry and JSON response handling. Invalid model output, IDs, resources, missing availability, aliases, review gating, effective dates, and HTTP contract errors are covered.

A real provider call has not been verified without configured credentials/model. No capacity scheduler, database migration, or workforce evidence change belongs to this module. Structured validation cannot prove the quality of every prose recommendation; estimates and business requirements remain drafts for review.
