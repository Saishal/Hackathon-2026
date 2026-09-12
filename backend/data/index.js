const { db, run, all, get, DB_PATH } = require('./db');
const { createTables, migrate, backfillDefaults } = require('./schema');
const { seedDemoData, backfillRoles } = require('./seed');
const queries = require('./queries');
const { loadWorkforce } = require('./workforce');

async function initializeDatabase() {
  await createTables();
  await migrate();
  await seedDemoData();
  await backfillDefaults();
  await backfillRoles();
}

module.exports = {
  db,
  run,
  all,
  get,
  DB_PATH,
  initializeDatabase,
  loadWorkforce,
  ...queries,
};
