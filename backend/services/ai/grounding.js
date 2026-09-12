const { validateShape, categories } = require('./schemas');

function normalizeName(value) {
  const normalized = value.normalize('NFKC').toLowerCase().trim().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  return ({ 'node js': 'nodejs', 'node': 'nodejs', 'ml': 'machine learning', 'e commerce': 'ecommerce', 'e commerce operations': 'ecommerce operations' })[normalized] || normalized;
}
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
    if (/https?:\/\/|www\./i.test(JSON.stringify(action))) throw new Error('Unverified generated URL');
    if (action.targetProficiency !== context.skill.targetProficiency) throw new Error('Unexpected target proficiency');
    if (action.employeeId !== null && !context.eligibleLearners.some((entry) => entry.id === action.employeeId)) throw new Error('Unsupported learner');
    const mentor = context.eligibleMentors.find((entry) => entry.id === action.mentorId);
    if (action.mentorId !== null && (action.category !== 'mentoring' || !mentor || action.mentorId === action.employeeId)) throw new Error('Unsupported mentor');
    if (action.status === 'proposed' && action.employeeId === null) throw new Error('Missing participant');
    if (action.category === 'mentoring' && action.status === 'proposed' && (!mentor || mentor.mentoringHoursPerMonth === null)) throw new Error('Unconfirmed mentoring availability');
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
    if (/https?:\/\/|www\./i.test(JSON.stringify(requirement))) throw new Error('Unverified generated URL');
    const name = normalizeName(requirement.skillName);
    if (!name) throw new Error('Empty skill name');
    const matches = workforce.skills.filter((skill) => normalizeName(skill.name) === name);
    if (matches.length > 1) throw new Error('Ambiguous catalog skill');
    const named = matches[0];
    const specified = requirement.skillId === null ? null : workforce.skills.find((skill) => skill.id === requirement.skillId);
    if (requirement.skillId !== null && (!specified || normalizeName(specified.name) !== name)) throw new Error('Mismatched skill ID/name');
    const match = specified || named;
    const key = match ? `id:${match.id}` : `name:${name}`;
    if (seen.has(key)) throw new Error('Duplicate strategic skill');
    seen.add(key);
    return { ...requirement, skillId: match?.id ?? null, skillName: match?.name ?? requirement.skillName.trim() };
  });
}
module.exports = { normalizeName, developmentContext, validateDevelopment, normalizeRequirements };
