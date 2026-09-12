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
module.exports = { analyze };
