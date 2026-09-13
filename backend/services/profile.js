// The signed-in person's own profile: evidence with its trust state, what their role asks of them, and
// development suggestions drawn only from the verified catalogue. Nothing here is AI-generated, so the
// employee view never sends data to a provider and never shows colleagues' details.

const evidenceTrust = (edge, staleBefore) => {
  if (!edge.lastVerifiedAt) return 'unverified';
  return edge.lastVerifiedAt < staleBefore ? 'stale' : 'verified';
};

function buildProfile({ workforce, employeeId, issues, changeRequests, staleBefore }) {
  const employee = workforce.employees.find((entry) => entry.id === employeeId);
  if (!employee) return null;

  const skillById = new Map(workforce.skills.map((skill) => [skill.id, skill]));
  const skillName = (id) => skillById.get(id)?.name ?? `Skill ${id}`;
  const role = workforce.roles.find((entry) => entry.name === employee.role);
  const own = workforce.matrix.filter((edge) => edge.employeeId === employeeId);
  const pendingFor = (skillId) => changeRequests.find((request) => request.type === 'employee_skill' && request.status === 'submitted'
    && request.subjectEmployeeId === employeeId && request.payload?.skillId === skillId);

  const evidence = own.map((edge) => ({
    skillId: edge.skillId,
    skillName: skillName(edge.skillId),
    proficiency: edge.proficiency,
    targetProficiency: skillById.get(edge.skillId)?.targetProficiency ?? null,
    evidenceSource: edge.evidenceSource,
    lastVerifiedAt: edge.lastVerifiedAt,
    trust: evidenceTrust(edge, staleBefore),
    pendingChangeRequestId: pendingFor(edge.skillId)?.id ?? null,
  })).sort((a, b) => a.skillName.localeCompare(b.skillName));

  const roleRequirements = (role?.requirements ?? []).map((requirement) => {
    const edge = own.find((entry) => entry.skillId === requirement.skillId);
    return {
      skillId: requirement.skillId,
      skillName: skillName(requirement.skillId),
      minimumProficiency: requirement.minimumProficiency,
      recordedProficiency: edge?.proficiency ?? null,
      // Unknown is not unmet: a missing record means nobody has recorded evidence yet.
      status: !edge ? 'unknown' : edge.proficiency >= requirement.minimumProficiency ? 'met' : 'unmet',
    };
  });

  const developmentSuggestions = roleRequirements.filter((requirement) => requirement.status !== 'met').map((requirement) => ({
    skillId: requirement.skillId,
    skillName: requirement.skillName,
    reason: requirement.status === 'unknown'
      ? `No evidence is recorded for ${requirement.skillName}; your role asks for level ${requirement.minimumProficiency}.`
      : `Recorded at level ${requirement.recordedProficiency}; your role asks for level ${requirement.minimumProficiency}.`,
    resources: (workforce.learningResources ?? [])
      .filter((resource) => resource.verified && resource.skillIds.includes(requirement.skillId))
      .map(({ id, title, category, provider }) => ({ id, title, category, provider })),
  }));

  const manager = workforce.employees.find((entry) => entry.id === employee.managerId);
  return {
    employee: {
      id: employee.id,
      name: employee.name,
      role: employee.role,
      department: employee.department,
      managerName: manager?.name ?? null,
      mentoringHoursPerMonth: employee.mentoringHoursPerMonth ?? null,
    },
    evidence,
    roleRequirements,
    developmentSuggestions,
    dataQualityIssues: issues.filter((issue) => issue.status !== 'resolved' && issue.employeeIds.length === 1 && issue.employeeIds[0] === employeeId),
  };
}

module.exports = { buildProfile };
