const { run, all, get } = require('./db');
const { withTransaction } = require('./transactions');
const { recordAudit } = require('./audit');
const { notFound } = require('../errors');

// Saved Time Machine scenarios. Scenarios are modelled assumptions, never official data: saving one
// changes no evidence or score. Deletion is soft, so the audit trail can still name what was removed.
const SELECT = `
  SELECT s.*, creator.display_name AS created_by_name, editor.display_name AS updated_by_name
  FROM scenarios s
  JOIN users creator ON creator.id = s.created_by
  JOIN users editor ON editor.id = s.updated_by`;

const mapScenario = (row) => ({
  id: row.id,
  name: row.name,
  horizonMonths: row.horizon_months,
  departures: JSON.parse(row.departures_json),
  interventions: JSON.parse(row.interventions_json),
  includePendingChanges: row.include_pending === 1,
  createdBy: { id: row.created_by, name: row.created_by_name },
  updatedBy: { id: row.updated_by, name: row.updated_by_name },
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const listScenarios = async () => (await all(`${SELECT} WHERE s.deleted_at IS NULL ORDER BY s.updated_at DESC, s.id DESC`)).map(mapScenario);

async function getScenario(id) {
  const row = await get(`${SELECT} WHERE s.id = ? AND s.deleted_at IS NULL`, [id]);
  return row ? mapScenario(row) : null;
}

const normalize = (input) => ({
  name: input.name.trim(),
  horizonMonths: input.horizonMonths,
  departures: input.departures.map(({ employeeId, month }) => ({ employeeId, month })),
  interventions: input.interventions.map((item) => ({
    employeeId: item.employeeId,
    skillId: item.skillId,
    mentorId: item.mentorId ?? null,
    startMonth: item.startMonth ?? 0,
    completionMonth: item.completionMonth,
    targetProficiency: item.targetProficiency,
    assumeVerified: item.assumeVerified,
    ...(item.source ? { source: item.source } : {}),
  })),
  includePendingChanges: input.includePendingChanges === true,
});

const snapshot = (scenario) => ({
  name: scenario.name, horizonMonths: scenario.horizonMonths, departures: scenario.departures,
  interventions: scenario.interventions, includePendingChanges: scenario.includePendingChanges,
});

function difference(before, after) {
  const key = (item) => JSON.stringify(item);
  const beforeKeys = new Set(before.map(key));
  const afterKeys = new Set(after.map(key));
  return { added: after.filter((item) => !beforeKeys.has(key(item))).length, removed: before.filter((item) => !afterKeys.has(key(item))).length };
}

async function createScenario(input, user, ctx) {
  const scenario = normalize(input);
  return withTransaction(async () => {
    const now = new Date().toISOString();
    const { lastID } = await run(
      `INSERT INTO scenarios (name, horizon_months, departures_json, interventions_json, include_pending, created_by, updated_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [scenario.name, scenario.horizonMonths, JSON.stringify(scenario.departures), JSON.stringify(scenario.interventions),
        scenario.includePendingChanges ? 1 : 0, user.id, user.id, now, now],
    );
    await recordAudit({
      ...ctx, action: 'scenario.saved', entityType: 'scenario', entityId: lastID, entityLabel: scenario.name,
      summary: `${user.displayName} saved scenario "${scenario.name}" with ${scenario.departures.length} departure(s) and ${scenario.interventions.length} planned development action(s)`,
      after: scenario,
    });
    return getScenario(lastID);
  });
}

async function updateScenario(id, input, user, ctx) {
  const next = normalize(input);
  return withTransaction(async () => {
    const current = await getScenario(id);
    if (!current) throw notFound('The scenario');
    await run(
      `UPDATE scenarios SET name = ?, horizon_months = ?, departures_json = ?, interventions_json = ?, include_pending = ?,
         updated_by = ?, updated_at = ? WHERE id = ?`,
      [next.name, next.horizonMonths, JSON.stringify(next.departures), JSON.stringify(next.interventions),
        next.includePendingChanges ? 1 : 0, user.id, new Date().toISOString(), id],
    );
    const interventions = difference(current.interventions, next.interventions);
    const departures = difference(current.departures, next.departures);
    await recordAudit({
      ...ctx, action: 'scenario.updated', entityType: 'scenario', entityId: id, entityLabel: next.name,
      summary: `${user.displayName} updated scenario "${next.name}" (development +${interventions.added}/−${interventions.removed}, departures +${departures.added}/−${departures.removed})`,
      before: snapshot(current), after: next,
      metadata: { interventionsAdded: interventions.added, interventionsRemoved: interventions.removed,
        departuresAdded: departures.added, departuresRemoved: departures.removed },
    });
    return getScenario(id);
  });
}

async function deleteScenario(id, user, ctx) {
  return withTransaction(async () => {
    const current = await getScenario(id);
    if (!current) throw notFound('The scenario');
    await run('UPDATE scenarios SET deleted_at = ?, updated_by = ? WHERE id = ?', [new Date().toISOString(), user.id, id]);
    await recordAudit({
      ...ctx, action: 'scenario.deleted', entityType: 'scenario', entityId: id, entityLabel: current.name,
      summary: `${user.displayName} deleted scenario "${current.name}"`, before: snapshot(current), after: null,
    });
  });
}

module.exports = { listScenarios, getScenario, createScenario, updateScenario, deleteScenario };
