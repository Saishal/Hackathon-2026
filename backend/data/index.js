const { db, run, all, get, DB_PATH } = require('./db');
const { createTables, migrate, backfillDefaults, dropSupersededResources } = require('./schema');
const { seedDemoData } = require('./seed');
const queries = require('./queries');
const { loadWorkforce } = require('./workforce');
const { createWorkforceFixture } = require('./fixture');

// Roles, catalogue and mentoring capacity now come from the CSV seed rather than being
// derived from hardcoded profiles, so there is nothing left to backfill for them.
async function initializeDatabase() {
  await dropSupersededResources();
  await createTables();
  await migrate();
  await seedDemoData();
  await backfillDefaults();
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
