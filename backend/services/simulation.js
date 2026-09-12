const { analyze } = require('./risk');
const fail = (message) => { const error = new Error(message); error.status = 400; throw error; };

function simulate(workforce, scenario) {
  if (!scenario || ![0, 12, 36, 60].includes(scenario.horizonMonths)) fail('horizonMonths must be 0, 12, 36, or 60');
  const { horizonMonths, departures = [], interventions = [] } = scenario;
  if (!Array.isArray(departures) || !Array.isArray(interventions)) fail('departures and interventions must be arrays');
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
  }
  const projected = structuredClone(workforce);
  const blocked = [];
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
    }
    const edge = projected.matrix.find((entry) => entry.employeeId === item.employeeId && entry.skillId === item.skillId);
    if (edge) edge.proficiency = Math.max(edge.proficiency, item.targetProficiency);
    else projected.matrix.push({ employeeId: item.employeeId, skillId: item.skillId, proficiency: item.targetProficiency });
  }
  const unavailable = new Set(departures.filter((departure) => departure.month <= horizonMonths).map((departure) => departure.employeeId));
  projected.matrix = projected.matrix.filter((edge) => !unavailable.has(edge.employeeId));
  const withoutInterventions = { ...workforce, matrix: workforce.matrix.filter((edge) => !unavailable.has(edge.employeeId)) };
  return { horizonMonths, baseline: analyze(workforce), noIntervention: analyze(withoutInterventions), projected: analyze(projected), blocked,
    assumptions: ['Scenario only; baseline is unchanged.', 'Completed interventions assume successful proficiency verification.', 'Capacity scheduling and future strategic requirements are extension work.'] };
}
module.exports = { simulate };
