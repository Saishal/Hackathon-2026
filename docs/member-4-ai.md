# Matias — AI recommendations and future strategy

**Prompt:** Build two modes behind backend/services/recommendations.js: development plans for current risks and future skill proposals for strategic direction. Use JavaScript/CommonJS with a server-side provider adapter. Implemented with the official OpenAI JavaScript SDK, configurable model, strict output schema, local validation, and offline fallbacks. The earlier Python prototype is separate.

- [x] Add provider configuration, timeouts, bounded retries, local output validation.
- [x] Ground output in employee/skill IDs, evidence, risks, and verified catalog.
- [x] Cover training, mentoring, certifications, rotations, project experience; mark unsupported categories not applicable.
- [x] Include rationale, target proficiency, estimated duration, milestone, verification method, assumptions.
- [x] Knowledge transfer: documentation, shadowing, practice, independent demonstration.
- [x] Verify mentor qualifications and supplied availability.
- [x] Strategy -> proposed skills, rationale, target proficiency, holder count, criticality, effective month.
- [x] Match existing skills; keep new proposals separate until review and ID allocation.
- [x] Use Member 2 for gap calculations, never ask AI to invent scores.
- [x] Suggest internal development, hiring, external support when justified.
- [x] Keep explicit offline fallback; do not label it live AI.
- [x] Reject fabricated IDs/resources/credential URLs.

**Integration:** Member 1 supplies data/catalog and IDs, Member 2 findings, Member 3 direction/skill selection. Reviewed requirements now flow into dated simulations through simulate(scenario.requirements); see API.md. Recommendations never directly update evidence. Provider keys stay in backend environment variables.

**Acceptance:** one at-risk skill yields grounded structured actions; one strategy yields reviewable requirements feeding gaps; no-key mode stays usable. Strategy now returns validated proposals with labeled demo fallback and a reviewed, read-only gap preview. Items 5 and 12 are enforced in `validateDevelopment`, not left to the prompt: mentoring must describe all four knowledge-transfer elements, and the link guard covers bare domains as well as URLs. An invented credential name carrying no domain remains undetectable by pattern and needs human review. A direction matching no keyword template falls back to requirements derived from recorded coverage rather than proposing nothing. See AI-INTEGRATION.md for setup and team handoff. A real provider call still needs configured credentials and model.

**Branch:** feature/ai-recommendations. **Ownership:** recommendations, strategy, provider adapter/prompts, validation tests.
