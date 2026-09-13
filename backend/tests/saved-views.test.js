const test = require('node:test');
const assert = require('node:assert/strict');
const { useTempDatabase, startServer, signedIn } = require('./helpers/server');

useTempDatabase('saved-views');
const started = startServer();
test.after(async () => (await started).close());

test('saved views are private to the user, upsert by name, and are validated', async () => {
  const { base } = await started;
  const hr = await signedIn(base, 'hr');
  const created = await hr.post('/api/keystone/saved-views', { view: 'overview', name: 'Unowned critical', filters: { coverage: 'single', owner: 'unowned' } });
  assert.equal(created.status, 201);
  assert.deepEqual(created.body.filters, { coverage: 'single', owner: 'unowned' });

  const updated = await hr.post('/api/keystone/saved-views', { view: 'overview', name: 'Unowned critical', filters: { coverage: 'uncovered' } });
  assert.equal(updated.status, 201);
  assert.equal(updated.body.id, created.body.id, 'same name on the same page updates rather than duplicates');

  const mine = await hr.get('/api/keystone/saved-views?view=overview');
  assert.equal(mine.body.items.length, 1);
  assert.deepEqual(mine.body.items[0].filters, { coverage: 'uncovered' });

  const admin = await signedIn(base, 'admin');
  assert.equal((await admin.get('/api/keystone/saved-views?view=overview')).body.items.length, 0, 'another user does not see it');
  assert.equal((await admin.delete(`/api/keystone/saved-views/${created.body.id}`)).status, 404, 'and cannot delete it');

  assert.equal((await hr.post('/api/keystone/saved-views', { view: 'Overview!', name: 'x', filters: {} })).status, 400);
  assert.equal((await hr.post('/api/keystone/saved-views', { view: 'overview', name: 'x', filters: { nested: { a: 1 } } })).status, 400, 'filters are flat strings only');

  const before = (await admin.get('/api/keystone/audit-log?pageSize=1')).body.total;
  assert.equal((await hr.delete(`/api/keystone/saved-views/${created.body.id}`)).status, 204);
  assert.equal((await hr.get('/api/keystone/saved-views?view=overview')).body.items.length, 0);
  assert.equal((await admin.get('/api/keystone/audit-log?pageSize=1')).body.total, before, 'saved views are not audited');
});
