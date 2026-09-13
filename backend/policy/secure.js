const { all } = require('../data/db');
const { withTransaction } = require('../data/transactions');
const { recordAudit, auditContext } = require('../data/audit');
const writes = require('../data/workforce-writes');
const queries = require('../data/queries');
const { loadWorkforce } = require('../data/workforce');
const { recordEvidenceAudit, recordCoverageChanges, pickRequirement } = require('../data/change-requests');
const { analyze } = require('../services/risk');
const { evaluateScenario } = require('../services/data-quality');
const { requirePermission } = require('../middleware/auth');
const { validateBody } = require('../validation/ajv');
const schemas = require('../validation/schemas');
const { scopeFor, scopeWorkforce, scopeRisks, scopeEmployeeRisks, scopeSuccession } = require('../security/scope');

// The server's policy for the v1 Keystone routers: permissions are checked before a handler runs,
// responses are narrowed to what the signed-in role may see, and direct writes are audited.
const SHAPERS = { workforce: scopeWorkforce, risks: scopeRisks, employeeRisks: scopeEmployeeRisks, succession: scopeSuccession };

function createSecurePolicy() {
  return {
    guard: requirePermission,

    validate: (schemaName) => validateBody(schemas[schemaName]),

    shape: (req, kind, payload, workforce) => SHAPERS[kind](scopeFor(req.user, workforce), payload),

    // Submitted, not yet approved evidence changes, for scenarios that choose to model them. Only the
    // server supplies these; a client cannot inject provisional evidence into a simulation.
    async provisionalEvidence() {
      const rows = await all(
        `SELECT id, payload_json, target_label FROM change_requests
         WHERE type = 'employee_skill' AND status = 'submitted' AND operation = 'upsert'
         ORDER BY submitted_at, id`,
      );
      const byPair = new Map();
      for (const row of rows) {
        const payload = JSON.parse(row.payload_json);
        byPair.set(`${payload.employeeId}:${payload.skillId}`, {
          changeRequestId: row.id, employeeId: payload.employeeId, skillId: payload.skillId, proficiency: payload.proficiency, label: row.target_label,
        });
      }
      return [...byPair.values()];
    },

    decorateSimulation: (_req, result, scenario, workforce) => ({
      ...result,
      scenarioWarnings: evaluateScenario(workforce, {
        id: 'current',
        name: 'This scenario',
        departures: Array.isArray(scenario.departures) ? scenario.departures : [],
        interventions: Array.isArray(scenario.interventions) ? scenario.interventions : [],
      }),
    }),

    async saveEmployeeSkill(req, body) {
      const evidence = await queries.validateEmployeeSkillEdit(body);
      return withTransaction(async () => {
        const before = await writes.getEvidence(evidence.employeeId, evidence.skillId);
        const riskBefore = analyze(await loadWorkforce());
        await queries.writeEmployeeSkill(evidence);
        const stored = await writes.getEvidence(evidence.employeeId, evidence.skillId);
        const ctx = auditContext(req);
        await recordEvidenceAudit(before, evidence, `${stored.employeeName} · ${stored.skillName}`, ctx, { direct: true });
        await recordCoverageChanges(riskBefore, analyze(await loadWorkforce()), ctx, { direct: true });
        return evidence;
      });
    },

    async addFutureRequirement(req, body) {
      const validated = queries.validateFutureRequirementInput(body);
      return withTransaction(async () => {
        const created = await queries.insertFutureRequirement(validated);
        const approved = created.status === 'reviewed';
        await recordAudit({
          ...auditContext(req),
          action: approved ? 'future_requirement.approved' : 'future_requirement.created',
          entityType: 'future_requirement', entityId: created.id, entityLabel: created.skillName,
          summary: `${req.user.displayName} ${approved ? 'added an approved' : 'proposed a'} ${created.skillName} requirement: ${created.requiredHolders} people at level ${created.targetProficiency}+ from month ${created.effectiveMonth}`,
          after: pickRequirement(created), metadata: { direct: true, createdSkill: created.createdSkill },
        });
        return created;
      });
    },
  };
}

module.exports = { createSecurePolicy };
