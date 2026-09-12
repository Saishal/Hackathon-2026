const BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';
async function request(path, body) {
  const response = await fetch(`${BASE}/api/keystone${path}`, body === undefined ? {} : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
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
};
