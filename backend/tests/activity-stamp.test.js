const test = require('node:test');
const assert = require('node:assert/strict');
const { useTempDatabase, startServer, signedIn, client } = require('./helpers/server');

useTempDatabase('activity-stamp');
const started = startServer();
test.after(async () => (await started).close());

test('the activity stamp moves on every audited change and is available to every signed-in role', async () => {
  const { base } = await started;
  assert.equal((await client(base).get('/api/keystone/activity-stamp')).status, 401);

  const employee = await signedIn(base, 'employee');
  const before = await employee.get('/api/keystone/activity-stamp');
  assert.equal(before.status, 200);
  assert.equal(typeof before.body.latestAuditId, 'number');
  assert.equal(before.headers.get('cache-control'), 'no-store');

  // Another person's work (an admin acknowledging a risk) must be visible to the employee's tab through the stamp alone.
  const admin = await signedIn(base, 'admin');
  const risks = (await admin.get('/api/keystone/risks')).body;
  const skill = risks.skills.find((entry) => entry.busFactor <= 1) ?? risks.skills[0];
  const owners = (await admin.get('/api/keystone/users/assignable-owners')).body.items;
  const created = await admin.post('/api/keystone/risk-acknowledgements', {
    riskType: 'skill', entityId: skill.id, ownerUserId: owners[0].id, note: 'Stamp test', dueDate: '2027-01-31', nextReviewDate: '2026-12-01',
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));

  const after = await employee.get('/api/keystone/activity-stamp');
  assert.ok(after.body.latestAuditId > before.body.latestAuditId, 'stamp did not move');
  // A risk acknowledgement is not an official data change, so the data stamp stays put.
  assert.equal(after.body.dataUpdatedAt, before.body.dataUpdatedAt);
});
