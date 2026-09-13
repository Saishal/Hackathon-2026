const { run, get } = require('./db');
const { enqueueWrite } = require('./transactions');

// Single-tenant settings for the demo organization. plan_start_date anchors "effective month" offsets
// to calendar dates; evidence_stale_months decides when recorded evidence needs re-verification.
const DEFAULTS = {
  name: 'Harbor & Pine Co. (demo tenant)',
  planStartDate: '2026-09-01',
  evidenceStaleMonths: 12,
};

const mapRow = (row) => ({
  name: row.name,
  environment: row.environment,
  planStartDate: row.plan_start_date,
  evidenceStaleMonths: row.evidence_stale_months,
  updatedAt: row.updated_at,
  updatedBy: row.updated_by,
});

async function ensureOrganization(environment) {
  await run(
    `INSERT INTO organization_settings (id, name, environment, plan_start_date, evidence_stale_months, updated_at)
     VALUES (1, ?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING`,
    [DEFAULTS.name, environment, DEFAULTS.planStartDate, DEFAULTS.evidenceStaleMonths, new Date().toISOString()],
  );
}

async function getOrganization() {
  const row = await get('SELECT * FROM organization_settings WHERE id = 1');
  return row ? mapRow(row) : { ...DEFAULTS, environment: 'demo', updatedAt: null, updatedBy: null };
}

async function updateOrganization(fields, actorId) {
  const columns = { name: 'name', planStartDate: 'plan_start_date', evidenceStaleMonths: 'evidence_stale_months' };
  const entries = Object.entries(fields).filter(([key, value]) => columns[key] && value !== undefined);
  if (entries.length > 0) {
    await enqueueWrite(() => run(
      `UPDATE organization_settings SET ${entries.map(([key]) => `${columns[key]} = ?`).join(', ')}, updated_at = ?, updated_by = ? WHERE id = 1`,
      [...entries.map(([, value]) => value), new Date().toISOString(), actorId],
    ));
  }
  return getOrganization();
}

module.exports = { ensureOrganization, getOrganization, updateOrganization, ORGANIZATION_DEFAULTS: DEFAULTS };
