const { run } = require('./db');

async function createTables() {
  await run(`
    CREATE TABLE IF NOT EXISTS employees (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      role TEXT NOT NULL,
      department TEXT NOT NULL
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS skills (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS employee_skills (
      employee_id INTEGER NOT NULL,
      skill_id INTEGER NOT NULL,
      proficiency INTEGER NOT NULL CHECK (proficiency BETWEEN 1 AND 5),
      PRIMARY KEY (employee_id, skill_id),
      FOREIGN KEY (employee_id) REFERENCES employees(id),
      FOREIGN KEY (skill_id) REFERENCES skills(id)
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS future_skill_targets (
      skill_id INTEGER PRIMARY KEY,
      target_people INTEGER NOT NULL CHECK (target_people >= 0),
      FOREIGN KEY (skill_id) REFERENCES skills(id)
    )
  `);
}

module.exports = { createTables };
