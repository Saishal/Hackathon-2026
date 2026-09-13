const { AsyncLocalStorage } = require('node:async_hooks');
const { run } = require('./db');

// node-sqlite3 gives this process one shared connection. Two requests issuing BEGIN at once would
// either fail ("cannot start a transaction within a transaction") or fold one request's writes into
// the other's transaction, so a rollback could erase an unrelated audit record. Writes that must be
// atomic run through this queue one at a time; work already inside the queue runs inline.
const context = new AsyncLocalStorage();
let tail = Promise.resolve();

function enqueueWrite(work) {
  if (context.getStore()) return work();
  const result = tail.then(() => context.run(true, work));
  tail = result.catch(() => {});
  return result;
}

function withTransaction(work) {
  if (context.getStore()) return work();
  return enqueueWrite(async () => {
    await run('BEGIN IMMEDIATE');
    try {
      const value = await work();
      await run('COMMIT');
      return value;
    } catch (error) {
      await run('ROLLBACK').catch(() => {});
      throw error;
    }
  });
}

module.exports = { withTransaction, enqueueWrite };
