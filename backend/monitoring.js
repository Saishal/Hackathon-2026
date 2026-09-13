const { get } = require('./data');
const ai = require('./services/recommendations');

const ALERT_TIMEOUT_MS = 5000;

// Every table the snapshot reads. A missing one means requests will 500.
const CORE_TABLES = [
  'employees',
  'skills',
  'employee_skills',
  'skill_requirements',
  'critical_roles',
  'role_skill_requirements',
  'resources',
  'future_requirements',
];

// Checks the things a company's uptime monitor would actually need to know.
// AI in demo mode is by design and is reported, not counted as a failure.
async function checkHealth() {
  const checks = {};

  try {
    await get('SELECT 1 AS ok');
    checks.database = { status: 'ok' };
  } catch (error) {
    checks.database = { status: 'fail', reason: error.message };
  }

  const missingTables = [];
  for (const table of CORE_TABLES) {
    try {
      await get(`SELECT 1 FROM ${table} LIMIT 1`);
    } catch {
      missingTables.push(table);
    }
  }
  checks.schema = missingTables.length === 0
    ? { status: 'ok', tables: CORE_TABLES.length }
    : { status: 'fail', reason: `missing table(s): ${missingTables.join(', ')}`, missing: missingTables };

  try {
    const row = await get('SELECT COUNT(*) AS count FROM employees');
    checks.seed = row.count > 0
      ? { status: 'ok', employees: row.count }
      : { status: 'fail', reason: 'no employees seeded; run npm run seed:reset' };
  } catch (error) {
    checks.seed = { status: 'fail', reason: error.message };
  }

  const aiStatus = ai.status();
  checks.ai = {
    status: 'ok',
    provider: aiStatus.provider,
    configured: aiStatus.configured,
    ...(aiStatus.reason ? { reason: aiStatus.reason } : {}),
  };

  const failing = Object.entries(checks)
    .filter(([, check]) => check.status === 'fail')
    .map(([name]) => name);

  return {
    status: failing.length === 0 ? 'ok' : 'fail',
    failing,
    checks,
    checkedAt: new Date().toISOString(),
  };
}

// Posts a server error to KEYSTONE_ALERT_WEBHOOK_URL if one is configured.
// Sends both `content` (Discord) and `text` (Slack); each ignores the other.
// Never throws and never delays the HTTP response that triggered it.
async function reportError(error, context = {}) {
  const url = process.env.KEYSTONE_ALERT_WEBHOOK_URL;

  if (!url) {
    return false;
  }

  const summary = [
    'Keystone backend error',
    context.status ? `HTTP ${context.status}` : null,
    context.method && context.path ? `${context.method} ${context.path}` : null,
    error.message,
  ].filter(Boolean).join(' — ');

  const body = JSON.stringify({
    content: summary,
    text: summary,
    error: { message: error.message, stack: error.stack },
    context,
    at: new Date().toISOString(),
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ALERT_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal: controller.signal,
    });
    return response.ok;
  } catch (sendError) {
    console.error(`alert webhook failed: ${sendError.message}`);
    return false;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { checkHealth, reportError };
