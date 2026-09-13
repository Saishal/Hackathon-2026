const { run, all, get } = require('./db');

// Official workforce reads and writes used by governed endpoints and approvals. These functions do not
// open transactions themselves: callers wrap them in withTransaction together with their audit records.

async function getEvidence(employeeId, skillId) {
  const row = await get(
    `SELECT es.employee_id, es.skill_id, es.proficiency, es.evidence_source, es.last_verified_at,
            e.name AS employee_name, s.name AS skill_name
     FROM employee_skills es JOIN employees e ON e.id = es.employee_id JOIN skills s ON s.id = es.skill_id
     WHERE es.employee_id = ? AND es.skill_id = ?`,
    [employeeId, skillId],
  );
  return row ? {
    employeeId: row.employee_id,
    skillId: row.skill_id,
    proficiency: row.proficiency,
    evidenceSource: row.evidence_source,
    lastVerifiedAt: row.last_verified_at,
    employeeName: row.employee_name,
    skillName: row.skill_name,
  } : null;
}

const deleteEvidence = (employeeId, skillId) => run('DELETE FROM employee_skills WHERE employee_id = ? AND skill_id = ?', [employeeId, skillId]);

async function getEmployee(id) {
  const row = await get(
    `SELECT e.id, e.name, e.role, e.department, e.manager_id, e.reports_externally, e.mentoring_hours_per_month, m.name AS manager_name
     FROM employees e LEFT JOIN employees m ON m.id = e.manager_id WHERE e.id = ?`,
    [id],
  );
  return row ? {
    id: row.id,
    name: row.name,
    role: row.role,
    department: row.department,
    managerId: row.manager_id,
    managerName: row.manager_name,
    reportsExternally: row.reports_externally === 1,
    mentoringHoursPerMonth: row.mentoring_hours_per_month,
  } : null;
}

async function updateEmployee(id, fields) {
  const columns = { name: 'name', role: 'role', department: 'department', managerId: 'manager_id',
    reportsExternally: 'reports_externally', mentoringHoursPerMonth: 'mentoring_hours_per_month' };
  const entries = Object.entries(fields).filter(([key, value]) => columns[key] && value !== undefined);
  if (entries.length === 0) return;
  await run(`UPDATE employees SET ${entries.map(([key]) => `${columns[key]} = ?`).join(', ')} WHERE id = ?`,
    [...entries.map(([key, value]) => (key === 'reportsExternally' ? (value ? 1 : 0) : value)), id]);
}

// Walks up the reporting chain; returns true if making managerId the manager of employeeId would loop.
async function wouldCreateCycle(employeeId, managerId) {
  let current = managerId;
  const seen = new Set();
  while (current != null) {
    if (current === employeeId) return true;
    if (seen.has(current)) return true;
    seen.add(current);
    current = (await get('SELECT manager_id FROM employees WHERE id = ?', [current]))?.manager_id ?? null;
  }
  return false;
}

const roleExists = async (name) => Boolean(await get('SELECT id FROM critical_roles WHERE name = ?', [name]));
const getRole = (id) => get('SELECT id, name, criticality FROM critical_roles WHERE id = ?', [id]);
const getSkill = (id) => get('SELECT id, name, future_only AS futureOnly FROM skills WHERE id = ?', [id]);

async function getFutureRequirement(id) {
  return get(
    `SELECT fr.id, fr.skill_id AS skillId, s.name AS skillName, fr.required_holders AS requiredHolders,
            fr.target_proficiency AS targetProficiency, fr.criticality, fr.effective_month AS effectiveMonth,
            fr.status, fr.provenance
     FROM future_requirements fr JOIN skills s ON s.id = fr.skill_id WHERE fr.id = ?`,
    [id],
  );
}

async function updateFutureRequirement(id, fields) {
  const columns = { requiredHolders: 'required_holders', targetProficiency: 'target_proficiency', criticality: 'criticality',
    effectiveMonth: 'effective_month', status: 'status', provenance: 'provenance' };
  const entries = Object.entries(fields).filter(([key, value]) => columns[key] && value !== undefined);
  if (entries.length === 0) return;
  await run(`UPDATE future_requirements SET ${entries.map(([key]) => `${columns[key]} = ?`).join(', ')} WHERE id = ?`,
    [...entries.map(([, value]) => value), id]);
}

const deleteFutureRequirement = (id) => run('DELETE FROM future_requirements WHERE id = ?', [id]);

async function getResource(slug) {
  const row = await get('SELECT id, slug, title, kind, url, provider, verified, provenance FROM resources WHERE slug = ?', [slug]);
  if (!row) return null;
  const links = await all('SELECT skill_id FROM resource_skills WHERE resource_id = ? ORDER BY skill_id', [row.id]);
  return {
    slug: row.slug,
    title: row.title,
    kind: row.kind,
    url: row.url,
    provider: row.provider,
    verified: row.verified === 1,
    provenance: row.provenance,
    skillIds: links.map((link) => link.skill_id),
  };
}

async function upsertResource(slug, { title, kind, url = null, provider = null, verified, provenance, skillIds }) {
  const existing = await get('SELECT id FROM resources WHERE slug = ?', [slug]);
  let resourceId = existing?.id;
  if (existing) {
    await run('UPDATE resources SET title = ?, kind = ?, url = ?, provider = ?, verified = ?, provenance = ? WHERE id = ?',
      [title, kind, url, provider, verified ? 1 : 0, provenance, resourceId]);
    await run('DELETE FROM resource_skills WHERE resource_id = ?', [resourceId]);
  } else {
    ({ lastID: resourceId } = await run(
      'INSERT INTO resources (slug, title, kind, url, provider, verified, provenance) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [slug, title, kind, url, provider, verified ? 1 : 0, provenance],
    ));
  }
  for (const skillId of [...new Set(skillIds)]) {
    await run('INSERT INTO resource_skills (resource_id, skill_id) VALUES (?, ?)', [resourceId, skillId]);
  }
  return getResource(slug);
}

async function getRoleRequirement(roleId, skillId) {
  const row = await get('SELECT minimum_proficiency FROM role_skill_requirements WHERE role_id = ? AND skill_id = ?', [roleId, skillId]);
  return row ? { roleId, skillId, minimumProficiency: row.minimum_proficiency } : null;
}

const upsertRoleRequirement = (roleId, skillId, minimumProficiency) => run(
  `INSERT INTO role_skill_requirements (role_id, skill_id, minimum_proficiency) VALUES (?, ?, ?)
   ON CONFLICT(role_id, skill_id) DO UPDATE SET minimum_proficiency = excluded.minimum_proficiency`,
  [roleId, skillId, minimumProficiency],
);

const deleteRoleRequirement = (roleId, skillId) => run('DELETE FROM role_skill_requirements WHERE role_id = ? AND skill_id = ?', [roleId, skillId]);

async function assertIdsExist(table, ids) {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return [];
  const rows = await all(`SELECT id FROM ${table} WHERE id IN (${unique.map(() => '?').join(', ')})`, unique);
  const known = new Set(rows.map((row) => row.id));
  return unique.filter((id) => !known.has(id));
}

module.exports = {
  getEvidence, deleteEvidence, getEmployee, updateEmployee, wouldCreateCycle, roleExists, getRole, getSkill,
  getFutureRequirement, updateFutureRequirement, deleteFutureRequirement, getResource, upsertResource,
  getRoleRequirement, upsertRoleRequirement, deleteRoleRequirement, missingIds: assertIdsExist,
};
