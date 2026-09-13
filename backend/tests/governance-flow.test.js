const test = require('node:test');
const assert = require('node:assert/strict');
const { useTempDatabase, startServer, signedIn } = require('./helpers/server');

// The governance demo flow end to end on the CSV-seeded database: data-quality review, risk ownership,
// scenario planning with warnings, audited AI decisions and exports scoped by role.
useTempDatabase('governance-flow');
const started = startServer();
test.after(async () => (await started).close());

const named = (list, name) => list.find((entry) => entry.name === name);

test('startup migrations are recorded once and re-running initialization adds nothing', async () => {
  const { data, config } = await started;
  const { MIGRATION_IDS } = require('../data/governance-schema');
  const applied = (await data.all('SELECT id FROM schema_migrations')).map((row) => row.id);
  for (const id of MIGRATION_IDS) assert.ok(applied.includes(id), id);

  const before = await data.get('SELECT (SELECT COUNT(*) FROM users) AS users, (SELECT COUNT(*) FROM scenarios) AS scenarios');
  await data.initializeDatabase({ config });
  const after = await data.get('SELECT (SELECT COUNT(*) FROM users) AS users, (SELECT COUNT(*) FROM scenarios) AS scenarios');
  assert.deepEqual(after, before);

  const oliver = await data.get("SELECT manager_id, reports_externally FROM employees WHERE name = 'Oliver Grant'");
  assert.deepEqual(oliver, { manager_id: null, reports_externally: 0 });
});

test('the organization reports when official data last changed', async () => {
  const { base } = await started;
  const employee = await signedIn(base, 'employee');
  const organization = (await employee.get('/api/keystone/organization')).body;
  assert.equal(organization.environment, 'demo');
  assert.equal(organization.planStartDate, '2026-09-01');
  assert.ok(organization.dataUpdatedAt, 'the CSV import is the first recorded data change');
});

test('data quality surfaces the seeded issues with an honest score and actionable links', async () => {
  const { base } = await started;
  const hr = await signedIn(base, 'hr');
  const quality = (await hr.get('/api/keystone/data-quality')).body;
  const codes = new Set(quality.issues.map((issue) => issue.ruleCode));

  for (const expected of ['CRITICAL_SKILL_SINGLE_HOLDER', 'CRITICAL_SKILL_UNCOVERED', 'RESOURCE_VERIFIED_WITHOUT_SOURCE', 'EMPLOYEE_MISSING_MANAGER',
    'EVIDENCE_STALE', 'SCENARIO_INTERVENTION_AFTER_RISK', 'SCENARIO_DEPARTURE_NO_SUCCESSOR']) {
    assert.ok(codes.has(expected), expected);
  }
  assert.equal(quality.total, quality.issues.length);
  assert.equal(quality.summary.counts.critical + quality.summary.counts.warning + quality.summary.counts.info, quality.summary.open + quality.summary.acknowledged);
  assert.ok(quality.summary.score > 0 && quality.summary.score < 100);
  assert.ok(quality.issues.every((issue) => issue.link && issue.suggestedAction && issue.status === 'open'));

  const oliver = quality.issues.find((issue) => issue.ruleCode === 'EMPLOYEE_MISSING_MANAGER');
  assert.equal(oliver.entityLabel, 'Oliver Grant');

  const criticalOnly = (await hr.get('/api/keystone/data-quality?severity=critical')).body.issues;
  assert.ok(criticalOnly.length > 0 && criticalOnly.every((issue) => issue.severity === 'critical'));
  assert.equal((await hr.get('/api/keystone/data-quality?severity=urgent')).status, 400);
});

test('acknowledging an issue keeps it visible, attributed and audited; fixing the data resolves it', async () => {
  const { base } = await started;
  const hr = await signedIn(base, 'hr');
  const admin = await signedIn(base, 'admin');
  const issue = (await hr.get('/api/keystone/data-quality')).body.issues.find((entry) => entry.ruleCode === 'EMPLOYEE_MISSING_MANAGER');

  const acknowledged = await hr.post(`/api/keystone/data-quality/${encodeURIComponent(issue.fingerprint)}/acknowledge`, { note: 'Finance reorganisation in progress.' });
  assert.equal(acknowledged.status, 200);
  assert.equal(acknowledged.body.status, 'acknowledged');
  assert.equal(acknowledged.body.acknowledgedBy.name, 'Abigail Lewis');

  const still = (await hr.get('/api/keystone/data-quality?status=acknowledged')).body.issues;
  assert.ok(still.some((entry) => entry.fingerprint === issue.fingerprint));

  const workforce = (await admin.get('/api/keystone/workforce')).body;
  const oliver = named(workforce.employees, 'Oliver Grant');
  const harper = named(workforce.employees, 'Harper White');
  const updated = await admin.patch(`/api/keystone/employees/${oliver.id}`, { managerId: harper.id });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.managerName, 'Harper White');

  const resolved = (await hr.get('/api/keystone/data-quality?status=resolved')).body.issues;
  assert.ok(resolved.some((entry) => entry.fingerprint === issue.fingerprint));

  const events = (await hr.get('/api/keystone/audit-log?entityType=data_quality_issue&pageSize=50')).body.items.map((entry) => entry.actionType);
  assert.ok(events.includes('data_quality.acknowledged'));
  assert.ok(events.includes('data_quality.resolved'));

  const loop = await admin.patch(`/api/keystone/employees/${harper.id}`, { managerId: oliver.id });
  assert.equal(loop.status, 400);
  assert.equal(loop.body.details[0].code, 'reporting_cycle');
});

test('managers see only data-quality issues about their team', async () => {
  const { base } = await started;
  const manager = await signedIn(base, 'manager');
  const team = new Set((await manager.get('/api/keystone/workforce')).body.employees.map((employee) => employee.id));
  const quality = (await manager.get('/api/keystone/data-quality')).body;
  assert.equal(quality.visibility, 'team');
  assert.ok(quality.issues.length > 0);
  assert.ok(quality.issues.every((issue) => issue.employeeIds.length > 0 && issue.employeeIds.every((id) => team.has(id))));
  assert.equal((await manager.post(`/api/keystone/data-quality/${encodeURIComponent(quality.issues[0].fingerprint)}/acknowledge`, { note: 'x' })).status, 403);
});

test('acknowledging a risk records an owner without changing its score', async () => {
  const { base } = await started;
  const hr = await signedIn(base, 'hr');
  const billing = named((await hr.get('/api/keystone/risks')).body.skills, 'Legacy Billing Recovery');
  const owners = (await hr.get('/api/keystone/users/assignable-owners')).body.items;
  const rachel = owners.find((owner) => owner.displayName === 'Rachel Moreno');

  const invalid = await hr.post('/api/keystone/risk-acknowledgements', { riskType: 'skill', entityId: billing.id, ownerUserId: rachel.id,
    note: 'x', dueDate: '2026-01-01', nextReviewDate: '2026-12-01' });
  assert.equal(invalid.status, 400);
  assert.deepEqual(invalid.body.details.map((detail) => detail.code).sort(), ['after_due_date', 'date_in_past']);

  const created = await hr.post('/api/keystone/risk-acknowledgements', { riskType: 'skill', entityId: billing.id, ownerUserId: rachel.id,
    note: 'Mentoring Mason through Q4; review after the recovery drill.', dueDate: '2026-12-15', nextReviewDate: '2026-10-15' });
  assert.equal(created.status, 201);
  assert.equal(created.body.owner.name, 'Rachel Moreno');

  const duplicate = await hr.post('/api/keystone/risk-acknowledgements', { riskType: 'skill', entityId: billing.id, ownerUserId: rachel.id,
    note: 'Again', dueDate: '2026-12-15', nextReviewDate: '2026-10-15' });
  assert.equal(duplicate.status, 409);

  const after = named((await hr.get('/api/keystone/risks')).body.skills, 'Legacy Billing Recovery');
  assert.equal(after.keystoneScore, billing.keystoneScore, 'acknowledgement never changes a score');

  const manager = await signedIn(base, 'manager');
  assert.ok((await manager.get('/api/keystone/risk-acknowledgements?status=active')).body.items.some((item) => item.id === created.body.id));
  assert.equal((await manager.post(`/api/keystone/risk-acknowledgements/${created.body.id}/close`, {})).status, 403);

  const closed = await hr.post(`/api/keystone/risk-acknowledgements/${created.body.id}/close`, { note: 'Mason verified.' });
  assert.equal(closed.body.status, 'closed');
});

test('saved scenarios validate references, return warnings and audit intervention changes', async () => {
  const { base } = await started;
  const hr = await signedIn(base, 'hr');
  const workforce = (await hr.get('/api/keystone/workforce')).body;
  const liam = named(workforce.employees, 'Liam Chen');
  const mason = named(workforce.employees, 'Mason Green');
  const billing = named(workforce.skills, 'Legacy Billing Recovery');

  const seeded = (await hr.get('/api/keystone/scenarios')).body.items;
  assert.ok(seeded[0].warnings.some((issue) => issue.ruleCode === 'SCENARIO_INTERVENTION_AFTER_RISK'));

  const badReference = await hr.post('/api/keystone/scenarios', { name: 'Broken', horizonMonths: 12, departures: [{ employeeId: 99999, month: 3 }], interventions: [] });
  assert.equal(badReference.status, 400);
  assert.equal(badReference.body.details[0].code, 'invalid_reference');

  const scenario = { name: 'Billing continuity: mentor early', horizonMonths: 12, departures: [{ employeeId: liam.id, month: 9 }], interventions: [] };
  const saved = await hr.post('/api/keystone/scenarios', scenario);
  assert.equal(saved.status, 201);
  assert.ok(saved.body.warnings.some((issue) => issue.ruleCode === 'SCENARIO_DEPARTURE_NO_SUCCESSOR'));

  const intervention = { employeeId: mason.id, skillId: billing.id, mentorId: liam.id, startMonth: 0, completionMonth: 6, targetProficiency: 3, assumeVerified: true };
  const updated = await hr.put(`/api/keystone/scenarios/${saved.body.id}`, { ...scenario, interventions: [intervention] });
  assert.equal(updated.status, 200);
  assert.ok(!updated.body.warnings.some((issue) => issue.ruleCode === 'SCENARIO_INTERVENTION_AFTER_RISK'));

  const [event] = (await hr.get(`/api/keystone/audit-log?entityType=scenario&entityId=${saved.body.id}&actionType=scenario.updated`)).body.items;
  assert.equal(event.metadata.interventionsAdded, 1);
  assert.equal(event.before.interventions.length, 0);
  assert.equal(event.after.interventions.length, 1);

  const simulated = (await hr.post('/api/keystone/simulate', { horizonMonths: 12, departures: scenario.departures,
    interventions: [{ ...intervention, completionMonth: 10 }] })).body;
  assert.ok(simulated.scenarioWarnings.some((issue) => issue.ruleCode === 'SCENARIO_INTERVENTION_AFTER_RISK'));

  const manager = await signedIn(base, 'manager');
  assert.equal((await manager.get('/api/keystone/scenarios')).status, 403);
  assert.equal((await hr.delete(`/api/keystone/scenarios/${saved.body.id}`)).status, 204);
});

test('AI recommendation decisions are audited against real records only', async () => {
  const { base } = await started;
  const hr = await signedIn(base, 'hr');
  const workforce = (await hr.get('/api/keystone/workforce')).body;
  const billing = named(workforce.skills, 'Legacy Billing Recovery');
  const mason = named(workforce.employees, 'Mason Green');
  const liam = named(workforce.employees, 'Liam Chen');

  const scheduled = await hr.post('/api/keystone/ai/decisions', { skillId: billing.id, category: 'mentoring', decision: 'scheduled',
    employeeId: mason.id, mentorId: liam.id, mode: 'demo-fallback' });
  assert.equal(scheduled.status, 201);
  const [entry] = (await hr.get('/api/keystone/audit-log?actionType=ai_recommendation.scheduled')).body.items;
  assert.match(entry.summary, /scheduled the Legacy Billing Recovery mentoring recommendation for Mason Green, mentored by Liam Chen/);

  const invented = await hr.post('/api/keystone/ai/decisions', { skillId: billing.id, category: 'mentoring', decision: 'scheduled',
    employeeId: 99999, mentorId: null, mode: 'live-ai' });
  assert.equal(invented.status, 400);
  assert.equal(invented.body.details[0].field, 'employeeId');
});

test('exports are CSV, scoped by role, formula-safe and audited', async () => {
  const { base } = await started;
  const hr = await signedIn(base, 'hr');
  const manager = await signedIn(base, 'manager');

  const organizationWide = await hr.get('/api/keystone/exports/risks.csv?filter=at-risk');
  assert.equal(organizationWide.status, 200);
  assert.match(organizationWide.headers.get('content-type'), /text\/csv/);
  assert.match(organizationWide.headers.get('content-disposition'), /keystone-skill-risks-2026-09-12\.csv/);
  const rows = organizationWide.text.replace(/^﻿/, '').trim().split('\r\n');
  assert.match(rows[0], /^Skill,Criticality \(1-5\),Target level,People needed,Qualified people,Gap,Dependency score \(0-100\),Qualified holders/);
  assert.ok(rows.some((row) => row.startsWith('Cybersecurity,') && row.includes('Isabella Ross')));

  const team = await manager.get('/api/keystone/exports/risks.csv');
  assert.match(team.text, /Qualified holders outside your team/);
  assert.ok(!team.text.includes('Isabella Ross'), 'names outside the team are never exported');

  const quality = await hr.get('/api/keystone/exports/data-quality.csv?status=active');
  assert.equal(quality.status, 200);
  assert.match(quality.text, /Severity,Status,Rule,Issue,Affected record/);

  const exports = (await hr.get('/api/keystone/audit-log?actionType=export.generated')).body.items;
  assert.ok(exports.length >= 3);
  assert.equal((await hr.get('/api/keystone/exports/risks.csv?filter=everything')).status, 400);

  const { toCsv } = require('../services/csv');
  assert.equal(toCsv([{ label: 'Name', value: 'name' }], [{ name: '=HYPERLINK("x")' }, { name: 'Chen, Liam' }]),
    'Name\r\n"\'=HYPERLINK(""x"")"\r\n"Chen, Liam"\r\n');
});

test('the signed-in employee profile shows trust states and only verified catalogue suggestions', async () => {
  const { base } = await started;
  const employee = await signedIn(base, 'employee');
  const { profile, skills } = (await employee.get('/api/keystone/me/profile')).body;
  assert.equal(profile.employee.name, 'Mason Green');
  assert.equal(profile.employee.managerName, 'Rachel Moreno');
  assert.ok(profile.evidence.every((edge) => ['verified', 'unverified', 'stale'].includes(edge.trust)));
  assert.ok(profile.roleRequirements.every((requirement) => ['met', 'unmet', 'unknown'].includes(requirement.status)));
  assert.ok(profile.developmentSuggestions.every((suggestion) => suggestion.resources.every((resource) => typeof resource.title === 'string')));
  assert.ok(skills.length > 0);
});
