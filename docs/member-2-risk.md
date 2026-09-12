# Member 2 — risk and Time Machine

**Prompt:** Extend backend/services/risk.js and simulation.js in pure JavaScript/CommonJS. Keep deterministic functions independent of DB, UI, AI. Starter skill scoring and dated departures/interventions are implemented.

- [ ] Add employee Keystone Score using incremental criticality-weighted shortage after removal.
- [ ] Show affected skills and newly uncovered capabilities with each score.
- [ ] Add successor matching against Member 1's role requirements.
- [ ] Distinguish unmet requirements from unknown evidence.
- [ ] Add approved future requirements with effective months.
- [ ] Add mentor capacity and scheduling constraints.
- [ ] Compare baseline/no-intervention/intervention scenarios.
- [ ] Expand tests for arithmetic, timing, unknown data, blocked transfers, and baseline immutability.

**Integration:** preserve analyze(workforce) and simulate(workforce,scenario), or agree on additive changes in docs/API.md. React renders your scores; Matias consumes findings. No assumptions changed must mean no projection change. Never write simulated skill gains to baseline.

**Acceptance:** losing the sole holder removes coverage; verified transfer completed before departure creates a backup; unavailable mentor blocks transfer. Scores measure dependency, not employee departure probability.

**Branch:** feature/risk-simulation. **Ownership:** risk/simulation services and calculation tests.
