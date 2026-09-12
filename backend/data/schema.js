const { run, all } = require('./db');

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

  // Replaces the values loadWorkforce used to hardcode, so criticality and
  // coverage requirements become editable and auditable per skill.
  await run(`
    CREATE TABLE IF NOT EXISTS skill_requirements (
      skill_id INTEGER PRIMARY KEY,
      criticality INTEGER NOT NULL CHECK (criticality BETWEEN 1 AND 5),
      target_proficiency INTEGER NOT NULL CHECK (target_proficiency BETWEEN 1 AND 5),
      required_holders INTEGER NOT NULL CHECK (required_holders >= 0),
      metadata_source TEXT NOT NULL,
      FOREIGN KEY (skill_id) REFERENCES skills(id)
    )
  `);
}

async function columnExists(table, column) {
  const columns = await all(`PRAGMA table_info(${table})`);
  return columns.some((entry) => entry.name === column);
}

// Table and column names here are internal constants, never caller input.
async function addColumnIfMissing(table, column, definition) {
  if (await columnExists(table, column)) {
    return;
  }

  await run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

// Additive only, so databases created before these fields existed keep their rows.
async function migrate() {
  await addColumnIfMissing('employee_skills', 'evidence_source', 'TEXT');
  await addColumnIfMissing('employee_skills', 'last_verified_at', 'TEXT');
  await addColumnIfMissing('employees', 'mentoring_available', 'INTEGER NOT NULL DEFAULT 1');
}

// Gives every row the values loadWorkforce previously computed in memory, so the
// published snapshot is unchanged while the source of truth moves into the database.
async function backfillDefaults() {
  await run(`
    UPDATE employee_skills
    SET evidence_source = 'fictional seed'
    WHERE evidence_source IS NULL
  `);

  await run(`
    INSERT INTO skill_requirements (
      skill_id, criticality, target_proficiency, required_holders, metadata_source
    )
    SELECT
      s.id,
      CASE WHEN s.name = 'Legacy Billing Recovery' THEN 5 ELSE 3 END,
      3,
      MAX(1, COALESCE(fst.target_people, 2)),
      'fictional demo default'
    FROM skills s
    LEFT JOIN future_skill_targets fst ON fst.skill_id = s.id
    WHERE s.id NOT IN (SELECT skill_id FROM skill_requirements)
  `);
}

module.exports = { createTables, migrate, backfillDefaults };
