// Policy used when the Keystone routers are mounted without the application shell, as the router unit
// tests and scripts do: no authentication, no scoping and no database side effects, so behaviour matches
// the v1 routers exactly. The server always mounts them with policy/secure.js instead.
module.exports = {
  guard: () => (_req, _res, next) => next(),
  shape: (_req, _kind, payload) => payload,
  provisionalEvidence: async () => [],
  decorateSimulation: (_req, result) => result,
  saveEmployeeSkill: null,
  addFutureRequirement: null,
};
