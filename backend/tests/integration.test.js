const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// Parts 1, 2 and 4 together on the database seeded from the CSV demo dataset, rather than
// on hand-built fixtures. A change to the dataset, data layer, risk services or AI layer
// that breaks the demo story fails here.
const DB_FILE = path.join(os.tmpdir(), `keystone-integration-test-${process.pid}.db`);
fs.rmSync(DB_FILE, { force: true });
process.env.DB_PATH = DB_FILE;

const data = require('../data');
const { analyze, analyzeEmployees, analyzeSuccession } = require('../services/risk');
const { simulate } = require('../services/simulation');
const { createRecommendationService } = require('../services/recommendations');
const { createProvider } = require('../services/ai/provider');

const ai = createRecommendationService({ provider: createProvider({ env: { KEYSTONE_AI_PROVIDER: 'demo' } }) });
const ready = data.initializeDatabase();

test.after(() => {
  data.db.close();
});

const named = (list, name) => list.find((entry) => entry.name === name);

test('risk analysis finds the Legacy Billing Recovery dependency in the seeded data', async () => {
  await ready;
  const workforce = await data.loadWorkforce();
  const liam = named(workforce.employees, 'Liam Chen');
  const billing = named(analyze(workforce).skills, 'Legacy Billing Recovery');

  assert.equal(billing.busFactor, 1);
  assert.deepEqual(billing.holderIds, [liam.id]);

  const liamRisk = analyzeEmployees(workforce).employees.find((employee) => employee.id === liam.id);
  assert.ok(liamRisk.newlyUncovered.includes('Legacy Billing Recovery'));
});

test('succession compares candidates with the CSV role requirements', async () => {
  await ready;
  const workforce = await data.loadWorkforce();
  const succession = analyzeSuccession(workforce);

  assert.equal(succession.roles.length, workforce.roles.length);

  const backend = named(succession.roles, 'Backend Engineer');
  assert.equal(backend.requirementCount, 5);
  assert.equal(backend.incumbents.length, 5);

  // Nobody holds AI Governance at 3, so no one outside the role can step into it.
  assert.equal(named(succession.roles, 'AI Specialist').readyNonIncumbents, 0);
});

test('Time Machine: Liam leaving in month 9 uncovers billing unless Mason is mentored by month 6', async () => {
  await ready;
  const workforce = await data.loadWorkforce();
  const liam = named(workforce.employees, 'Liam Chen');
  const mason = named(workforce.employees, 'Mason Green');
  const billing = named(workforce.skills, 'Legacy Billing Recovery');
  const scenario = {
    horizonMonths: 12,
    departures: [{ employeeId: liam.id, month: 9 }],
    interventions: [{
      employeeId: mason.id, skillId: billing.id, mentorId: liam.id, completionMonth: 6, targetProficiency: 3, assumeVerified: true,
    }],
  };

  const result = simulate(workforce, scenario);

  assert.deepEqual(result.blocked, []);
  assert.equal(named(result.baseline.skills, billing.name).busFactor, 1);
  assert.equal(named(result.noIntervention.skills, billing.name).busFactor, 0);
  assert.equal(named(result.projected.skills, billing.name).busFactor, 1);
});

test('a development plan uses only seeded people and verified catalogue entries for the skill', async () => {
  await ready;
  const workforce = await data.loadWorkforce();
  const billing = named(workforce.skills, 'Legacy Billing Recovery');
  const employeeIds = new Set(workforce.employees.map((employee) => employee.id));
  const catalogue = new Map(workforce.learningResources.map((resource) => [resource.id, resource]));

  const plan = await ai.recommend(workforce, billing.id);
  const applicable = plan.actions.filter((action) => action.status !== 'not_applicable');

  assert.equal(plan.mode, 'demo-fallback');
  assert.ok(applicable.length > 0);

  for (const action of applicable) {
    assert.ok(employeeIds.has(action.employeeId));

    if (action.mentorId !== null) {
      assert.equal(action.mentorId, named(workforce.employees, 'Liam Chen').id);
    }

    if (action.resourceId !== null) {
      assert.equal(catalogue.get(action.resourceId)?.verified, true);
      assert.ok(catalogue.get(action.resourceId).skillIds.includes(billing.id));
    }
  }

  assert.equal(plan.actions.find((action) => action.category === 'certification').resourceId, 'cert-billing-recovery');
});

test('a reviewed strategy proposal is saved and applied by Time Machine at its effective month', async () => {
  await ready;
  const proposal = await ai.proposeStrategy('We are expanding into e-commerce', await data.loadWorkforce());
  const forecast = named(proposal.requirements.map((requirement) => ({ ...requirement, name: requirement.skillName })), 'E-commerce Operations');

  assert.equal(proposal.mode, 'demo-fallback');
  assert.equal(forecast.skillId, null);
  // Time Machine horizons are 0, 12, 36 or 60 months, so month 12 is checked against today.
  assert.equal(forecast.effectiveMonth, 12);

  const saved = await data.addFutureRequirement({
    skillName: forecast.skillName,
    requiredHolders: forecast.requiredHolders,
    targetProficiency: forecast.targetProficiency,
    criticality: forecast.criticality,
    effectiveMonth: forecast.effectiveMonth,
    status: 'reviewed',
    provenance: 'Reviewed e-commerce strategy proposal',
  });
  const workforce = await data.loadWorkforce();

  assert.equal(workforce.skills.some((skill) => skill.id === saved.skillId), false, 'a forecast skill is not in today\'s inventory');

  const early = simulate(workforce, { horizonMonths: 0 });
  const due = simulate(workforce, { horizonMonths: forecast.effectiveMonth });

  assert.equal(early.projected.skills.some((skill) => skill.id === saved.skillId), false);
  assert.equal(due.requirementsSource, 'persisted-reviewed');
  assert.equal(due.projected.skills.find((skill) => skill.id === saved.skillId).gap, forecast.requiredHolders);
  assert.equal(due.baseline.skills.some((skill) => skill.id === saved.skillId), false);
});

test('restarting keeps a saved forecast skill\'s reviewed values for when evidence promotes it', async () => {
  await ready;
  const saved = await data.addFutureRequirement({
    skillName: 'Marketplace Integrations',
    requiredHolders: 2,
    targetProficiency: 4,
    criticality: 5,
    effectiveMonth: 6,
    status: 'reviewed',
    provenance: 'Reviewed strategy proposal',
  });

  await data.initializeDatabase();

  const [employee] = (await data.loadWorkforce()).employees;
  await data.saveEmployeeSkill({
    employeeId: employee.id,
    skillId: saved.skillId,
    proficiency: 4,
    evidenceSource: 'Project delivery review',
    lastVerifiedAt: '2026-09-01',
  });

  const promoted = (await data.loadWorkforce()).skills.find((skill) => skill.id === saved.skillId);
  assert.equal(promoted.criticality, 5);
  assert.equal(promoted.targetProficiency, 4);
  assert.equal(promoted.metadataSource, 'promoted from recorded evidence');
});
