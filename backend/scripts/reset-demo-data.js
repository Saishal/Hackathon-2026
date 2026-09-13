// Rebuilds the database from the CSV seed. Stop the backend first: Windows will not
// delete a database file that another process has open.
const fs = require('node:fs');
const path = require('node:path');

// `--dataset enterprise` seeds from data/enterprise instead of the demo folder (same as KEYSTONE_SEED_DIR).
const datasetFlag = process.argv.indexOf('--dataset');
if (datasetFlag !== -1) {
  const name = process.argv[datasetFlag + 1];
  if (!name || !/^[a-z0-9-]+$/.test(name)) { console.error('Usage: reset-demo-data.js [--dataset <folder under backend/data>]'); process.exit(1); }
  process.env.KEYSTONE_SEED_DIR = path.join(__dirname, '..', 'data', name);
  if (!fs.existsSync(path.join(process.env.KEYSTONE_SEED_DIR, 'employees.csv'))) { console.error(`No dataset at ${process.env.KEYSTONE_SEED_DIR}`); process.exit(1); }
}

// Same default as data/db.js, resolved here because requiring that module opens the file.
const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'skillsight.db');

for (const suffix of ['', '-journal', '-wal', '-shm']) {
  try {
    fs.rmSync(`${dbPath}${suffix}`, { force: true });
  } catch (error) {
    if (error.code !== 'EBUSY' && error.code !== 'EPERM') throw error;
    console.error(`${dbPath}${suffix} is in use. Stop the backend, then run this again.`);
    process.exit(1);
  }
}

const data = require('../data');
const { DEFAULT_SEED_DIR } = require('../data/dataset');

data.initializeDatabase()
  .then(async () => {
    const workforce = await data.loadWorkforce();
    console.log(`Seeded ${dbPath} from ${process.env.KEYSTONE_SEED_DIR || DEFAULT_SEED_DIR}: `
      + `${workforce.employees.length} employees, ${workforce.skills.length} skills, ${workforce.matrix.length} skill records.`);
  })
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => data.db.close());
