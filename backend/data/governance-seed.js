const { run, get } = require('./db');
const { readSeedDataset } = require('./dataset');
const { backfillFromSeed } = require('./seed');
const { ensureOrganization } = require('./organization');
const { createUser } = require('./users');
const { recordAudit } = require('./audit');
const { loadConfig } = require('../config');

// Governance seed: organization settings, demo sign-in accounts and one illustrative saved scenario.
// Deterministic, and each part runs only when its table is empty, so restarts never duplicate rows.

async function once(id, work) {
  if (await get('SELECT id FROM schema_migrations WHERE id = ?', [id])) return;
  await work();
  await run('INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)', [id, new Date().toISOString()]);
}

async function seedDemoAccounts(dataset, config) {
  const created = [];
  for (const account of dataset.users) {
    const employee = account.employee ? await get('SELECT id FROM employees WHERE name = ?', [account.employee]) : null;
    if (account.employee && !employee) {
      console.warn(`Skipping demo account ${account.email}: employee "${account.employee}" is not in the database.`);
      continue;
    }
    const user = await createUser({
      email: account.email, displayName: account.displayName, role: account.role, employeeId: employee?.id ?? null, password: config.demoPassword,
    });
    await recordAudit({
      action: 'user.created', entityType: 'user', entityId: user.id, entityLabel: user.email, source: 'seed',
      summary: `Demo account ${user.email} created with the ${user.role} role`,
      after: { email: user.email, displayName: user.displayName, role: user.role, employeeId: user.employeeId },
    });
    created.push(user);
  }
  return created;
}

// Liam Chen leaves in month 9 while his own mentoring of Mason Green only completes in month 10: the
// data-quality checks flag the late intervention and the missing ready successor on this draft.
async function seedDemoScenario(owner) {
  const liam = await get("SELECT id FROM employees WHERE name = 'Liam Chen'");
  const mason = await get("SELECT id FROM employees WHERE name = 'Mason Green'");
  const billing = await get("SELECT id FROM skills WHERE name = 'Legacy Billing Recovery'");
  if (!liam || !mason || !billing || !owner) return;

  const departures = [{ employeeId: liam.id, month: 9 }];
  const interventions = [{ employeeId: mason.id, skillId: billing.id, mentorId: liam.id, startMonth: 0, completionMonth: 10,
    targetProficiency: 3, assumeVerified: true }];
  const now = new Date().toISOString();
  const { lastID } = await run(
    `INSERT INTO scenarios (name, horizon_months, departures_json, interventions_json, include_pending, created_by, updated_by, created_at, updated_at)
     VALUES (?, 12, ?, ?, 0, ?, ?, ?, ?)`,
    ['Billing continuity draft', JSON.stringify(departures), JSON.stringify(interventions), owner.id, owner.id, now, now],
  );
  await recordAudit({
    action: 'scenario.saved', entityType: 'scenario', entityId: lastID, entityLabel: 'Billing continuity draft', source: 'seed',
    summary: 'Demo scenario "Billing continuity draft" saved by the seed',
    after: { name: 'Billing continuity draft', horizonMonths: 12, departures, interventions },
  });
}

async function seedGovernance({ datasetSeeded = false, config = loadConfig() } = {}) {
  await ensureOrganization(config.environment);

  let dataset;
  const readDataset = () => (dataset ||= readSeedDataset());

  // A database seeded before reporting lines existed is filled in once from the same CSV.
  await once('governance-seed-relationships', async () => {
    if (!datasetSeeded) await backfillFromSeed(readDataset());
  });

  if (datasetSeeded) {
    const counts = await get(`SELECT (SELECT COUNT(*) FROM employees) AS employees, (SELECT COUNT(*) FROM skills) AS skills,
      (SELECT COUNT(*) FROM employee_skills) AS evidence`);
    await recordAudit({
      action: 'dataset.imported', entityType: 'dataset', entityId: 'csv-seed', entityLabel: 'CSV demo dataset', source: 'seed',
      summary: `Imported ${counts.employees} employees, ${counts.skills} skills and ${counts.evidence} evidence records from the CSV seed`,
      metadata: counts,
    });
  }

  const { count } = await get('SELECT COUNT(*) AS count FROM users');
  if (count > 0) return;

  if (config.environment !== 'demo' || !config.demoPassword) {
    console.warn('No user accounts exist and demo accounts are only seeded in the demo environment. See README "Demo accounts".');
    return;
  }

  const accounts = await seedDemoAccounts(readDataset(), config);
  const { count: scenarios } = await get('SELECT COUNT(*) AS count FROM scenarios');
  if (scenarios === 0) await seedDemoScenario(accounts.find((user) => user.role === 'hr') ?? accounts[0]);
}

module.exports = { seedGovernance };
