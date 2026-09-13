const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const DB_FILE = path.join(os.tmpdir(), `keystone-monitoring-test-${process.pid}.db`);
fs.rmSync(DB_FILE, { force: true });
process.env.DB_PATH = DB_FILE;
delete process.env.KEYSTONE_ALERT_WEBHOOK_URL;

const data = require('../data');
const { checkHealth, reportError } = require('../monitoring');

const ready = data.initializeDatabase();

test.after(() => {
  data.db.close();
});

test('health reports every component and passes on a seeded database', async () => {
  await ready;
  const health = await checkHealth();

  assert.equal(health.status, 'ok');
  assert.deepEqual(health.failing, []);
  assert.equal(health.checks.database.status, 'ok');
  assert.equal(health.checks.seed.status, 'ok');
  assert.ok(health.checks.seed.employees > 0);
  assert.equal(health.checks.ai.status, 'ok');
  assert.ok(['demo', 'openai'].includes(health.checks.ai.provider));
  assert.ok(!Number.isNaN(Date.parse(health.checkedAt)));
});

test('ai running in demo mode is reported, not treated as a failure', async () => {
  await ready;
  const health = await checkHealth();

  assert.equal(health.checks.ai.configured, false);
  assert.equal(health.checks.ai.reason, 'missing_api_key');
  assert.equal(health.status, 'ok');
});

test('health fails and names the table when a core table is gone', async () => {
  await ready;
  await data.run('PRAGMA foreign_keys = OFF');
  await data.run('DROP TABLE role_skill_requirements');

  const health = await checkHealth();

  assert.equal(health.status, 'fail');
  assert.ok(health.failing.includes('schema'));
  assert.deepEqual(health.checks.schema.missing, ['role_skill_requirements']);
  assert.equal(health.checks.database.status, 'ok');

  await data.run('PRAGMA foreign_keys = ON');
  await data.initializeDatabase();
  assert.equal((await checkHealth()).checks.schema.status, 'ok');
});

test('health fails and names the component when the seed is missing', async () => {
  await ready;
  await data.run('PRAGMA foreign_keys = OFF');
  await data.run('DELETE FROM employee_skills');
  await data.run('DELETE FROM employees');

  const health = await checkHealth();

  assert.equal(health.status, 'fail');
  assert.deepEqual(health.failing, ['seed']);
  assert.match(health.checks.seed.reason, /seed:reset/);
  assert.equal(health.checks.database.status, 'ok');

  await data.run('PRAGMA foreign_keys = ON');
});

test('reportError is a silent no-op when no webhook is configured', async () => {
  delete process.env.KEYSTONE_ALERT_WEBHOOK_URL;

  const sent = await reportError(new Error('boom'), { status: 500, method: 'GET', path: '/x' });

  assert.equal(sent, false);
});

test('reportError posts a payload both Discord and Slack can read', async () => {
  const received = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      received.push({ headers: req.headers, body: JSON.parse(body) });
      res.writeHead(204).end();
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  process.env.KEYSTONE_ALERT_WEBHOOK_URL = `http://127.0.0.1:${server.address().port}/hook`;

  try {
    const sent = await reportError(new Error('database is locked'), {
      status: 500,
      method: 'PUT',
      path: '/api/keystone/employee-skills',
    });

    assert.equal(sent, true);
    assert.equal(received.length, 1);
    const [{ headers, body }] = received;
    assert.match(headers['content-type'], /application\/json/);
    assert.equal(body.content, body.text);
    assert.match(body.content, /HTTP 500/);
    assert.match(body.content, /PUT \/api\/keystone\/employee-skills/);
    assert.match(body.content, /database is locked/);
    assert.equal(body.error.message, 'database is locked');
    assert.ok(body.error.stack);
    assert.equal(body.context.status, 500);
  } finally {
    delete process.env.KEYSTONE_ALERT_WEBHOOK_URL;
    server.close();
  }
});

test('an unreachable webhook never throws', async () => {
  process.env.KEYSTONE_ALERT_WEBHOOK_URL = 'http://127.0.0.1:1/unreachable';

  try {
    const sent = await reportError(new Error('boom'));
    assert.equal(sent, false);
  } finally {
    delete process.env.KEYSTONE_ALERT_WEBHOOK_URL;
  }
});
