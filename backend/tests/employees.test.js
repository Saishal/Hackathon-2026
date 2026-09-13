const test = require('node:test');
const assert = require('node:assert/strict');
const { useTempDatabase, startServer, signedIn, client, ACCOUNTS } = require('./helpers/server');

useTempDatabase('employees');
const started = startServer();
test.after(async () => (await started).close());

const byName = (items, name) => items.find((item) => item.name === name);

test('an admin can add an employee, who then appears in the workforce, risk and directory', async () => {
  const { base } = await started;
  const admin = await signedIn(base, 'admin');
  const before = (await admin.get('/api/keystone/workforce')).body.employees.length;

  const created = await admin.post('/api/keystone/employees', {
    name: 'Noor Haddad', role: 'Backend Engineer', department: 'Engineering', startDate: '2026-03-02', mentoringHoursPerMonth: 2,
  });
  assert.equal(created.status, 201);
  assert.ok(Number.isInteger(created.body.id));
  assert.equal(created.body.employmentStatus, 'active');
  assert.equal(created.body.startDate, '2026-03-02');

  const workforce = (await admin.get('/api/keystone/workforce')).body;
  assert.equal(workforce.employees.length, before + 1);
  assert.ok(byName(workforce.employees, 'Noor Haddad'));

  const directory = (await admin.get('/api/keystone/employees')).body.items;
  const row = byName(directory, 'Noor Haddad');
  assert.equal(row.recordedSkills, 0);
  assert.equal(row.directReports, 0);
  assert.equal(row.account, null);

  const audit = (await admin.get('/api/keystone/audit-log?entityType=employee&q=Noor%20Haddad')).body;
  const entry = audit.items.find((item) => item.actionType === 'employee.created');
  assert.ok(entry, 'creation is audited');
  assert.match(entry.summary, /added Noor Haddad as Backend Engineer/);
  assert.equal(entry.actor.name, 'Keystone Administrator');
});

test('creation is validated: duplicates, undefined roles, unknown or archived managers, future start dates', async () => {
  const { base } = await started;
  const admin = await signedIn(base, 'admin');
  const directory = (await admin.get('/api/keystone/employees')).body.items;
  const liam = byName(directory, 'Liam Chen');

  const duplicate = await admin.post('/api/keystone/employees', { name: 'Liam Chen', role: 'Backend Engineer', department: 'Engineering' });
  assert.equal(duplicate.status, 409);
  assert.equal(duplicate.body.code, 'duplicate_name');

  const badRole = await admin.post('/api/keystone/employees', { name: 'Test Person', role: 'Backend Enginer', department: 'Engineering' });
  assert.equal(badRole.status, 400);
  assert.equal(badRole.body.details[0].field, 'role');

  const badManager = await admin.post('/api/keystone/employees', { name: 'Test Person', role: 'Backend Engineer', department: 'Engineering', managerId: 99999 });
  assert.equal(badManager.status, 400);
  assert.equal(badManager.body.details[0].code, 'unknown_reference');

  const future = await admin.post('/api/keystone/employees', { name: 'Test Person', role: 'Backend Engineer', department: 'Engineering', startDate: '2099-01-01' });
  assert.equal(future.status, 400);
  assert.equal(future.body.details[0].code, 'date_in_future');

  const unknownField = await admin.post('/api/keystone/employees', { name: 'Test Person', role: 'Backend Engineer', department: 'Engineering', salary: 1 });
  assert.equal(unknownField.status, 400);

  assert.ok(liam);
  const hr = await signedIn(base, 'hr');
  assert.equal((await hr.post('/api/keystone/employees', { name: 'Test Person', role: 'Backend Engineer', department: 'Engineering' })).status, 403);
});

test('archiving removes a person from every score, disables their account, and is reversible', async () => {
  const { base } = await started;
  const admin = await signedIn(base, 'admin');
  const directory = (await admin.get('/api/keystone/employees')).body.items;
  const mason = byName(directory, 'Mason Green');
  assert.ok(mason.account, 'Mason has the demo employee account linked');

  const impact = (await admin.get(`/api/keystone/employees/${mason.id}/impact`)).body;
  assert.equal(impact.employee.name, 'Mason Green');
  assert.equal(impact.account.email, ACCOUNTS.employee);
  assert.ok(Array.isArray(impact.coverage.affectedSkills));

  // Mason's own session must die when he is archived.
  const masonSession = await client(base).login(ACCOUNTS.employee);
  assert.equal(masonSession.status, 200);
  const masonClient = client(base);
  masonClient.cookie = masonSession.headers.get('set-cookie');

  const archived = await admin.post(`/api/keystone/employees/${mason.id}/archive`, {});
  assert.equal(archived.status, 200);
  assert.equal(archived.body.employee.employmentStatus, 'archived');
  assert.ok(archived.body.employee.archivedAt);
  assert.equal(archived.body.accountDisabled, true);

  const workforce = (await admin.get('/api/keystone/workforce')).body;
  assert.equal(byName(workforce.employees, 'Mason Green'), undefined, 'archived people leave the snapshot');
  assert.ok(workforce.matrix.every((edge) => edge.employeeId !== mason.id), 'and their evidence no longer counts');
  const risks = (await admin.get('/api/keystone/employee-risks')).body;
  assert.equal(risks.employees.find((entry) => entry.id === mason.id), undefined);

  const users = (await admin.get('/api/keystone/users')).body.items;
  assert.equal(users.find((user) => user.id === mason.account.id).disabled, true);
  assert.equal((await client(base).login(ACCOUNTS.employee)).status, 401, 'a disabled account cannot sign in');

  const again = await admin.post(`/api/keystone/employees/${mason.id}/archive`, {});
  assert.equal(again.status, 409);

  const restored = await admin.post(`/api/keystone/employees/${mason.id}/restore`, {});
  assert.equal(restored.status, 200);
  assert.equal(restored.body.employee.employmentStatus, 'active');
  assert.equal(restored.body.accountStillDisabled, true, 'restoring the person does not silently re-enable sign-in');
  assert.ok(byName((await admin.get('/api/keystone/workforce')).body.employees, 'Mason Green'));

  const audit = (await admin.get('/api/keystone/audit-log?entityType=employee&q=Mason%20Green')).body.items.map((item) => item.actionType);
  assert.ok(audit.includes('employee.archived'));
  assert.ok(audit.includes('employee.restored'));
});

test('archiving a manager requires a new manager for their reports, and applies it in one transaction', async () => {
  const { base } = await started;
  const admin = await signedIn(base, 'admin');
  const directory = (await admin.get('/api/keystone/employees')).body.items;
  const rachel = byName(directory, 'Rachel Moreno');
  assert.ok(rachel.directReports > 0, 'Rachel manages people in the demo data');
  const jack = byName(directory, 'Jack Turner');

  const blocked = await admin.post(`/api/keystone/employees/${rachel.id}/archive`, {});
  assert.equal(blocked.status, 400);
  assert.equal(blocked.body.details[0].code, 'reports_need_manager');

  const self = await admin.post(`/api/keystone/employees/${rachel.id}/archive`, { reassignReportsTo: rachel.id });
  assert.equal(self.status, 400);

  const moved = await admin.post(`/api/keystone/employees/${rachel.id}/archive`, { reassignReportsTo: jack.id });
  assert.equal(moved.status, 200);
  assert.equal(moved.body.reassignedReports, rachel.directReports);

  const after = (await admin.get('/api/keystone/employees')).body.items;
  assert.equal(byName(after, 'Rachel Moreno').employmentStatus, 'archived');
  assert.equal(byName(after, 'Jack Turner').directReports, jack.directReports + rachel.directReports);
  assert.ok(after.every((row) => row.managerId !== rachel.id || row.employmentStatus === 'archived'), 'nobody active still reports to an archived manager');

  await admin.post(`/api/keystone/employees/${rachel.id}/restore`, {});
});

test('edits keep the reporting line sound and record what changed', async () => {
  const { base } = await started;
  const admin = await signedIn(base, 'admin');
  const directory = (await admin.get('/api/keystone/employees')).body.items;
  const noor = byName(directory, 'Noor Haddad');
  const liam = byName(directory, 'Liam Chen');

  const ok = await admin.patch(`/api/keystone/employees/${noor.id}`, { managerId: liam.id, startDate: '2026-02-01' });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.managerId, liam.id);
  assert.equal(ok.body.startDate, '2026-02-01');

  const loop = await admin.patch(`/api/keystone/employees/${liam.id}`, { managerId: noor.id });
  assert.equal(loop.status, 400);
  assert.equal(loop.body.details[0].code, 'reporting_cycle');

  await admin.post(`/api/keystone/employees/${noor.id}/archive`, {});
  const archivedManager = await admin.patch(`/api/keystone/employees/${liam.id}`, { managerId: noor.id });
  assert.equal(archivedManager.status, 400);
  assert.match(archivedManager.body.details[0].message, /archived/);
});

test('restoring a person whose manager was archived clears the reporting line and says so', async () => {
  const { base } = await started;
  const admin = await signedIn(base, 'admin');
  const list = (await admin.get('/api/keystone/employees')).body.items;
  const manager = list.find((item) => item.employmentStatus === 'active' && item.directReports === 0 && item.managerId !== null);
  const report = list.find((item) => item.id !== manager.id && item.employmentStatus === 'active' && item.directReports === 0 && item.managerId !== null);
  assert.equal((await admin.patch(`/api/keystone/employees/${report.id}`, { managerId: manager.id })).status, 200);
  assert.equal((await admin.post(`/api/keystone/employees/${report.id}/archive`, {})).status, 200);
  assert.equal((await admin.post(`/api/keystone/employees/${manager.id}/archive`, {})).status, 200);
  const restored = await admin.post(`/api/keystone/employees/${report.id}/restore`, {});
  assert.equal(restored.status, 200);
  assert.equal(restored.body.managerCleared, true);
  assert.equal(restored.body.previousManagerName, manager.name);
  assert.equal(restored.body.employee.managerId, null);
  // A restored person with an active manager keeps the line.
  assert.equal((await admin.post(`/api/keystone/employees/${manager.id}/restore`, {})).body.managerCleared, false);
});

test('an account cannot be created for or linked to an archived employee', async () => {
  const { base } = await started;
  const admin = await signedIn(base, 'admin');
  const list = (await admin.get('/api/keystone/employees')).body.items;
  const person = list.find((item) => item.employmentStatus === 'active' && item.directReports === 0 && item.account === null);
  assert.equal((await admin.post(`/api/keystone/employees/${person.id}/archive`, {})).status, 200);
  const created = await admin.post('/api/keystone/users', { email: 'archived.link@keystone.demo', displayName: person.name, role: 'employee', employeeId: person.id, password: 'Another-Strong-Pass-1!' });
  assert.equal(created.status, 400);
  assert.equal(created.body.details[0].field, 'employeeId');
  assert.match(created.body.details[0].message, /archived/);
  await admin.post(`/api/keystone/employees/${person.id}/restore`, {});
});

test('promoting one of the reports to be the new manager never leaves them reporting to themselves', async () => {
  const { base } = await started;
  const admin = await signedIn(base, 'admin');
  const list = (await admin.get('/api/keystone/employees')).body.items;
  const manager = list.find((item) => item.employmentStatus === 'active' && item.directReports >= 2);
  const reports = list.filter((item) => item.managerId === manager.id && item.employmentStatus === 'active');
  const promoted = reports[0];
  const result = await admin.post(`/api/keystone/employees/${manager.id}/archive`, { reassignReportsTo: promoted.id });
  assert.equal(result.status, 200, JSON.stringify(result.body));
  assert.equal(result.body.promotedReport, true);
  assert.equal(result.body.reassignedReports, reports.length - 1);
  const after = (await admin.get('/api/keystone/employees')).body.items;
  const lead = after.find((item) => item.id === promoted.id);
  assert.notEqual(lead.managerId, lead.id, 'the promoted report reports to themselves');
  assert.equal(lead.managerId, manager.managerId);
  assert.equal(lead.reportsExternally, manager.reportsExternally);
  for (const sibling of reports.slice(1)) assert.equal(after.find((item) => item.id === sibling.id).managerId, promoted.id);
  await admin.post(`/api/keystone/employees/${manager.id}/restore`, {});
});
