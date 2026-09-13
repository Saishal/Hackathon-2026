const { can } = require('./permissions');

// Data scoping. Risk and succession are always calculated on the whole organization, so scores stay
// truthful; what a manager or employee receives is then narrowed to the people they may see.
// People outside the scope are replaced by an anonymous placeholder that keeps only aggregate facts.
const OUTSIDE_SCOPE = 'Colleague outside your team';

function reportsOf(employees, managerEmployeeId) {
  const byManager = new Map();
  for (const employee of employees) {
    if (employee.managerId == null) continue;
    byManager.set(employee.managerId, [...(byManager.get(employee.managerId) ?? []), employee.id]);
  }
  const reports = new Set();
  const queue = [...(byManager.get(managerEmployeeId) ?? [])];
  while (queue.length > 0) {
    const id = queue.shift();
    if (reports.has(id) || id === managerEmployeeId) continue;
    reports.add(id);
    queue.push(...(byManager.get(id) ?? []));
  }
  return reports;
}

function scopeFor(user, workforce) {
  if (can(user, 'workforce.read.all')) return { kind: 'organization', employeeIds: null };
  const employeeIds = new Set(user.employeeId != null ? [user.employeeId] : []);
  const team = can(user, 'workforce.read.team');
  if (team && user.employeeId != null) {
    for (const id of reportsOf(workforce.employees, user.employeeId)) employeeIds.add(id);
  }
  return { kind: team ? 'team' : 'self', employeeIds };
}

const inScope = (scope, id) => scope.employeeIds === null || scope.employeeIds.has(id);

function scopeWorkforce(scope, workforce) {
  if (scope.employeeIds === null) return { ...workforce, visibility: scope.kind };
  return {
    ...workforce,
    visibility: scope.kind,
    employees: workforce.employees.filter((employee) => inScope(scope, employee.id)),
    matrix: workforce.matrix.filter((edge) => inScope(scope, edge.employeeId)),
    roles: workforce.roles.map((role) => ({ ...role, incumbentIds: role.incumbentIds.filter((id) => inScope(scope, id)) })),
  };
}

function scopeRisks(scope, analysis) {
  if (scope.employeeIds === null) return { ...analysis, visibility: scope.kind };
  return {
    ...analysis,
    visibility: scope.kind,
    skills: analysis.skills.map((skill) => {
      const holderIds = skill.holderIds.filter((id) => inScope(scope, id));
      return { ...skill, holderIds, holdersOutsideScope: skill.holderIds.length - holderIds.length };
    }),
  };
}

const redactBackup = (scope, backup) => (inScope(scope, backup.employeeId) ? backup
  : { employeeId: null, name: OUTSIDE_SCOPE, proficiency: null, shortfall: null, status: backup.status, redacted: true });

const redactCandidate = (scope, candidate) => (inScope(scope, candidate.employeeId) ? candidate : {
  employeeId: null,
  name: OUTSIDE_SCOPE,
  currentRole: null,
  isCurrentIncumbent: candidate.isCurrentIncumbent,
  status: candidate.status,
  readinessPercent: candidate.readinessPercent,
  metCount: candidate.metCount,
  requirementCount: candidate.requirementCount,
  unknownCount: candidate.unknownCount,
  shortfallCount: candidate.shortfallCount,
  requirements: [],
  redacted: true,
});

function scopeEmployeeRisks(scope, result) {
  if (scope.employeeIds === null) return { ...result, visibility: scope.kind };
  const employees = result.employees
    .filter((employee) => inScope(scope, employee.id))
    .map((employee) => ({
      ...employee,
      successors: employee.successors.map((candidate) => redactCandidate(scope, candidate)),
      affectedSkills: employee.affectedSkills.map((skill) => ({
        ...skill, skillBackups: skill.skillBackups.map((backup) => redactBackup(scope, backup)),
      })),
    }));
  return {
    ...result,
    visibility: scope.kind,
    employees,
    soleCoverageHolders: employees.filter((employee) => employee.newlyUncovered.length > 0).length,
  };
}

function scopeSuccession(scope, result) {
  if (scope.employeeIds === null) return { ...result, visibility: scope.kind };
  const roles = result.roles
    .filter((role) => role.incumbentIds.some((id) => inScope(scope, id)))
    .map((role) => ({
      ...role,
      incumbentIds: role.incumbentIds.filter((id) => inScope(scope, id)),
      incumbents: role.incumbents
        .filter((incumbent) => inScope(scope, incumbent.employeeId))
        .map((incumbent) => ({ ...incumbent, candidates: incumbent.candidates.map((candidate) => redactCandidate(scope, candidate)) })),
      pipeline: role.pipeline.map((candidate) => redactCandidate(scope, candidate)),
    }));
  return { ...result, visibility: scope.kind, roles, rolesWithoutReadyNonIncumbent: roles.filter((role) => role.readyNonIncumbents === 0).length };
}

// An issue is visible when every person it names is in scope. Issues naming nobody (catalogue, plans)
// are organization-wide and only shown to organization-scoped readers.
function scopeIssues(scope, issues) {
  if (scope.employeeIds === null) return issues;
  return issues.filter((issue) => issue.employeeIds.length > 0 && issue.employeeIds.every((id) => inScope(scope, id)));
}

module.exports = {
  OUTSIDE_SCOPE, reportsOf, scopeFor, inScope, scopeWorkforce, scopeRisks, scopeEmployeeRisks, scopeSuccession, scopeIssues,
};
