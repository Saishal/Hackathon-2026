const test = require('node:test');
const assert = require('node:assert/strict');
const { useTempDatabase, startServer, signedIn } = require('./helpers/server');
const { buildSuggestions } = require('../services/suggestions');

useTempDatabase('suggestions');
const started = startServer();
test.after(async () => (await started).close());

const ofKind = (items, kind) => items.filter((item) => item.kind === kind);

test('rules are deterministic, labelled by basis, and offer only safe actions', () => {
  const workforce = {
    employees: [{ id: 1, name: 'Liam Chen' }, { id: 2, name: 'Mason Green' }],
    skills: [], roles: [], matrix: [], futureRequirements: [{ id: 9, skillId: 3, skillName: 'Payments Compliance', status: 'proposed', requiredHolders: 3, targetProficiency: 4, effectiveMonth: 12 }],
  };
  const risks = { skills: [
    { id: 10, name: 'Legacy Billing Recovery', busFactor: 1, holderIds: [1], criticality: 5, requiredHolders: 2, targetProficiency: 3, keystoneScore: 80 },
    { id: 11, name: 'AI Governance', busFactor: 0, holderIds: [], criticality: 4, requiredHolders: 2, targetProficiency: 3, keystoneScore: 80 },
    { id: 12, name: 'React', busFactor: 4, holderIds: [1, 2], criticality: 3, requiredHolders: 2, targetProficiency: 3, keystoneScore: 10 },
  ] };
  const permissions = new Set(['risk.read', 'risk.acknowledge', 'scenario.run', 'ai.development', 'changes.review.planning']);
  const items = buildSuggestions({ workforce, risks, permissions, issues: [
    { ruleCode: 'EVIDENCE_STALE', severity: 'warning', entityType: 'employee_skill', entityId: '2:10', entityLabel: 'Mason Green · Legacy Billing Recovery', employeeIds: [2], fingerprint: 'EVIDENCE_STALE:employee_skill:2:10', link: null },
    { ruleCode: 'SCENARIO_INTERVENTION_AFTER_RISK', severity: 'warning', title: 'Development finishes after the coverage gap opens', entityType: 'scenario', entityId: '5', entityLabel: 'Billing continuity', employeeIds: [], fingerprint: 'SCENARIO_INTERVENTION_AFTER_RISK:scenario:5', link: null },
  ] });

  const single = items.find((item) => item.key === 'coverage:single:10');
  assert.equal(single.title, 'Legacy Billing Recovery has only one qualified holder, Liam Chen.');
  assert.equal(single.basisLabel, 'Current official data');
  assert.deepEqual(single.actions.map((action) => action.label), ['See who could step in', 'Model their departure', 'Draft a development plan']);
  assert.ok(items.find((item) => item.key === 'coverage:uncovered:11').severity === 'critical');
  assert.equal(items.find((item) => item.entity?.id === 12), undefined, 'a well-covered skill produces nothing');

  assert.equal(items.filter((item) => item.kind === 'ownership').length, 2, 'both at-risk skills lack an owner');
  const stale = items.find((item) => item.key.startsWith('evidence:'));
  assert.equal(stale.basis, 'unverified');
  assert.equal(stale.actions[0].href, '#/data?tab=evidence&q=Mason%20Green');
  const scenario = items.find((item) => item.kind === 'scenario');
  assert.equal(scenario.basisLabel, 'Time Machine scenario');
  assert.equal(scenario.actions[0].href, '#/timemachine?scenario=5');
  assert.match(scenario.detail, /Move the completion date earlier/);
  const pending = items.find((item) => item.key === 'planning:proposed:9');
  assert.equal(pending.basis, 'pending');
  assert.match(pending.detail, /Not in the official baseline/);

  assert.equal(items[0].severity, 'critical', 'critical first');
  const again = buildSuggestions({ workforce, risks, permissions, issues: [] });
  assert.deepEqual(again.map((item) => item.key), buildSuggestions({ workforce, risks, permissions, issues: [] }).map((item) => item.key), 'same input, same output');
});

test('permissions remove whole categories rather than leaking a weaker version', () => {
  const workforce = { employees: [{ id: 1, name: 'Liam Chen' }], skills: [], roles: [], matrix: [], futureRequirements: [] };
  const risks = { skills: [{ id: 10, name: 'Legacy Billing Recovery', busFactor: 1, holderIds: [1], criticality: 5, requiredHolders: 2, targetProficiency: 3 }] };
  const readOnly = buildSuggestions({ workforce, risks, permissions: new Set(['risk.read']) });
  assert.equal(ofKind(readOnly, 'ownership').length, 0, 'no acknowledge permission, no ownership nudges');
  assert.deepEqual(readOnly[0].actions.map((action) => action.label), ['See who could step in'], 'no scenario or AI actions offered');
  const none = buildSuggestions({ workforce, risks: null, permissions: new Set() });
  assert.equal(none.length, 0);
});

test('the endpoint is scoped and dismissals are per user and reversible', async () => {
  const { base } = await started;
  const admin = await signedIn(base, 'admin');
  const first = await admin.get('/api/keystone/suggestions');
  assert.equal(first.status, 200);
  assert.ok(first.body.items.length > 0);
  assert.ok(first.body.items.every((item) => item.key && item.title && item.basisLabel && Array.isArray(item.actions)));
  const target = first.body.items[0];

  assert.equal((await admin.post('/api/keystone/suggestions/dismiss', { key: target.key })).status, 204);
  const after = await admin.get('/api/keystone/suggestions');
  assert.equal(after.body.items.find((item) => item.key === target.key), undefined);
  assert.equal(after.body.dismissed.find((item) => item.key === target.key)?.title, target.title);

  const hr = await signedIn(base, 'hr');
  const other = await hr.get('/api/keystone/suggestions');
  assert.ok(other.body.items.find((item) => item.key === target.key), 'a dismissal belongs to one user only');

  assert.equal((await admin.post('/api/keystone/suggestions/restore', { key: target.key })).status, 204);
  assert.ok((await admin.get('/api/keystone/suggestions')).body.items.find((item) => item.key === target.key));
  assert.equal((await admin.post('/api/keystone/suggestions/dismiss', { key: 'bad key with spaces' })).status, 400);

  const manager = await signedIn(base, 'manager');
  const team = await manager.get('/api/keystone/suggestions');
  assert.equal(team.body.visibility, 'team');
  assert.ok(!JSON.stringify(team.body).includes('Isabella Ross'), 'a manager never sees a name outside their team');
  assert.equal(ofKind(team.body.items, 'ownership').length, 0, 'managers cannot acknowledge risks');

  const employee = await signedIn(base, 'employee');
  const self = await employee.get('/api/keystone/suggestions');
  assert.equal(self.body.visibility, 'self');
  assert.equal(self.body.items.filter((item) => item.kind === 'coverage').length, 0, 'employees have no risk permission');

  const before = (await admin.get('/api/keystone/audit-log?pageSize=1')).body.total;
  await admin.post('/api/keystone/suggestions/dismiss', { key: target.key });
  assert.equal((await admin.get('/api/keystone/audit-log?pageSize=1')).body.total, before, 'dismissals are not audited');
});
