const { run, all, get } = require('./db');
const { enqueueWrite } = require('./transactions');
const { hashPassword } = require('../security/passwords');

// User accounts. Password hashes stay inside this module: nothing it returns to routes includes one,
// except findLoginCandidate, which only the login handler uses to verify a password.
const SELECT = `
  SELECT u.id, u.email, u.display_name, u.role, u.employee_id, e.name AS employee_name, u.disabled,
         u.created_at, u.updated_at, u.last_login_at
  FROM users u LEFT JOIN employees e ON e.id = u.employee_id`;

const mapUser = (row) => row && ({
  id: row.id,
  email: row.email,
  displayName: row.display_name,
  role: row.role,
  employeeId: row.employee_id,
  employeeName: row.employee_name ?? null,
  disabled: row.disabled === 1,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  lastLoginAt: row.last_login_at,
});

const normalizeEmail = (email) => String(email).trim().toLowerCase();

const listUsers = async () => (await all(`${SELECT} ORDER BY u.role, u.display_name`)).map(mapUser);
const getUser = async (id) => mapUser(await get(`${SELECT} WHERE u.id = ?`, [id]));
const getUserByEmail = async (email) => mapUser(await get(`${SELECT} WHERE u.email = ?`, [normalizeEmail(email)]));
const getUserByEmployee = async (employeeId) => mapUser(await get(`${SELECT} WHERE u.employee_id = ?`, [employeeId]));

async function findLoginCandidate(email) {
  const row = await get(`${SELECT.replace('u.last_login_at', 'u.last_login_at, u.password_hash')} WHERE u.email = ?`, [normalizeEmail(email)]);
  return row ? { user: mapUser(row), passwordHash: row.password_hash } : null;
}

async function createUser({ email, displayName, role, employeeId = null, password }) {
  const passwordHash = await hashPassword(password);
  const now = new Date().toISOString();
  const { lastID } = await enqueueWrite(() => run(
    `INSERT INTO users (email, display_name, role, employee_id, password_hash, disabled, created_at, updated_at, password_changed_at)
     VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)`,
    [normalizeEmail(email), displayName.trim(), role, employeeId, passwordHash, now, now, now],
  ));
  return getUser(lastID);
}

async function updateUser(id, { displayName, role, employeeId, disabled }) {
  const sets = [];
  const params = [];
  if (displayName !== undefined) { sets.push('display_name = ?'); params.push(displayName.trim()); }
  if (role !== undefined) { sets.push('role = ?'); params.push(role); }
  if (employeeId !== undefined) { sets.push('employee_id = ?'); params.push(employeeId); }
  if (disabled !== undefined) { sets.push('disabled = ?'); params.push(disabled ? 1 : 0); }
  if (sets.length > 0) {
    sets.push('updated_at = ?');
    params.push(new Date().toISOString(), id);
    await enqueueWrite(() => run(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`, params));
  }
  return getUser(id);
}

async function setPassword(id, password) {
  const passwordHash = await hashPassword(password);
  const now = new Date().toISOString();
  await enqueueWrite(() => run('UPDATE users SET password_hash = ?, password_changed_at = ?, updated_at = ? WHERE id = ?',
    [passwordHash, now, now, id]));
}

const recordLogin = (id) => enqueueWrite(() => run('UPDATE users SET last_login_at = ? WHERE id = ?', [new Date().toISOString(), id]));

// People who can own a risk acknowledgement: active accounts with a planning or leadership role.
async function assignableOwners() {
  const rows = await all(`${SELECT} WHERE u.disabled = 0 AND u.role IN ('admin', 'hr', 'manager') ORDER BY u.display_name`);
  return rows.map(mapUser).map(({ id, displayName, role }) => ({ id, displayName, role }));
}

const countActiveAdmins = async () => (await get("SELECT COUNT(*) AS count FROM users WHERE role = 'admin' AND disabled = 0")).count;

module.exports = {
  normalizeEmail, listUsers, getUser, getUserByEmail, getUserByEmployee, findLoginCandidate,
  createUser, updateUser, setPassword, recordLogin, assignableOwners, countActiveAdmins,
};
