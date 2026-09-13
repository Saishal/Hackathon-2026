const { all } = require('./db');
const { getHeatmapData, getFutureRequirements } = require('./queries');

// services/risk.js computes gap / requiredHolders, so publishing 0 would make
// keystoneScore NaN and corrupt the ranking. Coverage floors at 1; genuine
// zero-demand is reported through demandTarget instead.
const MIN_REQUIRED_HOLDERS = 1;

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

  const mentoring = await all('SELECT id, mentoring_hours_per_month, manager_id FROM employees');
  const mentoringById = new Map(mentoring.map((row) => [row.id, row.mentoring_hours_per_month]));
  const managerById = new Map(mentoring.map((row) => [row.id, row.manager_id]));

  // Legacy future demand is reported separately from Keystone coverage: a skill can
  // have zero hiring demand and still need holders to avoid a knowledge dependency.
  const demand = await all('SELECT skill_id, target_people FROM future_skill_targets');
  const demandBySkill = new Map(demand.map((row) => [row.skill_id, row.target_people]));

  const roles = await all(
    'SELECT id, name, criticality, metadata_source FROM critical_roles ORDER BY name ASC',
  );
  const roleRequirements = await all(`
    SELECT role_id, skill_id, minimum_proficiency
    FROM role_skill_requirements
    ORDER BY role_id ASC, skill_id ASC
  `);
  const resources = await all(`
    SELECT id, slug, title, kind, url, provider, verified, provenance
    FROM resources
    ORDER BY kind ASC, title ASC
  `);
  const resourceSkills = await all('SELECT resource_id, skill_id FROM resource_skills');

  const futureRequirements = await getFutureRequirements();

  const incumbentsByRole = new Map();

  for (const employee of snapshot.employees) {
    const current = incumbentsByRole.get(employee.role) ?? [];
    current.push(employee.id);
    incumbentsByRole.set(employee.role, current);
  }

  return {
    schemaVersion: 1,
    ...snapshot,
    // mentoringHoursPerMonth is omitted entirely when capacity was never recorded:
    // consumers treat an absent field as unknown, which is not the same as zero.
    // managerId is null when no reporting line is recorded inside this dataset.
    employees: snapshot.employees.map((employee) => {
      const hours = mentoringById.get(employee.id);
      const withManager = { ...employee, managerId: managerById.get(employee.id) ?? null };

      return hours === null || hours === undefined ? withManager : { ...withManager, mentoringHoursPerMonth: hours };
    }),
    skills: snapshot.skills.map((skill) => {
      const requirement = requirementBySkill.get(skill.id) ?? UNSPECIFIED_REQUIREMENT;

      return {
        ...skill,
        criticality: requirement.criticality,
        targetProficiency: requirement.target_proficiency,
        requiredHolders: Math.max(MIN_REQUIRED_HOLDERS, requirement.required_holders),
        demandTarget: demandBySkill.get(skill.id) ?? null,
        metadataSource: requirement.metadata_source,
      };
    }),
    roles: roles.map((role) => ({
      id: role.id,
      name: role.name,
      criticality: role.criticality,
      metadataSource: role.metadata_source,
      incumbentIds: incumbentsByRole.get(role.name) ?? [],
      requirements: roleRequirements
        .filter((requirement) => requirement.role_id === role.id)
        .map((requirement) => ({
          skillId: requirement.skill_id,
          minimumProficiency: requirement.minimum_proficiency,
        })),
    })),
    learningResources: resources.map((resource) => ({
      id: resource.slug,
      title: resource.title,
      category: resource.kind,
      verified: resource.verified === 1,
      url: resource.url,
      provider: resource.provider,
      provenance: resource.provenance,
      skillIds: resourceSkills
        .filter((link) => link.resource_id === resource.id)
        .map((link) => link.skill_id),
    })),
    futureRequirements,
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
