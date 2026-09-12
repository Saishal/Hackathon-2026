// Member 2 owns deterministic scoring. No database or AI dependencies.
function analyze(workforce) {
  const skills = workforce.skills.map((skill) => {
    const holders = workforce.matrix.filter((edge) => edge.skillId === skill.id && edge.proficiency >= skill.targetProficiency);
    const holderCount = holders.length;
    const gap = Math.max(0, skill.requiredHolders - holderCount);
    const shortage = gap / skill.requiredHolders;
    const score = Math.round(100 * skill.criticality / 5 * (0.6 / Math.max(1, holderCount) + 0.4 * shortage));
    return { ...skill, holderIds: holders.map((edge) => edge.employeeId), busFactor: holderCount, gap, keystoneScore: score,
      explanation: `${holderCount} recorded independent holders; ${skill.requiredHolders} required at proficiency ${skill.targetProficiency}+. Criticality ${skill.criticality}/5.` };
  });
  return { skills: skills.sort((a, b) => b.keystoneScore - a.keystoneScore),
    uncovered: skills.filter((skill) => skill.busFactor === 0).length,
    singleHolder: skills.filter((skill) => skill.busFactor === 1).length,
    methodology: 'Demo prioritization heuristic, not departure probability. Bus Factor means recorded independent holder count.' };
}

// Employee Keystone Score: the incremental criticality-weighted shortage the organization takes
// on if this person's recorded coverage disappears. Same shape as the skill score so the two read
// consistently — 0.6 weights losing the last recorded holder, 0.4 weights the shortage increase.
// Summed across affected skills, so holding sole coverage of several critical skills scores higher.
// Capped at 100. This measures dependency on a person, never their likelihood of leaving.
function analyzeEmployees(workforce) {
  const coverage = workforce.skills.map((skill) => ({ skill,
    qualified: workforce.matrix.filter((edge) => edge.skillId === skill.id && edge.proficiency >= skill.targetProficiency)
      .map((edge) => edge.employeeId) }));
  const employees = workforce.employees.map((employee) => {
    const affectedSkills = coverage.filter(({ qualified }) => qualified.includes(employee.id)).map(({ skill, qualified }) => {
      const busFactorBefore = qualified.length;
      const busFactorAfter = busFactorBefore - 1;
      const gapBefore = Math.max(0, skill.requiredHolders - busFactorBefore);
      const gapAfter = Math.max(0, skill.requiredHolders - busFactorAfter);
      const becomesUncovered = busFactorAfter === 0;
      return { id: skill.id, name: skill.name, criticality: skill.criticality, targetProficiency: skill.targetProficiency,
        requiredHolders: skill.requiredHolders, busFactorBefore, busFactorAfter, gapBefore, gapAfter, becomesUncovered,
        contribution: skill.criticality / 5 * (0.6 * (becomesUncovered ? 1 : 0) + 0.4 * ((gapAfter - gapBefore) / skill.requiredHolders)),
        skillBackups: skillBackupsFor(workforce, skill, employee.id) };
    }).sort((a, b) => b.contribution - a.contribution);
    const raw = affectedSkills.reduce((total, entry) => total + entry.contribution, 0);
    const newlyUncovered = affectedSkills.filter((entry) => entry.becomesUncovered);
    const role = (workforce.roles || []).find((entry) => entry.incumbentIds?.includes(employee.id)
      || entry.name === employee.role);
    const successors = role ? roleCandidatesFor(workforce, role, [employee.id]).slice(0, 3) : [];
    return { id: employee.id, name: employee.name, role: employee.role, department: employee.department,
      keystoneScore: Math.min(100, Math.round(100 * raw)),
      capped: 100 * raw > 100,
      recordedSkills: affectedSkills.length,
      newlyUncovered: newlyUncovered.map((entry) => entry.name),
      successionRole: role ? { id: role.id, name: role.name, criticality: role.criticality,
        requirementCount: role.requirements?.length || 0 } : null,
      successors,
      affectedSkills: affectedSkills.map(({ contribution: _contribution, ...entry }) => entry),
      explanation: affectedSkills.length === 0
        ? 'No skill currently depends on this person at or above its target proficiency, on recorded evidence.'
        : `Qualified in ${affectedSkills.length} skill(s); ${newlyUncovered.length} would have no recorded holder left${newlyUncovered.length ? `: ${newlyUncovered.map((entry) => entry.name).join(', ')}` : ''}.` };
  });
  return { employees: employees.sort((a, b) => b.keystoneScore - a.keystoneScore || a.id - b.id),
    soleCoverageHolders: employees.filter((employee) => employee.newlyUncovered.length > 0).length,
    methodology: 'Incremental criticality-weighted shortage if this person\'s recorded coverage is removed. Organizational dependency, not a prediction that anyone will leave. Successor readiness uses every persisted requirement for the person\'s role. Missing skill evidence stays unknown, never proof that nobody else is capable.' };
}

// A skill backup supports the Bus Factor explanation. It is intentionally separate from
// a successor, which must be checked against every persisted requirement for the role.
function skillBackupsFor(workforce, skill, departingId) {
  return workforce.matrix
    .filter((edge) => edge.skillId === skill.id && edge.employeeId !== departingId)
    .map((edge) => ({ employeeId: edge.employeeId,
      name: workforce.employees.find((employee) => employee.id === edge.employeeId)?.name ?? `Employee ${edge.employeeId}`,
      proficiency: edge.proficiency,
      shortfall: Math.max(0, skill.targetProficiency - edge.proficiency),
      status: edge.proficiency >= skill.targetProficiency ? 'ready' : 'developable' }))
    .sort((a, b) => b.proficiency - a.proficiency || a.employeeId - b.employeeId)
    .slice(0, 3);
}

function roleCandidatesFor(workforce, role, excludedIds = []) {
  const excluded = new Set(excludedIds);
  const requirements = role.requirements || [];
  return workforce.employees
    .filter((employee) => !excluded.has(employee.id))
    .map((employee) => {
      const evidence = requirements.map((requirement) => {
        const edge = workforce.matrix.find((entry) => entry.employeeId === employee.id
          && entry.skillId === requirement.skillId);
        const skill = workforce.skills.find((entry) => entry.id === requirement.skillId);
        const recordedProficiency = edge?.proficiency ?? null;
        return { skillId: requirement.skillId, skillName: skill?.name ?? `Skill ${requirement.skillId}`,
          minimumProficiency: requirement.minimumProficiency, recordedProficiency,
          shortfall: recordedProficiency === null ? null : Math.max(0, requirement.minimumProficiency - recordedProficiency),
          status: recordedProficiency === null ? 'unknown'
            : recordedProficiency >= requirement.minimumProficiency ? 'met' : 'below_requirement' };
      });
      const metCount = evidence.filter((entry) => entry.status === 'met').length;
      const unknownCount = evidence.filter((entry) => entry.status === 'unknown').length;
      const shortfallCount = evidence.filter((entry) => entry.status === 'below_requirement').length;
      const status = requirements.length === 0 ? 'unknown'
        : metCount === requirements.length ? 'ready'
          : unknownCount > 0 ? 'evidence_missing' : 'developable';
      return { employeeId: employee.id, name: employee.name, currentRole: employee.role,
        isCurrentIncumbent: role.incumbentIds?.includes(employee.id) || false,
        status, readinessPercent: requirements.length ? Math.round(100 * metCount / requirements.length) : null,
        metCount, requirementCount: requirements.length, unknownCount, shortfallCount, requirements: evidence };
    })
    .sort((a, b) => {
      const order = { ready: 0, developable: 1, evidence_missing: 2, unknown: 3 };
      return order[a.status] - order[b.status]
        || b.metCount - a.metCount
        || a.unknownCount - b.unknownCount
        || a.shortfallCount - b.shortfallCount
        || a.employeeId - b.employeeId;
    });
}

function analyzeSuccession(workforce) {
  const roles = (workforce.roles || []).map((role) => {
    const incumbents = (role.incumbentIds || []).map((employeeId) => {
      const employee = workforce.employees.find((entry) => entry.id === employeeId);
      return { employeeId, name: employee?.name ?? `Employee ${employeeId}`,
        candidates: roleCandidatesFor(workforce, role, [employeeId]).slice(0, 3) };
    });
    const externalPipeline = roleCandidatesFor(workforce, role, role.incumbentIds || []);
    return { id: role.id, name: role.name, criticality: role.criticality,
      requirementCount: role.requirements?.length || 0, incumbentIds: role.incumbentIds || [], incumbents,
      readyNonIncumbents: externalPipeline.filter((candidate) => candidate.status === 'ready').length,
      pipeline: externalPipeline.slice(0, 5) };
  }).sort((a, b) => a.readyNonIncumbents - b.readyNonIncumbents || b.criticality - a.criticality || a.id - b.id);
  return { roles,
    rolesWithoutReadyNonIncumbent: roles.filter((role) => role.readyNonIncumbents === 0).length,
    methodology: 'Candidates are compared with every persisted role requirement. Ready means every requirement is met on recorded evidence. Evidence missing is reported separately from a recorded proficiency below the requirement.' };
}

module.exports = { analyze, analyzeEmployees, analyzeSuccession, roleCandidatesFor };
