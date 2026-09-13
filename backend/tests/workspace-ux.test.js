const test = require('node:test');
const assert = require('node:assert/strict');
const { useTempDatabase, startServer, client, signedIn, ACCOUNTS, DEMO_PASSWORD } = require('./helpers/server');
useTempDatabase('workspace-ux');
const { createSession, resolveSession } = require('../security/sessions');
const { cookieOptions } = require('../middleware/auth');
const { loadConfig } = require('../config');
const { buildSkillMap } = require('../../shared/skill-map.mjs');
const started = startServer();
test.after(async () => (await started).close());
test('persistent vs browser sessions restore, expire, revoke and retain cookie protection', async () => {
  const { base, config } = await started;
  for (const persistent of [true, false]) {
    const person = client(base);
    const response = await person.post('/api/auth/login', { email: ACCOUNTS.hr, password: DEMO_PASSWORD, keepSignedIn: persistent });
    assert.equal(response.status, 200);
    const cookie = response.headers.get('set-cookie');
    assert.match(cookie, /HttpOnly/); assert.match(cookie, /SameSite=Lax/);
    assert.equal(/Max-Age=/.test(cookie), persistent);
    assert.equal(/Expires=/.test(cookie), persistent);
    const restored = client(base); restored.cookie = person.cookie;
    assert.equal((await restored.get('/api/auth/me')).status, 200);
    const saved = restored.cookie;
    const logout = await restored.post('/api/auth/logout');
    assert.equal(logout.status, 204);
    assert.match(logout.headers.get('set-cookie'), /Expires=Thu, 01 Jan 1970/);
    restored.cookie = saved;
    assert.equal((await restored.get('/api/auth/me')).status, 401);
  }
  assert.equal(cookieOptions(loadConfig({ KEYSTONE_ENVIRONMENT: 'production' })).secure, true);
  const person = await signedIn(base, 'hr');
  const now = new Date('2026-01-01T00:00:00Z');
  const short = await createSession(person.user.id, config, { now, persistent: false });
  const long = await createSession(person.user.id, config, { now, persistent: true });
  assert.equal(Date.parse(short.absoluteExpiresAt) - +now, 8 * 3600000);
  assert.equal(Date.parse(long.absoluteExpiresAt) - +now, 24 * 3600000);
  assert.equal(await resolveSession(short.token, config, new Date(+now + 8 * 3600000)), null);
  assert.equal(await resolveSession(long.token, config, new Date(+now + 24 * 3600000)), null);
  assert.equal((await client(base).post('/api/auth/login', { email: ACCOUNTS.hr, password: DEMO_PASSWORD, keepSignedIn: 'yes' })).status, 400);
});
test('skill map export rejects unauthorized roles and applies exactly the visible filters', async () => {
  const { base, data } = await started;
  const path = '/api/keystone/exports/skill-map.csv';
  assert.equal((await client(base).get(path)).status, 401);
  const employee = await signedIn(base, 'employee');
  assert.equal((await employee.get(path)).status, 403);
  for (const role of ['admin', 'hr', 'manager']) {
    const person = await signedIn(base, role);
    const workforce = (await person.get('/api/keystone/workforce')).body;
    const risks = (await person.get('/api/keystone/risks')).body;
    const edge = workforce.matrix.find((entry) => entry.proficiency >= 3);
    const skill = workforce.skills.find((entry) => entry.id === edge.skillId);
    const department = workforce.employees.find((entry) => entry.id === edge.employeeId).department;
    const filters = { department, q: skill.name, minProficiency: 3, concentratedOnly: false };
    const expected = buildSkillMap(workforce, risks, filters).edges;
    const response = await person.get(`${path}?${new URLSearchParams(filters)}`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-disposition'), /keystone-skill-map-2026-09-12.csv/);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const lines = response.text.trim().split('\r\n');
    assert.equal(lines.length - 1, expected.length);
    assert.match(lines[0], /employee_id,employee_name,role,department,skill_id/);
    const ids = lines.slice(1).map((line) => Number(line.split(',')[0]));
    assert.deepEqual(ids.sort((a,b) => a-b), expected.map((entry) => entry.employeeId).sort((a,b) => a-b));
    assert.ok(ids.every((id) => workforce.employees.some((entry) => entry.id === id)));
    assert.equal((await person.get(`${path}?q=does-not-exist`)).status, 422);
    assert.equal((await person.get(`${path}?department=not-visible`)).status, 422);
    assert.equal((await person.get(`${path}?minProficiency=9`)).status, 400);
    assert.equal((await person.get(`${path}?q=a&q=b`)).status, 400);
    for (const filter of [{ minProficiency: 5 }, { concentratedOnly: true }]) {
      const filtered = buildSkillMap(workforce, risks, filter).edges;
      const result = await person.get(`${path}?${new URLSearchParams(filter)}`);
      assert.equal(result.status, filtered.length ? 200 : 422);
      if (filtered.length) assert.equal(result.text.trim().split('\r\n').length - 1, filtered.length);
    }
  }
  const audits = await data.all("SELECT actor_user_id, metadata_json FROM audit_log WHERE action_type = 'export.generated' AND entity_id = 'skill-map'");
  assert.ok(audits.length >= 3);
  for (const audit of audits) {
    const metadata = JSON.parse(audit.metadata_json);
    assert.ok(audit.actor_user_id);
    assert.equal(metadata.exportType, 'skill-map');
    assert.equal(metadata.filters.q, undefined);
    assert.equal(metadata.dataset, undefined);
  }
});
