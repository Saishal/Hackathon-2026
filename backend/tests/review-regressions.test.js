const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { normalizeName } = require('../services/skill-identity');
const { simulate } = require('../services/simulation');
const { normalizeRequirements } = require('../services/ai/grounding');
const { previewRequirements } = require('../services/ai/strategy-preview');
const { createRecommendationService } = require('../services/recommendations');
const { createProvider } = require('../services/ai/provider');
const { developmentFallback } = require('../services/ai/fallbacks');
const { developmentContext } = require('../services/ai/grounding');
const { analyze } = require('../services/risk');
const routes = require('../routes/keystone');

const workforce = () => ({
  employees: [{ id: 1, mentoringHoursPerMonth: 4 }, { id: 2 }, { id: 3 }, { id: 4 }],
  skills: [{ id: 1, name: 'C#', criticality: 5, requiredHolders: 2, targetProficiency: 3 }],
  matrix: [{ employeeId: 1, skillId: 1, proficiency: 5 }, { employeeId: 2, skillId: 1, proficiency: 2 }],
});
const requirement = (overrides = {}) => ({ skillId: null, skillName: 'C++', targetProficiency: 3,
  requiredHolders: 2, criticality: 5, effectiveMonth: 12, rationale: 'Build the proposed capability.',
  sourcing: 'build', sourcingRationale: 'Assess internal development capacity.', assumptions: ['Review scope.'], ...overrides });
const engagement = (employeeId, startMonth, completionMonth) => ({ employeeId, skillId: 1,
  mentorId: 1, startMonth, completionMonth, targetProficiency: 3, assumeVerified: true });
const demo = () => createRecommendationService({ provider: createProvider({ env: {} }) });
const liveMock = (payload) => createRecommendationService({ provider: {
  status: { configured: true, provider: 'mock', model: 'test' }, generate: async () => payload,
} });

test('C, C++, C# and F# remain distinct; known aliases still resolve', () => {
  assert.equal(new Set(['C', 'C++', 'C#', 'F#'].map(normalizeName)).size, 4);
  assert.equal(normalizeName('  NODE   JS '), normalizeName('Node.js'));
  assert.equal(normalizeName('ML'), normalizeName('Machine Learning'));
  assert.equal(normalizeName('e-commerce operations'), normalizeName('E commerce operations'));
  assert.notEqual(normalizeName('Node'), normalizeName('Node.js'));
});

test('a C++ requirement cannot borrow C# coverage in either scenario path', () => {
  const data = workforce();
  data.matrix[1].proficiency = 5;
  const before = JSON.stringify(data);
  const req = requirement();
  const preview = previewRequirements(data, { reviewed: true, horizonMonths: 12, requirements: [req] });
  assert.equal(preview.requirements[0].skillId, null);
  assert.equal(preview.requirements[0].skillName, 'C++');
  assert.equal(preview.requirements[0].coverage.recordedQualifiedHolders, 0);
  assert.equal(preview.requirements[0].coverage.gap, 2);
  const result = simulate(data, { horizonMonths: 12, requirements: [req] });
  assert.equal(result.projected.skills.find((skill) => skill.name === 'C++').busFactor, 0);
  assert.equal(result.projected.skills.find((skill) => skill.name === 'C#').busFactor, 2);
  assert.equal(JSON.stringify(data), before);
});

test('C++ and C# can both appear in one proposal without a duplicate error', () => {
  const result = normalizeRequirements({ requirements: [requirement(), requirement({ skillId: 1, skillName: 'C#' })] }, workforce());
  assert.deepEqual(result.map((item) => item.skillId), [null, 1]);
});

test('a long engagement spanning separate bookings fits two concurrent slots', () => {
  const data = workforce();
  const before = JSON.stringify(data);
  const result = simulate(data, { horizonMonths: 12, interventions: [engagement(2, 0, 3), engagement(3, 4, 6), engagement(4, 0, 9)] });
  assert.deepEqual(result.blocked, []);
  assert.equal(result.projected.skills[0].busFactor, 4);
  assert.equal(JSON.stringify(data), before);
});

test('actual triple occupancy remains blocked and endpoints remain inclusive', () => {
  const overlapping = simulate(workforce(), { horizonMonths: 12,
    interventions: [engagement(2, 0, 5), engagement(3, 4, 6), engagement(4, 0, 9)] });
  assert.equal(overlapping.blocked.length, 1);
  const data = workforce(); data.employees[0].mentoringHoursPerMonth = 2;
  assert.equal(simulate(data, { horizonMonths: 12, interventions: [engagement(2, 0, 3), engagement(3, 3, 6)] }).blocked.length, 1);
  assert.equal(simulate(data, { horizonMonths: 12, interventions: [engagement(2, 0, 3), engagement(3, 4, 6)] }).blocked.length, 0);
});

test('simulation rejects unknown IDs and conflicting ID/name pairs before changing data', () => {
  const data = workforce(); const before = JSON.stringify(data);
  for (const req of [requirement({ skillId: 999 }), requirement({ skillId: 1 }), requirement({ skillId: 1, skillName: '' }),
    requirement({ skillId: 999, effectiveMonth: 60 })]) {
    assert.throws(() => simulate(data, { horizonMonths: 12, requirements: [req] }), { status: 400 });
  }
  assert.equal(JSON.stringify(data), before);
});

test('known aliases resolve identically in preview and simulation and reject duplicates', () => {
  const data = workforce(); data.skills[0].name = 'Node.js';
  const req = requirement({ skillName: ' node js ' });
  const simulated = simulate(data, { horizonMonths: 12, requirements: [req] });
  const previewed = previewRequirements(data, { reviewed: true, horizonMonths: 12, requirements: [req] });
  assert.equal(simulated.projected.skills.length, 1);
  assert.equal(simulated.requirementsApplied[0].skillId, 1);
  assert.equal(simulated.projected.skills[0].gap, previewed.requirements[0].coverage.gap);
  assert.throws(() => simulate(data, { horizonMonths: 12, requirements: [req, requirement({ skillId: 1, skillName: 'Node.js' })] }), { status: 400 });
  assert.throws(() => normalizeRequirements({ requirements: [req, requirement({ skillId: 1, skillName: 'Node.js' })] }, data));
});

test('legacy requirement with an existing ID and no name remains supported', () => {
  const req = requirement({ skillId: 1 }); delete req.skillName;
  assert.equal(simulate(workforce(), { horizonMonths: 12, requirements: [req] }).requirementsApplied[0].skillName, 'C#');
});

test('ASP.NET Core is accepted as a new skill and as an existing skill in prose', async () => {
  const data = workforce();
  const req = requirement({ skillName: 'ASP.NET Core', rationale: 'Build web services with ASP.NET Core.' });
  assert.equal(normalizeRequirements({ requirements: [req] }, data)[0].skillId, null);
  data.skills[0].name = 'ASP.NET Core';
  assert.equal(normalizeRequirements({ requirements: [req] }, data)[0].skillId, 1);
  const result = await liveMock({ requirements: [req] }).proposeStrategy('Refresh the internal wiki', data);
  assert.equal(result.mode, 'live-ai');
  assert.equal(result.requirements[0].skillId, 1);
  const offline = await demo().proposeStrategy('Refresh the internal wiki', data);
  assert.equal(offline.fallbackReason, 'missing_api_key');
  assert.equal(offline.requirements[0].skillName, 'ASP.NET Core');
});

test('resource link validation checks prose, not verified resource IDs', async () => {
  const data = workforce(); data.skills[0].name = 'ASP.NET Core';
  data.learningResources = [{ id: 'internal.assessment.org', title: 'Internal assessment', category: 'certification', skillIds: [1], verified: true }];
  const context = developmentContext(data, data.skills[0], analyze(data));
  const payload = developmentFallback(context);
  payload.actions[0].action = 'Complete supervised ASP.NET Core exercises.';
  const result = await liveMock(payload).recommend(data, 1);
  assert.equal(result.mode, 'live-ai');
  assert.equal(result.actions.find((action) => action.category === 'certification').resourceId, 'internal.assessment.org');
});

test('dotted catalog identifiers are allowed but URLs and deceptive domains are rejected', () => {
  const data = workforce(); data.skills[0].name = 'Acme.IO Integration';
  assert.equal(normalizeRequirements({ requirements: [requirement({ skillName: 'Acme.IO Integration', rationale: 'Practice Acme.IO integration.' })] }, data)[0].skillId, 1);
  for (const rationale of ['Enroll at billingcert.com.', 'Visit https://asp.net/course.', 'Visit www.asp.net.', 'Enroll at asp.net.evil.com.']) {
    assert.throws(() => normalizeRequirements({ requirements: [requirement({ skillName: 'ASP.NET Core', rationale })] }, data), /Unverified generated URL/);
  }
});

test('an invalid strategy fallback produces an explicit empty result instead of throwing', async () => {
  const data = workforce(); data.skills[0].name = 'x'.repeat(101);
  const result = await demo().proposeStrategy('Refresh the internal wiki', data);
  assert.equal(result.mode, 'demo-fallback'); assert.equal(result.fallbackReason, 'fallback_invalid');
  assert.deepEqual(result.requirements, []); assert.match(result.message, /No validated skill requirements/);
});

test('an invalid development fallback produces unassigned inactive actions', async () => {
  const data = workforce();
  data.learningResources = [{ id: 'x'.repeat(101), title: 'Internal assessment', category: 'certification', skillIds: [1], verified: true }];
  const result = await demo().recommend(data, 1);
  assert.equal(result.fallbackReason, 'fallback_invalid');
  assert.ok(result.actions.every((action) => action.status === 'not_applicable' && action.employeeId === null && action.resourceId === null));
});

test('HTTP simulation rejects bad skill references and strategy fallback errors stay recoverable', async (t) => {
  const data = workforce(); data.skills[0].name = 'ASP.NET Core';
  const app = express(); app.use(express.json()); app.use('/api/keystone', routes(async () => structuredClone(data), demo()));
  app.use((error, _req, res, _next) => res.status(error.status || 500).json({ error: error.message }));
  const server = await new Promise((resolve) => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const post = (path, body) => fetch(`http://127.0.0.1:${server.address().port}/api/keystone/${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const invalid = await post('simulate', { horizonMonths: 12, requirements: [requirement({ skillId: 999 })] });
  assert.equal(invalid.status, 400); assert.match((await invalid.json()).error, /Unknown skill ID/);
  const valid = await post('strategy', { direction: 'Refresh the internal wiki' });
  assert.equal(valid.status, 200); assert.equal((await valid.json()).requirements[0].skillName, 'ASP.NET Core');
  data.skills[0].name = 'x'.repeat(101);
  const recovery = await post('strategy', { direction: 'Refresh the internal wiki' });
  assert.equal(recovery.status, 200); assert.equal((await recovery.json()).fallbackReason, 'fallback_invalid');
});
