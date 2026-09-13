const { run, get } = require('./db');
const { readSeedDataset } = require('./dataset');

// Writes a validated CSV dataset in one transaction, allocating integer IDs as it goes.
async function importDataset(dataset) {
  const roleIds = new Map();
  const skillIds = new Map();
  const employeeIds = new Map();

  await run('BEGIN TRANSACTION');

  try {
    for (const role of dataset.roles) {
      const { lastID } = await run(
        'INSERT INTO critical_roles (name, criticality, metadata_source) VALUES (?, ?, ?)',
        [role.name, role.criticality, role.source],
      );
      roleIds.set(role.name, lastID);
    }

    for (const skill of dataset.skills) {
      const { lastID } = await run('INSERT INTO skills (name) VALUES (?)', [skill.name]);
      skillIds.set(skill.name, lastID);

      await run(
        `INSERT INTO skill_requirements (skill_id, criticality, target_proficiency, required_holders, metadata_source)
         VALUES (?, ?, ?, ?, ?)`,
        [lastID, skill.criticality, skill.targetProficiency, skill.requiredHolders, skill.source],
      );

      if (skill.demandTarget !== null) {
        await run('INSERT INTO future_skill_targets (skill_id, target_people) VALUES (?, ?)', [lastID, skill.demandTarget]);
      }
    }

    for (const employee of dataset.employees) {
      const { lastID } = await run(
        'INSERT INTO employees (name, role, department, mentoring_hours_per_month, reports_externally, start_date) VALUES (?, ?, ?, ?, ?, ?)',
        [employee.name, employee.role, employee.department, employee.mentoringHoursPerMonth, employee.reportsExternally ? 1 : 0, employee.startDate ?? null],
      );
      employeeIds.set(employee.name, lastID);
    }

    // Managers may appear later in the file than their reports, so links are set once every ID exists.
    for (const employee of dataset.employees) {
      if (employee.manager) {
        await run('UPDATE employees SET manager_id = ? WHERE id = ?', [employeeIds.get(employee.manager), employeeIds.get(employee.name)]);
      }
    }

    for (const requirement of dataset.roleRequirements) {
      await run(
        'INSERT INTO role_skill_requirements (role_id, skill_id, minimum_proficiency) VALUES (?, ?, ?)',
        [roleIds.get(requirement.role), skillIds.get(requirement.skill), requirement.minimumProficiency],
      );
    }

    for (const edge of dataset.employeeSkills) {
      await run(
        `INSERT INTO employee_skills (employee_id, skill_id, proficiency, evidence_source, last_verified_at)
         VALUES (?, ?, ?, ?, ?)`,
        [employeeIds.get(edge.employee), skillIds.get(edge.skill), edge.proficiency, edge.evidenceSource, edge.lastVerifiedAt],
      );
    }

    for (const resource of dataset.resources) {
      const { lastID } = await run(
        'INSERT INTO resources (slug, title, kind, url, provider, verified, provenance) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [resource.slug, resource.title, resource.kind, resource.url, resource.provider, resource.verified ? 1 : 0, resource.provenance],
      );

      for (const name of resource.skills) {
        await run('INSERT INTO resource_skills (resource_id, skill_id) VALUES (?, ?)', [lastID, skillIds.get(name)]);
      }
    }

    for (const requirement of dataset.futureRequirements) {
      await run(
        `INSERT INTO future_requirements
           (skill_id, required_holders, target_proficiency, criticality, effective_month, status, provenance)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          skillIds.get(requirement.skill),
          requirement.requiredHolders,
          requirement.targetProficiency,
          requirement.criticality,
          requirement.effectiveMonth,
          requirement.status,
          requirement.provenance,
        ],
      );
    }

    await run('COMMIT');
  } catch (error) {
    await run('ROLLBACK');
    throw error;
  }
}

// Only an empty database is seeded, so edits made through the API survive restarts.
// `npm run seed:reset` rebuilds the database from the CSV files.
async function seedDemoData() {
  const { count } = await get('SELECT COUNT(*) AS count FROM employees');

  if (count > 0) {
    const roles = await get('SELECT COUNT(*) AS count FROM critical_roles');

    if (roles.count === 0) {
      console.warn('Database predates the CSV seed and has no critical roles; stop the backend and run `npm run seed:reset`.');
    }

    return false;
  }

  await importDataset(readSeedDataset());
  return true;
}

// Databases seeded before reporting lines and catalogue providers existed get them from the same CSV,
// matched by name and slug. Only empty values are filled, so nothing edited in the app is overwritten.
async function backfillFromSeed(dataset) {
  const { count } = await get('SELECT COUNT(*) AS count FROM employees WHERE manager_id IS NOT NULL OR reports_externally = 1');
  if (count === 0) {
    for (const employee of dataset.employees) {
      await run(
        `UPDATE employees SET reports_externally = ?, manager_id = (SELECT id FROM employees WHERE name = ?)
         WHERE name = ? AND manager_id IS NULL`,
        [employee.reportsExternally ? 1 : 0, employee.manager, employee.name],
      );
    }
  }
  for (const resource of dataset.resources) {
    if (resource.provider) await run('UPDATE resources SET provider = ? WHERE slug = ? AND provider IS NULL', [resource.provider, resource.slug]);
  }
}

module.exports = { importDataset, seedDemoData, backfillFromSeed };
