// Formatting and small helpers shared by views. Components live in ui.jsx.

// Counted nouns for interface copy: plural(1, 'skill') -> "1 skill", plural(3, 'person', 'people') -> "3 people".
export const plural = (count, singular, pluralWord = `${singular}s`) => `${count} ${count === 1 ? singular : pluralWord}`;

// Capabilities come from the server with the session. They decide what to show; the server still enforces them.
export const can = (session, ...permissions) => permissions.some((permission) => session?.capabilities?.includes(permission));

export function humanizeKey(key = '') {
  const words = String(key).split('.').pop().replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const pad = (value) => String(value).padStart(2, '0');
export const localToday = () => {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

const toDate = (value) => new Date(value.length === 10 ? `${value}T00:00:00` : value);

export function formatDate(value) {
  if (!value) return '—';
  const date = toDate(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatDateTime(value) {
  if (!value) return '—';
  const date = toDate(value);
  return Number.isNaN(date.getTime()) ? value
    : date.toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function relativeTime(value) {
  if (!value) return 'never';
  const minutes = Math.round((Date.now() - toDate(value).getTime()) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return days < 30 ? `${days} d ago` : formatDate(value);
}

// Field-level messages from an API validation error, keyed by the last segment of each field path.
export function fieldMessages(error) {
  const messages = {};
  for (const detail of error?.details ?? []) {
    const key = String(detail.field).split('.').pop();
    messages[key] ??= detail.message;
  }
  return messages;
}

// Turns a data-quality issue link into an in-app route.
export function hrefForLink(link) {
  if (!link) return null;
  const params = new URLSearchParams();
  if (link.tab) params.set('tab', link.tab);
  if (link.query) params.set('q', link.query);
  if (link.skillId) params.set('skill', link.skillId);
  if (link.employeeId) params.set('employee', link.employeeId);
  if (link.scenarioId) params.set('scenario', link.scenarioId);
  const search = params.toString();
  return `#/${link.view}${search ? `?${search}` : ''}`;
}

export const SEVERITY_LABELS = { critical: 'Critical', warning: 'Warning', info: 'Info' };

export const CHANGE_STATUS = {
  draft: ['Draft', 'tag-outline'],
  submitted: ['Pending review', 'tag-warn'],
  approved: ['Approved', 'tag-ok'],
  rejected: ['Rejected', 'tag-danger'],
  cancelled: ['Cancelled', 'tag-outline'],
};

export const ISSUE_STATUS = {
  open: ['Open', 'tag-outline'],
  acknowledged: ['Acknowledged', 'tag-accent'],
  resolved: ['Resolved', 'tag-ok'],
};

export const TRUST_LABELS = {
  verified: ['Verified', 'tag-ok'],
  unverified: ['Unverified', 'tag-outline'],
  stale: ['Due for re-verification', 'tag-warn'],
};

export const FIELD_LABELS = {
  proficiency: 'Level', evidenceSource: 'Evidence source', lastVerifiedAt: 'Verified on', requiredHolders: 'People needed',
  targetProficiency: 'Target level', criticality: 'Criticality', effectiveMonth: 'Starts in month', provenance: 'Source',
  skillName: 'Skill', skillId: 'Skill', title: 'Title', kind: 'Type', url: 'Link', provider: 'Provider', verified: 'Verified',
  skillIds: 'Skills', status: 'Status', qualifiedPeople: 'Qualified people', dependencyScore: 'Dependency score',
  minimumProficiency: 'Minimum level', displayName: 'Display name', employeeId: 'Linked employee', disabled: 'Disabled',
  managerId: 'Manager', reportsExternally: 'Reports outside the organization', mentoringHoursPerMonth: 'Mentoring hours per month',
  horizonMonths: 'Horizon (months)', departures: 'Departures', interventions: 'Planned development',
  includePendingChanges: 'Includes pending changes', note: 'Note', dueDate: 'Due date', nextReviewDate: 'Next review',
  owner: 'Owner', ownerUserId: 'Owner account', decision: 'Decision', mentorId: 'Mentor', name: 'Name', email: 'Email', role: 'Role',
  department: 'Department', planStartDate: 'Plan start date', evidenceStaleMonths: 'Re-verification period (months)',
  reviewerComment: 'Reviewer comment', operation: 'Operation', changedFields: 'Changed fields',
};

export const ACTION_LABELS = {
  'auth.login': 'Signed in', 'auth.logout': 'Signed out', 'auth.login_failed': 'Failed sign-in', 'auth.login_blocked': 'Sign-in blocked',
  'employee_skill.created': 'Evidence recorded', 'employee_skill.updated': 'Evidence updated', 'employee_skill.verified': 'Evidence verified',
  'employee_skill.removed': 'Evidence removed', 'employee.updated': 'Employee profile edited',
  'role_requirement.created': 'Role requirement added', 'role_requirement.updated': 'Role requirement changed', 'role_requirement.removed': 'Role requirement removed',
  'future_requirement.created': 'Future requirement proposed', 'future_requirement.approved': 'Future requirement approved',
  'future_requirement.updated': 'Future requirement updated', 'future_requirement.rejected': 'Future requirement rejected',
  'future_requirement.removed': 'Future requirement removed', 'future_skill_target.updated': 'Hiring targets updated',
  'resource.created': 'Learning resource added', 'resource.updated': 'Learning resource updated',
  'change_request.drafted': 'Change drafted', 'change_request.submitted': 'Change submitted for review', 'change_request.updated': 'Draft edited',
  'change_request.approved': 'Change approved', 'change_request.rejected': 'Change rejected', 'change_request.cancelled': 'Change cancelled',
  'scenario.saved': 'Scenario saved', 'scenario.updated': 'Scenario updated', 'scenario.deleted': 'Scenario deleted',
  'ai_recommendation.reviewed': 'AI action reviewed', 'ai_recommendation.unreviewed': 'AI review withdrawn',
  'ai_recommendation.scheduled': 'AI action scheduled', 'ai_recommendation.dismissed': 'AI action dismissed',
  'risk.acknowledged': 'Risk owner assigned', 'risk.acknowledgement_updated': 'Risk ownership updated', 'risk.acknowledgement_closed': 'Risk ownership closed',
  'risk.critical_skill_uncovered': 'Critical skill uncovered', 'risk.coverage_restored': 'Coverage restored', 'risk.single_holder_resolved': 'Single-holder risk resolved',
  'data_quality.acknowledged': 'Data issue acknowledged', 'data_quality.reopened': 'Data issue reopened', 'data_quality.resolved': 'Data issue resolved',
  'user.created': 'User created', 'user.updated': 'User details changed', 'user.role_changed': 'Role changed', 'user.disabled': 'User disabled',
  'user.enabled': 'User re-enabled', 'user.password_reset': 'Password reset', 'organization.updated': 'Organization settings changed',
  'export.generated': 'Report exported', 'dataset.imported': 'Dataset imported',
};

export const actionLabel = (type) => ACTION_LABELS[type] ?? humanizeKey(String(type).replace('.', '_'));

export const initials = (name = '') => name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0].toUpperCase()).join('');

export function addDays(date, days) {
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

export const ENTITY_LABELS = {
  employee_skill: 'Evidence', employee: 'Employee', skill: 'Skill', role_requirement: 'Role requirement',
  future_requirement: 'Future requirement', future_skill_target: 'Hiring target', resource: 'Learning resource',
  change_request: 'Change request', scenario: 'Scenario', ai_recommendation: 'AI recommendation',
  data_quality_issue: 'Data-quality issue', user: 'Account', organization: 'Organization', dataset: 'Dataset', report: 'Report',
};
export const entityLabel = (type) => ENTITY_LABELS[type] ?? humanizeKey(type);

export const ROLE_NAMES = { admin: 'Admin', hr: 'HR', manager: 'Manager', employee: 'Employee' };
export const SOURCE_NAMES = { ui: 'Web app', api: 'API', seed: 'Seed', system: 'System' };
export const CHANGE_TYPE_LABELS = { employee_skill: 'Skill evidence', future_requirement: 'Future requirement', resource: 'Learning resource' };

export const PROFICIENCY_LABELS = {
  1: 'Awareness', 2: 'Works with support', 3: 'Independent', 4: 'Advanced, can mentor', 5: 'Expert',
};
