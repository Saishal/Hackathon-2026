const { run, all, get } = require('./db');
const { withTransaction } = require('./transactions');
const { recordAudit } = require('./audit');
const { loadWorkforce } = require('./workforce');
const { listScenarios } = require('./scenarios');
const { listUsers } = require('./users');
const { getOrganization } = require('./organization');
const { evaluateDataQuality, countEvaluatedRecords } = require('../services/data-quality');
const { today } = require('../services/clock');
const { conflict, notFound } = require('../errors');

// Persists the lifecycle of deterministic issues. Detection is recomputed from the data on every read;
// what is stored is when an issue was first seen, who acknowledged it, and when it stopped being true.
// An issue that is no longer detected resolves automatically; one that returns after resolution reopens.
const RESOLVED_VISIBLE_DAYS = 30;

const SELECT = `
  SELECT dq.*, acknowledger.display_name AS acknowledged_by_name
  FROM data_quality_issues dq
  LEFT JOIN users acknowledger ON acknowledger.id = dq.acknowledged_by`;

const mapIssue = (row) => ({
  fingerprint: row.fingerprint,
  ruleCode: row.rule_code,
  severity: row.severity,
  title: row.title,
  explanation: row.explanation,
  entityType: row.entity_type,
  entityId: row.entity_id,
  entityLabel: row.entity_label,
  suggestedAction: row.suggested_action,
  employeeIds: JSON.parse(row.employee_ids_json),
  link: row.link_json ? JSON.parse(row.link_json) : null,
  status: row.status,
  firstDetectedAt: row.first_detected_at,
  lastDetectedAt: row.last_detected_at,
  acknowledgedBy: row.acknowledged_by ? { id: row.acknowledged_by, name: row.acknowledged_by_name } : null,
  acknowledgedAt: row.acknowledged_at,
  acknowledgementNote: row.acknowledgement_note,
  resolvedAt: row.resolved_at,
});

const SEVERITY_ORDER = { critical: 0, warning: 1, info: 2 };
const STATUS_ORDER = { open: 0, acknowledged: 1, resolved: 2 };

async function refreshDataQuality({ todayDate = today() } = {}) {
  const [workforce, scenarios, changeRequests, users, external, organization] = await Promise.all([
    loadWorkforce(),
    listScenarios(),
    all(`SELECT type, status, subject_employee_id AS subjectEmployeeId, target_key AS targetKey, target_label AS targetLabel
         FROM change_requests WHERE status = 'submitted'`),
    listUsers(),
    all('SELECT id FROM employees WHERE reports_externally = 1'),
    getOrganization(),
  ]);
  const detected = evaluateDataQuality({
    workforce, scenarios, changeRequests, users, organization, today: todayDate,
    externalReporting: new Set(external.map((row) => row.id)),
  });

  const rows = await withTransaction(async () => {
    const now = new Date().toISOString();
    const stored = new Map((await all('SELECT * FROM data_quality_issues')).map((row) => [row.fingerprint, row]));
    const seen = new Set();

    for (const issue of detected) {
      seen.add(issue.fingerprint);
      const row = stored.get(issue.fingerprint);
      const content = [issue.ruleCode, issue.severity, issue.title, issue.explanation, issue.entityType, issue.entityId, issue.entityLabel,
        issue.suggestedAction, JSON.stringify(issue.employeeIds), issue.link ? JSON.stringify(issue.link) : null];
      if (!row) {
        await run(
          `INSERT INTO data_quality_issues (rule_code, severity, title, explanation, entity_type, entity_id, entity_label, suggested_action,
             employee_ids_json, link_json, fingerprint, status, first_detected_at, last_detected_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)`,
          [...content, issue.fingerprint, now, now],
        );
      } else if (row.status === 'resolved') {
        await run(
          `UPDATE data_quality_issues SET rule_code = ?, severity = ?, title = ?, explanation = ?, entity_type = ?, entity_id = ?, entity_label = ?,
             suggested_action = ?, employee_ids_json = ?, link_json = ?, status = 'open', last_detected_at = ?, resolved_at = NULL,
             acknowledged_by = NULL, acknowledged_at = NULL, acknowledgement_note = NULL
           WHERE fingerprint = ?`,
          [...content, now, issue.fingerprint],
        );
        await recordAudit({
          action: 'data_quality.reopened', entityType: 'data_quality_issue', entityId: issue.fingerprint,
          entityLabel: `${issue.title} · ${issue.entityLabel}`, source: 'system',
          summary: `Data-quality issue detected again: ${issue.title} (${issue.entityLabel})`,
          before: { status: 'resolved' }, after: { status: 'open' }, metadata: { ruleCode: issue.ruleCode, severity: issue.severity },
        });
      } else {
        await run(
          `UPDATE data_quality_issues SET rule_code = ?, severity = ?, title = ?, explanation = ?, entity_type = ?, entity_id = ?, entity_label = ?,
             suggested_action = ?, employee_ids_json = ?, link_json = ?, last_detected_at = ?
           WHERE fingerprint = ?`,
          [...content, now, issue.fingerprint],
        );
      }
    }

    for (const row of stored.values()) {
      if (seen.has(row.fingerprint) || row.status === 'resolved') continue;
      await run("UPDATE data_quality_issues SET status = 'resolved', resolved_at = ? WHERE fingerprint = ?", [now, row.fingerprint]);
      await recordAudit({
        action: 'data_quality.resolved', entityType: 'data_quality_issue', entityId: row.fingerprint,
        entityLabel: `${row.title} · ${row.entity_label}`, source: 'system',
        summary: `Data-quality issue no longer detected: ${row.title} (${row.entity_label})`,
        before: { status: row.status }, after: { status: 'resolved' }, metadata: { ruleCode: row.rule_code, severity: row.severity },
      });
    }

    return all(SELECT);
  });

  const cutoff = new Date(Date.now() - RESOLVED_VISIBLE_DAYS * 24 * 3600 * 1000).toISOString();
  const issues = rows.map(mapIssue)
    .filter((issue) => issue.status !== 'resolved' || issue.resolvedAt >= cutoff)
    .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
      || a.ruleCode.localeCompare(b.ruleCode) || String(a.entityLabel).localeCompare(String(b.entityLabel)));

  return {
    issues,
    evaluatedAt: new Date().toISOString(),
    evaluatedRecords: countEvaluatedRecords(workforce, scenarios),
    workforce,
    organization,
  };
}

async function setAcknowledgement(fingerprint, { acknowledge, note }, user, ctx) {
  return withTransaction(async () => {
    const row = await get('SELECT * FROM data_quality_issues WHERE fingerprint = ?', [fingerprint]);
    if (!row) throw notFound('The data-quality issue');
    const expected = acknowledge ? 'open' : 'acknowledged';
    if (row.status !== expected) {
      throw conflict(acknowledge ? `Only open issues can be acknowledged; this one is ${row.status}.` : 'Only acknowledged issues can be reopened.', 'invalid_status');
    }
    const now = new Date().toISOString();
    if (acknowledge) {
      await run("UPDATE data_quality_issues SET status = 'acknowledged', acknowledged_by = ?, acknowledged_at = ?, acknowledgement_note = ? WHERE fingerprint = ?",
        [user.id, now, note.trim(), fingerprint]);
    } else {
      await run("UPDATE data_quality_issues SET status = 'open', acknowledged_by = NULL, acknowledged_at = NULL, acknowledgement_note = NULL WHERE fingerprint = ?",
        [fingerprint]);
    }
    await recordAudit({
      ...ctx,
      action: acknowledge ? 'data_quality.acknowledged' : 'data_quality.reopened',
      entityType: 'data_quality_issue', entityId: fingerprint, entityLabel: `${row.title} · ${row.entity_label}`,
      summary: acknowledge
        ? `${user.displayName} acknowledged "${row.title}" for ${row.entity_label}`
        : `${user.displayName} reopened "${row.title}" for ${row.entity_label}`,
      before: { status: row.status, note: row.acknowledgement_note },
      after: { status: acknowledge ? 'acknowledged' : 'open', note: acknowledge ? note.trim() : null },
      metadata: { ruleCode: row.rule_code, severity: row.severity },
    });
    return mapIssue(await get(`${SELECT} WHERE dq.fingerprint = ?`, [fingerprint]));
  });
}

const acknowledgeIssue = (fingerprint, note, user, ctx) => setAcknowledgement(fingerprint, { acknowledge: true, note }, user, ctx);
const reopenIssue = (fingerprint, user, ctx) => setAcknowledgement(fingerprint, { acknowledge: false }, user, ctx);

module.exports = { refreshDataQuality, acknowledgeIssue, reopenIssue };
