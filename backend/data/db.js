const path = require('path');
const sqlite3 = require('sqlite3').verbose();

// Resolves to backend/skillsight.db so existing databases keep working after this move.
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'skillsight.db');

const db = new sqlite3.Database(DB_PATH);

// SQLite ignores FOREIGN KEY clauses unless this is set per connection, so the
// schema's references are unenforced without it. Queued first on the connection.
db.run('PRAGMA foreign_keys = ON');

const run = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) {
        reject(err);
        return;
      }
      resolve(this);
    });
  });

const all = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(rows);
    });
  });

const get = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(row);
    });
  });

module.exports = { db, run, all, get, DB_PATH };
