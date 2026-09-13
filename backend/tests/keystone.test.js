const test = require('node:test');
const assert = require('node:assert/strict');
const { analyze, analyzeEmployees, analyzeSuccession } = require('../services/risk');
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

const succession = {
  employees: [{ id: 1, name: 'Sole expert', role: 'Billing Lead' }, { id: 2, name: 'Learner', role: 'Analyst' },
    { id: 3, name: 'Uninvolved', role: 'Analyst' }],
  skills: [{ id: 1, name: 'Billing', criticality: 5, requiredHolders: 2, targetProficiency: 3 },
    { id: 2, name: 'Shared', criticality: 3, requiredHolders: 2, targetProficiency: 3 }],
  matrix: [{ employeeId: 1, skillId: 1, proficiency: 5 }, { employeeId: 2, skillId: 1, proficiency: 2 },
    { employeeId: 1, skillId: 2, proficiency: 4 }, { employeeId: 3, skillId: 2, proficiency: 4 }],
  roles: [{ id: 1, name: 'Billing Lead', criticality: 5, incumbentIds: [1],
    requirements: [{ skillId: 1, minimumProficiency: 2 }] }],
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
test('skill backups are ranked against the skill target, never invented', () => {
  const expert = analyzeEmployees(succession).employees.find((employee) => employee.id === 1);
  const billing = expert.affectedSkills.find((skill) => skill.name === 'Billing');
  assert.deepEqual(billing.skillBackups, [{ employeeId: 2, name: 'Learner', proficiency: 2, shortfall: 1, status: 'developable' }]);
  const shared = expert.affectedSkills.find((skill) => skill.name === 'Shared');
  assert.equal(shared.skillBackups[0].status, 'ready');
  assert.equal(shared.becomesUncovered, false);
});
test('missing backup evidence is reported as unknown, not as nobody capable', () => {
  const lonely = { ...succession, matrix: succession.matrix.filter((edge) => !(edge.skillId === 1 && edge.employeeId === 2)) };
  const billing = analyzeEmployees(lonely).employees.find((employee) => employee.id === 1)
    .affectedSkills.find((skill) => skill.name === 'Billing');
  assert.deepEqual(billing.skillBackups, []);
  assert.match(analyzeEmployees(lonely).methodology, /Missing skill evidence stays unknown, never proof that nobody else is capable/);
});
test('successor readiness uses persisted role requirements instead of the skill target stand-in', () => {
  const expert = analyzeEmployees(succession).employees.find((employee) => employee.id === 1);
  assert.equal(expert.successionRole.name, 'Billing Lead');
  assert.equal(expert.successors[0].employeeId, 2);
  assert.equal(expert.successors[0].status, 'ready');
  assert.equal(expert.successors[0].requirements[0].minimumProficiency, 2);
  assert.equal(expert.successors[0].requirements[0].recordedProficiency, 2);

  const roles = analyzeSuccession(succession);
  assert.equal(roles.roles[0].incumbents[0].candidates[0].employeeId, 2);
  assert.equal(roles.roles[0].readyNonIncumbents, 1);
});
test('employee scoring never mutates the workforce and ranks the keystone first', () => {
  const before = JSON.stringify(succession);
  const { employees, soleCoverageHolders } = analyzeEmployees(succession);
  assert.equal(employees[0].id, 1);
  assert.equal(soleCoverageHolders, 1);
  assert.equal(JSON.stringify(succession), before);
});

const capacity = {
  employees: [{ id: 1, name: 'Mentor', mentoringHoursPerMonth: 4 }, { id: 2, name: 'Learner A' },
    { id: 3, name: 'Learner B' }, { id: 4, name: 'Learner C' },
    { id: 5, name: 'Unrecorded capacity' }, { id: 6, name: 'Part hour', mentoringHoursPerMonth: 1 }],
  skills: [1, 2, 3].map((id) => ({ id, name: `S${id}`, criticality: 3, requiredHolders: 3, targetProficiency: 3 })),
  matrix: [{ employeeId: 1, skillId: 1, proficiency: 5 }, { employeeId: 1, skillId: 2, proficiency: 5 },
    { employeeId: 1, skillId: 3, proficiency: 5 }, { employeeId: 5, skillId: 1, proficiency: 5 },
    { employeeId: 6, skillId: 2, proficiency: 5 }],
};
const engage = (employeeId, skillId, mentorId, startMonth, completionMonth) =>
  ({ employeeId, skillId, mentorId, startMonth, completionMonth, targetProficiency: 3, assumeVerified: true });

test('recorded mentor capacity limits concurrent engagements', () => {
  const result = simulate(capacity, { horizonMonths: 12, interventions: [
    engage(2, 1, 1, 0, 6), engage(3, 2, 1, 0, 6), engage(4, 3, 1, 0, 6)] });
  assert.equal(result.blocked.length, 1);
  assert.equal(result.blocked[0].employeeId, 4);
  assert.match(result.blocked[0].reason, /capacity exceeded: 4 recorded hours per month supports 2 concurrent/);
});
test('engagements that do not overlap do not consume capacity at the same time', () => {
  const result = simulate(capacity, { horizonMonths: 36, interventions: [
    engage(2, 1, 1, 0, 6), engage(3, 2, 1, 0, 6), engage(4, 3, 1, 7, 12)] });
  assert.deepEqual(result.blocked, []);
});
test('a mentor below one engagement of capacity is blocked, not silently scheduled', () => {
  const result = simulate(capacity, { horizonMonths: 12, interventions: [engage(2, 2, 6, 0, 6)] });
  assert.equal(result.blocked.length, 1);
  assert.match(result.blocked[0].reason, /1 recorded hours per month, below one engagement/);
});
test('unknown mentor capacity warns rather than blocks, and is never called verified', () => {
  const result = simulate(capacity, { horizonMonths: 12, interventions: [engage(2, 1, 5, 0, 6)] });
  assert.deepEqual(result.blocked, []);
  assert.equal(result.capacityWarnings.length, 1);
  assert.match(result.capacityWarnings[0].warning, /no recorded monthly capacity.*unverified assumption/);
});
test('approved future requirements apply at their effective month and never to baseline', () => {
  const raise = { skillId: 1, targetProficiency: 3, requiredHolders: 9, criticality: 4, effectiveMonth: 12 };
  const due = simulate(capacity, { horizonMonths: 12, requirements: [raise] });
  assert.equal(due.baseline.skills.find((skill) => skill.id === 1).requiredHolders, 3);
  assert.equal(due.projected.skills.find((skill) => skill.id === 1).requiredHolders, 9);
  assert.equal(due.requirementsApplied.length, 1);
  const notYet = simulate(capacity, { horizonMonths: 12, requirements: [{ ...raise, effectiveMonth: 36 }] });
  assert.equal(notYet.projected.skills.find((skill) => skill.id === 1).requiredHolders, 3);
  assert.deepEqual(notYet.requirementsApplied, []);
});
test('persisted requirements use the latest reviewed value due at the selected horizon', () => {
  const data = { ...capacity, futureRequirements: [
    { id: 1, skillId: 1, skillName: 'S1', targetProficiency: 3, requiredHolders: 99, criticality: 5, effectiveMonth: 0, status: 'proposed' },
    { id: 2, skillId: 1, skillName: 'S1', targetProficiency: 3, requiredHolders: 5, criticality: 4, effectiveMonth: 12, status: 'reviewed' },
    { id: 3, skillId: 1, skillName: 'S1', targetProficiency: 3, requiredHolders: 7, criticality: 4, effectiveMonth: 36, status: 'reviewed' },
  ] };
  assert.equal(simulate(data, { horizonMonths: 12 }).projected.skills.find((skill) => skill.id === 1).requiredHolders, 5);
  assert.equal(simulate(data, { horizonMonths: 60 }).projected.skills.find((skill) => skill.id === 1).requiredHolders, 7);
  assert.equal(simulate(data, { horizonMonths: 60, requirements: [] }).projected.skills.find((skill) => skill.id === 1).requiredHolders, 3);
});
test('a new future skill enters the scenario with a provisional ID and no recorded coverage', () => {
  const result = simulate(capacity, { horizonMonths: 12, requirements: [
    { skillId: null, skillName: 'Quantum Readiness', targetProficiency: 3, requiredHolders: 2, criticality: 5, effectiveMonth: 0 }] });
  const added = result.projected.skills.find((skill) => skill.name === 'Quantum Readiness');
  assert.ok(added.id < 0, 'provisional IDs are scenario-only and negative');
  assert.equal(added.busFactor, 0);
  assert.equal(added.gap, 2);
  assert.equal(result.requirementsApplied[0].isNewSkill, true);
  assert.equal(result.baseline.skills.some((skill) => skill.name === 'Quantum Readiness'), false);
  assert.equal(capacity.skills.length, 3, 'the caller\'s workforce is never mutated');
});
test('malformed future requirements fail with a client error', () => {
  for (const bad of [{ skillId: 1, targetProficiency: 9, requiredHolders: 2, criticality: 3, effectiveMonth: 0 },
    { skillId: null, targetProficiency: 3, requiredHolders: 2, criticality: 3, effectiveMonth: 0 },
    { skillId: 1, targetProficiency: 3, requiredHolders: 0, criticality: 3, effectiveMonth: 0 },
    { skillId: 1, targetProficiency: 3, requiredHolders: 2, criticality: 3, effectiveMonth: 99 }]) {
    assert.throws(() => simulate(capacity, { horizonMonths: 12, requirements: [bad] }), { status: 400 });
  }
});
