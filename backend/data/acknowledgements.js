const { run, all, get } = require('./db');
const { withTransaction } = require('./transactions');
const { recordAudit } = require('./audit');
const { getUser } = require('./users');
const writes = require('./workforce-writes');
const { today } = require('../services/clock');
const { conflict, notFound, validationError } = require('../errors');

// Risk acknowledgements record that someone owns a known risk and when it will be reviewed. They never
// change a score: an acknowledged risk is still a risk, shown separately from unowned ones.
const SELECT = `
  SELECT a.*, owner.display_name AS owner_name, creator.display_name AS created_by_name, closer.display_name AS closed_by_name
  FROM risk_acknowledgements a
  JOIN users owner ON owner.id = a.owner_user_id
  JOIN users creator ON creator.id = a.created_by
  LEFT JOIN users closer ON closer.id = a.closed_by`;

function mapAcknowledgement(row) {
  const now = today();
  return {
    id: row.id,
    riskType: row.risk_type,
    entityId: row.entity_id,
    entityLabel: row.entity_label,
    owner: { id: row.owner_user_id, name: row.owner_name },
    note: row.note,
    dueDate: row.due_date,
    nextReviewDate: row.next_review_date,
    status: row.status,
    overdue: row.status === 'active' && row.due_date < now,
    reviewDue: row.status === 'active' && row.next_review_date <= now,
    createdBy: { id: row.created_by, name: row.created_by_name },
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    closedBy: row.closed_by ? { id: row.closed_by, name: row.closed_by_name } : null,
    closedAt: row.closed_at,
  };
}

const snapshot = (item) => ({ owner: item.owner.name, ownerUserId: item.owner.id, note: item.note, dueDate: item.dueDate, nextReviewDate: item.nextReviewDate, status: item.status });

async function listAcknowledgements({ status } = {}) {
  const rows = await all(`${SELECT} ${status ? 'WHERE a.status = ?' : ''} ORDER BY a.status, a.due_date, a.id`, status ? [status] : []);
  return rows.map(mapAcknowledgement);
}

async function fetchAcknowledgement(id) {
  const row = await get(`${SELECT} WHERE a.id = ?`, [id]);
  return row ? mapAcknowledgement(row) : null;
}

async function assertOwner(ownerUserId) {
  const owner = await getUser(ownerUserId);
  if (!owner || owner.disabled || !['admin', 'hr', 'manager'].includes(owner.role)) {
    throw validationError([{ field: 'ownerUserId', code: 'invalid_owner', message: 'Owner must be an active admin, HR or manager account.' }]);
  }
  return owner;
}

function assertDates({ dueDate, nextReviewDate }, requireFuture) {
  const details = [];
  const now = today();
  if (requireFuture && dueDate !== undefined && dueDate < now) details.push({ field: 'dueDate', code: 'date_in_past', message: 'Due date cannot be in the past.' });
  if (requireFuture && nextReviewDate !== undefined && nextReviewDate < now) {
    details.push({ field: 'nextReviewDate', code: 'date_in_past', message: 'Next review date cannot be in the past.' });
  }
  if (dueDate !== undefined && nextReviewDate !== undefined && nextReviewDate > dueDate) {
    details.push({ field: 'nextReviewDate', code: 'after_due_date', message: 'Next review should be on or before the due date.' });
  }
  if (details.length > 0) throw validationError(details);
}

async function createAcknowledgement(input, user, ctx) {
  return withTransaction(async () => {
    const owner = await assertOwner(input.ownerUserId);
    const entity = input.riskType === 'skill' ? await writes.getSkill(input.entityId) : await writes.getEmployee(input.entityId);
    if (!entity) throw validationError([{ field: 'entityId', code: 'unknown_reference', message: `That ${input.riskType} does not exist.` }]);
    assertDates(input, true);
    const active = await get("SELECT id FROM risk_acknowledgements WHERE risk_type = ? AND entity_id = ? AND status = 'active'", [input.riskType, input.entityId]);
    if (active) throw conflict('This risk already has an active acknowledgement. Update or close it instead.', 'already_acknowledged');

    const now = new Date().toISOString();
    const { lastID } = await run(
      `INSERT INTO risk_acknowledgements (risk_type, entity_id, entity_label, owner_user_id, note, due_date, next_review_date, status,
         created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)`,
      [input.riskType, input.entityId, entity.name, owner.id, input.note.trim(), input.dueDate, input.nextReviewDate, user.id, now, now],
    );
    const created = await fetchAcknowledgement(lastID);
    await recordAudit({
      ...ctx, action: 'risk.acknowledged', entityType: input.riskType, entityId: input.entityId, entityLabel: entity.name,
      summary: `${user.displayName} acknowledged the ${entity.name} risk; ${owner.displayName} owns it, due ${input.dueDate}`,
      after: snapshot(created), metadata: { acknowledgementId: lastID },
    });
    return created;
  });
}

async function updateAcknowledgement(id, fields, user, ctx) {
  return withTransaction(async () => {
    const current = await fetchAcknowledgement(id);
    if (!current) throw notFound('The acknowledgement');
    if (current.status !== 'active') throw conflict('Closed acknowledgements cannot be changed.', 'invalid_status');
    if (fields.ownerUserId !== undefined) await assertOwner(fields.ownerUserId);
    assertDates({ dueDate: fields.dueDate ?? current.dueDate, nextReviewDate: fields.nextReviewDate ?? current.nextReviewDate }, false);
    const columns = { ownerUserId: 'owner_user_id', note: 'note', dueDate: 'due_date', nextReviewDate: 'next_review_date' };
    const entries = Object.entries(fields).filter(([key]) => columns[key]);
    await run(
      `UPDATE risk_acknowledgements SET ${entries.map(([key]) => `${columns[key]} = ?`).join(', ')}, updated_at = ? WHERE id = ?`,
      [...entries.map(([key, value]) => (key === 'note' ? value.trim() : value)), new Date().toISOString(), id],
    );
    const updated = await fetchAcknowledgement(id);
    await recordAudit({
      ...ctx, action: 'risk.acknowledgement_updated', entityType: current.riskType, entityId: current.entityId, entityLabel: current.entityLabel,
      summary: `${user.displayName} updated the acknowledgement for ${current.entityLabel}`,
      before: snapshot(current), after: snapshot(updated), metadata: { acknowledgementId: id },
    });
    return updated;
  });
}

async function closeAcknowledgement(id, note, user, ctx) {
  return withTransaction(async () => {
    const current = await fetchAcknowledgement(id);
    if (!current) throw notFound('The acknowledgement');
    if (current.status !== 'active') throw conflict('This acknowledgement is already closed.', 'invalid_status');
    const now = new Date().toISOString();
    await run("UPDATE risk_acknowledgements SET status = 'closed', closed_by = ?, closed_at = ?, updated_at = ? WHERE id = ?", [user.id, now, now, id]);
    const closed = await fetchAcknowledgement(id);
    await recordAudit({
      ...ctx, action: 'risk.acknowledgement_closed', entityType: current.riskType, entityId: current.entityId, entityLabel: current.entityLabel,
      summary: `${user.displayName} closed the acknowledgement for ${current.entityLabel}`,
      before: snapshot(current), after: snapshot(closed), metadata: { acknowledgementId: id, note: note?.trim() || null },
    });
    return closed;
  });
}

module.exports = { listAcknowledgements, createAcknowledgement, updateAcknowledgement, closeAcknowledgement };
