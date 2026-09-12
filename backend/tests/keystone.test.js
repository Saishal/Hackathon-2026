const test = require('node:test');
const assert = require('node:assert/strict');
const { analyze } = require('../services/risk');
const { simulate } = require('../services/simulation');
const { recommend, proposeStrategy } = require('../services/recommendations');
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
test('invalid inputs fail with a client error', () => {
  assert.throws(() => simulate(workforce, { horizonMonths: 12, departures: [{ employeeId: 999, month: 1 }] }), { status: 400 });
  assert.throws(() => recommend(workforce, 999), { status: 400 });
  assert.throws(() => proposeStrategy(''), { status: 400 });
});
test('recommendations disclose fallback and strategy does not pretend to forecast', () => {
  assert.equal(recommend(workforce, 1).actions.length, 5);
  assert.equal(recommend(workforce, 1).mode, 'demo-fallback');
  assert.equal(proposeStrategy('Automate production').mode, 'not-configured');
});
