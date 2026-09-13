const { all, get, run } = require('./db');
const { withTransaction } = require('./transactions');
const { recordAudit } = require('./audit');
const writes = require('./workforce-writes');
const queries = require('./queries');
const { loadWorkforce } = require('./workforce');
const { analyze } = require('../services/risk');
const { normalizeName } = require('../services/skill-identity');
const { today } = require('../services/clock');
const { can } = require('../security/permissions');
const { inScope } = require('../security/scope');
const { compile } = require('../validation/ajv');
const schemas = require('../validation/schemas');
const { conflict, forbidden, notFound, validationError } = require('../errors');

// Review workflow for sensitive edits. A change request stores the proposed values beside the official
// data; nothing it holds reaches scoring until a reviewer approves it, and approval applies the change,
// its audit records and any resulting coverage events in one transaction.
//
// Statuses: draft -> submitted -> approved | rejected, and draft/submitted -> cancelled.

const TYPE_LABELS = { employee_skill: 'skill evidence', future_requirement: 'future requirement', resource: 'learning resource' };
const REVIEW_PERMISSION = { employee_skill: 'changes.review.people', future_requirement: 'changes.review.planning', resource: 'changes.review.planning' };
const checkPayload = {
  employee_skill: compile(schemas.evidenceChangePayload),
  future_requirement: compile(schemas.futureRequirementChangePayload),
  resource: compile(schemas.resourceChangePayload),
};

const SELECT = `
  SELECT cr.*, requester.display_name AS requester_name, requester.role AS requester_role,
         reviewer.display_name AS reviewer_name, subject.name AS subject_name
  FROM change_requests cr
  JOIN users requester ON requester.id = cr.requested_by
  LEFT JOIN users reviewer ON reviewer.id = cr.reviewed_by
  LEFT JOIN employees subject ON subject.id = cr.subject_employee_id`;

const parse = (value) => (value === null || value === undefined ? null : JSON.parse(value));

const mapRequest = (row) => ({
  id: row.id,
  type: row.type,
  typeLabel: TYPE_LABELS[row.type],
  operation: row.operation,
  status: row.status,
  subjectEmployeeId: row.subject_employee_id,
  subjectEmployeeName: row.subject_name ?? null,
  targetKey: row.target_key,
  targetLabel: row.target_label,
  payload: parse(row.payload_json),
  baseline: parse(row.baseline_json),
  justification: row.justification,
  requestedBy: { id: row.requested_by, name: row.requester_name, role: row.requester_role },
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  submittedAt: row.submitted_at,
  reviewedBy: row.reviewed_by ? { id: row.reviewed_by, name: row.reviewer_name } : null,
  reviewedAt: row.reviewed_at,
  reviewerComment: row.reviewer_comment,
  cancelledAt: row.cancelled_at,
  applied: parse(row.applied_json),
});

const fetchRequest = async (id) => {
  const row = await get(`${SELECT} WHERE cr.id = ?`, [id]);
  return row ? mapRequest(row) : null;
};

function decorate(request, user) {
  const own = request.requestedBy.id === user.id;
  return {
    ...request,
    canReview: request.status === 'submitted' && !own && can(user, REVIEW_PERMISSION[request.type]),
    canEdit: own && request.status === 'draft',
    canSubmit: own && request.status === 'draft',
    canCancel: (own || can(user, 'changes.review.planning')) && ['draft', 'submitted'].includes(request.status),
  };
}

// Drafts are private to their author. Admins see every submitted request; HR sees evidence changes;
// managers see evidence changes about their team; everyone sees their own and changes about themselves.
function canSee(request, user, scope) {
  if (request.requestedBy.id === user.id) return true;
  if (request.status === 'draft') return false;
  if (can(user, 'changes.review.planning')) return true;
  if (request.type !== 'employee_skill') return false;
  if (user.employeeId !== null && request.subjectEmployeeId === user.employeeId) return true;
  if (can(user, 'changes.review.people')) return true;
  return scope.kind === 'team' && inScope(scope, request.subjectEmployeeId);
}

const pickEvidence = (row) => (row ? { proficiency: row.proficiency, evidenceSource: row.evidenceSource, lastVerifiedAt: row.lastVerifiedAt ?? null } : null);
const pickRequirement = (row) => (row ? {
  skillId: row.skillId, skillName: row.skillName, requiredHolders: row.requiredHolders, targetProficiency: row.targetProficiency,
  criticality: row.criticality, effectiveMonth: row.effectiveMonth, status: row.status, provenance: row.provenance,
} : null);
const pickResource = (row) => (row ? {
  title: row.title, kind: row.kind, skillIds: row.skillIds, url: row.url, provider: row.provider, verified: row.verified, provenance: row.provenance,
} : null);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// The data layer throws plain 400 errors; approvals report them as field-level validation errors.
function asValidation(field, work) {
  try {
    return work();
  } catch (error) {
    if (error.status === 400 && !error.code) throw validationError([{ field, code: 'invalid', message: error.message }]);
    throw error;
  }
}

async function prepareEvidence(payload, scope) {
  checkPayload.employee_skill(payload);
  const employee = await writes.getEmployee(payload.employeeId);
  const skill = await writes.getSkill(payload.skillId);
  const unknown = [];
  if (!employee) unknown.push({ field: 'payload.employeeId', code: 'unknown_reference', message: 'Employee does not exist.' });
  if (!skill) unknown.push({ field: 'payload.skillId', code: 'unknown_reference', message: 'Skill does not exist.' });
  if (unknown.length > 0) throw validationError(unknown);
  if (!inScope(scope, employee.id)) {
    throw forbidden('changes.submit', 'You can only submit evidence for yourself or for people in your team.');
  }

  const baseline = pickEvidence(await writes.getEvidence(employee.id, skill.id));
  const base = { operation: payload.operation, employeeId: employee.id, skillId: skill.id };
  let proposed = {};

  if (payload.operation === 'upsert') {
    const lastVerifiedAt = payload.lastVerifiedAt ?? null;
    const details = [];
    if (lastVerifiedAt !== null && lastVerifiedAt > today()) {
      details.push({ field: 'payload.lastVerifiedAt', code: 'date_in_future', message: 'Verification date cannot be in the future.' });
    }
    if (payload.proficiency >= 4 && lastVerifiedAt === null) {
      details.push({ field: 'payload.lastVerifiedAt', code: 'verification_required', message: 'Levels 4 and 5 need the date the evidence was verified.' });
    }
    if (details.length > 0) throw validationError(details);
    proposed = { proficiency: payload.proficiency, evidenceSource: payload.evidenceSource.trim(), lastVerifiedAt };
    if (same(baseline, proposed)) throw conflict('The proposed evidence matches what is already recorded.', 'no_change');
  } else if (!baseline) {
    throw conflict('There is no recorded evidence to remove.', 'baseline_missing');
  }

  return {
    operation: payload.operation,
    subjectEmployeeId: employee.id,
    targetKey: `${employee.id}:${skill.id}`,
    targetLabel: `${employee.name} · ${skill.name}`,
    baseline,
    payload: { ...base, ...proposed },
  };
}

async function prepareFutureRequirement(payload, user) {
  if (!can(user, 'planning.propose')) throw forbidden('planning.propose', 'Only HR and admins can propose changes to the future skills plan.');
  checkPayload.future_requirement(payload);

  if (payload.operation === 'create') {
    const fields = { criticality: 3, ...payload.fields };
    const validated = asValidation('payload.fields', () => queries.validateFutureRequirementInput({ ...fields, status: 'reviewed' }));
    let label = fields.skillName?.trim();
    if (validated.existingId) {
      const skill = await writes.getSkill(fields.skillId);
      if (!skill) throw validationError([{ field: 'payload.fields.skillId', code: 'unknown_reference', message: 'Skill does not exist.' }]);
      label = skill.name;
    }
    return {
      operation: 'create',
      subjectEmployeeId: null,
      targetKey: `new-requirement:${normalizeName(label)}`,
      targetLabel: label,
      baseline: null,
      payload: {
        operation: 'create',
        fields: {
          skillId: validated.existingId ? fields.skillId : null,
          skillName: label,
          requiredHolders: fields.requiredHolders,
          targetProficiency: fields.targetProficiency,
          criticality: fields.criticality,
          effectiveMonth: fields.effectiveMonth,
          provenance: validated.provenance,
        },
      },
    };
  }

  const current = await writes.getFutureRequirement(payload.requirementId);
  if (!current) throw notFound('The future requirement');
  const target = { subjectEmployeeId: null, targetKey: `future-requirement:${current.id}`, targetLabel: current.skillName, baseline: pickRequirement(current) };

  if (payload.operation === 'update') {
    if ('skillId' in payload.fields || 'skillName' in payload.fields) {
      throw validationError([{ field: 'payload.fields.skillId', code: 'not_editable',
        message: "The skill of an existing requirement can't change. Remove it and propose a new one." }]);
    }
    if (Object.keys(payload.fields).length === 0) {
      throw validationError([{ field: 'payload.fields', code: 'required', message: 'Change at least one value.' }]);
    }
    const merged = { ...current, ...payload.fields };
    asValidation('payload.fields', () => queries.validateFutureRequirementInput({
      skillId: current.skillId, requiredHolders: merged.requiredHolders, targetProficiency: merged.targetProficiency,
      criticality: merged.criticality, effectiveMonth: merged.effectiveMonth, provenance: merged.provenance, status: current.status,
    }));
    return { ...target, operation: 'update', payload: { operation: 'update', requirementId: current.id, fields: payload.fields } };
  }

  return { ...target, operation: 'remove', payload: { operation: 'remove', requirementId: current.id } };
}

async function validateResourceFields(fields, fieldPrefix = '') {
  const at = (name) => (fieldPrefix ? `${fieldPrefix}.${name}` : name);
  const details = [];
  const missing = await writes.missingIds('skills', fields.skillIds);
  if (missing.length > 0) {
    details.push({ field: at('skillIds'), code: 'unknown_reference', message: `Unknown skill id(s): ${missing.join(', ')}.` });
  }
  if (fields.verified && !fields.url && !fields.provider?.trim()) {
    details.push({ field: at('provider'), code: 'source_required', message: 'A verified resource needs a provider or an https:// link.' });
  }
  if (details.length > 0) throw validationError(details);
  return {
    title: fields.title.trim(),
    kind: fields.kind,
    skillIds: [...fields.skillIds].sort((a, b) => a - b),
    url: fields.url ?? null,
    provider: fields.provider?.trim() || null,
    verified: fields.verified,
    provenance: fields.provenance.trim(),
  };
}

async function prepareResource(payload, user) {
  if (!can(user, 'planning.propose')) throw forbidden('planning.propose', 'Only HR and admins can propose catalogue changes.');
  checkPayload.resource(payload);
  const fields = await validateResourceFields(payload.fields, 'payload.fields');
  const current = await writes.getResource(payload.slug);
  if (payload.operation === 'create' && current) throw conflict(`A resource with identifier "${payload.slug}" already exists.`, 'duplicate_resource');
  if (payload.operation === 'update' && !current) throw notFound('The learning resource');
  if (current && same(pickResource(current), fields)) throw conflict('The proposed values match the catalogue entry.', 'no_change');
  return {
    operation: payload.operation,
    subjectEmployeeId: null,
    targetKey: `resource:${payload.slug}`,
    targetLabel: fields.title,
    baseline: pickResource(current),
    payload: { operation: payload.operation, slug: payload.slug, fields },
  };
}

function prepare(type, payload, user, scope) {
  if (type === 'employee_skill') return prepareEvidence(payload, scope);
  if (type === 'future_requirement') return prepareFutureRequirement(payload, user);
  return prepareResource(payload, user);
}

async function assertNoDuplicate(type, targetKey, userId, exceptId = 0) {
  const existing = await get(
    "SELECT id FROM change_requests WHERE type = ? AND target_key = ? AND requested_by = ? AND status = 'submitted' AND id != ?",
    [type, targetKey, userId, exceptId],
  );
  if (existing) {
    throw conflict('You already have a pending submission for this record. Cancel it before submitting another.', 'duplicate_submission');
  }
}

async function createChangeRequest({ type, payload, justification, submit = true }, user, scope, ctx) {
  const prepared = await prepare(type, payload, user, scope);
  const status = submit ? 'submitted' : 'draft';
  return withTransaction(async () => {
    if (status === 'submitted') await assertNoDuplicate(type, prepared.targetKey, user.id);
    const now = new Date().toISOString();
    const { lastID } = await run(
      `INSERT INTO change_requests (type, operation, status, subject_employee_id, target_key, target_label, payload_json,
         baseline_json, justification, requested_by, created_at, updated_at, submitted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [type, prepared.operation, status, prepared.subjectEmployeeId, prepared.targetKey, prepared.targetLabel,
        JSON.stringify(prepared.payload), prepared.baseline ? JSON.stringify(prepared.baseline) : null,
        justification?.trim() || null, user.id, now, now, status === 'submitted' ? now : null],
    );
    await recordAudit({
      ...ctx,
      action: status === 'submitted' ? 'change_request.submitted' : 'change_request.drafted',
      entityType: 'change_request', entityId: lastID, entityLabel: prepared.targetLabel,
      summary: `${user.displayName} ${status === 'submitted' ? 'submitted' : 'drafted'} a ${TYPE_LABELS[type]} change for ${prepared.targetLabel}`,
      before: prepared.baseline, after: prepared.payload,
      metadata: { type, operation: prepared.operation, status, justification: justification?.trim() || null },
    });
    return decorate(await fetchRequest(lastID), user);
  });
}

async function loadRow(id) {
  const row = await get('SELECT * FROM change_requests WHERE id = ?', [id]);
  if (!row) throw notFound('The change request');
  return row;
}

async function updateDraft(id, input, user, scope, ctx) {
  return withTransaction(async () => {
    const row = await loadRow(id);
    if (row.requested_by !== user.id) throw forbidden(null, 'Only the author of a draft can edit it.');
    if (row.status !== 'draft') throw conflict('Only drafts can be edited.', 'invalid_status');
    const prepared = input.payload ? await prepare(row.type, input.payload, user, scope) : null;
    const justification = input.justification !== undefined ? input.justification.trim() || null : row.justification;
    await run(
      `UPDATE change_requests SET operation = ?, subject_employee_id = ?, target_key = ?, target_label = ?, payload_json = ?,
         baseline_json = ?, justification = ?, updated_at = ? WHERE id = ?`,
      prepared
        ? [prepared.operation, prepared.subjectEmployeeId, prepared.targetKey, prepared.targetLabel, JSON.stringify(prepared.payload),
          prepared.baseline ? JSON.stringify(prepared.baseline) : null, justification, new Date().toISOString(), id]
        : [row.operation, row.subject_employee_id, row.target_key, row.target_label, row.payload_json, row.baseline_json,
          justification, new Date().toISOString(), id],
    );
    const label = prepared?.targetLabel ?? row.target_label;
    await recordAudit({
      ...ctx, action: 'change_request.updated', entityType: 'change_request', entityId: id, entityLabel: label,
      summary: `${user.displayName} edited the draft ${TYPE_LABELS[row.type]} change for ${label}`,
      before: parse(row.payload_json), after: prepared?.payload ?? parse(row.payload_json),
      metadata: { justificationChanged: justification !== row.justification },
    });
    return decorate(await fetchRequest(id), user);
  });
}

async function submitDraft(id, user, ctx) {
  return withTransaction(async () => {
    const row = await loadRow(id);
    if (row.requested_by !== user.id) throw forbidden(null, 'Only the author of a draft can submit it.');
    if (row.status !== 'draft') throw conflict('Only drafts can be submitted.', 'invalid_status');
    await assertNoDuplicate(row.type, row.target_key, user.id, id);
    const now = new Date().toISOString();
    await run("UPDATE change_requests SET status = 'submitted', submitted_at = ?, updated_at = ? WHERE id = ?", [now, now, id]);
    await recordAudit({
      ...ctx, action: 'change_request.submitted', entityType: 'change_request', entityId: id, entityLabel: row.target_label,
      summary: `${user.displayName} submitted a ${TYPE_LABELS[row.type]} change for ${row.target_label}`,
      before: { status: 'draft' }, after: { status: 'submitted' }, metadata: { type: row.type, operation: row.operation },
    });
    return decorate(await fetchRequest(id), user);
  });
}

async function cancelRequest(id, user, ctx) {
  return withTransaction(async () => {
    const row = await loadRow(id);
    if (row.requested_by !== user.id && !can(user, 'changes.review.planning')) {
      throw forbidden(null, 'Only the author or an admin can cancel this change.');
    }
    if (!['draft', 'submitted'].includes(row.status)) throw conflict('Only drafts and pending changes can be cancelled.', 'invalid_status');
    const now = new Date().toISOString();
    await run("UPDATE change_requests SET status = 'cancelled', cancelled_at = ?, updated_at = ? WHERE id = ?", [now, now, id]);
    await recordAudit({
      ...ctx, action: 'change_request.cancelled', entityType: 'change_request', entityId: id, entityLabel: row.target_label,
      summary: `${user.displayName} cancelled the ${TYPE_LABELS[row.type]} change for ${row.target_label}`,
      before: { status: row.status }, after: { status: 'cancelled' }, metadata: { type: row.type },
    });
    return decorate(await fetchRequest(id), user);
  });
}

async function recordEvidenceAudit(before, after, label, ctx, metadata = {}) {
  const previous = pickEvidence(before);
  const next = pickEvidence(after);
  const verified = next.lastVerifiedAt !== null && next.lastVerifiedAt !== (previous?.lastVerifiedAt ?? null);
  const levelChange = previous && previous.proficiency !== next.proficiency ? ` (was level ${previous.proficiency})` : '';
  let action;
  let summary;
  if (!previous) {
    action = 'employee_skill.created';
    summary = `${label} recorded at level ${next.proficiency} from ${next.evidenceSource}`;
  } else if (verified) {
    action = 'employee_skill.verified';
    summary = `${label} verified at level ${next.proficiency} on ${next.lastVerifiedAt}${levelChange}`;
  } else {
    action = 'employee_skill.updated';
    summary = `${label} evidence updated to level ${next.proficiency}${levelChange}`;
  }
  return recordAudit({
    ...ctx, action, entityType: 'employee_skill', entityId: `${after.employeeId}:${after.skillId}`, entityLabel: label,
    summary, before: previous, after: next, metadata,
  });
}

async function recordResourceAudit(before, after, ctx, metadata = {}) {
  const verificationChanged = Boolean(before) && before.verified !== after.verified;
  return recordAudit({
    ...ctx,
    action: before ? 'resource.updated' : 'resource.created',
    entityType: 'resource', entityId: after.slug, entityLabel: after.title,
    summary: before
      ? `Learning resource "${after.title}" updated${verificationChanged ? ` (${after.verified ? 'now verified' : 'no longer verified'})` : ''}`
      : `Learning resource "${after.title}" added to the catalogue${after.verified ? ' as verified' : ''}`,
    before: pickResource(before), after: pickResource(after), metadata: { ...metadata, verificationChanged },
  });
}

// Coverage consequences are recorded as system events, attributed to the change that triggered them.
async function recordCoverageChanges(before, after, ctx, metadata = {}) {
  const previous = new Map(before.skills.map((skill) => [skill.id, skill]));
  for (const skill of after.skills) {
    const old = previous.get(skill.id);
    if (!old) continue;
    const event = {
      actor: null, source: 'system', requestId: ctx.requestId ?? null,
      entityType: 'skill', entityId: skill.id, entityLabel: skill.name,
      before: { qualifiedPeople: old.busFactor, dependencyScore: old.keystoneScore },
      after: { qualifiedPeople: skill.busFactor, dependencyScore: skill.keystoneScore },
      metadata: { ...metadata, triggeredByUserId: ctx.actor?.id ?? null },
    };
    if (old.busFactor > 0 && skill.busFactor === 0 && skill.criticality >= 4) {
      await recordAudit({ ...event, action: 'risk.critical_skill_uncovered',
        summary: `${skill.name} (criticality ${skill.criticality}/5) now has no qualified holder on record` });
    } else if (old.busFactor === 0 && skill.busFactor > 0) {
      await recordAudit({ ...event, action: 'risk.coverage_restored', summary: `${skill.name} has a qualified holder on record again` });
    } else if (old.busFactor === 1 && skill.busFactor >= 2 && skill.criticality >= 4) {
      await recordAudit({ ...event, action: 'risk.single_holder_resolved',
        summary: `${skill.name} (criticality ${skill.criticality}/5) no longer depends on a single person` });
    }
  }
}

async function applyChange(request, ctx) {
  const metadata = { changeRequestId: request.id, requestedByUserId: request.requestedBy.id };

  if (request.type === 'employee_skill') {
    const { employeeId, skillId } = request.payload;
    const current = await writes.getEvidence(employeeId, skillId);
    const baselineChanged = !same(pickEvidence(current), request.baseline);
    if (request.operation === 'remove') {
      if (!current) throw conflict('The evidence was removed before this change was reviewed.', 'baseline_missing');
      await writes.deleteEvidence(employeeId, skillId);
      await recordAudit({
        ...ctx, action: 'employee_skill.removed', entityType: 'employee_skill', entityId: `${employeeId}:${skillId}`,
        entityLabel: request.targetLabel, summary: `${request.targetLabel} evidence removed (was level ${current.proficiency})`,
        before: pickEvidence(current), after: null, metadata: { ...metadata, baselineChanged },
      });
      return { removed: true, baselineChanged };
    }
    const evidence = await queries.validateEmployeeSkillEdit({
      employeeId, skillId, proficiency: request.payload.proficiency,
      evidenceSource: request.payload.evidenceSource, lastVerifiedAt: request.payload.lastVerifiedAt,
    });
    await queries.writeEmployeeSkill(evidence);
    await recordEvidenceAudit(current, evidence, request.targetLabel, ctx, { ...metadata, baselineChanged });
    return { ...pickEvidence(evidence), baselineChanged };
  }

  if (request.type === 'future_requirement') {
    if (request.operation === 'create') {
      const validated = queries.validateFutureRequirementInput({ ...request.payload.fields, status: 'reviewed' });
      const created = await queries.insertFutureRequirement(validated);
      await recordAudit({
        ...ctx, action: 'future_requirement.approved', entityType: 'future_requirement', entityId: created.id, entityLabel: created.skillName,
        summary: `${created.skillName} added to the approved plan: ${created.requiredHolders} people at level ${created.targetProficiency}+ from month ${created.effectiveMonth}`,
        after: pickRequirement(created), metadata: { ...metadata, operation: 'create', createdSkill: created.createdSkill },
      });
      return { requirementId: created.id, skillId: created.skillId };
    }
    const current = await writes.getFutureRequirement(request.payload.requirementId);
    if (!current) throw conflict('The requirement was removed before this change was reviewed.', 'baseline_missing');
    if (request.operation === 'update') {
      await writes.updateFutureRequirement(current.id, request.payload.fields);
      const updated = await writes.getFutureRequirement(current.id);
      await recordAudit({
        ...ctx, action: 'future_requirement.updated', entityType: 'future_requirement', entityId: current.id, entityLabel: current.skillName,
        summary: `${current.skillName} future requirement updated`, before: pickRequirement(current), after: pickRequirement(updated), metadata,
      });
      return { requirementId: current.id };
    }
    await writes.deleteFutureRequirement(current.id);
    await recordAudit({
      ...ctx, action: 'future_requirement.removed', entityType: 'future_requirement', entityId: current.id, entityLabel: current.skillName,
      summary: `${current.skillName} removed from the future skills plan`, before: pickRequirement(current), after: null, metadata,
    });
    return { removed: true };
  }

  const before = await writes.getResource(request.payload.slug);
  if (request.operation === 'update' && !before) throw conflict('The resource was removed before this change was reviewed.', 'baseline_missing');
  if (request.operation === 'create' && before) throw conflict('A resource with this identifier was added before this change was reviewed.', 'duplicate_resource');
  const after = await writes.upsertResource(request.payload.slug, request.payload.fields);
  await recordResourceAudit(before, after, ctx, metadata);
  return { slug: after.slug };
}

async function reviewChangeRequest(id, { decision, comment }, user, ctx) {
  return withTransaction(async () => {
    const request = await fetchRequest(id);
    if (!request) throw notFound('The change request');
    if (request.status !== 'submitted') throw conflict('Only submitted changes can be reviewed.', 'invalid_status');
    const permission = REVIEW_PERMISSION[request.type];
    if (!can(user, permission)) {
      throw forbidden(permission, request.type === 'employee_skill'
        ? 'Only HR and admins can review evidence changes.'
        : 'Only admins can approve planning and catalogue changes.');
    }
    if (request.requestedBy.id === user.id) throw forbidden(permission, 'You cannot review your own submission. Another reviewer must decide.');

    let applied = null;
    if (decision === 'approved') {
      const before = analyze(await loadWorkforce());
      applied = await applyChange(request, ctx);
      await recordCoverageChanges(before, analyze(await loadWorkforce()), ctx, { changeRequestId: id });
    }

    const now = new Date().toISOString();
    await run(
      'UPDATE change_requests SET status = ?, reviewed_by = ?, reviewed_at = ?, reviewer_comment = ?, updated_at = ?, applied_json = ? WHERE id = ?',
      [decision, user.id, now, comment?.trim() || null, now, applied ? JSON.stringify(applied) : null, id],
    );
    await recordAudit({
      ...ctx, action: `change_request.${decision}`, entityType: 'change_request', entityId: id, entityLabel: request.targetLabel,
      summary: `${user.displayName} ${decision} ${request.requestedBy.name}'s ${TYPE_LABELS[request.type]} change for ${request.targetLabel}`,
      before: { status: 'submitted' }, after: { status: decision, reviewerComment: comment?.trim() || null },
      metadata: { type: request.type, operation: request.operation, requestedByUserId: request.requestedBy.id, applied },
    });
    return decorate(await fetchRequest(id), user);
  });
}

async function listChangeRequests({ status, type } = {}, user, scope) {
  const where = [];
  const params = [];
  if (status) { where.push('cr.status = ?'); params.push(status); }
  if (type) { where.push('cr.type = ?'); params.push(type); }
  const rows = await all(
    `${SELECT} ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY COALESCE(cr.submitted_at, cr.created_at) DESC, cr.id DESC LIMIT 500`,
    params,
  );
  return rows.map(mapRequest).filter((request) => canSee(request, user, scope)).map((request) => decorate(request, user));
}

async function getChangeRequestForUser(id, user, scope) {
  const request = await fetchRequest(id);
  if (!request || !canSee(request, user, scope)) throw notFound('The change request');
  return decorate(request, user);
}

module.exports = {
  TYPE_LABELS, createChangeRequest, updateDraft, submitDraft, cancelRequest, reviewChangeRequest,
  listChangeRequests, getChangeRequestForUser, recordEvidenceAudit, recordResourceAudit, recordCoverageChanges,
  validateResourceFields, pickRequirement,
};
