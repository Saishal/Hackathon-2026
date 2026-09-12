#!/usr/bin/env node
// Keystone AI live-provider verification harness.
// Phase A runs with no credentials. Phase B runs only when a key + model are configured.
// Run from backend/:  node <path-to-this-file>
const assert = require('node:assert/strict');
const http = require('node:http');
const OpenAI = require('openai');
const { developmentSchema, strategySchema } = require('../services/ai/schemas');
const { createProvider } = require('../services/ai/provider');
const { createRecommendationService } = require('../services/recommendations');

const pass = (m) => console.log(`  PASS  ${m}`);
const fail = (m) => { console.log(`  FAIL  ${m}`); process.exitCode = 1; };
const info = (m) => console.log(`  ..    ${m}`);

// ---------- Phase A1: strict-mode structural audit of the real schemas ----------
// Long-standing strict Structured Outputs rules: root is an object, every object sets
// additionalProperties:false, and every declared property appears in required.
function auditStrict(node, path, problems) {
  if (!node || typeof node !== 'object') return;
  if (node.type === 'object' || node.properties) {
    if (node.additionalProperties !== false) problems.push(`${path}: missing additionalProperties:false`);
    const props = Object.keys(node.properties || {});
    const required = node.required || [];
    const missing = props.filter((p) => !required.includes(p));
    if (missing.length) problems.push(`${path}: not in required -> ${missing.join(', ')}`);
    const phantom = required.filter((p) => !props.includes(p));
    if (phantom.length) problems.push(`${path}: required names absent properties -> ${phantom.join(', ')}`);
    for (const [k, v] of Object.entries(node.properties || {})) auditStrict(v, `${path}.${k}`, problems);
  }
  if (node.items) auditStrict(node.items, `${path}[]`, problems);
}

console.log('\n== Phase A1: strict-schema structural audit (no credentials needed) ==');
for (const [name, schema] of [['keystone_development', developmentSchema], ['keystone_strategy', strategySchema]]) {
  const problems = [];
  if (schema.type !== 'object') problems.push('root is not type object');
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(name)) problems.push(`schema name "${name}" is not a legal format name`);
  auditStrict(schema, name, problems);
  if (problems.length) problems.forEach((p) => fail(p));
  else pass(`${name}: root object, all properties required, additionalProperties:false throughout`);
}

// ---------- Phase A2: put the REAL schemas on the real SDK wire ----------
// The existing suite only ever transmits `schema: {}`; this transmits what production sends.
async function wireTest() {
  console.log('\n== Phase A2: real schemas over the real SDK transport ==');
  const captured = [];
  const server = http.createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    captured.push(JSON.parse(body));
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      id: 'resp_wire', object: 'response', status: 'completed',
      output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: '{"ok":true}', annotations: [] }] }],
    }));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const provider = createProvider({
    env: { OPENAI_API_KEY: 'test-only', KEYSTONE_AI_MODEL: 'wire-model' },
    clientFactory: (o) => new OpenAI({ ...o, baseURL: `http://127.0.0.1:${server.address().port}` }),
  });
  for (const [name, schema] of [['keystone_development', developmentSchema], ['keystone_strategy', strategySchema]]) {
    await provider.generate({ name, schema, instructions: 'wire check', context: { probe: true } });
  }
  await new Promise((r) => server.close(r));

  for (const body of captured) {
    const fmt = body.text && body.text.format;
    try {
      assert.equal(fmt.type, 'json_schema');
      assert.equal(fmt.strict, true);
      assert.equal(body.store, false);
      assert.equal(body.max_output_tokens, 6000);
      assert.ok(fmt.schema && Object.keys(fmt.schema).length > 0, 'schema is empty on the wire');
      assert.deepEqual(fmt.schema, fmt.name === 'keystone_development' ? developmentSchema : strategySchema);
      pass(`${fmt.name}: strict json_schema transmitted intact, store:false, bounded output`);
    } catch (error) {
      fail(`${fmt && fmt.name}: ${error.message}`);
    }
  }
  info(`development schema payload: ${JSON.stringify(captured[0].text.format.schema).length} bytes`);
  info(`instructions transmitted: ${captured[0].instructions ? 'yes' : 'NO - prompt missing'}`);
}

// ---------- Phase B: one real call per mode ----------
const workforce = {
  employees: [{ id: 1, name: 'Liam Chen', mentoringHoursPerMonth: 4 }, { id: 2, name: 'Mason Green' }],
  skills: [
    { id: 1, name: 'Legacy Billing Recovery', criticality: 5, targetProficiency: 3, requiredHolders: 2 },
    { id: 2, name: 'Data Analysis', criticality: 3, targetProficiency: 3, requiredHolders: 2 },
  ],
  matrix: [
    { employeeId: 1, skillId: 1, proficiency: 5 }, { employeeId: 2, skillId: 1, proficiency: 2 },
    { employeeId: 1, skillId: 2, proficiency: 4 },
  ],
  learningResources: [{ id: 'cert-billing-1', title: 'Billing recovery practitioner assessment', category: 'certification', skillIds: [1], verified: true }],
};

async function liveTest() {
  console.log('\n== Phase B: live provider call ==');
  const status = createProvider().status;
  console.log(`  provider=${status.provider} configured=${status.configured} model=${status.model || '-'} reason=${status.reason || '-'}`);
  if (!status.configured) {
    info('SKIPPED - set OPENAI_API_KEY and KEYSTONE_AI_MODEL (and KEYSTONE_AI_PROVIDER=openai) in backend/.env');
    info('The live path remains UNVERIFIED. Phase A cannot substitute for this.');
    return;
  }
  const service = createRecommendationService();
  const cases = [
    ['development-plan', () => service.recommend(structuredClone(workforce), 1)],
    ['strategy', () => service.proposeStrategy('launch a direct-to-consumer e-commerce channel next year', structuredClone(workforce))],
  ];
  for (const [label, run] of cases) {
    const started = Date.now();
    try {
      const result = await run();
      const ms = Date.now() - started;
      if (result.mode === 'live-ai') pass(`${label}: live-ai in ${ms}ms`);
      else fail(`${label}: fell back to ${result.mode} (reason: ${result.fallbackReason}) in ${ms}ms`);
      if (label === 'development-plan') {
        result.actions.forEach((a) => console.log(`        ${a.category.padEnd(19)} ${a.status.padEnd(15)} emp:${a.employeeId} mentor:${a.mentorId} res:${a.resourceId}`));
      } else {
        console.log(`        ${result.requirements.length} requirements`);
        result.requirements.forEach((r) => console.log(`        ${r.skillName} | id:${r.skillId} | ${r.sourcing} | month ${r.effectiveMonth}`));
      }
    } catch (error) {
      fail(`${label}: threw ${error.message}`);
    }
  }
}

(async () => {
  await wireTest();
  await liveTest();
  console.log(process.exitCode ? '\nRESULT: failures above.\n' : '\nRESULT: all executed checks passed.\n');
})();
