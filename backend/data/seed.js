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
        'INSERT INTO employees (name, role, department, mentoring_hours_per_month) VALUES (?, ?, ?, ?)',
        [employee.name, employee.role, employee.department, employee.mentoringHoursPerMonth],
      );
      employeeIds.set(employee.name, lastID);
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
        'INSERT INTO resources (slug, title, kind, url, verified, provenance) VALUES (?, ?, ?, ?, ?, ?)',
        [resource.slug, resource.title, resource.kind, resource.url, resource.verified ? 1 : 0, resource.provenance],
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

module.exports = { importDataset, seedDemoData };
