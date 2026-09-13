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

// Plain-language summary of each role, shown to an admin before they assign it. Kept beside GRANTS
// so a change to one is a reminder to change the other; the test suite checks every role has one.
const ROLE_SUMMARIES = {
  admin: {
    sees: 'The whole organization: every person, skill, score and data-quality issue.',
    can: [
      'Approve or reject any proposed change, including future requirements and catalogue entries.',
      'Edit official data directly for corrections; every edit is recorded in the audit history.',
      'Run and save Time Machine scenarios and use the AI advisor.',
      'Acknowledge risks and data-quality issues, and export reports.',
      'Create and manage user accounts, roles and organization settings.',
    ],
    cannot: ['Review their own submissions.', 'Remove or disable the last active admin, or lock themselves out.'],
  },
  hr: {
    sees: 'The whole organization: every person, skill, score and data-quality issue.',
    can: [
      "Review proposed changes to people's skill evidence.",
      'Propose future requirements and catalogue changes for an admin to approve.',
      'Run and save Time Machine scenarios and use the AI advisor.',
      'Acknowledge risks and data-quality issues, and export reports.',
      'Read the audit history.',
    ],
    cannot: ['Approve future requirements or catalogue changes.', 'Edit official data directly.', 'Manage user accounts or settings.'],
  },
  manager: {
    sees: 'Only their own team: everyone who reports to them, directly or indirectly. Scores are still calculated on the whole organization, then narrowed.',
    can: [
      'Read workforce data, risk scores, succession and data quality for their team.',
      'Propose skill evidence changes for people on their team.',
      'Export the risk register for their team.',
    ],
    cannot: ['See people outside their team by name.', 'Review or approve changes.', 'Run Time Machine scenarios or the AI advisor.'],
  },
  employee: {
    sees: 'Only their own profile: their recorded skills, what their role asks of them, and the changes they have proposed.',
    can: ['Propose changes to their own skill evidence for a reviewer to approve.'],
    cannot: ["See other people's records or any risk score.", 'Review changes, run scenarios or use the AI advisor.'],
  },
};

const describeRole = (role) => ROLE_SUMMARIES[role] ?? null;

module.exports = { ROLES, ROLE_LABELS, can, capabilities, describeRole };
