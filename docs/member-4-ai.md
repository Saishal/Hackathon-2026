# Matias — AI recommendations and future strategy

**Prompt:** Build two modes behind backend/services/recommendations.js: development plans for current risks and future skill proposals for strategic direction. Use JavaScript/CommonJS with a server-side provider adapter. No AI SDK is installed in this JavaScript foundation yet; choose OpenAI or Anthropic and add its SDK/lockfile. The earlier Python prototype is separate.

- [ ] Add provider configuration, timeouts, bounded retries, local output validation.
- [ ] Ground output in employee/skill IDs, evidence, risks, and verified catalog.
- [ ] Cover training, mentoring, certifications, rotations, project experience; mark unsupported categories not applicable.
- [ ] Include rationale, target proficiency, estimated duration, milestone, verification method, assumptions.
- [ ] Knowledge transfer: documentation, shadowing, practice, independent demonstration.
- [ ] Verify mentor qualifications and supplied availability.
- [ ] Strategy -> proposed skills, rationale, target proficiency, holder count, criticality, effective month.
- [ ] Match existing skills; keep new proposals separate until review and ID allocation.
- [ ] Use Member 2 for gap calculations, never ask AI to invent scores.
- [ ] Suggest internal development, hiring, external support when justified.
- [ ] Keep explicit offline fallback; do not label it live AI.
- [ ] Reject fabricated IDs/resources/credential URLs.

**Integration:** Member 1 supplies data/catalog and IDs, Member 2 findings, Member 3 direction/skill selection. Reviewed requirements flow into dated simulations. Recommendations never directly update evidence. Provider keys stay in backend environment variables.

**Acceptance:** one at-risk skill yields grounded structured actions; one strategy yields reviewable requirements feeding gaps; no-key mode stays usable. Current strategy reports not-configured intentionally—replace only when validated proposals work.

**Branch:** feature/ai-recommendations. **Ownership:** recommendations, strategy, provider adapter/prompts, validation tests.
