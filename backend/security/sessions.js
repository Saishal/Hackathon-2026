const crypto = require('node:crypto');
const { run, get } = require('../data/db');
const { enqueueWrite } = require('../data/transactions');

// Server-side sessions: the browser holds a random 256-bit token in an HTTP-only cookie and the
// database stores only its SHA-256 hash, so a copied database cannot be replayed as a login.
// Sliding idle expiry is capped by an absolute lifetime. Logout and account changes delete rows,
// which revokes access immediately (the reason for sessions over stateless JWTs here).
const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');
const TOUCH_INTERVAL_MS = 60 * 1000;

async function createSession(userId, config, { userAgent = null, now = new Date(), persistent = true } = {}) {
  const token = crypto.randomBytes(32).toString('base64url');
  const lifetime = persistent ? config.sessionAbsoluteHours : Math.min(config.sessionShortHours ?? 8, config.sessionAbsoluteHours);
  const absolute = new Date(now.getTime() + lifetime * 3600 * 1000);
  const idle = new Date(Math.min(now.getTime() + config.sessionIdleMinutes * 60 * 1000, absolute.getTime()));
  await enqueueWrite(() => run(
    `INSERT INTO sessions (token_hash, user_id, created_at, last_seen_at, expires_at, absolute_expires_at, user_agent)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [hashToken(token), userId, now.toISOString(), now.toISOString(), idle.toISOString(), absolute.toISOString(),
      typeof userAgent === 'string' ? userAgent.slice(0, 200) : null],
  ));
  return { token, expiresAt: idle.toISOString(), absoluteExpiresAt: absolute.toISOString() };
}

async function resolveSession(token, config, now = new Date()) {
  if (typeof token !== 'string' || token.length < 32 || token.length > 128) return null;
  const tokenHash = hashToken(token);
  const row = await get(
    `SELECT s.last_seen_at, s.expires_at, s.absolute_expires_at,
            u.id, u.email, u.display_name, u.role, u.employee_id, u.disabled, e.name AS employee_name
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     LEFT JOIN employees e ON e.id = u.employee_id
     WHERE s.token_hash = ?`,
    [tokenHash],
  );
  if (!row) return null;

  const nowMs = now.getTime();
  if (row.disabled || nowMs >= Date.parse(row.expires_at) || nowMs >= Date.parse(row.absolute_expires_at)) {
    await enqueueWrite(() => run('DELETE FROM sessions WHERE token_hash = ?', [tokenHash]));
    return null;
  }

  let expiresAt = row.expires_at;
  if (nowMs - Date.parse(row.last_seen_at) > TOUCH_INTERVAL_MS) {
    expiresAt = new Date(Math.min(nowMs + config.sessionIdleMinutes * 60 * 1000, Date.parse(row.absolute_expires_at))).toISOString();
    await enqueueWrite(() => run('UPDATE sessions SET last_seen_at = ?, expires_at = ? WHERE token_hash = ?',
      [now.toISOString(), expiresAt, tokenHash]));
  }

  return {
    tokenHash,
    expiresAt,
    user: {
      id: row.id,
      email: row.email,
      displayName: row.display_name,
      role: row.role,
      employeeId: row.employee_id,
      employeeName: row.employee_name,
    },
  };
}

const destroySession = (tokenHash) => enqueueWrite(() => run('DELETE FROM sessions WHERE token_hash = ?', [tokenHash]));
const destroyUserSessions = (userId) => enqueueWrite(() => run('DELETE FROM sessions WHERE user_id = ?', [userId]));
const purgeExpiredSessions = (now = new Date()) => enqueueWrite(() => run(
  'DELETE FROM sessions WHERE expires_at <= ? OR absolute_expires_at <= ?', [now.toISOString(), now.toISOString()],
));

module.exports = { createSession, resolveSession, destroySession, destroyUserSessions, purgeExpiredSessions, hashToken };
