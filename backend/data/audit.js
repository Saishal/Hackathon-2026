const { run, all, get } = require('./db');
const { enqueueWrite } = require('./transactions');

// Append-only audit trail. The actor always comes from the authenticated session on the server,
// never from a name the client sends. Snapshots are sanitized so credentials, tokens and hashes can
// never be written, and long strings are truncated.
const SENSITIVE_KEY = /pass(word|phrase)?|token|secret|hash|salt|cookie|api[-_]?key|authorization|session/i;
const SOURCES = new Set(['ui', 'api', 'seed', 'system']);

// Events worth surfacing on the dashboard's recent-activity panel.
const HIGH_SIGNAL = new Set([
  'future_requirement.approved', 'future_requirement.created', 'future_requirement.rejected',
  'employee_skill.verified', 'change_request.approved', 'change_request.rejected',
  'risk.critical_skill_uncovered', 'risk.coverage_restored', 'risk.single_holder_resolved',
  'risk.acknowledged', 'scenario.saved', 'ai_recommendation.scheduled', 'user.role_changed', 'user.disabled',
]);

// Entity types whose changes alter the official workforce picture, used for "last updated".
const DATA_ENTITY_TYPES = ['employee_skill', 'employee', 'future_requirement', 'resource', 'role_requirement', 'future_skill_target', 'dataset'];

function sanitize(value, depth = 0) {
  if (value === null || value === undefined) return null;
  if (depth > 6) return '[truncated]';
  if (Array.isArray(value)) return value.slice(0, 200).map((item) => sanitize(item, depth + 1));
  if (typeof value === 'object') {
    return Object.fromEntries(Object.entries(value)
      .filter(([key]) => !SENSITIVE_KEY.test(key))
      .map(([key, item]) => [key, sanitize(item, depth + 1)]));
  }
  if (typeof value === 'string') return value.length > 2000 ? `${value.slice(0, 2000)}…` : value;
  return value;
}

const toJson = (value) => (value === undefined || value === null ? null : JSON.stringify(sanitize(value)));
const parse = (value) => (value === null || value === undefined ? null : JSON.parse(value));

// Joins a transaction when one is open; otherwise waits its turn in the write queue.
async function recordAudit(entry) {
  const {
    actor = null, action, entityType, entityId = null, entityLabel = null, summary,
    before, after, metadata, source = 'api', requestId = null, occurredAt = new Date().toISOString(),
  } = entry;
  if (!action || !entityType || !summary) throw new Error('Audit entries need action, entityType and summary');

  const result = await enqueueWrite(() => run(
    `INSERT INTO audit_log (occurred_at, actor_user_id, actor_name, actor_role, action_type, entity_type, entity_id,
       entity_label, summary, before_json, after_json, metadata_json, source, request_id, high_signal)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [occurredAt, actor?.id ?? null, actor?.displayName ?? 'System', actor?.role ?? null, action, entityType,
      entityId === null ? null : String(entityId), entityLabel, summary, toJson(before), toJson(after), toJson(metadata),
      SOURCES.has(source) ? source : 'api', requestId, HIGH_SIGNAL.has(action) ? 1 : 0],
  ));
  return result.lastID;
}

// Everything an audit entry needs from the request, resolved on the server.
const auditContext = (req, overrides = {}) => ({
  actor: req.user ?? null,
  source: req.get?.('X-Keystone-Client') === 'web' ? 'ui' : 'api',
  requestId: req.id ?? null,
  ...overrides,
});

const mapRow = (row) => ({
  id: row.id,
  occurredAt: row.occurred_at,
  actor: { userId: row.actor_user_id, name: row.actor_name, role: row.actor_role },
  actionType: row.action_type,
  entityType: row.entity_type,
  entityId: row.entity_id,
  entityLabel: row.entity_label,
  summary: row.summary,
  before: parse(row.before_json),
  after: parse(row.after_json),
  metadata: parse(row.metadata_json),
  source: row.source,
  requestId: row.request_id,
  highSignal: row.high_signal === 1,
});

const nextDay = (date) => new Date(Date.parse(`${date}T00:00:00Z`) + 24 * 3600 * 1000).toISOString();
const escapeLike = (text) => text.replace(/[\\%_]/g, (char) => `\\${char}`);

async function queryAudit({ page = 1, pageSize = 25, from, to, actorUserId, actionType, entityType, entityId, q, highSignal } = {}) {
  const where = [];
  const params = [];
  if (from) { where.push('occurred_at >= ?'); params.push(`${from}T00:00:00.000Z`); }
  if (to) { where.push('occurred_at < ?'); params.push(nextDay(to)); }
  if (actorUserId) { where.push('actor_user_id = ?'); params.push(actorUserId); }
  if (actionType) {
    if (actionType.endsWith('.*')) { where.push("action_type LIKE ? ESCAPE '\\'"); params.push(`${escapeLike(actionType.slice(0, -1))}%`); }
    else { where.push('action_type = ?'); params.push(actionType); }
  }
  if (entityType) { where.push('entity_type = ?'); params.push(entityType); }
  if (entityId) { where.push('entity_id = ?'); params.push(String(entityId)); }
  if (highSignal) where.push('high_signal = 1');
  if (q) {
    where.push("(summary LIKE ? ESCAPE '\\' OR entity_label LIKE ? ESCAPE '\\' OR actor_name LIKE ? ESCAPE '\\')");
    const pattern = `%${escapeLike(q)}%`;
    params.push(pattern, pattern, pattern);
  }

  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const { total } = await get(`SELECT COUNT(*) AS total FROM audit_log ${clause}`, params);
  const rows = await all(
    `SELECT * FROM audit_log ${clause} ORDER BY occurred_at DESC, id DESC LIMIT ? OFFSET ?`,
    [...params, pageSize, (page - 1) * pageSize],
  );
  return { items: rows.map(mapRow), page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

async function auditFacets() {
  const [actionTypes, entityTypes, actors] = await Promise.all([
    all('SELECT DISTINCT action_type AS value FROM audit_log ORDER BY action_type'),
    all('SELECT DISTINCT entity_type AS value FROM audit_log ORDER BY entity_type'),
    all(`SELECT actor_user_id AS userId, MAX(actor_name) AS name FROM audit_log
         WHERE actor_user_id IS NOT NULL GROUP BY actor_user_id ORDER BY name`),
  ]);
  return { actionTypes: actionTypes.map((row) => row.value), entityTypes: entityTypes.map((row) => row.value), actors };
}

async function getAuditEntry(id) {
  const row = await get('SELECT * FROM audit_log WHERE id = ?', [id]);
  return row ? mapRow(row) : null;
}

async function lastDataChange() {
  const placeholders = DATA_ENTITY_TYPES.map(() => '?').join(', ');
  const row = await get(`SELECT MAX(occurred_at) AS at FROM audit_log WHERE entity_type IN (${placeholders})`, DATA_ENTITY_TYPES);
  return row?.at ?? null;
}

module.exports = { recordAudit, auditContext, queryAudit, auditFacets, getAuditEntry, lastDataChange, sanitize, HIGH_SIGNAL };
