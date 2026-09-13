const { db, run, all, get, DB_PATH } = require('./db');
const { createTables, migrate, backfillDefaults, dropSupersededResources } = require('./schema');
const { runGovernanceMigrations } = require('./governance-schema');
const { seedDemoData } = require('./seed');
const { seedGovernance } = require('./governance-seed');
const queries = require('./queries');
const { loadWorkforce } = require('./workforce');
const { createWorkforceFixture } = require('./fixture');

// Roles, catalogue and mentoring capacity now come from the CSV seed rather than being
// derived from hardcoded profiles, so there is nothing left to backfill for them.
// Governance tables are added by recorded, additive migrations after the workforce schema exists.
async function initializeDatabase(options = {}) {
  await dropSupersededResources();
  await createTables();
  await migrate();
  await runGovernanceMigrations();
  const datasetSeeded = await seedDemoData();
  await backfillDefaults();
  await seedGovernance({ datasetSeeded, ...options });
}

module.exports = {
  db,
  run,
  all,
  get,
  DB_PATH,
  initializeDatabase,
  loadWorkforce,
  createWorkforceFixture,
  ...queries,
};
