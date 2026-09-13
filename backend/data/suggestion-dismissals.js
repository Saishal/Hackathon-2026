const { run, all } = require('./db');

// Which suggestions a user has dismissed. Keys are stable per rule and record, so a dismissal
// survives re-evaluation; if the underlying fact changes the key changes and the suggestion returns.
const listDismissed = async (userId) => (await all('SELECT key, dismissed_at FROM suggestion_dismissals WHERE user_id = ?', [userId]))
  .map((row) => ({ key: row.key, dismissedAt: row.dismissed_at }));

const dismiss = (userId, key, now) => run(
  'INSERT INTO suggestion_dismissals (user_id, key, dismissed_at) VALUES (?, ?, ?) ON CONFLICT(user_id, key) DO UPDATE SET dismissed_at = excluded.dismissed_at',
  [userId, key, now],
);

const restore = (userId, key) => run('DELETE FROM suggestion_dismissals WHERE user_id = ? AND key = ?', [userId, key]);

module.exports = { listDismissed, dismiss, restore };
