const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const OpenAI = require('openai');
const { createRecommendationService } = require('../services/recommendations');
const { createProvider, ProviderFailure } = require('../services/ai/provider');
const { developmentContext, normalizeRequirements } = require('../services/ai/grounding');
const { developmentFallback, strategyFallback, coverageFallback } = require('../services/ai/fallbacks');
const { previewRequirements } = require('../services/ai/strategy-preview');
const { analyze } = require('../services/risk');
const { developmentSchema } = require('../services/ai/schemas');
const workforce = {
  employees: [{ id: 1, name: 'Mentor', mentoringHoursPerMonth: 4 }, { id: 2, name: 'Learner' }],
  skills: [{ id: 1, name: 'Data Analysis', targetProficiency: 3, requiredHolders: 2, criticality: 5 },
    { id: 2, name: 'Node.js', targetProficiency: 3, requiredHolders: 2, criticality: 3 }],
  matrix: [{ employeeId: 1, skillId: 1, proficiency: 5 }, { employeeId: 2, skillId: 1, proficiency: 2 }],
};
const demo = () => createRecommendationService({ provider: createProvider({ env: {} }) });
const context = () => developmentContext(workforce, workforce.skills[0], analyze(workforce));
const mockedService = (generate) => createRecommendationService({ provider: { status: { configured: true, provider: 'openai', model: 'test' }, generate } });
const requirement = () => strategyFallback('e-commerce').requirements[1];

test('no-key plan includes all categories, valid mentor and unsupported certification', async () => {
  const result = await demo().recommend(workforce, 1);
  assert.equal(result.mode, 'demo-fallback');
  assert.equal(result.fallbackReason, 'missing_api_key');
  assert.equal(result.actions.length, 5);
  const mentoring = result.actions.find((action) => action.category === 'mentoring');
  assert.equal(mentoring.mentorId, 1); assert.equal(mentoring.employeeId, 2);
  assert.match(mentoring.action, /runbook.*shadow.*practice.*independent/);
  const certification = result.actions.find((action) => action.category === 'certification');
  assert.equal(certification.status, 'not_applicable'); assert.equal(certification.resourceId, null);
});
test('only verified matching catalog resources enable certification', async () => {
  const data = structuredClone(workforce);
  data.learningResources = [{ id: 'cert-demo', title: 'Fictional demo credential', category: 'certification', skillIds: [1], verified: true }];
  const action = (await demo().recommend(data, 1)).actions.find((entry) => entry.category === 'certification');
  assert.equal(action.resourceId, 'cert-demo'); assert.equal(action.resource.title, 'Fictional demo credential');
  data.learningResources[0].verified = false;
  assert.equal((await demo().recommend(data, 1)).actions.find((entry) => entry.category === 'certification').status, 'not_applicable');
});
test('zero mentoring capacity excludes mentor; missing learner is not fabricated', async () => {
  const data = structuredClone(workforce); data.employees[0].mentoringHoursPerMonth = 0;
  assert.equal((await demo().recommend(data, 1)).actions.find((entry) => entry.category === 'mentoring').mentorId, null);
  data.matrix = data.matrix.filter((edge) => edge.employeeId !== 2);
  assert.ok((await demo().recommend(data, 1)).actions.every((action) => action.employeeId === null && action.status === 'not_applicable'));
});
test('valid mocked AI is accepted and risk remains deterministic', async () => {
  const service = mockedService(async () => developmentFallback(context()));
  const result = await service.recommend(workforce, 1);
  assert.equal(result.mode, 'live-ai'); assert.equal(result.risk.keystoneScore, 80);
});
test('malformed or ungrounded AI responses fall back', async (t) => {
  const mutations = {
    'invented employee': (p) => { p.actions[0].employeeId = 999; },
    'invented mentor': (p) => { p.actions[1].mentorId = 999; },
    'mentor in unrelated action': (p) => { p.actions[0].mentorId = 1; },
    'invented resource': (p) => { p.actions[0].resourceId = 'fake'; },
    'unverified certification': (p) => { p.actions[2].status = 'needs_review'; },
    'invented URL': (p) => { p.actions[0].action = 'Visit https://fake.example/course'; },
    'bare domain': (p) => { p.actions[0].action = 'Enrol through billingcert.com before the review.'; },
    'credential domain in milestone': (p) => { p.actions[3].milestone = 'Learner passes the assessment at skillsacademy.org.'; },
    'mentoring without shadowing': (p) => { p.actions[1].action = 'Write a runbook and complete supervised practice, then an independent demonstration.'; },
    'mentoring without documentation': (p) => { p.actions[1].action = 'Shadow the mentor, practise under supervision, then demonstrate independently.'; },
    'duplicate category': (p) => { p.actions[0].category = 'mentoring'; },
    'wrong threshold': (p) => { p.actions[0].targetProficiency = 5; },
    'missing milestone': (p) => { delete p.actions[0].milestone; },
    'extra field': (p) => { p.actions[0].departureProbability = 0.5; },
  };
  for (const [name, mutate] of Object.entries(mutations)) await t.test(name, async () => {
    const payload = developmentFallback(context()); mutate(payload);
    const result = await mockedService(async () => payload).recommend(workforce, 1);
    assert.equal(result.mode, 'demo-fallback'); assert.equal(result.fallbackReason, 'invalid_output');
  });
});
test('unknown mentor availability cannot be presented as confirmed', async () => {
  const data = structuredClone(workforce); delete data.employees[0].mentoringHoursPerMonth;
  const payload = developmentFallback(context()); payload.actions[1].status = 'proposed';
  assert.equal((await mockedService(async () => payload).recommend(data, 1)).mode, 'demo-fallback');
});
test('strategy matches known names, leaves novel IDs null, calculates gaps without writes', async () => {
  const before = JSON.stringify(workforce);
  const result = await demo().proposeStrategy('Expand into e-commerce', workforce);
  assert.equal(result.reviewStatus, 'requires-review');
  assert.equal(result.requirements.find((r) => r.skillName === 'Data Analysis').skillId, 1);
  assert.equal(result.requirements.find((r) => r.skillName === 'Data Analysis').coverage.gap, 1);
  assert.equal(result.requirements.find((r) => r.skillName === 'E-commerce Operations').skillId, null);
  assert.equal(result.requirements.find((r) => r.skillName === 'E-commerce Operations').coverage.recordedQualifiedHolders, 0);
  assert.equal(JSON.stringify(workforce), before);
  const derived = (await demo().proposeStrategy('Make things better', workforce)).requirements;
  assert.ok(derived.length > 0, 'an unmatched direction still proposes reviewable requirements');
  assert.ok(derived.every((r) => Number.isInteger(r.skillId)), 'derived requirements only reference catalog skills');
  assert.ok(derived.every((r) => r.assumptions.some((a) => /derived deterministically/i.test(a))), 'derived requirements disclose their basis');
  assert.equal(JSON.stringify(workforce), before);
});
test('coverage-derived fallback invents nothing and stays empty without a catalog', () => {
  assert.deepEqual(coverageFallback({ skills: [], matrix: [] }), []);
  assert.deepEqual(coverageFallback(undefined), []);
  const names = coverageFallback(workforce).map((requirement) => requirement.skillName);
  assert.ok(names.every((name) => workforce.skills.some((skill) => skill.name === name)));
  const bySkill = new Map(coverageFallback(workforce).map((requirement) => [requirement.skillId, requirement]));
  assert.equal(bySkill.get(2).sourcing, 'hire', 'a skill with no recorded holders proposes hiring');
  assert.equal(bySkill.get(1).sourcing, 'build', 'a skill with a recorded holder proposes internal development');
});
test('name normalization resolves aliases but rejects invented IDs and duplicates', () => {
  const candidate = { ...requirement(), skillName: '  NODE JS  ' };
  assert.equal(normalizeRequirements({ requirements: [candidate] }, workforce)[0].skillId, 2);
  assert.throws(() => normalizeRequirements({ requirements: [{ ...candidate, skillId: 1 }] }, workforce));
  assert.throws(() => normalizeRequirements({ requirements: [candidate, { ...candidate, skillName: 'Node.js' }] }, workforce));
});
test('strategy preview requires review, respects dates and computes at proposed threshold', () => {
  const req = { ...requirement(), skillId: 1, targetProficiency: 5, effectiveMonth: 36 };
  assert.throws(() => previewRequirements(workforce, { requirements: [req], horizonMonths: 36 }), { status: 400 });
  assert.equal(previewRequirements(workforce, { requirements: [req], horizonMonths: 12, reviewed: true }).requirements[0].coverage, null);
  assert.equal(previewRequirements(workforce, { requirements: [req], horizonMonths: 36, reviewed: true }).requirements[0].coverage.recordedQualifiedHolders, 1);
  assert.equal(previewRequirements(workforce, { requirements: [req], horizonMonths: 36, reviewed: true }).persisted, false);
});
test('provider failures are sanitized and retain usable fallback', async () => {
  const result = await mockedService(async () => { throw new ProviderFailure('timeout'); }).recommend(workforce, 1);
  assert.equal(result.fallbackReason, 'timeout'); assert.equal(result.actions.length, 5);
});
test('configuration requires both key and explicit model; status never exposes key', () => {
  assert.equal(createProvider({ env: { OPENAI_API_KEY: 'secret' } }).status.reason, 'missing_model');
  const provider = createProvider({ env: { OPENAI_API_KEY: 'secret', KEYSTONE_AI_MODEL: 'test-model' } });
  assert.equal(provider.status.configured, true); assert.ok(!JSON.stringify(provider.status).includes('secret'));
});
test('adapter sends strict schema, store false, bounded timeout/retries and rejects refusal', async () => {
  let options; let body;
  const provider = createProvider({ env: { OPENAI_API_KEY: 'test', KEYSTONE_AI_MODEL: 'test-model', KEYSTONE_AI_TIMEOUT_MS: '999999' },
    clientFactory: (settings) => { options = settings; return { responses: { create: async (request) => { body = request;
      return { status: 'completed', output: [{ content: [{ type: 'refusal' }] }] }; } } }; } });
  await assert.rejects(() => provider.generate({ name: 'test', schema: developmentSchema, instructions: 'test', context: {} }), { code: 'refusal' });
  assert.equal(options.timeout, 60000); assert.equal(options.maxRetries, 1);
  assert.equal(body.store, false); assert.equal(body.text.format.strict, true);
});
test('real SDK transport retries one transient failure and parses structured output', async (t) => {
  let attempts = 0;
  const server = http.createServer(async (req, res) => {
    let body = ''; for await (const chunk of req) body += chunk;
    assert.equal(JSON.parse(body).text.format.type, 'json_schema');
    attempts += 1; res.setHeader('Content-Type', 'application/json');
    if (attempts === 1) { res.writeHead(500); res.end(JSON.stringify({ error: { message: 'temporary' } })); return; }
    res.end(JSON.stringify({ id: 'resp_test', object: 'response', status: 'completed', output: [{ type: 'message', role: 'assistant',
      content: [{ type: 'output_text', text: '{"ok":true}', annotations: [] }] }] }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const provider = createProvider({ env: { OPENAI_API_KEY: 'test-only', KEYSTONE_AI_MODEL: 'test-model' },
    clientFactory: (options) => new OpenAI({ ...options, baseURL: `http://127.0.0.1:${server.address().port}` }) });
  assert.deepEqual(await provider.generate({ name: 'test', schema: {}, instructions: 'test', context: {} }), { ok: true });
  assert.equal(attempts, 2);
});

test('strategy templates cover payments, security, cloud, data, expansion and mobile, and merge without duplicates', () => {
  const merged = strategyFallback('Launch a regulated payments product in the EU with PCI-grade security and cloud automation').requirements;
  const names = merged.map((entry) => entry.skillName);
  assert.equal(new Set(names).size, names.length, 'a skill appeared twice');
  for (const expected of ['Payments Compliance', 'Cybersecurity', 'Data Privacy (GDPR)', 'Incident Response', 'Cloud Architecture']) assert.ok(names.includes(expected), expected);
  assert.ok(merged.length <= 8);
  assert.ok(merged.every((entry) => entry.assumptions.some((line) => /not an AI forecast/.test(line))));
  assert.equal(strategyFallback('Open a chain of bakeries').requirements.length, 0, 'no workforce means no coverage fallback');
  assert.ok(strategyFallback('Build the Android and iOS app').requirements.some((entry) => entry.skillName === 'Kotlin & Android'));
});
