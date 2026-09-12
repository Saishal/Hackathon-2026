// Rebuilds the database from the CSV seed. Stop the backend first: Windows will not
// delete a database file that another process has open.
const fs = require('node:fs');
const path = require('node:path');

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
