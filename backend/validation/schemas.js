// Request body schemas. Every schema rejects unknown fields and never coerces types.
const RESOURCE_KINDS = ['training', 'mentoring', 'certification', 'job_rotation', 'project_experience', 'documentation'];
const ROLES = ['admin', 'hr', 'manager', 'employee'];
const AI_CATEGORIES = ['training', 'mentoring', 'certification', 'job_rotation', 'project_experience'];

const id = (title) => ({ type: 'integer', minimum: 1, ...(title ? { title } : {}) });
const nullableId = (title) => ({ type: ['integer', 'null'], minimum: 1, ...(title ? { title } : {}) });
const text = (max, title) => ({ type: 'string', minLength: 1, maxLength: max, pattern: '\\S', formatHint: "can't be blank", ...(title ? { title } : {}) });
const date = (title) => ({ type: 'string', calendarDate: true, ...(title ? { title } : {}) });
const nullableDate = (title) => ({ type: ['string', 'null'], calendarDate: true, ...(title ? { title } : {}) });
const level = (title) => ({ type: 'integer', minimum: 1, maximum: 5, ...(title ? { title } : {}) });
const month = (title) => ({ type: 'integer', minimum: 0, maximum: 60, ...(title ? { title } : {}) });
const object = (properties, required = [], extra = {}) => ({ type: 'object', additionalProperties: false, properties, required, ...extra });

const login = object({
  email: { type: 'string', minLength: 3, maxLength: 254, title: 'Email' },
  password: { type: 'string', minLength: 1, maxLength: 200, title: 'Password' },
}, ['email', 'password']);

// PUT /employee-skills keeps its v1 contract: lastVerifiedAt is optional and may be null.
const employeeSkill = object({
  employeeId: id('Employee'),
  skillId: id('Skill'),
  proficiency: level('Proficiency'),
  evidenceSource: text(200, 'Evidence source'),
  lastVerifiedAt: nullableDate('Last verified date'),
}, ['employeeId', 'skillId', 'proficiency', 'evidenceSource']);

const evidenceChangePayload = object({
  operation: { enum: ['upsert', 'remove'], title: 'Operation' },
  employeeId: id('Employee'),
  skillId: id('Skill'),
  proficiency: level('Proficiency'),
  evidenceSource: text(200, 'Evidence source'),
  lastVerifiedAt: nullableDate('Verification date'),
}, ['operation', 'employeeId', 'skillId'], {
  if: { properties: { operation: { const: 'upsert' } } },
  then: { required: ['proficiency', 'evidenceSource'] },
});

const futureRequirementFields = {
  skillId: { type: ['integer', 'null'], title: 'Skill' },
  skillName: text(100, 'Skill name'),
  requiredHolders: { type: 'integer', minimum: 1, maximum: 10000, title: 'People needed' },
  targetProficiency: level('Target level'),
  criticality: level('Criticality'),
  effectiveMonth: month('Effective month'),
  provenance: text(300, 'Source'),
};

// POST /future-requirements keeps v1 defaults (criticality 3, status proposed).
const futureRequirementCreate = object({ ...futureRequirementFields, status: { enum: ['proposed', 'reviewed'], title: 'Status' } },
  ['requiredHolders', 'targetProficiency', 'effectiveMonth', 'provenance']);

const futureRequirementUpdate = object({
  requiredHolders: futureRequirementFields.requiredHolders,
  targetProficiency: futureRequirementFields.targetProficiency,
  criticality: futureRequirementFields.criticality,
  effectiveMonth: futureRequirementFields.effectiveMonth,
  provenance: futureRequirementFields.provenance,
}, [], { minProperties: 1 });

const futureRequirementChangePayload = object({
  operation: { enum: ['create', 'update', 'remove'], title: 'Operation' },
  requirementId: id('Requirement'),
  fields: object(futureRequirementFields),
}, ['operation'], {
  allOf: [
    { if: { properties: { operation: { const: 'create' } } }, then: { required: ['fields'] } },
    { if: { properties: { operation: { const: 'update' } } }, then: { required: ['requirementId', 'fields'] } },
    { if: { properties: { operation: { const: 'remove' } } }, then: { required: ['requirementId'] } },
  ],
});

const resourceFields = object({
  title: text(200, 'Title'),
  kind: { enum: RESOURCE_KINDS, title: 'Type' },
  skillIds: { type: 'array', minItems: 1, maxItems: 20, uniqueItems: true, items: id('Skill'), title: 'Skills' },
  url: { type: ['string', 'null'], maxLength: 500, pattern: '^https://\\S+$', formatHint: 'must be an https:// link', title: 'URL' },
  provider: { type: ['string', 'null'], maxLength: 200, title: 'Provider' },
  verified: { type: 'boolean', title: 'Verified' },
  provenance: text(300, 'Source'),
}, ['title', 'kind', 'skillIds', 'verified', 'provenance']);

const slug = { type: 'string', pattern: '^[a-z0-9][a-z0-9-]{2,79}$', formatHint: 'must use lowercase letters, digits and hyphens', title: 'Identifier' };

const resourceChangePayload = object({
  operation: { enum: ['create', 'update'], title: 'Operation' },
  slug,
  fields: resourceFields,
}, ['operation', 'slug', 'fields']);

const changeRequestCreate = object({
  type: { enum: ['employee_skill', 'future_requirement', 'resource'], title: 'Change type' },
  payload: { type: 'object', title: 'Proposed change' },
  justification: { type: 'string', maxLength: 1000, title: 'Justification' },
  submit: { type: 'boolean', title: 'Submit' },
}, ['type', 'payload']);

const changeRequestUpdate = object({
  payload: { type: 'object', title: 'Proposed change' },
  justification: { type: 'string', maxLength: 1000, title: 'Justification' },
}, [], { minProperties: 1 });

const approveDecision = object({ comment: { type: 'string', maxLength: 1000, title: 'Comment' } });
const rejectDecision = object({ comment: text(1000, 'Reason for rejection') }, ['comment']);

const departure = object({ employeeId: id('Employee'), month: month('Departure month') }, ['employeeId', 'month']);
const intervention = object({
  employeeId: id('Learner'),
  skillId: id('Skill'),
  mentorId: nullableId('Mentor'),
  startMonth: month('Start month'),
  completionMonth: month('Completion month'),
  targetProficiency: level('Target level'),
  assumeVerified: { type: 'boolean', title: 'Verified at completion' },
  source: { type: 'string', maxLength: 60, title: 'Source' },
}, ['employeeId', 'skillId', 'completionMonth', 'targetProficiency', 'assumeVerified']);

const scenario = object({
  name: text(120, 'Scenario name'),
  horizonMonths: { enum: [0, 12, 36, 60], title: 'Horizon' },
  departures: { type: 'array', maxItems: 50, items: departure, title: 'Departures' },
  interventions: { type: 'array', maxItems: 100, items: intervention, title: 'Planned development' },
  includePendingChanges: { type: 'boolean', title: 'Include pending changes' },
}, ['name', 'horizonMonths', 'departures', 'interventions']);

const acknowledgementCreate = object({
  riskType: { enum: ['skill', 'employee'], title: 'Risk type' },
  entityId: id('Risk'),
  ownerUserId: id('Owner'),
  note: text(1000, 'Note'),
  dueDate: date('Due date'),
  nextReviewDate: date('Next review date'),
}, ['riskType', 'entityId', 'ownerUserId', 'note', 'dueDate', 'nextReviewDate']);

const acknowledgementUpdate = object({
  ownerUserId: id('Owner'),
  note: text(1000, 'Note'),
  dueDate: date('Due date'),
  nextReviewDate: date('Next review date'),
}, [], { minProperties: 1 });

const acknowledgementClose = object({ note: { type: 'string', maxLength: 1000, title: 'Closing note' } });

const email = { type: 'string', maxLength: 254, pattern: '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$', formatHint: 'must be a valid email address', title: 'Email' };
const password = { type: 'string', minLength: 12, maxLength: 128, title: 'Password' };

const userCreate = object({
  email,
  displayName: text(120, 'Display name'),
  role: { enum: ROLES, title: 'Role' },
  employeeId: nullableId('Linked employee'),
  password,
}, ['email', 'displayName', 'role', 'password']);

const userUpdate = object({
  displayName: text(120, 'Display name'),
  role: { enum: ROLES, title: 'Role' },
  employeeId: nullableId('Linked employee'),
  disabled: { type: 'boolean', title: 'Disabled' },
}, [], { minProperties: 1 });

const passwordReset = object({ password }, ['password']);

const organizationUpdate = object({
  name: text(120, 'Organization name'),
  planStartDate: date('Plan start date'),
  evidenceStaleMonths: { type: 'integer', minimum: 1, maximum: 60, title: 'Re-verification period' },
}, [], { minProperties: 1 });

const employeeFields = {
  name: text(120, 'Name'),
  role: text(120, 'Role'),
  department: text(120, 'Department'),
  managerId: nullableId('Manager'),
  reportsExternally: { type: 'boolean', title: 'Reports outside the organization' },
  mentoringHoursPerMonth: { type: ['integer', 'null'], minimum: 0, maximum: 744, title: 'Mentoring hours per month' },
  startDate: nullableDate('Start date'),
};
const employeeUpdate = object(employeeFields, [], { minProperties: 1 });
const employeeCreate = object(employeeFields, ['name', 'role', 'department']);
// Archiving a manager needs to say where their active reports go; null is allowed only when they have none.
const employeeArchive = object({ reassignReportsTo: nullableId('New manager for their reports') }, []);

const roleRequirement = object({ minimumProficiency: level('Minimum level') }, ['minimumProficiency']);

const aiDecision = object({
  skillId: id('Skill'),
  category: { enum: AI_CATEGORIES, title: 'Action type' },
  decision: { enum: ['reviewed', 'unreviewed', 'scheduled', 'dismissed'], title: 'Decision' },
  employeeId: nullableId('Participant'),
  mentorId: nullableId('Mentor'),
  mode: { enum: ['live-ai', 'demo-fallback'], title: 'Recommendation source' },
  note: { type: 'string', maxLength: 500, title: 'Note' },
}, ['skillId', 'category', 'decision', 'mode']);

const issueAcknowledge = object({ note: text(1000, 'Acknowledgement note') }, ['note']);
// Filters are short string values keyed by field; the server never interprets them, only stores them.
const savedViewCreate = object({
  view: { type: 'string', minLength: 2, maxLength: 40, pattern: '^[a-z]+$', title: 'Page' },
  name: text(60, 'View name'),
  filters: { type: 'object', maxProperties: 20, additionalProperties: { type: 'string', maxLength: 200 }, title: 'Filters' },
}, ['view', 'name', 'filters']);
const suggestionKey = object({ key: { type: 'string', minLength: 3, maxLength: 200, pattern: '^[a-z_]+:[A-Za-z0-9_:.-]+$', title: 'Suggestion' } }, ['key']);

module.exports = {
  RESOURCE_KINDS, ROLES, login, employeeSkill, evidenceChangePayload, futureRequirementCreate, futureRequirementUpdate,
  futureRequirementChangePayload, resourceFields, resourceChangePayload, changeRequestCreate, changeRequestUpdate,
  approveDecision, rejectDecision, scenario, acknowledgementCreate, acknowledgementUpdate, acknowledgementClose,
  userCreate, userUpdate, passwordReset, organizationUpdate, employeeUpdate, employeeCreate, employeeArchive, roleRequirement, aiDecision, issueAcknowledge, suggestionKey, savedViewCreate,
};
