// Matias owns this boundary. Replace the explicit demo fallback with a validated provider adapter.
function recommend(workforce, skillId) {
  const skill = workforce.skills.find((entry) => entry.id === skillId);
  if (!skill) { const error = new Error('Unknown skillId'); error.status = 400; throw error; }
  const mentor = workforce.matrix.find((edge) => edge.skillId === skillId && edge.proficiency >= Math.max(4, skill.targetProficiency));
  const learner = workforce.matrix.find((edge) => edge.skillId === skillId && edge.proficiency < skill.targetProficiency);
  return { mode: 'demo-fallback', skillId, actions: ['training', 'mentoring', 'certification', 'job_rotation', 'project_experience'].map((category) => ({
    category, employeeId: learner?.employeeId ?? null, mentorId: category === 'mentoring' ? mentor?.employeeId ?? null : null,
    status: category === 'certification' || (category === 'mentoring' && (!mentor || !learner)) ? 'needs_review' : 'proposed',
    targetProficiency: skill.targetProficiency,
    rationale: `Build additional independent coverage for ${skill.name}.`,
    action: category === 'certification' ? 'Select a relevant verified certification; no catalog is connected.' : `Plan ${category.replaceAll('_', ' ')} with supervised practice in ${skill.name}.`,
    verificationMethod: 'Independent demonstration reviewed by a qualified assessor.',
    assumptions: ['Confirm participant interest, availability, resources, and duration before simulation.'],
  })) };
}

function proposeStrategy(direction) {
  if (typeof direction !== 'string' || !direction.trim() || direction.length > 2000) {
    const error = new Error('direction must contain 1–2000 characters'); error.status = 400; throw error;
  }
  return { mode: 'not-configured', direction: direction.trim(), requirements: [],
    message: 'Matias: connect a structured AI provider here. Proposed skills must be reviewed before simulation; no forecast has been generated.' };
}
module.exports = { recommend, proposeStrategy };
