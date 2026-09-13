// Role-based permissions, enforced on the backend. The frontend receives the same list only to decide
// what to show; hiding a control is never the authorization.
const ROLES = ['admin', 'hr', 'manager', 'employee'];

const ROLE_LABELS = {
  admin: 'Admin',
  hr: 'HR / People Leader',
  manager: 'Manager',
  employee: 'Employee',
};

const EVERYONE = ['profile.read.self', 'changes.submit'];

const GRANTS = {
  admin: [
    'workforce.read.all', 'risk.read.org', 'succession.read', 'scenario.run', 'scenario.save',
    'ai.development', 'ai.strategy', 'planning.propose',
    'evidence.write', 'employee.edit', 'roleRequirement.configure', 'futureRequirement.read',
    'futureRequirement.configure', 'resource.configure',
    'changes.review.people', 'changes.review.planning',
    'audit.read', 'dataQuality.read.org', 'dataQuality.manage', 'risk.acknowledge',
    'export.risks', 'export.dataQuality', 'users.manage', 'organization.manage', 'repository.log',
  ],
  hr: [
    'workforce.read.all', 'risk.read.org', 'succession.read', 'scenario.run', 'scenario.save',
    'ai.development', 'ai.strategy', 'planning.propose', 'futureRequirement.read',
    'changes.review.people', 'audit.read', 'dataQuality.read.org', 'dataQuality.manage', 'risk.acknowledge',
    'export.risks', 'export.dataQuality',
  ],
  manager: [
    'workforce.read.team', 'risk.read.team', 'succession.read', 'futureRequirement.read',
    'dataQuality.read.team', 'export.risks',
  ],
  employee: ['workforce.read.self'],
};

// Endpoints that serve more than one scope ask for the family; the handler then narrows the data.
const ANY_OF = {
  'workforce.read': ['workforce.read.all', 'workforce.read.team', 'workforce.read.self'],
  'risk.read': ['risk.read.org', 'risk.read.team'],
  'dataQuality.read': ['dataQuality.read.org', 'dataQuality.read.team'],
  'changes.review': ['changes.review.people', 'changes.review.planning'],
};

const permissionsFor = (role) => new Set([...(GRANTS[role] ?? []), ...(GRANTS[role] ? EVERYONE : [])]);

function can(user, permission) {
  if (!user) return false;
  const granted = permissionsFor(user.role);
  return (ANY_OF[permission] ?? [permission]).some((entry) => granted.has(entry));
}

const capabilities = (user) => [...permissionsFor(user.role)].sort();

module.exports = { ROLES, ROLE_LABELS, can, capabilities };
