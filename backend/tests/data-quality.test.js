const test = require('node:test');
const assert = require('node:assert/strict');
const { evaluateDataQuality, evaluateScenario, summarizeDataQuality } = require('../services/data-quality');

// Rule-by-rule coverage on a tiny organization. The clean baseline has no issues, so each test changes
// exactly one thing and checks the rule that should notice it.
const base = () => ({
  employees: [
    { id: 1, name: 'Ada', role: 'Engineer', department: 'Eng', managerId: 3 },
    { id: 2, name: 'Ben', role: 'Engineer', department: 'Eng', managerId: 3 },
    { id: 3, name: 'Cleo', role: 'Lead', department: 'Eng', managerId: null },
  ],
  skills: [
    { id: 1, name: 'Billing', criticality: 5, targetProficiency: 3, requiredHolders: 2, metadataSource: 'test' },
    { id: 2, name: 'Docs', criticality: 2, targetProficiency: 3, requiredHolders: 1, metadataSource: 'test' },
  ],
  roles: [
    { id: 1, name: 'Engineer', criticality: 3, incumbentIds: [1, 2], requirements: [{ skillId: 1, minimumProficiency: 3 }] },
    { id: 2, name: 'Lead', criticality: 4, incumbentIds: [3], requirements: [{ skillId: 2, minimumProficiency: 2 }] },
  ],
  learningResources: [{ id: 'course', title: 'Billing course', category: 'training', verified: true, url: null, provider: 'Academy', skillIds: [1] }],
  futureRequirements: [],
  matrix: [
    { employeeId: 1, skillId: 1, proficiency: 5, evidenceSource: 'review', lastVerifiedAt: '2026-06-01' },
    { employeeId: 2, skillId: 1, proficiency: 4, evidenceSource: 'review', lastVerifiedAt: '2026-06-01' },
    { employeeId: 3, skillId: 2, proficiency: 3, evidenceSource: 'review', lastVerifiedAt: '2026-06-01' },
  ],
});

const evaluate = (workforce, overrides = {}) => evaluateDataQuality({
  workforce,
  organization: { planStartDate: '2026-01-01', evidenceStaleMonths: 12 },
  today: '2026-09-12',
  externalReporting: new Set([3]),
  ...overrides,
});
const find = (issues, code) => issues.filter((issue) => issue.ruleCode === code);

test('a clean dataset has no issues', () => {
  assert.deepEqual(evaluate(base()), []);
});

test('proficiency outside 1-5 is critical', () => {
  const workforce = base();
  workforce.matrix[0].proficiency = 7;
  const [issue] = find(evaluate(workforce), 'EVIDENCE_INVALID_PROFICIENCY');
  assert.equal(issue.severity, 'critical');
  assert.deepEqual(issue.employeeIds, [1]);
  assert.equal(issue.link.view, 'data');
});

test('duplicate evidence for one person and skill is critical', () => {
  const workforce = base();
  workforce.matrix.push({ ...workforce.matrix[0] });
  assert.equal(find(evaluate(workforce), 'EVIDENCE_DUPLICATE')[0].severity, 'critical');
});

test('competing pending submissions are flagged', () => {
  const request = { type: 'employee_skill', status: 'submitted', targetKey: '2:1', targetLabel: 'Ben · Billing', subjectEmployeeId: 2 };
  const issues = evaluate(base(), { changeRequests: [request, { ...request }] });
  assert.equal(find(issues, 'EVIDENCE_DUPLICATE_SUBMISSION').length, 1);
  assert.equal(find(evaluate(base(), { changeRequests: [request] }), 'EVIDENCE_DUPLICATE_SUBMISSION').length, 0);
});

test('evidence without a source is flagged', () => {
  const workforce = base();
  workforce.matrix[2].evidenceSource = '  ';
  assert.equal(find(evaluate(workforce), 'EVIDENCE_MISSING_SOURCE').length, 1);
});

test('unverified evidence is a warning only when it props up a critical skill', () => {
  const critical = base();
  critical.matrix[0].lastVerifiedAt = null;
  assert.equal(find(evaluate(critical), 'EVIDENCE_UNVERIFIED')[0].severity, 'warning');

  const minor = base();
  minor.matrix[2].lastVerifiedAt = null;
  assert.equal(find(evaluate(minor), 'EVIDENCE_UNVERIFIED').length, 0);
});

test('stale evidence is a warning when it counts toward coverage and info otherwise', () => {
  const counting = base();
  counting.matrix[0].lastVerifiedAt = '2025-01-15';
  assert.equal(find(evaluate(counting), 'EVIDENCE_STALE')[0].severity, 'warning');

  const notCounting = base();
  notCounting.matrix.push({ employeeId: 3, skillId: 1, proficiency: 1, evidenceSource: 'review', lastVerifiedAt: '2025-01-15' });
  assert.equal(find(evaluate(notCounting), 'EVIDENCE_STALE')[0].severity, 'info');

  const future = base();
  future.matrix[0].lastVerifiedAt = '2027-01-01';
  assert.equal(find(evaluate(future), 'EVIDENCE_VERIFIED_IN_FUTURE').length, 1);
});

test('a role requirement nobody meets is flagged, critical for critical roles', () => {
  const workforce = base();
  workforce.roles[1].requirements[0].minimumProficiency = 5;
  const [issue] = find(evaluate(workforce), 'ROLE_SKILL_NO_EVIDENCE');
  assert.equal(issue.severity, 'critical');
  assert.equal(issue.entityId, '2:2');
});

test('a critical skill held by one person, or nobody, is flagged', () => {
  const single = base();
  single.matrix.splice(1, 1);
  const [holder] = find(evaluate(single), 'CRITICAL_SKILL_SINGLE_HOLDER');
  assert.equal(holder.severity, 'critical');
  assert.deepEqual(holder.employeeIds, [1]);

  const none = base();
  none.matrix = none.matrix.filter((edge) => edge.skillId !== 1);
  assert.equal(find(evaluate(none), 'CRITICAL_SKILL_UNCOVERED')[0].severity, 'critical');
});

test('a departure without a ready successor is flagged; a ready successor clears it', () => {
  const scenario = { id: 7, name: 'Plan', horizonMonths: 12, departures: [{ employeeId: 1, month: 9 }], interventions: [] };
  assert.equal(find(evaluate(base(), { scenarios: [scenario] }), 'SCENARIO_DEPARTURE_NO_SUCCESSOR').length, 0, 'Ben is ready');

  const workforce = base();
  workforce.matrix[1].proficiency = 2;
  const [issue] = find(evaluate(workforce, { scenarios: [scenario] }), 'SCENARIO_DEPARTURE_NO_SUCCESSOR');
  assert.equal(issue.severity, 'critical', 'Ada would be the sole holder of a criticality 5 skill');
  assert.deepEqual(issue.link, { view: 'timemachine', scenarioId: 7 });
});

test('a proposed requirement past its effective date is flagged; approved or future ones are not', () => {
  const requirement = { id: 1, skillId: 1, skillName: 'Billing', requiredHolders: 3, targetProficiency: 3, criticality: 5, effectiveMonth: 3, status: 'proposed' };
  const workforce = base();
  workforce.futureRequirements = [requirement];
  assert.equal(find(evaluate(workforce), 'FUTURE_REQUIREMENT_PAST_EFFECTIVE').length, 1);

  workforce.futureRequirements = [{ ...requirement, status: 'reviewed' }, { ...requirement, id: 2, effectiveMonth: 12 }];
  assert.equal(find(evaluate(workforce), 'FUTURE_REQUIREMENT_PAST_EFFECTIVE').length, 0);
});

test('a verified resource without a provider or URL is flagged', () => {
  const workforce = base();
  workforce.learningResources[0].provider = null;
  assert.equal(find(evaluate(workforce), 'RESOURCE_VERIFIED_WITHOUT_SOURCE').length, 1);
  workforce.learningResources[0].verified = false;
  assert.equal(find(evaluate(workforce), 'RESOURCE_VERIFIED_WITHOUT_SOURCE').length, 0);
});

test('a mentor below the required level is flagged', () => {
  const scenario = { id: 1, name: 'Plan', departures: [], interventions: [
    { employeeId: 2, skillId: 1, mentorId: 3, startMonth: 0, completionMonth: 6, targetProficiency: 3, assumeVerified: true },
  ] };
  const [issue] = find(evaluateScenario(base(), scenario), 'SCENARIO_MENTOR_BELOW_LEVEL');
  assert.match(issue.explanation, /recorded at no level; mentors need level 4\+/);
});

test('development that completes after the coverage gap opens is flagged', () => {
  const workforce = base();
  workforce.matrix.splice(1, 1);
  const late = { id: 1, name: 'Plan', departures: [{ employeeId: 1, month: 9 }], interventions: [
    { employeeId: 2, skillId: 1, mentorId: 1, startMonth: 0, completionMonth: 10, targetProficiency: 3, assumeVerified: true },
  ] };
  assert.equal(find(evaluateScenario(workforce, late), 'SCENARIO_INTERVENTION_AFTER_RISK').length, 1);
  late.interventions[0].completionMonth = 6;
  assert.equal(find(evaluateScenario(workforce, late), 'SCENARIO_INTERVENTION_AFTER_RISK').length, 0);
});

test('missing, invalid and looping reporting lines are flagged', () => {
  assert.equal(find(evaluate(base(), { externalReporting: new Set() }), 'EMPLOYEE_MISSING_MANAGER')[0].entityLabel, 'Cleo');

  const invalid = base();
  invalid.employees[0].managerId = 99;
  assert.equal(find(evaluate(invalid), 'EMPLOYEE_MANAGER_INVALID')[0].severity, 'critical');

  const loop = base();
  loop.employees[2].managerId = 1;
  assert.ok(find(evaluate(loop), 'EMPLOYEE_REPORTING_CYCLE').length > 0);

  const undefinedRole = base();
  undefinedRole.employees[1].role = 'Pilot';
  assert.equal(find(evaluate(undefinedRole), 'EMPLOYEE_ROLE_UNDEFINED').length, 1);
});

test('accounts without an employee link, and managers with no reports, are flagged', () => {
  const users = [
    { id: 1, displayName: 'Unlinked', role: 'employee', employeeId: null, disabled: false },
    { id: 2, displayName: 'Ada', role: 'manager', employeeId: 1, disabled: false },
    { id: 3, displayName: 'Gone', role: 'employee', employeeId: null, disabled: true },
  ];
  const issues = evaluate(base(), { users });
  assert.equal(find(issues, 'USER_EMPLOYEE_LINK_MISSING').length, 1);
  assert.equal(find(issues, 'MANAGER_WITHOUT_REPORTS')[0].severity, 'info');
});

test('issues have stable fingerprints and a severity-first order', () => {
  const workforce = base();
  workforce.matrix[0].proficiency = 9;
  workforce.learningResources[0].provider = null;
  const first = evaluate(workforce);
  const second = evaluate(workforce);
  assert.deepEqual(first.map((issue) => issue.fingerprint), second.map((issue) => issue.fingerprint));
  assert.equal(first[0].severity, 'critical');
});

test('the health score reports counts and weighs acknowledged issues at half', () => {
  const issues = [
    { severity: 'critical', status: 'open' },
    { severity: 'warning', status: 'acknowledged' },
    { severity: 'info', status: 'resolved' },
  ];
  const summary = summarizeDataQuality(issues, 100);
  assert.deepEqual(summary.counts, { critical: 1, warning: 1, info: 0 });
  assert.equal(summary.open, 1);
  assert.equal(summary.acknowledged, 1);
  assert.equal(summary.resolved, 1);
  assert.equal(summary.score, Math.round((100 * 100) / (100 + 10 + 1.5)));
  assert.equal(summarizeDataQuality([], 0).score, 100);
});
