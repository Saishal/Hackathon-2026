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
        successors: successorsFor(workforce, skill, employee.id) };
    }).sort((a, b) => b.contribution - a.contribution);
    const raw = affectedSkills.reduce((total, entry) => total + entry.contribution, 0);
    const newlyUncovered = affectedSkills.filter((entry) => entry.becomesUncovered);
    return { id: employee.id, name: employee.name, role: employee.role, department: employee.department,
      keystoneScore: Math.min(100, Math.round(100 * raw)),
      capped: 100 * raw > 100,
      recordedSkills: affectedSkills.length,
      newlyUncovered: newlyUncovered.map((entry) => entry.name),
      affectedSkills: affectedSkills.map(({ contribution: _contribution, ...entry }) => entry),
      explanation: affectedSkills.length === 0
        ? 'No skill currently depends on this person at or above its target proficiency, on recorded evidence.'
        : `Qualified in ${affectedSkills.length} skill(s); ${newlyUncovered.length} would have no recorded holder left${newlyUncovered.length ? `: ${newlyUncovered.map((entry) => entry.name).join(', ')}` : ''}.` };
  });
  return { employees: employees.sort((a, b) => b.keystoneScore - a.keystoneScore || a.id - b.id),
    soleCoverageHolders: employees.filter((employee) => employee.newlyUncovered.length > 0).length,
    methodology: 'Incremental criticality-weighted shortage if this person\'s recorded coverage is removed. Organizational dependency, not a prediction that anyone will leave. Absence of a recorded successor means no evidence on file, never proof that nobody else is capable.' };
}

// Member 1's role requirements do not exist yet, so candidates are matched on recorded skill
// evidence instead. Ready means already at target without this person; developable means recorded
// below target. An empty list is missing evidence, not a demonstrated absence of capability.
function successorsFor(workforce, skill, departingId) {
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

module.exports = { analyze, analyzeEmployees };
