const BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';
async function request(path, body, method = 'POST') {
  const response = await fetch(`${BASE}/api/keystone${path}`, body === undefined ? {} : {
    method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || `Request failed (${response.status})`);
  return payload;
}
export const keystoneApi = {
  workforce: () => request('/workforce'), risks: () => request('/risks'),
  employeeRisks: () => request('/employee-risks'),
  simulate: (scenario) => request('/simulate', scenario),
  developmentPlan: (skillId) => request('/development-plan', { skillId }),
  strategy: (direction) => request('/strategy', { direction }),
  previewStrategy: (payload) => request('/strategy/preview', payload),
  aiStatus: () => request('/ai-status'),
  // Member 1's workforce-data contract: evidence edits and effective-dated future requirements.
  // lastVerifiedAt is null when verification is unknown; render null/undefined as a dash, never guessed.
  saveEmployeeSkill: (entry) => request('/employee-skills', entry, 'PUT'),
  futureRequirements: () => request('/future-requirements'),
  addFutureRequirement: (requirement) => request('/future-requirements', requirement),
};
