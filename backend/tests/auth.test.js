const test = require('node:test');
const assert = require('node:assert/strict');
const { ACCOUNTS, DEMO_PASSWORD, useTempDatabase, startServer, client, signedIn } = require('./helpers/server');

useTempDatabase('auth');
const { createLoginLimiter } = require('../security/rate-limit');
const { hashPassword, verifyPassword } = require('../security/passwords');

const started = startServer({ limiter: createLoginLimiter({ maxFailures: 3, windowMinutes: 15 }) });
test.after(async () => (await started).close());

test('passwords are stored as salted scrypt hashes, never as plaintext', async () => {
  const { data } = await started;
  const rows = await data.all('SELECT email, password_hash FROM users');
  assert.equal(rows.length, 4);
  for (const row of rows) {
    assert.match(row.password_hash, /^scrypt\$32768\$8\$1\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/);
    assert.ok(!row.password_hash.includes(DEMO_PASSWORD));
  }
  assert.equal(new Set(rows.map((row) => row.password_hash)).size, rows.length, 'each account has its own salt');

  const hash = await hashPassword('a sufficiently long password');
  assert.equal(await verifyPassword('a sufficiently long password', hash), true);
  assert.equal(await verifyPassword('a sufficiently long passwork', hash), false);
  await assert.rejects(() => hashPassword('short'), /12-128 characters/);
});

test('signing in returns the user and capabilities in an HTTP-only session cookie, with no secrets', async () => {
  const { base } = await started;
  const admin = client(base);
  const response = await admin.login(ACCOUNTS.admin);

  assert.equal(response.status, 200);
  assert.equal(response.body.user.role, 'admin');
  assert.equal(response.body.user.roleLabel, 'Admin');
  assert.ok(response.body.capabilities.includes('users.manage'));
  assert.equal(response.body.organization.environment, 'demo');
  assert.doesNotMatch(response.text, /password|scrypt|hash/i);

  const cookie = response.headers.get('set-cookie');
  assert.match(cookie, /^keystone_session=[A-Za-z0-9_-]{43};/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);

  const me = await admin.get('/api/auth/me');
  assert.equal(me.status, 200);
  assert.equal(me.body.user.email, ACCOUNTS.admin);
});

test('failed sign-ins get one generic message whether the account exists or not', async () => {
  const { base } = await started;
  const wrongPassword = await client(base).login(ACCOUNTS.hr, 'not-the-password');
  const unknownAccount = await client(base).login('nobody@keystone.demo', 'not-the-password');

  assert.equal(wrongPassword.status, 401);
  assert.equal(unknownAccount.status, 401);
  assert.equal(wrongPassword.body.code, 'invalid_credentials');
  assert.equal(wrongPassword.body.error, unknownAccount.body.error);
});

test('login payloads are validated with structured field errors', async () => {
  const { base } = await started;
  const response = await client(base).post('/api/auth/login', { email: 5, extra: true });

  assert.equal(response.status, 400);
  assert.equal(response.body.code, 'validation_failed');
  const fields = response.body.details.map((detail) => `${detail.field}:${detail.code}`).sort();
  assert.deepEqual(fields, ['email:invalid_type', 'extra:unknown_field', 'password:required']);
  assert.ok(response.body.details.every((detail) => typeof detail.message === 'string' && detail.message.length > 0));
});

test('repeated failures lock the account for a while, even with the right password afterwards', async () => {
  const { base, data } = await started;
  const admin = await signedIn(base, 'admin');
  const email = 'lockout.check@keystone.demo';
  const password = 'Lockout-Check-Pass-1';
  assert.equal((await admin.post('/api/keystone/users', { email, displayName: 'Lockout Check', role: 'hr', employeeId: null, password })).status, 201);

  const person = client(base);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    assert.equal((await person.login(email, 'wrong-password-attempt')).status, 401);
  }
  const locked = await person.login(email, password);
  assert.equal(locked.status, 429);
  assert.equal(locked.body.code, 'too_many_attempts');
  assert.ok(Number(locked.headers.get('retry-after')) > 0);

  const [blocked] = await data.all("SELECT COUNT(*) AS count FROM audit_log WHERE action_type = 'auth.login_blocked'");
  assert.ok(blocked.count >= 1);
});

test('unauthenticated requests are rejected, health and the environment label stay public', async () => {
  const { base } = await started;
  const anonymous = client(base);

  assert.equal((await anonymous.get('/api/health')).status, 200);
  assert.deepEqual((await anonymous.get('/api/auth/environment')).body, { environment: 'demo', organizationName: 'Harbor & Pine Co. (demo tenant)' });
  for (const route of ['/api/keystone/workforce', '/api/keystone/risks', '/api/keystone/audit-log', '/api/heatmap', '/api/auth/me']) {
    const response = await anonymous.get(route);
    assert.equal(response.status, 401, route);
    assert.equal(response.body.code, 'unauthenticated');
  }
  assert.equal((await anonymous.put('/api/keystone/employee-skills', { employeeId: 1, skillId: 1, proficiency: 3, evidenceSource: 'x' })).status, 401);
});

test('logging out revokes the session on the server', async () => {
  const { base } = await started;
  const hr = await signedIn(base, 'hr');
  const cookie = hr.cookie;

  assert.equal((await hr.post('/api/auth/logout')).status, 204);
  const replay = client(base);
  replay.cookie = cookie;
  assert.equal((await replay.get('/api/keystone/workforce')).status, 401);
});

test('every role is blocked from at least one endpoint by the backend', async () => {
  const { base } = await started;
  const cases = {
    employee: [['GET', '/api/keystone/risks'], ['GET', '/api/keystone/audit-log'], ['POST', '/api/keystone/simulate', { horizonMonths: 12 }],
      ['PUT', '/api/keystone/employee-skills', { employeeId: 1, skillId: 1, proficiency: 5, evidenceSource: 'self-assessed' }]],
    manager: [['GET', '/api/keystone/audit-log'], ['GET', '/api/keystone/users'], ['POST', '/api/keystone/development-plan', { skillId: 1 }],
      ['GET', '/api/keystone/exports/data-quality.csv']],
    hr: [['GET', '/api/keystone/users'], ['POST', '/api/keystone/future-requirements', { skillId: 1, requiredHolders: 2, targetProficiency: 3, effectiveMonth: 12, provenance: 'x' }],
      ['PUT', '/api/keystone/employee-skills', { employeeId: 1, skillId: 1, proficiency: 3, evidenceSource: 'review' }], ['PATCH', '/api/keystone/organization', { name: 'Renamed' }]],
  };

  for (const [role, requests] of Object.entries(cases)) {
    const person = await signedIn(base, role);
    for (const [method, route, body] of requests) {
      const response = method === 'GET' ? await person.get(route) : await person[method.toLowerCase()](route, body);
      assert.equal(response.status, 403, `${role} ${method} ${route}`);
      assert.equal(response.body.code, 'forbidden');
      assert.ok(response.body.requiredPermission, 'a 403 names the missing permission');
    }
  }

  // Admins hold every permission, but separation of duties still stops them approving their own change.
  const admin = await signedIn(base, 'admin');
  const workforce = (await admin.get('/api/keystone/workforce')).body;
  const liam = workforce.employees.find((employee) => employee.name === 'Liam Chen');
  const kubernetes = workforce.skills.find((skill) => skill.name === 'Kubernetes');
  const own = await admin.post('/api/keystone/change-requests', { type: 'employee_skill',
    payload: { operation: 'upsert', employeeId: liam.id, skillId: kubernetes.id, proficiency: 2, evidenceSource: 'Workshop attendance' } });
  assert.equal(own.status, 201);
  const selfApproval = await admin.post(`/api/keystone/change-requests/${own.body.id}/approve`, {});
  assert.equal(selfApproval.status, 403);
});

test('hidden frontend capabilities are enforced by data scoping, not only by status codes', async () => {
  const { base } = await started;
  const employee = await signedIn(base, 'employee');
  const manager = await signedIn(base, 'manager');

  const own = (await employee.get('/api/keystone/workforce')).body;
  assert.equal(own.visibility, 'self');
  assert.deepEqual(own.employees.map((person) => person.name), ['Mason Green']);
  assert.ok(own.matrix.every((edge) => edge.employeeId === employee.user.employeeId));

  const team = (await manager.get('/api/keystone/workforce')).body;
  const names = team.employees.map((person) => person.name);
  assert.equal(team.visibility, 'team');
  assert.ok(names.includes('Liam Chen') && names.includes('Mason Green') && names.includes('Rachel Moreno'));
  assert.ok(!names.includes('Isabella Ross') && !names.includes('Abigail Lewis'));

  const risks = (await manager.get('/api/keystone/employee-risks')).body;
  assert.ok(risks.employees.every((person) => names.includes(person.name)));
  const successors = risks.employees.flatMap((person) => person.successors);
  assert.ok(successors.every((candidate) => candidate.redacted || names.includes(candidate.name)));

  const cybersecurity = (await manager.get('/api/keystone/risks')).body.skills.find((skill) => skill.name === 'Cybersecurity');
  assert.deepEqual(cybersecurity.holderIds, []);
  assert.equal(cybersecurity.holdersOutsideScope, 1);
  assert.equal(cybersecurity.busFactor, 1, 'scores stay organization-wide and truthful');
});

test('state-changing requests from an unlisted browser origin are refused', async () => {
  const { base } = await started;
  const hr = await signedIn(base, 'hr');
  const forged = await hr.post('/api/auth/logout', {}, { Origin: 'https://attacker.example' });
  assert.equal(forged.status, 403);
  assert.equal(forged.body.code, 'origin_not_allowed');
  assert.equal((await hr.get('/api/auth/me')).status, 200, 'the forged logout did not end the session');
  assert.equal((await hr.post('/api/auth/logout', {}, { Origin: 'http://localhost:5173' })).status, 204);
});

test('disabling an account signs it out immediately', async () => {
  const { base } = await started;
  const admin = await signedIn(base, 'admin');
  const created = await admin.post('/api/keystone/users', {
    email: 'temp.contractor@keystone.demo', displayName: 'Temp Contractor', role: 'hr', employeeId: null, password: 'Temporary-Pass-123',
  });
  assert.equal(created.status, 201);

  const contractor = client(base);
  assert.equal((await contractor.login('temp.contractor@keystone.demo', 'Temporary-Pass-123')).status, 200);
  assert.equal((await admin.patch(`/api/keystone/users/${created.body.id}`, { disabled: true })).status, 200);
  assert.equal((await contractor.get('/api/auth/me')).status, 401);
  assert.equal((await client(base).login('temp.contractor@keystone.demo', 'Temporary-Pass-123')).status, 401);

  const lastAdmin = await admin.patch(`/api/keystone/users/${admin.user.id}`, { role: 'hr' });
  assert.equal(lastAdmin.status, 409);
});
