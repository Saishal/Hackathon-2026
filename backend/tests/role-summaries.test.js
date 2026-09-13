const test = require('node:test');
const assert = require('node:assert/strict');
const { useTempDatabase, startServer, signedIn } = require('./helpers/server');
const { ROLES, describeRole, capabilities } = require('../security/permissions');

useTempDatabase('role-summaries');
const started = startServer();
test.after(async () => (await started).close());

test('every role has a plain-language summary with what it sees, can and cannot do', () => {
  for (const role of ROLES) {
    const summary = describeRole(role);
    assert.ok(summary, `${role} has no summary`);
    assert.equal(typeof summary.sees, 'string');
    assert.ok(summary.sees.length > 20, `${role}.sees is too short to be useful`);
    assert.ok(Array.isArray(summary.can) && summary.can.length > 0, `${role}.can is empty`);
    assert.ok(Array.isArray(summary.cannot) && summary.cannot.length > 0, `${role}.cannot is empty`);
    for (const line of [...summary.can, ...summary.cannot]) {
      assert.equal(typeof line, 'string');
      assert.match(line, /\.$/, `"${line}" should be a full sentence`);
    }
  }
  assert.equal(describeRole('nobody'), null);
});

test('summaries agree with the granted permissions they describe', () => {
  const grants = (role) => new Set(capabilities({ role }));
  assert.ok(grants('admin').has('users.manage'));
  assert.match(describeRole('admin').can.join(' '), /user accounts/i);
  assert.ok(!grants('hr').has('users.manage'));
  assert.match(describeRole('hr').cannot.join(' '), /user accounts/i);
  assert.ok(grants('manager').has('workforce.read.team') && !grants('manager').has('workforce.read.all'));
  assert.match(describeRole('manager').sees, /own team/i);
  assert.ok(!grants('employee').has('risk.read.org') && !grants('employee').has('risk.read.team'));
  assert.match(describeRole('employee').cannot.join(' '), /risk score/i);
});

test('GET /users returns the summary beside each assignable role, for admins only', async () => {
  const { base } = await started;
  const admin = await signedIn(base, 'admin');
  const response = await admin.get('/api/keystone/users');
  assert.equal(response.status, 200);
  assert.equal(response.body.roles.length, ROLES.length);
  for (const role of response.body.roles) {
    assert.ok(role.summary, `${role.value} arrived without a summary`);
    assert.deepEqual(role.summary, describeRole(role.value));
  }

  const hr = await signedIn(base, 'hr');
  assert.equal((await hr.get('/api/keystone/users')).status, 403);
});
