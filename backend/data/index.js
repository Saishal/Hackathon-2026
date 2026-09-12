const { db, run, all, get, DB_PATH } = require('./db');
const { createTables } = require('./schema');
const { seedDemoData } = require('./seed');
const queries = require('./queries');
const { loadWorkforce } = require('./workforce');

async function initializeDatabase() {
  await createTables();
  await seedDemoData();
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
