const { analyze } = require('./risk');
const { resolveSkillIdentity } = require('./skill-identity');
const fail = (message) => { const error = new Error(message); error.status = 400; throw error; };

// One mentoring engagement is assumed to cost this much of a mentor's recorded monthly capacity.
// A planning constant, not measured: it is stated in the response assumptions so a reviewer can
// challenge it rather than discover it.
const MENTOR_HOURS_PER_ENGAGEMENT = 2;
// Months are discrete and both endpoints are occupied. At most 61 months are checked.
function hasCapacity(booked, window, concurrent) {
  for (let month = window.startMonth; month <= window.completionMonth; month += 1) {
    const active = booked.filter((existing) => existing.startMonth <= month && month <= existing.completionMonth).length;
    if (active + 1 > concurrent) return false;
  }
  return true;
}

function validateRequirement(requirement) {
  const integerIn = (value, low, high) => Number.isInteger(value) && value >= low && value <= high;
  if (!requirement || (requirement.skillId != null && !integerIn(requirement.skillId, 1, Number.MAX_SAFE_INTEGER))
    || !integerIn(requirement.targetProficiency, 1, 5) || !integerIn(requirement.requiredHolders, 1, 10000)
    || !integerIn(requirement.criticality, 1, 5) || !integerIn(requirement.effectiveMonth, 0, 60)) fail('Invalid future requirement');
  if (requirement.skillId == null && (typeof requirement.skillName !== 'string' || !requirement.skillName.trim()
    || requirement.skillName.length > 100)) fail('A new future requirement needs a skillName');
  if (requirement.skillName !== undefined && (typeof requirement.skillName !== 'string' || !requirement.skillName.trim()
    || requirement.skillName.length > 100)) fail('Invalid future skill name');
}

function normalizeFutureRequirements(workforce, requirements) {
  const seen = new Set();
  return requirements.map((requirement) => {
    validateRequirement(requirement);
    let identity;
    try { identity = resolveSkillIdentity(workforce, requirement); }
    catch (error) { fail(error.message); }
    const { key, ...fields } = identity;
    if (seen.has(key)) fail('Duplicate future skill requirement');
    seen.add(key);
    return { ...requirement, ...fields };
  });
}

function persistedReviewedRequirements(workforce, horizonMonths = 60) {
  const latestBySkill = new Map();
  for (const requirement of workforce.futureRequirements || []) {
    if (requirement.status !== 'reviewed' || requirement.effectiveMonth > horizonMonths) continue;
    const current = latestBySkill.get(requirement.skillId);
    if (!current || requirement.effectiveMonth > current.effectiveMonth
      || (requirement.effectiveMonth === current.effectiveMonth && requirement.id > current.id)) {
      latestBySkill.set(requirement.skillId, requirement);
    }
  }
  return [...latestBySkill.values()].map((requirement) => ({ skillId: requirement.skillId, skillName: requirement.skillName,
      targetProficiency: requirement.targetProficiency, requiredHolders: requirement.requiredHolders,
      criticality: requirement.criticality ?? workforce.skills.find((skill) => skill.id === requirement.skillId)?.criticality ?? 3,
      effectiveMonth: requirement.effectiveMonth }));
}

// Approved future requirements change what the organization needs at a horizon, so they apply to
// the future scenarios and never to today's baseline. Unsaved skills use provisional negative IDs;
// persisted future skills keep their stable positive IDs.
function applyRequirements(snapshot, requirements, horizonMonths) {
  const applied = [];
  requirements.forEach((requirement, index) => {
    if (requirement.effectiveMonth > horizonMonths) return;
    const id = requirement.skillId ?? -(index + 1);
    const existing = snapshot.skills.find((skill) => skill.id === id);
    const isNewSkill = !existing;
    const definition = { id, name: requirement.skillName?.trim() || existing?.name || `Requirement ${index + 1}`,
      criticality: requirement.criticality, requiredHolders: requirement.requiredHolders, targetProficiency: requirement.targetProficiency };
    if (existing) Object.assign(existing, definition);
    else snapshot.skills.push(definition);
    applied.push({ skillId: requirement.skillId ?? null, skillName: definition.name, effectiveMonth: requirement.effectiveMonth,
      requiredHolders: definition.requiredHolders, targetProficiency: definition.targetProficiency, criticality: definition.criticality,
      isNewSkill });
  });
  return applied;
}

// Time Machine: projects coverage at a horizon (0, 12, 36 or 60 months) under hypothetical departures
// and development interventions, and compares it with the baseline. Pure calculation over a copy of
// the snapshot; it never writes official data.
function simulate(workforce, scenario) {
  if (!scenario || ![0, 12, 36, 60].includes(scenario.horizonMonths)) fail('horizonMonths must be 0, 12, 36, or 60');
  const { horizonMonths, departures = [], interventions = [] } = scenario;
  const usesPersistedRequirements = scenario.requirements === undefined;
  const requirements = usesPersistedRequirements ? persistedReviewedRequirements(workforce, horizonMonths) : scenario.requirements;
  if (!Array.isArray(departures) || !Array.isArray(interventions) || !Array.isArray(requirements)) fail('departures, interventions and requirements must be arrays');
  const employeeExists = (id) => workforce.employees.some((employee) => employee.id === id);
  const validMonth = (month) => Number.isInteger(month) && month >= 0 && month <= 60;
  for (const departure of departures) {
    if (!departure || !employeeExists(departure.employeeId) || !validMonth(departure.month)) fail('Invalid departure employeeId or month');
  }
  for (const item of interventions) {
    if (!item || !employeeExists(item.employeeId) || !workforce.skills.some((skill) => skill.id === item.skillId)
      || !validMonth(item.completionMonth) || !Number.isInteger(item.targetProficiency) || item.targetProficiency < 1 || item.targetProficiency > 5
      || typeof item.assumeVerified !== 'boolean') fail('Invalid intervention');
    if (item.mentorId != null && (!employeeExists(item.mentorId) || item.mentorId === item.employeeId)) fail('Invalid mentorId');
    if (item.startMonth !== undefined && (!validMonth(item.startMonth) || item.startMonth > item.completionMonth)) fail('Invalid intervention startMonth');
  }
  // Pending, not yet approved evidence the caller chose to model. It changes the horizon scenarios only;
  // the baseline stays today's official picture, and mentor eligibility still uses approved evidence.
  const provisionalEvidence = scenario.provisionalEvidence ?? [];
  if (!Array.isArray(provisionalEvidence)) fail('provisionalEvidence must be an array');
  for (const item of provisionalEvidence) {
    if (!item || !employeeExists(item.employeeId) || !workforce.skills.some((skill) => skill.id === item.skillId)
      || !Number.isInteger(item.proficiency) || item.proficiency < 1 || item.proficiency > 5) fail('Invalid provisional evidence');
  }
  const withProvisional = (snapshot) => {
    for (const item of provisionalEvidence) {
      const edge = snapshot.matrix.find((entry) => entry.employeeId === item.employeeId && entry.skillId === item.skillId);
      if (edge) edge.proficiency = item.proficiency;
      else snapshot.matrix.push({ employeeId: item.employeeId, skillId: item.skillId, proficiency: item.proficiency, evidenceSource: 'pending review', lastVerifiedAt: null });
    }
    return snapshot;
  };
  const normalizedRequirements = normalizeFutureRequirements(workforce, requirements);

  const projected = withProvisional(structuredClone(workforce));
  const blocked = [];
  const capacityWarnings = [];
  const mentorLoad = new Map();
  for (const item of [...interventions].sort((a, b) => a.completionMonth - b.completionMonth)) {
    if (!item.assumeVerified || item.completionMonth > horizonMonths) continue;
    if (departures.some((departure) => departure.employeeId === item.employeeId && departure.month <= item.completionMonth)) {
      blocked.push({ ...item, reason: 'Learner unavailable before completion' }); continue;
    }
    if (item.mentorId != null) {
      const mentor = workforce.matrix.find((edge) => edge.employeeId === item.mentorId && edge.skillId === item.skillId);
      if (!mentor || mentor.proficiency < Math.max(4, item.targetProficiency)
        || departures.some((departure) => departure.employeeId === item.mentorId && departure.month <= item.completionMonth)) {
        blocked.push({ ...item, reason: 'Mentor unqualified or unavailable before completion' }); continue;
      }
      const window = { startMonth: item.startMonth ?? 0, completionMonth: item.completionMonth };
      const hours = workforce.employees.find((employee) => employee.id === item.mentorId)?.mentoringHoursPerMonth;
      const booked = mentorLoad.get(item.mentorId) ?? [];
      if (Number.isFinite(hours)) {
        const concurrent = Math.floor(hours / MENTOR_HOURS_PER_ENGAGEMENT);
        if (concurrent < 1) {
          blocked.push({ ...item, reason: `Mentor has ${hours} recorded hours per month, below one engagement` }); continue;
        }
        if (!hasCapacity(booked, window, concurrent)) {
          blocked.push({ ...item, reason: `Mentor capacity exceeded: ${hours} recorded hours per month supports ${concurrent} concurrent engagement(s)` }); continue;
        }
      } else {
        // Unknown capacity is not a blocker, because absent evidence is not evidence of absence.
        // It is surfaced instead, so a reviewer confirms availability before relying on the plan.
        capacityWarnings.push({ mentorId: item.mentorId, skillId: item.skillId, completionMonth: item.completionMonth,
          warning: 'Mentor has no recorded monthly capacity; this engagement is scheduled on an unverified assumption' });
      }
      mentorLoad.set(item.mentorId, [...booked, window]);
    }
    const edge = projected.matrix.find((entry) => entry.employeeId === item.employeeId && entry.skillId === item.skillId);
    if (edge) edge.proficiency = Math.max(edge.proficiency, item.targetProficiency);
    else projected.matrix.push({ employeeId: item.employeeId, skillId: item.skillId, proficiency: item.targetProficiency });
  }
  const unavailable = new Set(departures.filter((departure) => departure.month <= horizonMonths).map((departure) => departure.employeeId));
  projected.matrix = projected.matrix.filter((edge) => !unavailable.has(edge.employeeId));
  const withoutInterventions = withProvisional(structuredClone(workforce));
  withoutInterventions.matrix = withoutInterventions.matrix.filter((edge) => !unavailable.has(edge.employeeId));
  const requirementsApplied = applyRequirements(projected, normalizedRequirements, horizonMonths);
  applyRequirements(withoutInterventions, normalizedRequirements, horizonMonths);
  const provisionalApplied = provisionalEvidence.map(({ changeRequestId = null, employeeId, skillId, proficiency, label = null }) =>
    ({ changeRequestId, employeeId, skillId, proficiency, label }));
  return { horizonMonths, baseline: analyze(workforce), noIntervention: analyze(withoutInterventions), projected: analyze(projected),
    requirementsSource: usesPersistedRequirements ? 'persisted-reviewed' : 'scenario',
    blocked, capacityWarnings, requirementsApplied, provisionalApplied,
    assumptions: ['Scenario only; baseline is unchanged.', 'Completed interventions assume successful proficiency verification.',
      `One mentoring engagement is assumed to occupy ${MENTOR_HOURS_PER_ENGAGEMENT} of a mentor's recorded hours per month.`,
      'Approved future requirements apply to the horizon scenarios, never to today\'s baseline.',
      usesPersistedRequirements
        ? 'Only persisted requirements with reviewed status are applied automatically.'
        : 'Caller-supplied requirements are scenario inputs and are not saved.',
      'Unsaved future skills use provisional scenario-only IDs; saved future skills keep their persistent IDs.',
      ...(provisionalApplied.length > 0
        ? ['Pending evidence changes are modelled as provisional assumptions: they are not approved and never change today\'s baseline.']
        : [])] };
}
module.exports = { simulate, MENTOR_HOURS_PER_ENGAGEMENT, persistedReviewedRequirements };
