const { run, all, get } = require('./db');

// A saved view is a named set of filters for one page, private to the user who saved it. It is a
// personal preference: never shared, never audited, and never able to widen what the user may see,
// because filters only narrow data the server has already scoped.
const map = (row) => ({ id: row.id, view: row.view, name: row.name, filters: JSON.parse(row.filters), createdAt: row.created_at, updatedAt: row.updated_at });

const listSavedViews = async (userId, view) => (await all(
  `SELECT * FROM saved_views WHERE user_id = ? ${view ? 'AND view = ?' : ''} ORDER BY view, name`, view ? [userId, view] : [userId],
)).map(map);

async function saveView(userId, { view, name, filters }, now) {
  await run(
    `INSERT INTO saved_views (user_id, view, name, filters, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, view, name) DO UPDATE SET filters = excluded.filters, updated_at = excluded.updated_at`,
    [userId, view, name, JSON.stringify(filters), now, now],
  );
  return map(await get('SELECT * FROM saved_views WHERE user_id = ? AND view = ? AND name = ?', [userId, view, name]));
}

const deleteView = async (userId, id) => (await run('DELETE FROM saved_views WHERE id = ? AND user_id = ?', [id, userId])).changes;

module.exports = { listSavedViews, saveView, deleteView };
