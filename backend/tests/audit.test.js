const test = require('node:test');
const assert = require('node:assert/strict');
const { useTempDatabase, startServer, signedIn } = require('./helpers/server');

useTempDatabase('audit');
const started = startServer();
test.after(async () => (await started).close());

const named = (list, name) => list.find((entry) => entry.name === name);

test('a material write records who did it, what changed, and where it came from', async () => {
  const { base } = await started;
  const admin = await signedIn(base, 'admin');
  const workforce = (await admin.get('/api/keystone/workforce')).body;
  const mason = named(workforce.employees, 'Mason Green');
  const billing = named(workforce.skills, 'Legacy Billing Recovery');

  const saved = await admin.put('/api/keystone/employee-skills',
    { employeeId: mason.id, skillId: billing.id, proficiency: 3, evidenceSource: 'Supervised recovery drill', lastVerifiedAt: '2026-09-10' },
    { 'X-Keystone-Client': 'web' });
  assert.equal(saved.status, 200);

  const log = (await admin.get(`/api/keystone/audit-log?entityType=employee_skill&entityId=${mason.id}:${billing.id}`)).body;
  const [entry] = log.items;
  assert.equal(entry.actionType, 'employee_skill.verified');
  assert.equal(entry.actor.userId, admin.user.id);
  assert.equal(entry.actor.name, 'Keystone Administrator');
  assert.equal(entry.actor.role, 'admin');
  assert.equal(entry.source, 'ui');
  assert.deepEqual(entry.before, { proficiency: 2, evidenceSource: 'Self-assessment', lastVerifiedAt: null });
  assert.deepEqual(entry.after, { proficiency: 3, evidenceSource: 'Supervised recovery drill', lastVerifiedAt: '2026-09-10' });
  assert.ok(entry.requestId);

  // The second qualified holder is a consequence the system records on its own.
  const coverage = (await admin.get('/api/keystone/audit-log?actionType=risk.single_holder_resolved')).body.items;
  assert.equal(coverage.length, 1);
  assert.equal(coverage[0].source, 'system');
  assert.equal(coverage[0].metadata.triggeredByUserId, admin.user.id);
});

test('the client cannot supply its own actor', async () => {
  const { base } = await started;
  const admin = await signedIn(base, 'admin');
  const response = await admin.put('/api/keystone/employee-skills',
    { employeeId: 1, skillId: 1, proficiency: 3, evidenceSource: 'review', actorName: 'Someone else' });
  assert.equal(response.status, 400);
  assert.equal(response.body.details[0].code, 'unknown_field');
});

test('audit history cannot be edited or deleted, through the API or the database', async () => {
  const { base, data } = await started;
  const admin = await signedIn(base, 'admin');
  const [{ id }] = (await admin.get('/api/keystone/audit-log?pageSize=1')).body.items;

  assert.equal((await admin.patch(`/api/keystone/audit-log/${id}`, { summary: 'rewritten' })).status, 404);
  assert.equal((await admin.delete(`/api/keystone/audit-log/${id}`)).status, 404);
  await assert.rejects(() => data.run('UPDATE audit_log SET summary = ? WHERE id = ?', ['rewritten', id]), /append-only/);
  await assert.rejects(() => data.run('DELETE FROM audit_log WHERE id = ?', [id]), /append-only/);
});

test('audit filters and pagination work together', async () => {
  const { base } = await started;
  const hr = await signedIn(base, 'hr');
  await signedIn(base, 'manager');

  const logins = (await hr.get('/api/keystone/audit-log?actionType=auth.login&pageSize=100')).body;
  assert.ok(logins.total >= 2);
  assert.ok(logins.items.every((entry) => entry.actionType === 'auth.login'));

  const first = (await hr.get('/api/keystone/audit-log?pageSize=2&page=1')).body;
  const second = (await hr.get('/api/keystone/audit-log?pageSize=2&page=2')).body;
  assert.equal(first.items.length, 2);
  assert.equal(first.total, second.total);
  assert.equal(first.totalPages, Math.ceil(first.total / 2));
  assert.equal(new Set([...first.items, ...second.items].map((entry) => entry.id)).size, 4, 'pages do not overlap');
  assert.ok(first.items[0].occurredAt >= first.items[1].occurredAt, 'newest first');

  const byActor = (await hr.get(`/api/keystone/audit-log?actorUserId=${hr.user.id}`)).body;
  assert.ok(byActor.items.length > 0 && byActor.items.every((entry) => entry.actor.userId === hr.user.id));

  const wildcard = (await hr.get('/api/keystone/audit-log?actionType=auth.*&pageSize=100')).body;
  assert.ok(wildcard.items.every((entry) => entry.actionType.startsWith('auth.')));

  const dated = (await hr.get('/api/keystone/audit-log?from=2020-01-01&to=2020-01-31')).body;
  assert.equal(dated.total, 0);

  const searched = (await hr.get('/api/keystone/audit-log?q=Rachel%20Moreno%20signed')).body;
  assert.ok(searched.items.length >= 1);

  assert.ok(first.facets.actionTypes.includes('auth.login'));
  assert.ok(first.facets.actors.some((actor) => actor.userId === hr.user.id));

  const invalid = await hr.get('/api/keystone/audit-log?from=2026-02-30');
  assert.equal(invalid.status, 400);
  assert.equal(invalid.body.details[0].code, 'invalid_date');
  const backwards = await hr.get('/api/keystone/audit-log?from=2026-09-10&to=2026-09-01');
  assert.equal(backwards.body.details[0].code, 'invalid_range');
});

test('high-signal events can be requested for the dashboard', async () => {
  const { base } = await started;
  const hr = await signedIn(base, 'hr');
  const recent = (await hr.get('/api/keystone/audit-log?highSignal=true&pageSize=50')).body;
  assert.ok(recent.items.length > 0);
  assert.ok(recent.items.every((entry) => entry.highSignal));
  assert.ok(!recent.items.some((entry) => entry.actionType === 'auth.login'));
});

test('passwords, hashes and session tokens never reach the audit log', async () => {
  const { base, data } = await started;
  const admin = await signedIn(base, 'admin');
  const secret = 'Unique-Audit-Secret-4471';
  const created = await admin.post('/api/keystone/users', {
    email: 'audit.check@keystone.demo', displayName: 'Audit Check', role: 'hr', employeeId: null, password: secret,
  });
  assert.equal(created.status, 201);
  assert.equal((await admin.post(`/api/keystone/users/${created.body.id}/reset-password`, { password: `${secret}-2` })).status, 204);
  await admin.get('/api/keystone/risks');

  const rows = await data.all('SELECT * FROM audit_log');
  const everything = JSON.stringify(rows);
  const token = admin.cookie.split('=')[1];
  assert.ok(!everything.includes(secret));
  assert.ok(!everything.includes('scrypt$'));
  assert.ok(!everything.includes(token));
  assert.ok(rows.some((row) => row.action_type === 'user.password_reset'));

  const { sanitize } = require('../data/audit');
  assert.deepEqual(sanitize({ password: 'x', nested: { apiKey: 'y', sessionToken: 'z', name: 'kept' } }), { nested: { name: 'kept' } });
});

test('sign-in and sign-out are recorded against the account', async () => {
  const { base } = await started;
  const employee = await signedIn(base, 'employee');
  await employee.post('/api/auth/logout');
  const hr = await signedIn(base, 'hr');
  const events = (await hr.get(`/api/keystone/audit-log?entityType=user&entityId=${employee.user.id}&pageSize=100`)).body.items;
  assert.ok(events.some((entry) => entry.actionType === 'auth.login' && entry.actor.userId === employee.user.id));
  assert.ok(events.some((entry) => entry.actionType === 'auth.logout' && entry.actor.userId === employee.user.id));
});
