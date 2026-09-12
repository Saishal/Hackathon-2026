const { validateShape, categories } = require('./schemas');
const { normalizeName, resolveSkillIdentity } = require('../skill-identity');
const { hasUnverifiedLink, developmentProse, strategyProse } = require('./resource-links');
// Member 4 brief: knowledge transfer means documentation, shadowing, practice, and an
// independent demonstration. The prompt asks for all four; this makes it a requirement.
// Matched against `action` and `milestone` only. `verificationMethod` is boilerplate that
// always says "observes an independent demonstration", so including it would satisfy the
// shadowing and demonstration elements for free and make this check meaningless.
const transferElements = [
  ['documentation', /runbook|document|write-?up|guide|notes/i],
  ['shadowing', /shadow|sit in|pair(ing|ed|s)?\b|watch/i],
  ['supervised practice', /practice|practis|supervis|hands-?on|exercise|drill/i],
  ['independent demonstration', /independent|unassisted|without assistance|demonstrat|sign-?off/i],
];

function developmentContext(workforce, skill, analysis) {
  const threshold = skill.targetProficiency;
  const employee = (id) => workforce.employees.find((entry) => entry.id === id);
  const edges = workforce.matrix.filter((edge) => edge.skillId === skill.id && employee(edge.employeeId));
  const eligibleLearners = edges.filter((edge) => edge.proficiency < threshold)
    .sort((a, b) => b.proficiency - a.proficiency || a.employeeId - b.employeeId)
    .map((edge) => ({ id: edge.employeeId, proficiency: edge.proficiency }));
  const eligibleMentors = edges.filter((edge) => edge.proficiency >= Math.max(4, threshold))
    .map((edge) => ({ id: edge.employeeId, proficiency: edge.proficiency,
      mentoringHoursPerMonth: Number.isFinite(employee(edge.employeeId).mentoringHoursPerMonth) ? employee(edge.employeeId).mentoringHoursPerMonth : null }))
    .filter((entry) => entry.mentoringHoursPerMonth === null || entry.mentoringHoursPerMonth > 0);
  const resources = (workforce.learningResources || []).filter((resource) => resource.verified === true && resource.skillIds?.includes(skill.id)
    && typeof resource.id === 'string' && categories.includes(resource.category))
    .map(({ id, title, category }) => ({ id, title, category }));
  return { skill: { id: skill.id, name: skill.name, targetProficiency: threshold },
    risk: analysis.skills.find((entry) => entry.id === skill.id), eligibleLearners, eligibleMentors, resources };
}
function validateDevelopment(payload, context) {
  validateShape('development', payload);
  if (new Set(payload.actions.map((action) => action.category)).size !== categories.length) throw new Error('Duplicate action category');
  for (const action of payload.actions) {
    if (hasUnverifiedLink(developmentProse(action), [context.skill.name])) throw new Error('Unverified generated URL');
    if (action.targetProficiency !== context.skill.targetProficiency) throw new Error('Unexpected target proficiency');
    if (action.employeeId !== null && !context.eligibleLearners.some((entry) => entry.id === action.employeeId)) throw new Error('Unsupported learner');
    const mentor = context.eligibleMentors.find((entry) => entry.id === action.mentorId);
    if (action.mentorId !== null && (action.category !== 'mentoring' || !mentor || action.mentorId === action.employeeId)) throw new Error('Unsupported mentor');
    if (action.status === 'proposed' && action.employeeId === null) throw new Error('Missing participant');
    if (action.category === 'mentoring' && action.status === 'proposed' && (!mentor || mentor.mentoringHoursPerMonth === null)) throw new Error('Unconfirmed mentoring availability');
    if (action.category === 'mentoring' && action.status !== 'not_applicable') {
      const prose = `${action.action} ${action.milestone}`;
      const missing = transferElements.filter(([, pattern]) => !pattern.test(prose)).map(([label]) => label);
      if (missing.length) throw new Error(`Mentoring plan omits ${missing.join(', ')}`);
    }
    if (action.status === 'not_applicable' && (action.employeeId !== null || action.mentorId !== null || action.resourceId !== null || action.estimatedDurationMonths !== null)) throw new Error('Inactive action has assignments');
    const resource = context.resources.find((entry) => entry.id === action.resourceId && entry.category === action.category);
    if (action.resourceId !== null && !resource) throw new Error('Unverified resource');
    if (action.category === 'certification' && action.status !== 'not_applicable' && !resource) throw new Error('Unverified certification');
  }
  return payload;
}
function normalizeRequirements(payload, workforce) {
  validateShape('strategy', payload);
  const seen = new Set();
  return payload.requirements.map((requirement) => {
    if (hasUnverifiedLink(strategyProse(requirement), workforce.skills.map((skill) => skill.name))) throw new Error('Unverified generated URL');
    const { key, ...identity } = resolveSkillIdentity(workforce, requirement);
    if (seen.has(key)) throw new Error('Duplicate strategic skill');
    seen.add(key);
    return { ...requirement, ...identity };
  });
}
module.exports = { normalizeName, developmentContext, validateDevelopment, normalizeRequirements };
