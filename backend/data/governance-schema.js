const { run, all } = require('./db');

// Governance tables and columns. Every step is additive, so an existing database upgrades in place on
// startup without deleting anything. Each migration runs once, inside a transaction, and is recorded
// in schema_migrations; the CREATE ... IF NOT EXISTS guards keep a partially upgraded file safe too.

async function addColumnIfMissing(table, column, definition) {
  const columns = await all(`PRAGMA table_info(${table})`);
  if (!columns.some((entry) => entry.name === column)) {
    await run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

const MIGRATIONS = [
  ['governance-001-identity', [
    `CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      display_name TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('admin', 'hr', 'manager', 'employee')),
      employee_id INTEGER REFERENCES employees(id),
      password_hash TEXT NOT NULL,
      disabled INTEGER NOT NULL DEFAULT 0 CHECK (disabled IN (0, 1)),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      password_changed_at TEXT NOT NULL,
      last_login_at TEXT
    )`,
    'CREATE UNIQUE INDEX IF NOT EXISTS users_employee_unique ON users(employee_id) WHERE employee_id IS NOT NULL',
    `CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      absolute_expires_at TEXT NOT NULL,
      user_agent TEXT
    )`,
    'CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id)',
  ]],
  ['governance-002-audit', [
    `CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      occurred_at TEXT NOT NULL,
      actor_user_id INTEGER REFERENCES users(id),
      actor_name TEXT NOT NULL,
      actor_role TEXT,
      action_type TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT,
      entity_label TEXT,
      summary TEXT NOT NULL,
      before_json TEXT,
      after_json TEXT,
      metadata_json TEXT,
      source TEXT NOT NULL CHECK (source IN ('ui', 'api', 'seed', 'system')),
      request_id TEXT,
      high_signal INTEGER NOT NULL DEFAULT 0 CHECK (high_signal IN (0, 1))
    )`,
    'CREATE INDEX IF NOT EXISTS audit_log_occurred ON audit_log(occurred_at DESC, id DESC)',
    'CREATE INDEX IF NOT EXISTS audit_log_actor ON audit_log(actor_user_id, occurred_at DESC)',
    'CREATE INDEX IF NOT EXISTS audit_log_action ON audit_log(action_type, occurred_at DESC)',
    'CREATE INDEX IF NOT EXISTS audit_log_entity ON audit_log(entity_type, entity_id, occurred_at DESC)',
    'CREATE INDEX IF NOT EXISTS audit_log_high_signal ON audit_log(high_signal, occurred_at DESC)',
    // Append-only at the storage layer, not just in the API: no application path can rewrite history.
    `CREATE TRIGGER IF NOT EXISTS audit_log_no_update BEFORE UPDATE ON audit_log
     BEGIN SELECT RAISE(ABORT, 'audit_log is append-only'); END`,
    `CREATE TRIGGER IF NOT EXISTS audit_log_no_delete BEFORE DELETE ON audit_log
     BEGIN SELECT RAISE(ABORT, 'audit_log is append-only'); END`,
  ]],
  ['governance-003-change-requests', [
    `CREATE TABLE IF NOT EXISTS change_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL CHECK (type IN ('employee_skill', 'future_requirement', 'resource')),
      operation TEXT NOT NULL CHECK (operation IN ('upsert', 'create', 'update', 'remove')),
      status TEXT NOT NULL CHECK (status IN ('draft', 'submitted', 'approved', 'rejected', 'cancelled')),
      subject_employee_id INTEGER REFERENCES employees(id),
      target_key TEXT,
      target_label TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      baseline_json TEXT,
      justification TEXT,
      requested_by INTEGER NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      submitted_at TEXT,
      reviewed_by INTEGER REFERENCES users(id),
      reviewed_at TEXT,
      reviewer_comment TEXT,
      cancelled_at TEXT,
      applied_json TEXT
    )`,
    'CREATE INDEX IF NOT EXISTS change_requests_status ON change_requests(status, submitted_at DESC)',
    'CREATE INDEX IF NOT EXISTS change_requests_requester ON change_requests(requested_by, created_at DESC)',
    'CREATE INDEX IF NOT EXISTS change_requests_subject ON change_requests(subject_employee_id, status)',
  ]],
  ['governance-004-quality-planning', [
    `CREATE TABLE IF NOT EXISTS data_quality_issues (
      fingerprint TEXT PRIMARY KEY,
      rule_code TEXT NOT NULL,
      severity TEXT NOT NULL CHECK (severity IN ('critical', 'warning', 'info')),
      title TEXT NOT NULL,
      explanation TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT,
      entity_label TEXT,
      suggested_action TEXT NOT NULL,
      employee_ids_json TEXT NOT NULL DEFAULT '[]',
      link_json TEXT,
      status TEXT NOT NULL CHECK (status IN ('open', 'acknowledged', 'resolved')),
      first_detected_at TEXT NOT NULL,
      last_detected_at TEXT NOT NULL,
      acknowledged_by INTEGER REFERENCES users(id),
      acknowledged_at TEXT,
      acknowledgement_note TEXT,
      resolved_at TEXT
    )`,
    'CREATE INDEX IF NOT EXISTS data_quality_status ON data_quality_issues(status, severity)',
    `CREATE TABLE IF NOT EXISTS risk_acknowledgements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      risk_type TEXT NOT NULL CHECK (risk_type IN ('skill', 'employee')),
      entity_id INTEGER NOT NULL,
      entity_label TEXT NOT NULL,
      owner_user_id INTEGER NOT NULL REFERENCES users(id),
      note TEXT NOT NULL,
      due_date TEXT NOT NULL,
      next_review_date TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('active', 'closed')),
      created_by INTEGER NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      closed_by INTEGER REFERENCES users(id),
      closed_at TEXT
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS risk_acknowledgements_active
     ON risk_acknowledgements(risk_type, entity_id) WHERE status = 'active'`,
    `CREATE TABLE IF NOT EXISTS scenarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      horizon_months INTEGER NOT NULL CHECK (horizon_months IN (0, 12, 36, 60)),
      departures_json TEXT NOT NULL,
      interventions_json TEXT NOT NULL,
      include_pending INTEGER NOT NULL DEFAULT 0 CHECK (include_pending IN (0, 1)),
      created_by INTEGER NOT NULL REFERENCES users(id),
      updated_by INTEGER NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    )`,
    'CREATE INDEX IF NOT EXISTS scenarios_active ON scenarios(deleted_at, updated_at DESC)',
    `CREATE TABLE IF NOT EXISTS organization_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      name TEXT NOT NULL,
      environment TEXT NOT NULL CHECK (environment IN ('demo', 'production')),
      plan_start_date TEXT NOT NULL,
      evidence_stale_months INTEGER NOT NULL CHECK (evidence_stale_months BETWEEN 1 AND 60),
      updated_at TEXT NOT NULL,
      updated_by INTEGER REFERENCES users(id)
    )`,
  ]],
  ['governance-005-relationships', [
    // Null manager means unknown unless reports_externally says the manager sits outside this dataset.
    () => addColumnIfMissing('employees', 'manager_id', 'INTEGER REFERENCES employees(id)'),
    () => addColumnIfMissing('employees', 'reports_externally', 'INTEGER NOT NULL DEFAULT 0 CHECK (reports_externally IN (0, 1))'),
    'CREATE INDEX IF NOT EXISTS employees_manager ON employees(manager_id)',
    // Who provides a catalogue entry; a verified entry should name a provider or a URL.
    () => addColumnIfMissing('resources', 'provider', 'TEXT'),
  ]],
];

async function runGovernanceMigrations() {
  await run('CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL)');
  const applied = new Set((await all('SELECT id FROM schema_migrations')).map((row) => row.id));

  for (const [id, steps] of MIGRATIONS) {
    if (applied.has(id)) continue;
    await run('BEGIN IMMEDIATE');
    try {
      for (const step of steps) {
        if (typeof step === 'string') await run(step); else await step();
      }
      await run('INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)', [id, new Date().toISOString()]);
      await run('COMMIT');
    } catch (error) {
      await run('ROLLBACK');
      throw error;
    }
  }
}

module.exports = { runGovernanceMigrations, MIGRATION_IDS: MIGRATIONS.map(([id]) => id) };
