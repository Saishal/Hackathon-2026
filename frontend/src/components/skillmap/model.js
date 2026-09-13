// Pure calculations behind every skill map view. Counts are recomputed from recorded evidence for the
// people currently shown, so one department filter narrows the network, the matrix and every chart alike.
// A missing evidence record is unknown, never a zero level.

export const LEVELS = [1, 2, 3, 4, 5];
export const MAP_MODES = [['network', 'network'], ['matrix', 'matrix'], ['charts', 'pie']];
export const CHART_TYPES = [['coverage', 'pie'], ['qualified', 'hbars'], ['departments', 'stacked'], ['person', 'user'], ['skill', 'bars']];
export const DENSITIES = ['compact', 'comfortable', 'spacious'];

export const coverageTone = (qualified) => (qualified === 0 ? 'uncovered' : qualified === 1 ? 'single' : 'covered');

export function buildSkillMap(workforce, risks, { department = 'all', minProficiency = 3, concentratedOnly = false } = {}) {
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
  const shownSkills = skills
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
    employeeById: new Map(employees.map((employee) => [employee.id, employee])),
    skillById: new Map(skills.map((skill) => [skill.id, skill])),
    edge: (employeeId, skillId) => edgeByKey.get(`${employeeId}:${skillId}`) ?? null,
    countAtLeast: (skillId, level) => matrix.filter((edge) => edge.skillId === skillId && personIds.has(edge.employeeId) && edge.proficiency >= level).length,
  };
}

// Qualified means recorded at or above the skill's own target level.
export const qualifiedIn = (map, skill) => map.countAtLeast(skill.id, skill.targetProficiency ?? 3);

export function coverageGroups(map) {
  const groups = { uncovered: [], single: [], covered: [] };
  for (const skill of map.shownSkills) groups[coverageTone(qualifiedIn(map, skill))].push(skill);
  return groups;
}

export function peopleAtLevel(map, minProficiency) {
  return map.shownSkills
    .map((skill) => ({ skill, count: map.countAtLeast(skill.id, minProficiency), needed: skill.requiredHolders ?? null }))
    .sort((a, b) => a.count - b.count || a.skill.name.localeCompare(b.skill.name));
}

export function levelsByDepartment(map, minProficiency) {
  const skillIds = new Set(map.shownSkills.map((skill) => skill.id));
  const departmentOf = new Map(map.people.map((person) => [person.id, person.department]));
  const rows = new Map();
  for (const edge of map.matrix) {
    const department = departmentOf.get(edge.employeeId);
    if (!department || !skillIds.has(edge.skillId) || edge.proficiency < minProficiency) continue;
    const row = rows.get(department) ?? { department, counts: Object.fromEntries(LEVELS.map((level) => [level, 0])), total: 0 };
    row.counts[edge.proficiency] += 1;
    row.total += 1;
    rows.set(department, row);
  }
  return [...rows.values()].sort((a, b) => a.department.localeCompare(b.department));
}

// A person's recorded levels beside what their role asks for. Required skills without a record stay in
// the list as unknown, so a gap in evidence is visible rather than silently dropped.
export function personProfile(map, employeeId) {
  const person = map.employeeById.get(employeeId);
  if (!person) return null;
  const role = map.roles.find((entry) => (entry.incumbentIds ?? []).includes(employeeId)) ?? null;
  const required = new Map((role?.requirements ?? []).map((requirement) => [requirement.skillId, requirement.minimumProficiency]));
  const skillIds = new Set([...map.matrix.filter((edge) => edge.employeeId === employeeId).map((edge) => edge.skillId), ...required.keys()]);
  const rows = [...skillIds]
    .map((skillId) => ({
      skill: map.skillById.get(skillId) ?? { id: skillId, name: `#${skillId}` },
      level: map.edge(employeeId, skillId)?.proficiency ?? null,
      required: required.get(skillId) ?? null,
    }))
    .sort((a, b) => (b.level ?? 0) - (a.level ?? 0) || a.skill.name.localeCompare(b.skill.name));
  return { person, role, rows };
}

export function skillDistribution(map, skillId) {
  const skill = map.skillById.get(skillId);
  if (!skill) return null;
  const byLevel = Object.fromEntries(LEVELS.map((level) => [level, []]));
  for (const edge of map.matrix) {
    if (edge.skillId === skillId && map.personIds.has(edge.employeeId) && byLevel[edge.proficiency]) {
      byLevel[edge.proficiency].push(map.employeeById.get(edge.employeeId));
    }
  }
  const recorded = LEVELS.reduce((sum, level) => sum + byLevel[level].length, 0);
  return { skill, byLevel, recorded, unrecorded: map.people.length - recorded, qualified: qualifiedIn(map, skill) };
}
