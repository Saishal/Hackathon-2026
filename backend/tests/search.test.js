const test = require('node:test');
const assert = require('node:assert/strict');
const { useTempDatabase, startServer, signedIn } = require('./helpers/server');
const { search } = require('../services/search');

useTempDatabase('search');
const started = startServer();
test.after(async () => (await started).close());

const group = (body, type) => body.groups.find((entry) => entry.type === type);
const titles = (body, type) => (group(body, type)?.items ?? []).map((item) => item.title);

test('search ranks exact and prefix matches first and never widens beyond what it was given', () => {
  const workforce = {
    employees: [{ id: 1, name: 'Liam Chen', role: 'Backend Engineer', department: 'Engineering' }, { id: 2, name: 'William Ng', role: 'Analyst', department: 'Data' }],
    skills: [{ id: 10, name: 'Legacy Billing Recovery', criticality: 5 }], roles: [], matrix: [],
  };
  const result = search({ query: 'liam', workforce, permissions: new Set() });
  assert.deepEqual(titles(result, 'employee'), ['Liam Chen', 'William Ng']);
  assert.equal(result.total, 2);
  assert.equal(search({ query: 'l', workforce, permissions: new Set() }).total, 0, 'one character is too short to search');
  assert.equal(group(search({ query: 'billing', workforce, risks: { skills: [{ id: 10, busFactor: 1, keystoneScore: 80 }] }, permissions: new Set() }), 'risk'), undefined,
    'risks appear only when the risk.read permission was passed in');
});

test('an admin finds people, skills, roles, departments, risks and scenarios with working links', async () => {
  const { base } = await started;
  const admin = await signedIn(base, 'admin');
  const response = await admin.get('/api/keystone/search?q=billing');
  assert.equal(response.status, 200);
  assert.equal(response.body.visibility, 'organization');
  assert.ok(titles(response.body, 'skill').includes('Legacy Billing Recovery'));
  const risk = group(response.body, 'risk').items.find((item) => item.title === 'Legacy Billing Recovery');
  assert.equal(risk.status, 'warning');
  assert.match(risk.description, /Covered by one person/);
  assert.match(risk.href, /^#\/network\?skill=\d+$/);
  assert.ok(titles(response.body, 'scenario').some((name) => /billing/i.test(name)), 'the seeded scenario is found');
  assert.ok(titles(response.body, 'role').includes('Billing Operations Specialist'));

  const people = await admin.get('/api/keystone/search?q=liam');
  const liam = group(people.body, 'employee').items[0];
  assert.equal(liam.title, 'Liam Chen');
  assert.equal(liam.href, '#/data?tab=people&q=Liam%20Chen');

  const department = await admin.get('/api/keystone/search?q=engineering');
  assert.ok(titles(department.body, 'department').includes('Engineering'));
  assert.ok(group(department.body, 'department').items[0].description.match(/\d+ people you can see/));
});

test('a manager only finds their own team, and an employee only themselves', async () => {
  const { base } = await started;
  const manager = await signedIn(base, 'manager');
  const inTeam = await manager.get('/api/keystone/search?q=liam');
  assert.equal(inTeam.body.visibility, 'team');
  assert.ok(titles(inTeam.body, 'employee').includes('Liam Chen'), 'Liam reports to Rachel');
  const outside = await manager.get('/api/keystone/search?q=isabella');
  assert.equal(group(outside.body, 'employee'), undefined, 'Isabella Ross is in Security, not Rachel\'s team');
  assert.ok(!JSON.stringify(outside.body).includes('Isabella'), 'her name appears nowhere in the response');
  assert.equal(group(inTeam.body, 'scenario'), undefined, 'managers cannot run scenarios so see none');

  const employee = await signedIn(base, 'employee');
  const self = await employee.get('/api/keystone/search?q=mason');
  assert.equal(self.body.visibility, 'self');
  assert.deepEqual(titles(self.body, 'employee'), ['Mason Green']);
  const other = await employee.get('/api/keystone/search?q=liam');
  assert.equal(group(other.body, 'employee'), undefined);
  assert.equal(group(other.body, 'risk'), undefined, 'employees have no risk permission');
  assert.equal(group(other.body, 'issue'), undefined);
});

test('searching is not written to the audit log', async () => {
  const { base } = await started;
  const admin = await signedIn(base, 'admin');
  const before = (await admin.get('/api/keystone/audit-log?pageSize=1')).body.total;
  await admin.get('/api/keystone/search?q=cyber');
  await admin.get('/api/keystone/search?q=payments');
  const after = (await admin.get('/api/keystone/audit-log?pageSize=1')).body.total;
  assert.equal(after, before);
});
