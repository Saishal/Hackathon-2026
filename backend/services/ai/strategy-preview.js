const { analyze } = require('../risk');
const { normalizeRequirements } = require('./grounding');

// Read-only bridge for Members 1/2: provisional negative IDs exist only in this cloned snapshot.
function previewRequirements(workforce, payload) {
  if (!payload || ![0, 12, 36, 60].includes(payload.horizonMonths) || payload.reviewed !== true) {
    const error = new Error('Review requirements and provide horizonMonths 0, 12, 36, or 60'); error.status = 400; throw error;
  }
  let requirements;
  try { requirements = normalizeRequirements({ requirements: payload.requirements }, workforce); }
  catch { const error = new Error('Invalid reviewed requirements: check fields, IDs, names, and duplicates'); error.status = 400; throw error; }
  const snapshot = structuredClone(workforce);
  const scheduled = requirements.map((requirement, index) => {
    const provisionalId = requirement.skillId ?? -(index + 1);
    const active = requirement.effectiveMonth <= payload.horizonMonths;
    if (active) {
      const definition = { id: provisionalId, name: requirement.skillName, criticality: requirement.criticality,
        requiredHolders: requirement.requiredHolders, targetProficiency: requirement.targetProficiency };
      const existing = snapshot.skills.findIndex((skill) => skill.id === provisionalId);
      if (existing >= 0) snapshot.skills[existing] = { ...snapshot.skills[existing], ...definition };
      else snapshot.skills.push(definition);
    }
    return { ...requirement, requirementId: `requirement-${index + 1}`, active, provisionalId };
  });
  const analysis = analyze(snapshot);
  return { horizonMonths: payload.horizonMonths, reviewStatus: 'reviewed-preview', persisted: false,
    requirements: scheduled.map(({ provisionalId, ...requirement }) => {
      const result = requirement.active ? analysis.skills.find((skill) => skill.id === provisionalId) : null;
      return { ...requirement, coverage: result ? { recordedQualifiedHolders: result.busFactor, gap: result.gap, keystoneScore: result.keystoneScore,
        explanation: result.explanation } : null };
    }),
    assumptions: ['Read-only preview; no skills, targets, or evidence are saved.',
      'Reviewed requirement quantities replace existing quantities for matching skills in this preview.',
      'No employee departures or training gains are assumed; combine these in Member 2’s scenario engine.',
      'New skills have no recorded coverage; this does not establish that no employee possesses them.'],
  };
}
module.exports = { previewRequirements };
