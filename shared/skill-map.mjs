export function buildSkillMap(workforce, risks, { department = 'all', minProficiency = 3, concentratedOnly = false, q = '' } = {}) {
  const employees = workforce?.employees ?? [];
  const skills = workforce?.skills ?? [];
  const matrix = workforce?.matrix ?? [];
  const roles = workforce?.roles ?? [];
  const riskById = new Map((risks?.skills ?? []).map((skill) => [skill.id, skill]));
  const busFactor = (skillId) => riskById.get(skillId)?.busFactor ?? null;

  const departments = [...new Set(employees.map((employee) => employee.department))].sort((a, b) => a.localeCompare(b));
  const people = employees
    .filter((employee) => department === 'all' || employee.department === department)
    .sort((a, b) => a.department.localeCompare(b.department) || a.name.localeCompare(b.name));
  const needle = q.trim().toLowerCase();
  const shownSkills = skills
    .filter((skill) => !needle || [skill.name, skill.category].join(' ').toLowerCase().includes(needle))
    .filter((skill) => !concentratedOnly || (busFactor(skill.id) ?? 0) <= 1)
    .sort((a, b) => (busFactor(a.id) ?? 0) - (busFactor(b.id) ?? 0) || a.name.localeCompare(b.name));

  const personIds = new Set(people.map((employee) => employee.id));
  const skillIds = new Set(shownSkills.map((skill) => skill.id));
  const edgeByKey = new Map(matrix.map((edge) => [`${edge.employeeId}:${edge.skillId}`, edge]));
  const edges = matrix.filter((edge) => edge.proficiency >= minProficiency && personIds.has(edge.employeeId) && skillIds.has(edge.skillId));

  return {
    employees,
    skills,
    matrix,
    roles,
    departments,
    people,
    shownSkills,
    edges,
    personIds,
    busFactor,
    riskScore: (id) => riskById.get(id)?.keystoneScore ?? null,
    employeeById: new Map(employees.map((employee) => [employee.id, employee])),
    skillById: new Map(skills.map((skill) => [skill.id, skill])),
    edge: (employeeId, skillId) => edgeByKey.get(`${employeeId}:${skillId}`) ?? null,
    countAtLeast: (skillId, level) => matrix.filter((edge) => edge.skillId === skillId && personIds.has(edge.employeeId) && edge.proficiency >= level).length,
  };
}


// Recorded qualification follows the established risk engine. Verification is reported separately.
export function heatState(qualified, required, known = true) {
  if (!known || !Number.isFinite(required) || required <= 0) return 'unknown';
  if (qualified === 0) return 'critical';
  if (qualified === 1) return 'at-risk';
  if (qualified >= required) return 'healthy';
  return qualified / required >= 0.8 ? 'watch' : 'at-risk';
}
export function heatRows(map, { minProficiency = 3, sort = 'dependency' } = {}) {
  const departments = [...new Set(map.people.map((person) => person.department))];
  const rows = map.shownSkills.map((skill) => {
    const cells = departments.map((department) => {
      const ids = new Set(map.people.filter((person) => person.department === department).map((person) => person.id));
      const records = map.matrix.filter((edge) => ids.has(edge.employeeId) && edge.skillId === skill.id);
      const qualifying = records.filter((edge) => edge.proficiency >= Math.max(minProficiency, skill.targetProficiency ?? 3));
      const qualified = qualifying.length;
      const known = records.length > 0 && records.some((edge) => edge.lastVerifiedAt) && qualifying.every((edge) => edge.lastVerifiedAt);
      return { department, qualified, required: skill.requiredHolders, state: heatState(qualified, skill.requiredHolders, known), unverified: qualifying.filter((edge) => !edge.lastVerifiedAt).length };
    });
    return { skill, cells, gap: Math.max(0, skill.requiredHolders - cells.reduce((sum, cell) => sum + cell.qualified, 0)) };
  });
  return rows.sort((a, b) => (sort === 'criticality' ? b.skill.criticality - a.skill.criticality
    : sort === 'gap' ? b.gap - a.gap : sort === 'dependency' ? (map.riskScore(b.skill.id) ?? 0) - (map.riskScore(a.skill.id) ?? 0) : 0) || a.skill.name.localeCompare(b.skill.name));
}
