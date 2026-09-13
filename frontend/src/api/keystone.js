const BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';

// Errors keep the server's machine-readable code, field details and request reference, so screens can
// explain what went wrong and never show a failed write as a success.
export class ApiError extends Error {
  constructor(status, body) {
    super(body?.error || (status === 0
      ? 'Keystone could not reach the server. Check that the backend is running, then try again.'
      : `The request failed (${status}).`));
    this.name = 'ApiError';
    this.status = status;
    this.code = body?.code ?? (status === 0 ? 'network_error' : 'error');
    this.details = body?.details ?? [];
    this.requestId = body?.requestId ?? null;
    this.requiredPermission = body?.requiredPermission ?? null;
  }
}

export const SIGNED_OUT_EVENT = 'keystone:signed-out';

// The session lives in an HTTP-only cookie the page cannot read; every request includes it.
async function request(path, { method = 'GET', body, raw = false } = {}) {
  let response;
  try {
    response = await fetch(`${BASE}/api${path}`, {
      method,
      credentials: 'include',
      headers: { 'X-Keystone-Client': 'web', ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, null);
  }

  if (raw && response.ok) return response;
  const payload = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    // An expired or revoked session sends the whole app back to sign-in.
    if (response.status === 401 && !path.startsWith('/auth/')) window.dispatchEvent(new Event(SIGNED_OUT_EVENT));
    throw new ApiError(response.status, payload);
  }
  return payload;
}

const post = (path, body = {}) => request(path, { method: 'POST', body });

function query(params = {}) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '' && value !== false) search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}

// Exports are generated and permission-checked by the server; the browser only saves the file.
async function download(path) {
  const response = await request(path, { raw: true });
  const disposition = response.headers.get('Content-Disposition') ?? '';
  const filename = /filename="([^"]+)"/.exec(disposition)?.[1] ?? 'keystone-export.csv';
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  return filename;
}

export const authApi = {
  environment: () => request('/auth/environment'),
  me: () => request('/auth/me'),
  login: (email, password) => post('/auth/login', { email, password }),
  logout: () => post('/auth/logout'),
};

export const keystoneApi = {
  workforce: () => request('/keystone/workforce'),
  risks: () => request('/keystone/risks'),
  employeeRisks: () => request('/keystone/employee-risks'),
  succession: () => request('/keystone/succession'),
  simulate: (scenario) => post('/keystone/simulate', scenario),
  developmentPlan: (skillId) => post('/keystone/development-plan', { skillId }),
  strategy: (direction) => post('/keystone/strategy', { direction }),
  previewStrategy: (payload) => post('/keystone/strategy/preview', payload),
  aiStatus: () => request('/keystone/ai-status'),
  // lastVerifiedAt is null when verification is unknown; render null/undefined as a dash, never guessed.
  saveEmployeeSkill: (entry) => request('/keystone/employee-skills', { method: 'PUT', body: entry }),
  removeEmployeeSkill: (employeeId, skillId) => request(`/keystone/employee-skills/${employeeId}/${skillId}`, { method: 'DELETE' }),
  futureRequirements: () => request('/keystone/future-requirements'),
  addFutureRequirement: (requirement) => post('/keystone/future-requirements', requirement),
  approveFutureRequirement: (id, comment) => post(`/keystone/future-requirements/${id}/approve`, comment ? { comment } : {}),
  rejectFutureRequirement: (id, comment) => post(`/keystone/future-requirements/${id}/reject`, { comment }),

  organization: () => request('/keystone/organization'),
  employees: () => request('/keystone/employees'),
  createEmployee: (body) => post('/keystone/employees', body),
  updateEmployee: (id, fields) => request(`/keystone/employees/${id}`, { method: 'PATCH', body: fields }),
  employeeImpact: (id) => request(`/keystone/employees/${id}/impact`),
  archiveEmployee: (id, body) => post(`/keystone/employees/${id}/archive`, body),
  restoreEmployee: (id) => post(`/keystone/employees/${id}/restore`),
  updateOrganization: (fields) => request('/keystone/organization', { method: 'PATCH', body: fields }),

  auditLog: (filters) => request(`/keystone/audit-log${query(filters)}`),

  dataQuality: (filters) => request(`/keystone/data-quality${query(filters)}`),
  acknowledgeIssue: (fingerprint, note) => post(`/keystone/data-quality/${encodeURIComponent(fingerprint)}/acknowledge`, { note }),
  reopenIssue: (fingerprint) => post(`/keystone/data-quality/${encodeURIComponent(fingerprint)}/reopen`),

  changeRequests: (filters) => request(`/keystone/change-requests${query(filters)}`),
  createChangeRequest: (body) => post('/keystone/change-requests', body),
  submitChangeRequest: (id) => post(`/keystone/change-requests/${id}/submit`),
  cancelChangeRequest: (id) => post(`/keystone/change-requests/${id}/cancel`),
  approveChangeRequest: (id, comment) => post(`/keystone/change-requests/${id}/approve`, comment ? { comment } : {}),
  rejectChangeRequest: (id, comment) => post(`/keystone/change-requests/${id}/reject`, { comment }),

  profile: () => request('/keystone/me/profile'),

  acknowledgements: (status) => request(`/keystone/risk-acknowledgements${query({ status })}`),
  acknowledgeRisk: (body) => post('/keystone/risk-acknowledgements', body),
  updateAcknowledgement: (id, fields) => request(`/keystone/risk-acknowledgements/${id}`, { method: 'PATCH', body: fields }),
  closeAcknowledgement: (id, note) => post(`/keystone/risk-acknowledgements/${id}/close`, note ? { note } : {}),
  assignableOwners: () => request('/keystone/users/assignable-owners'),

  scenarios: () => request('/keystone/scenarios'),
  createScenario: (body) => post('/keystone/scenarios', body),
  updateScenario: (id, body) => request(`/keystone/scenarios/${id}`, { method: 'PUT', body }),
  deleteScenario: (id) => request(`/keystone/scenarios/${id}`, { method: 'DELETE' }),

  recordAiDecision: (body) => post('/keystone/ai/decisions', body),

  users: () => request('/keystone/users'),
  createUser: (body) => post('/keystone/users', body),
  updateUser: (id, fields) => request(`/keystone/users/${id}`, { method: 'PATCH', body: fields }),
  resetPassword: (id, password) => post(`/keystone/users/${id}/reset-password`, { password }),

  exportRisks: (filter) => download(`/keystone/exports/risks.csv${query({ filter })}`),
  exportDataQuality: (filters) => download(`/keystone/exports/data-quality.csv${query(filters)}`),
};
