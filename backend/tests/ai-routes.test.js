const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const routes = require('../routes/keystone');
const { createRecommendationService } = require('../services/recommendations');
const { createProvider } = require('../services/ai/provider');
const { strategyFallback } = require('../services/ai/fallbacks');

test('HTTP contracts serve async plans/proposals/previews and reject invalid inputs', async (t) => {
  const workforce = { employees: [{ id: 1 }, { id: 2 }],
    skills: [{ id: 1, name: 'Data Analysis', criticality: 4, targetProficiency: 3, requiredHolders: 2 }],
    matrix: [{ employeeId: 1, skillId: 1, proficiency: 5 }, { employeeId: 2, skillId: 1, proficiency: 2 }] };
  const app = express(); app.use(express.json());
  app.use('/api/keystone', routes(async () => structuredClone(workforce), createRecommendationService({ provider: createProvider({ env: {} }) })));
  app.use((error, _req, res, _next) => res.status(error.status || 500).json({ error: error.message }));
  const server = await new Promise((resolve) => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}/api/keystone`;
  const post = (route, body) => fetch(`${base}/${route}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const plan = await (await post('development-plan', { skillId: 1 })).json();
  assert.equal(plan.actions.length, 5); assert.equal(plan.mode, 'demo-fallback');
  const strategy = await (await post('strategy', { direction: 'e-commerce expansion' })).json();
  assert.equal(strategy.requirements.length, 3);
  assert.equal((await post('strategy', { direction: '' })).status, 400);
  assert.equal((await post('strategy', { direction: 'a'.repeat(2001) })).status, 400);
  assert.equal((await post('development-plan', { skillId: '1' })).status, 400);
  assert.equal((await post('strategy/preview', { horizonMonths: 12, requirements: [] })).status, 400);
  const preview = await (await post('strategy/preview', { reviewed: true, horizonMonths: 12, requirements: strategyFallback('e-commerce').requirements })).json();
  assert.equal(preview.persisted, false);
  const matched = preview.requirements.find((requirement) => requirement.skillId === 1);
  assert.equal(matched.coverage.gap, 1);
  const status = await (await fetch(`${base}/ai-status`)).json();
  assert.deepEqual(status, { provider: 'demo', configured: false, model: null, reason: 'missing_api_key' });
});
