const { all } = require('./db');
const { getHeatmapData } = require('./queries');

// Used only if a skill is added without a requirements row; absent metadata is
// reported as unspecified rather than silently presented as a real requirement.
const UNSPECIFIED_REQUIREMENT = {
  criticality: 3,
  target_proficiency: 3,
  required_holders: 2,
  metadata_source: 'unspecified',
};

// Member 1 owns this adapter; existing endpoints remain compatible.
// Returns the v1 workforce snapshot consumed by Member 2 (calculations),
// Member 3 (over HTTP) and Member 4 (AI grounding).
async function loadWorkforce() {
  const snapshot = await getHeatmapData();

  const requirements = await all(`
    SELECT skill_id, criticality, target_proficiency, required_holders, metadata_source
    FROM skill_requirements
  `);
  const requirementBySkill = new Map(requirements.map((row) => [row.skill_id, row]));

  const evidence = await all(`
    SELECT employee_id, skill_id, evidence_source, last_verified_at
    FROM employee_skills
  `);
  const evidenceByEdge = new Map(
    evidence.map((row) => [`${row.employee_id}:${row.skill_id}`, row]),
  );

  const mentoring = await all('SELECT id, mentoring_available FROM employees');
  const mentoringById = new Map(mentoring.map((row) => [row.id, row.mentoring_available === 1]));

  return {
    schemaVersion: 1,
    ...snapshot,
    employees: snapshot.employees.map((employee) => ({
      ...employee,
      mentoringAvailable: mentoringById.get(employee.id) ?? true,
    })),
    skills: snapshot.skills.map((skill) => {
      const requirement = requirementBySkill.get(skill.id) ?? UNSPECIFIED_REQUIREMENT;

      return {
        ...skill,
        criticality: requirement.criticality,
        targetProficiency: requirement.target_proficiency,
        requiredHolders: requirement.required_holders,
        metadataSource: requirement.metadata_source,
      };
    }),
    matrix: snapshot.matrix.map((edge) => {
      const row = evidenceByEdge.get(`${edge.employeeId}:${edge.skillId}`);

      return {
        ...edge,
        evidenceSource: row?.evidence_source ?? null,
        lastVerifiedAt: row?.last_verified_at ?? null,
      };
    }),
  };
}

module.exports = { loadWorkforce };
