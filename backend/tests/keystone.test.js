const test = require('node:test');
const assert = require('node:assert/strict');
const { analyze } = require('../services/risk');
const { simulate } = require('../services/simulation');
const { createRecommendationService } = require('../services/recommendations');
const { createProvider } = require('../services/ai/provider');
const { recommend, proposeStrategy } = createRecommendationService({ provider: createProvider({ env: { KEYSTONE_AI_PROVIDER: 'demo' } }) });
const workforce = { employees: [{ id: 1 }, { id: 2 }], skills: [{ id: 1, name: 'Billing', criticality: 5, requiredHolders: 2, targetProficiency: 3 }],
  matrix: [{ employeeId: 1, skillId: 1, proficiency: 5 }, { employeeId: 2, skillId: 1, proficiency: 2 }] };
test('single-holder score has explainable arithmetic', () => {
  assert.equal(analyze(workforce).skills[0].keystoneScore, 80);
  assert.equal(analyze(workforce).skills[0].busFactor, 1);
});
test('verified mentoring before departure establishes backup without mutating baseline', () => {
  const before = JSON.stringify(workforce);
  const result = simulate(workforce, { horizonMonths: 12, departures: [{ employeeId: 1, month: 9 }],
    interventions: [{ employeeId: 2, skillId: 1, mentorId: 1, completionMonth: 6, targetProficiency: 3, assumeVerified: true }] });
  assert.equal(result.noIntervention.skills[0].busFactor, 0);
  assert.equal(result.projected.skills[0].busFactor, 1);
  assert.equal(JSON.stringify(workforce), before);
});
test('mentor departure blocks transfer', () => {
  const result = simulate(workforce, { horizonMonths: 12, departures: [{ employeeId: 1, month: 3 }],
    interventions: [{ employeeId: 2, skillId: 1, mentorId: 1, completionMonth: 6, targetProficiency: 3, assumeVerified: true }] });
  assert.equal(result.blocked.length, 1);
  assert.equal(result.projected.skills[0].busFactor, 0);
});
test('unverified or future learning does not change coverage', () => {
  for (const [completionMonth, assumeVerified] of [[6, false], [24, true]]) {
    assert.equal(simulate(workforce, { horizonMonths: 12, interventions: [{ employeeId: 2, skillId: 1, completionMonth, assumeVerified, targetProficiency: 3 }] }).projected.skills[0].busFactor, 1);
  }
});
test('unchanged assumptions produce unchanged projections', () => {
  assert.deepEqual(simulate(workforce, { horizonMonths: 60 }).baseline, simulate(workforce, { horizonMonths: 60 }).projected);
});
test('invalid inputs fail with a client error', async () => {
  assert.throws(() => simulate(workforce, { horizonMonths: 12, departures: [{ employeeId: 999, month: 1 }] }), { status: 400 });
  await assert.rejects(() => recommend(workforce, 999), { status: 400 });
  await assert.rejects(() => proposeStrategy(''), { status: 400 });
});
test('recommendations and strategy disclose their deterministic fallbacks', async () => {
  assert.equal((await recommend(workforce, 1)).actions.length, 5);
  assert.equal((await recommend(workforce, 1)).mode, 'demo-fallback');
  assert.equal((await proposeStrategy('Automate production')).mode, 'demo-fallback');
});

const { analyzeEmployees } = require('../services/risk');
const succession = {
  employees: [{ id: 1, name: 'Sole expert' }, { id: 2, name: 'Learner' }, { id: 3, name: 'Uninvolved' }],
  skills: [{ id: 1, name: 'Billing', criticality: 5, requiredHolders: 2, targetProficiency: 3 },
    { id: 2, name: 'Shared', criticality: 3, requiredHolders: 2, targetProficiency: 3 }],
  matrix: [{ employeeId: 1, skillId: 1, proficiency: 5 }, { employeeId: 2, skillId: 1, proficiency: 2 },
    { employeeId: 1, skillId: 2, proficiency: 4 }, { employeeId: 3, skillId: 2, proficiency: 4 }],
};
test('employee score is the incremental weighted shortage of removing recorded coverage', () => {
  const { employees } = analyzeEmployees(succession);
  const expert = employees.find((employee) => employee.id === 1);
  // Billing: sole holder, 0.6 + 0.4*(2-1)/2 = 0.8, weighted 5/5 -> 0.8
  // Shared:  2 holders -> 1, no uncovering, 0.4*(1-0)/2 = 0.2, weighted 3/5 -> 0.12
  assert.equal(expert.keystoneScore, 92);
  assert.equal(expert.capped, false);
  assert.deepEqual(expert.newlyUncovered, ['Billing']);
});
test('an employee nothing depends on scores zero and is not invented into a risk', () => {
  const learner = analyzeEmployees(succession).employees.find((employee) => employee.id === 2);
  assert.equal(learner.keystoneScore, 0);
  assert.equal(learner.recordedSkills, 0);
  assert.match(learner.explanation, /No skill currently depends on this person/);
});
test('successors are ranked and classified against the target, never invented', () => {
  const expert = analyzeEmployees(succession).employees.find((employee) => employee.id === 1);
  const billing = expert.affectedSkills.find((skill) => skill.name === 'Billing');
  assert.deepEqual(billing.successors, [{ employeeId: 2, name: 'Learner', proficiency: 2, shortfall: 1, status: 'developable' }]);
  const shared = expert.affectedSkills.find((skill) => skill.name === 'Shared');
  assert.equal(shared.successors[0].status, 'ready');
  assert.equal(shared.becomesUncovered, false);
});
test('missing successor evidence is reported as unknown, not as nobody capable', () => {
  const lonely = { ...succession, matrix: succession.matrix.filter((edge) => !(edge.skillId === 1 && edge.employeeId === 2)) };
  const billing = analyzeEmployees(lonely).employees.find((employee) => employee.id === 1)
    .affectedSkills.find((skill) => skill.name === 'Billing');
  assert.deepEqual(billing.successors, []);
  assert.match(analyzeEmployees(lonely).methodology, /no evidence on file, never proof that nobody else is capable/);
});
test('employee scoring never mutates the workforce and ranks the keystone first', () => {
  const before = JSON.stringify(succession);
  const { employees, soleCoverageHolders } = analyzeEmployees(succession);
  assert.equal(employees[0].id, 1);
  assert.equal(soleCoverageHolders, 1);
  assert.equal(JSON.stringify(succession), before);
});
