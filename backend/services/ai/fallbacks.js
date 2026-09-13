const { categories } = require('./schemas');
const { normalizeName } = require('./grounding');
const { analyze } = require('../risk');

// Deterministic, rule-based answers used when no AI provider is configured or the provider fails.
// They go through the same validation as live output and are labelled "demo rules" in the UI, never AI.

// One action per development category, using only the eligible learners, mentors and verified
// resources supplied in the context. A category with no supporting evidence is not_applicable.
function developmentFallback(context) {
  const learner = context.eligibleLearners[0];
  const mentor = context.eligibleMentors.find((entry) => entry.mentoringHoursPerMonth > 0) || context.eligibleMentors[0];
  const descriptions = {
    training: 'Complete a scoped learning plan, then perform a supervised task using the target skill.',
    mentoring: 'Write a recovery runbook, shadow the mentor, perform supervised practice, then complete an independent demonstration.',
    certification: 'Review the supplied verified certification resource and assess its fit before enrollment.',
    job_rotation: 'Arrange a supervised rotation with the team that owns this capability, subject to manager approval.',
    project_experience: 'Assign a bounded practice project and require an independently reviewed delivery.',
  };
  return { actions: categories.map((category) => {
    const resource = context.resources.find((entry) => entry.category === category);
    const applicable = Boolean(learner && (category !== 'mentoring' || mentor) && (category !== 'certification' || resource));
    return { category, employeeId: applicable ? learner.id : null,
      mentorId: applicable && category === 'mentoring' ? mentor.id : null,
      resourceId: applicable ? resource?.id ?? null : null,
      status: applicable ? 'needs_review' : 'not_applicable',
      targetProficiency: context.skill.targetProficiency,
      rationale: applicable ? `Add independent coverage; the current recorded gap is ${context.risk.gap}.`
        : !learner ? 'No assessed learner below the target was recorded; identify and assess a participant first.'
          : category === 'certification' ? 'No verified certification resource was supplied for this skill.' : 'No qualified available mentor was recorded.',
      action: applicable ? descriptions[category] : 'Collect the missing participant, mentor, or catalog evidence before proposing this action.',
      estimatedDurationMonths: applicable ? (category === 'job_rotation' ? 3 : 2) : null,
      milestone: applicable ? 'Participant completes a representative task without assistance and records the evidence.' : 'Required evidence is collected and reviewed.',
      verificationMethod: 'A qualified reviewer observes an independent demonstration; attendance alone does not establish proficiency.',
      assumptions: ['Rule-based demo proposal, not live AI.', 'Duration is an estimate; confirm participant interest, capacity, scope, and funding.',
        ...(category === 'mentoring' && mentor?.mentoringHoursPerMonth === null ? ['Mentor availability is unknown and must be confirmed.'] : [])],
    };
  }) };
}

const templates = [
  { pattern: /e[- ]?commerce|online (store|sales|retail)/i, skills: [
    ['E-commerce Operations', 'Operate online ordering, fulfillment, and returns.', 'build'],
    ['Data Analysis', 'Measure conversion, demand, and operational performance.', 'build'],
    ['Cybersecurity', 'Protect customer and transaction systems.', 'partner'],
  ] },
  { pattern: /production|manufactur|factory|robotic|industrial/i, skills: [
    ['Industrial Automation', 'Configure and maintain automated production controls.', 'hire'],
    ['Operational Technology Security', 'Protect connected industrial equipment.', 'partner'],
    ['Data Analysis', 'Interpret quality, downtime, and production metrics.', 'build'],
  ] },
  { pattern: /\bai\b|artificial intelligence|customer support|chatbot/i, skills: [
    ['AI Governance', 'Review accountability, evaluation, and oversight for AI-assisted work.', 'build'],
    ['AI System Evaluation', 'Test quality and failure behavior before operational use.', 'build'],
    ['Knowledge Base Operations', 'Maintain current, attributable support knowledge.', 'build'],
  ] },
  { pattern: /payment|fintech|billing|banking|\bpci\b|regulated|compliance|licen[cs]e/i, skills: [
    ['Payments Compliance', 'Meet card-scheme and regulatory obligations before processing live transactions.', 'build'],
    ['Cybersecurity', 'Protect cardholder data and transaction systems to the required standard.', 'partner'],
    ['Data Privacy (GDPR)', 'Handle personal and financial data lawfully across every market served.', 'build'],
  ] },
  { pattern: /securit|\bsoc\b|incident|threat|zero[- ]trust|penetration|pentest/i, skills: [
    ['Cybersecurity', 'Establish a security baseline and ownership for every exposed system.', 'build'],
    ['Incident Response', 'Detect, contain and review incidents with a rehearsed process.', 'build'],
    ['Identity & Access Management', 'Control who can reach which system, with reviewable access.', 'partner'],
  ] },
  { pattern: /cloud|kubernetes|platform|infrastructure|devops|migrat|automation|\bsre\b|reliab/i, skills: [
    ['Cloud Architecture', 'Design the target platform and its cost, resilience and security boundaries.', 'build'],
    ['Kubernetes', 'Run and operate the workloads the initiative depends on.', 'build'],
    ['DevOps', 'Automate delivery so infrastructure changes are repeatable and reviewed.', 'build'],
  ] },
  { pattern: /data platform|analytics|reporting|dashboard|warehouse|machine learning|\bml\b|predict/i, skills: [
    ['Data Analysis', 'Turn operational data into decisions with reviewable methods.', 'build'],
    ['SQL & Data Modeling', 'Model the data the initiative reports on so numbers agree across teams.', 'build'],
    ['Machine Learning', 'Build and validate models only where recorded data supports them.', 'partner'],
  ] },
  { pattern: /international|expan|new market|localis|localiz|\beu\b|europe|latam|apac|region/i, skills: [
    ['Project Management', 'Coordinate market entry across legal, product and operations.', 'build'],
    ['Data Privacy (GDPR)', 'Meet the data-protection rules of each new market.', 'partner'],
    ['Communication', 'Keep distributed teams and partners aligned across time zones.', 'build'],
  ] },
  { pattern: /mobile|\bios\b|android|\bapp\b/i, skills: [
    ['Swift & iOS', 'Ship and maintain the iOS application.', 'hire'],
    ['Kotlin & Android', 'Ship and maintain the Android application.', 'hire'],
    ['Test Automation', 'Keep release trains safe with automated checks.', 'build'],
  ] },
];
const clamp = (value, low, high) => Math.min(high, Math.max(low, Math.round(value)));
const sourcingRationale = (sourcing) => sourcing === 'build' ? 'Assess internal candidates and development capacity before selecting this path.'
  : sourcing === 'hire' ? 'Consider hiring if internal development cannot meet the reviewed timeline.' : 'Consider specialist support while evaluating internal capability.';

// No keyword template matched. Rather than proposing nothing, surface the capabilities the
// recorded evidence is already thinnest in: any initiative depends at least on those. Uses
// Member 2's analyzer, never invents a skill, and is labeled as derived rather than forecast.
function coverageFallback(workforce) {
  const catalog = workforce?.skills || [];
  if (!catalog.length || !workforce.matrix) return [];
  const unambiguous = (skill) => catalog.filter((entry) => normalizeName(entry.name) === normalizeName(skill.name)).length === 1;
  return analyze(workforce).skills
    .filter((skill) => (skill.gap > 0 || skill.busFactor <= 1) && unambiguous(skill))
    .slice(0, 3)
    .map((skill) => {
      const sourcing = skill.busFactor === 0 ? 'hire' : 'build';
      return { skillId: skill.id, skillName: skill.name.slice(0, 100),
        rationale: `No initiative template matched this direction, so this requirement is derived from recorded coverage rather than the initiative itself: ${skill.explanation}`,
        targetProficiency: clamp(skill.targetProficiency, 1, 5),
        requiredHolders: clamp(Math.max(2, skill.requiredHolders), 1, 10000),
        criticality: clamp(skill.criticality, 1, 5), effectiveMonth: 12, sourcing, sourcingRationale: sourcingRationale(sourcing),
        assumptions: ['Derived deterministically from recorded coverage gaps; not an AI forecast and not specific to this initiative.',
          'Confirm whether this capability actually supports the stated direction before acting on it.',
          'Month 12 and a two-holder minimum are illustrative planning defaults; review scope, budget, and timeline.'] };
    });
}
function strategyFallback(direction, workforce) {
  const matched = templates.filter((entry) => entry.pattern.test(direction));
  if (matched.length === 0) return { requirements: coverageFallback(workforce) };
  // A direction that touches several themes (payments + security + cloud) gets each theme's skills once.
  const seen = new Set();
  const skills = matched.flatMap((entry) => entry.skills).filter(([skillName]) => !seen.has(skillName) && seen.add(skillName)).slice(0, 8);
  return { requirements: skills.map(([skillName, rationale, sourcing]) => ({
    skillId: null, skillName, rationale, targetProficiency: 3, requiredHolders: 2, criticality: 3, effectiveMonth: 12,
    sourcing, sourcingRationale: sourcingRationale(sourcing),
    assumptions: ['Curated demo template selected by keywords; not an AI forecast.',
      'Two independent holders at month 12 is an illustrative planning assumption; review scope, budget, and timeline.'],
  })) };
}
function unavailableDevelopment(context) {
  return { actions: categories.map((category) => ({
    category, employeeId: null, mentorId: null, resourceId: null, status: 'not_applicable',
    targetProficiency: context.skill.targetProficiency, estimatedDurationMonths: null,
    rationale: 'A validated development proposal is unavailable.',
    action: 'Review the workforce evidence and resource catalog before planning this action.',
    milestone: 'Required evidence is reviewed and a valid plan can be generated.',
    verificationMethod: 'A qualified reviewer checks the supporting evidence.',
    assumptions: ['No participant has been assigned and no proficiency improvement is assumed.'],
  })) };
}
module.exports = { developmentFallback, strategyFallback, coverageFallback, unavailableDevelopment };
