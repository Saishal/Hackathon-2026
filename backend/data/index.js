const { db, run, all, get, DB_PATH } = require('./db');
const { createTables, migrate, backfillDefaults, dropSupersededResources } = require('./schema');
const {
  seedDemoData,
  backfillRoles,
  backfillResources,
  backfillMentoringCapacity,
} = require('./seed');
const queries = require('./queries');
const { loadWorkforce } = require('./workforce');
const { createWorkforceFixture } = require('./fixture');

async function initializeDatabase() {
  await dropSupersededResources();
  await createTables();
  await migrate();
  await seedDemoData();
  await backfillDefaults();
  await backfillRoles();
  await backfillResources();
  await backfillMentoringCapacity();
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
