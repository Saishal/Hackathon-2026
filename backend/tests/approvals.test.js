const test = require('node:test');
const assert = require('node:assert/strict');
const { useTempDatabase, startServer, signedIn } = require('./helpers/server');

useTempDatabase('approvals');
const started = startServer();
test.after(async () => (await started).close());

const named = (list, name) => list.find((entry) => entry.name === name);

async function context() {
  const { base } = await started;
  const hr = await signedIn(base, 'hr');
  const workforce = (await hr.get('/api/keystone/workforce')).body;
  return {
    base,
    hr,
    workforce,
    mason: named(workforce.employees, 'Mason Green'),
    liam: named(workforce.employees, 'Liam Chen'),
    billing: named(workforce.skills, 'Legacy Billing Recovery'),
  };
}

const billingCoverage = async (reader) => named((await reader.get('/api/keystone/risks')).body.skills, 'Legacy Billing Recovery').busFactor;
const masonBilling = async (reader, ids) => (await reader.get('/api/keystone/workforce')).body.matrix
  .find((edge) => edge.employeeId === ids.mason.id && edge.skillId === ids.billing.id);

test('invalid submissions return structured errors and are never stored', async () => {
  const ids = await context();
  const employee = await signedIn(ids.base, 'employee');

  const outOfRange = await employee.post('/api/keystone/change-requests', { type: 'employee_skill',
    payload: { operation: 'upsert', employeeId: ids.mason.id, skillId: ids.billing.id, proficiency: 9, evidenceSource: 'x' } });
  assert.equal(outOfRange.status, 400);
  assert.equal(outOfRange.body.code, 'validation_failed');
  assert.deepEqual(outOfRange.body.details.map((detail) => [detail.field, detail.code]), [['proficiency', 'out_of_range']]);

  const coerced = await employee.post('/api/keystone/change-requests', { type: 'employee_skill',
    payload: { operation: 'upsert', employeeId: String(ids.mason.id), skillId: ids.billing.id, proficiency: 3, evidenceSource: 'x' } });
  assert.equal(coerced.body.details[0].code, 'invalid_type', 'strings are not coerced into IDs');

  const expertWithoutDate = await employee.post('/api/keystone/change-requests', { type: 'employee_skill',
    payload: { operation: 'upsert', employeeId: ids.mason.id, skillId: ids.billing.id, proficiency: 4, evidenceSource: 'Certification' } });
  assert.equal(expertWithoutDate.body.details[0].code, 'verification_required');

  const futureDate = await employee.post('/api/keystone/change-requests', { type: 'employee_skill',
    payload: { operation: 'upsert', employeeId: ids.mason.id, skillId: ids.billing.id, proficiency: 3, evidenceSource: 'Review', lastVerifiedAt: '2030-01-01' } });
  assert.equal(futureDate.body.details[0].code, 'date_in_future');

  const unknownSkill = await employee.post('/api/keystone/change-requests', { type: 'employee_skill',
    payload: { operation: 'upsert', employeeId: ids.mason.id, skillId: 99999, proficiency: 3, evidenceSource: 'Review' } });
  assert.equal(unknownSkill.body.details[0].code, 'unknown_reference');

  const list = (await employee.get('/api/keystone/change-requests')).body.items;
  assert.equal(list.length, 0);
});

test('employees can only submit for themselves and cannot review', async () => {
  const ids = await context();
  const employee = await signedIn(ids.base, 'employee');
  const forSomeoneElse = await employee.post('/api/keystone/change-requests', { type: 'employee_skill',
    payload: { operation: 'upsert', employeeId: ids.liam.id, skillId: ids.billing.id, proficiency: 1, evidenceSource: 'Rumour' } });
  assert.equal(forSomeoneElse.status, 403);

  const planning = await employee.post('/api/keystone/change-requests', { type: 'future_requirement',
    payload: { operation: 'create', fields: { skillId: ids.billing.id, requiredHolders: 5, targetProficiency: 3, criticality: 5, effectiveMonth: 12, provenance: 'Me' } } });
  assert.equal(planning.status, 403);
});

test('a pending evidence update does not change official analytics; approval does, with audit events', async () => {
  const ids = await context();
  const employee = await signedIn(ids.base, 'employee');

  const submitted = await employee.post('/api/keystone/change-requests', {
    type: 'employee_skill',
    justification: 'Led the September recovery drill with Liam observing.',
    payload: { operation: 'upsert', employeeId: ids.mason.id, skillId: ids.billing.id, proficiency: 3,
      evidenceSource: 'Supervised recovery drill', lastVerifiedAt: '2026-09-08' },
  });
  assert.equal(submitted.status, 201);
  assert.equal(submitted.body.status, 'submitted');
  assert.deepEqual(submitted.body.baseline, { proficiency: 2, evidenceSource: 'Self-assessment', lastVerifiedAt: null });

  // Pending: nothing official moves.
  assert.equal(await billingCoverage(ids.hr), 1);
  assert.equal((await masonBilling(ids.hr, ids)).proficiency, 2);

  const duplicate = await employee.post('/api/keystone/change-requests', { type: 'employee_skill',
    payload: { operation: 'upsert', employeeId: ids.mason.id, skillId: ids.billing.id, proficiency: 3, evidenceSource: 'Again', lastVerifiedAt: '2026-09-08' } });
  assert.equal(duplicate.status, 409);
  assert.equal(duplicate.body.code, 'duplicate_submission');

  // The HR reviewer sees it in their queue and approves it.
  const queue = (await ids.hr.get('/api/keystone/change-requests?status=submitted')).body;
  const pending = queue.items.find((item) => item.id === submitted.body.id);
  assert.equal(pending.canReview, true);
  assert.ok(queue.awaitingMyReview >= 1);

  const approved = await ids.hr.post(`/api/keystone/change-requests/${submitted.body.id}/approve`, { comment: 'Confirmed with Liam.' });
  assert.equal(approved.status, 200);
  assert.equal(approved.body.status, 'approved');
  assert.equal(approved.body.reviewedBy.name, 'Abigail Lewis');

  assert.equal(await billingCoverage(ids.hr), 2);
  const official = await masonBilling(ids.hr, ids);
  assert.equal(official.proficiency, 3);
  assert.equal(official.lastVerifiedAt, '2026-09-08');

  const actions = (await ids.hr.get('/api/keystone/audit-log?pageSize=100')).body.items.map((entry) => entry.actionType);
  for (const expected of ['change_request.submitted', 'change_request.approved', 'employee_skill.verified', 'risk.single_holder_resolved']) {
    assert.ok(actions.includes(expected), expected);
  }

  // The submitter sees the outcome and the reviewer's feedback.
  const profile = (await employee.get('/api/keystone/me/profile')).body;
  const mine = profile.changeRequests.find((item) => item.id === submitted.body.id);
  assert.equal(mine.status, 'approved');
  assert.equal(mine.reviewerComment, 'Confirmed with Liam.');
  assert.equal(profile.profile.evidence.find((edge) => edge.skillId === ids.billing.id).trust, 'verified');

  const again = await ids.hr.post(`/api/keystone/change-requests/${submitted.body.id}/approve`, {});
  assert.equal(again.status, 409);
});

test('rejection needs a reason and leaves the official baseline untouched', async () => {
  const ids = await context();
  const employee = await signedIn(ids.base, 'employee');
  const before = await masonBilling(ids.hr, ids);

  const submitted = await employee.post('/api/keystone/change-requests', { type: 'employee_skill',
    payload: { operation: 'upsert', employeeId: ids.mason.id, skillId: ids.billing.id, proficiency: 5, evidenceSource: 'Self-assessment', lastVerifiedAt: '2026-09-11' } });
  assert.equal(submitted.status, 201);

  const noReason = await ids.hr.post(`/api/keystone/change-requests/${submitted.body.id}/reject`, {});
  assert.equal(noReason.status, 400);
  assert.equal(noReason.body.details[0].field, 'comment');

  const rejected = await ids.hr.post(`/api/keystone/change-requests/${submitted.body.id}/reject`, { comment: 'Level 5 needs an assessment, not a self-rating.' });
  assert.equal(rejected.body.status, 'rejected');
  assert.deepEqual(await masonBilling(ids.hr, ids), before);

  const feedback = (await employee.get(`/api/keystone/change-requests/${submitted.body.id}`)).body;
  assert.equal(feedback.reviewerComment, 'Level 5 needs an assessment, not a self-rating.');
});

test('drafts stay private until submitted, and authors can cancel', async () => {
  const ids = await context();
  const manager = await signedIn(ids.base, 'manager');
  const kubernetes = named(ids.workforce.skills, 'Kubernetes');

  const draft = await manager.post('/api/keystone/change-requests', { type: 'employee_skill', submit: false,
    payload: { operation: 'upsert', employeeId: ids.liam.id, skillId: kubernetes.id, proficiency: 2, evidenceSource: 'Pairing session' } });
  assert.equal(draft.body.status, 'draft');
  assert.equal((await ids.hr.get(`/api/keystone/change-requests/${draft.body.id}`)).status, 404, 'HR cannot see a draft');

  const edited = await manager.patch(`/api/keystone/change-requests/${draft.body.id}`, {
    payload: { operation: 'upsert', employeeId: ids.liam.id, skillId: kubernetes.id, proficiency: 3, evidenceSource: 'Pairing sessions' } });
  assert.equal(edited.body.payload.proficiency, 3);

  const submitted = await manager.post(`/api/keystone/change-requests/${draft.body.id}/submit`);
  assert.equal(submitted.body.status, 'submitted');
  assert.equal((await ids.hr.get(`/api/keystone/change-requests/${draft.body.id}`)).status, 200);

  const cancelled = await manager.post(`/api/keystone/change-requests/${draft.body.id}/cancel`);
  assert.equal(cancelled.body.status, 'cancelled');
  assert.equal((await ids.hr.post(`/api/keystone/change-requests/${draft.body.id}/approve`, {})).status, 409);
});

test('managers can propose evidence only for their own team', async () => {
  const ids = await context();
  const manager = await signedIn(ids.base, 'manager');
  const isabella = named(ids.workforce.employees, 'Isabella Ross');
  const outside = await manager.post('/api/keystone/change-requests', { type: 'employee_skill',
    payload: { operation: 'upsert', employeeId: isabella.id, skillId: ids.billing.id, proficiency: 1, evidenceSource: 'Guess' } });
  assert.equal(outside.status, 403);
});

test('Time Machine models pending changes only when asked, and labels them as provisional', async () => {
  const ids = await context();
  const employee = await signedIn(ids.base, 'employee');
  const kubernetes = named(ids.workforce.skills, 'Kubernetes');
  const submitted = await employee.post('/api/keystone/change-requests', { type: 'employee_skill',
    payload: { operation: 'upsert', employeeId: ids.mason.id, skillId: kubernetes.id, proficiency: kubernetes.targetProficiency, evidenceSource: 'Cluster upgrade runbook', lastVerifiedAt: '2026-09-01' } });
  assert.equal(submitted.status, 201);

  const official = (await ids.hr.post('/api/keystone/simulate', { horizonMonths: 12 })).body;
  assert.deepEqual(official.provisionalApplied, []);

  const modelled = (await ids.hr.post('/api/keystone/simulate', { horizonMonths: 12, includePendingChanges: true,
    provisionalEvidence: [{ employeeId: ids.liam.id, skillId: kubernetes.id, proficiency: 5 }] })).body;
  assert.equal(modelled.provisionalApplied.length, 1, 'client-supplied provisional evidence is ignored');
  assert.equal(modelled.provisionalApplied[0].changeRequestId, submitted.body.id);
  assert.ok(modelled.assumptions.some((line) => /provisional assumptions/.test(line)));
  const before = named(modelled.baseline.skills, 'Kubernetes').busFactor;
  assert.equal(named(official.baseline.skills, 'Kubernetes').busFactor, before, 'the baseline never includes pending changes');
  assert.equal(named(modelled.projected.skills, 'Kubernetes').busFactor, before + 1);
});

test('future requirements proposed by HR need an admin, and apply only once approved', async () => {
  const ids = await context();
  const admin = await signedIn(ids.base, 'admin');
  const proposal = await ids.hr.post('/api/keystone/change-requests', { type: 'future_requirement',
    payload: { operation: 'create', fields: { skillId: null, skillName: 'Marketplace Payments', requiredHolders: 2, targetProficiency: 3,
      criticality: 4, effectiveMonth: 12, provenance: 'E-commerce strategy review' } } });
  assert.equal(proposal.status, 201);

  const planBefore = (await ids.hr.get('/api/keystone/future-requirements')).body;
  assert.ok(!planBefore.some((entry) => entry.skillName === 'Marketplace Payments'));
  assert.equal((await ids.hr.post(`/api/keystone/change-requests/${proposal.body.id}/approve`, {})).status, 403);

  const approved = await admin.post(`/api/keystone/change-requests/${proposal.body.id}/approve`, { comment: 'Aligned with the plan.' });
  assert.equal(approved.status, 200);
  const saved = (await ids.hr.get('/api/keystone/future-requirements')).body.find((entry) => entry.skillName === 'Marketplace Payments');
  assert.equal(saved.status, 'reviewed');

  const events = (await admin.get('/api/keystone/audit-log?actionType=future_requirement.approved')).body.items;
  assert.ok(events.some((entry) => entry.entityLabel === 'Marketplace Payments'));
});

test('catalogue changes go through review and a verified entry must name its source', async () => {
  const ids = await context();
  const admin = await signedIn(ids.base, 'admin');
  const fields = { title: 'Responsible AI Oversight Certificate', kind: 'certification', skillIds: [named(ids.workforce.skills, 'AI Governance').id],
    url: null, provider: null, verified: true, provenance: 'Fictional demo dataset' };

  const unsourced = await ids.hr.post('/api/keystone/change-requests', { type: 'resource', payload: { operation: 'update', slug: 'cert-ai-governance', fields } });
  assert.equal(unsourced.status, 400);
  assert.equal(unsourced.body.details[0].code, 'source_required');

  const sourced = await ids.hr.post('/api/keystone/change-requests', { type: 'resource',
    payload: { operation: 'update', slug: 'cert-ai-governance', fields: { ...fields, provider: 'Data & AI Chapter (internal)' } } });
  assert.equal(sourced.status, 201);
  const catalogueBefore = (await ids.hr.get('/api/keystone/workforce')).body.learningResources.find((entry) => entry.id === 'cert-ai-governance');
  assert.equal(catalogueBefore.provider, null);

  assert.equal((await admin.post(`/api/keystone/change-requests/${sourced.body.id}/approve`, {})).status, 200);
  const catalogueAfter = (await ids.hr.get('/api/keystone/workforce')).body.learningResources.find((entry) => entry.id === 'cert-ai-governance');
  assert.equal(catalogueAfter.provider, 'Data & AI Chapter (internal)');
});
