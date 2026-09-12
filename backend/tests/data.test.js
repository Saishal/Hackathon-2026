const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// Point the data layer at a throwaway file before it opens its connection.
const DB_FILE = path.join(os.tmpdir(), `keystone-data-test-${process.pid}.db`);
fs.rmSync(DB_FILE, { force: true });
process.env.DB_PATH = DB_FILE;

const data = require('../data');

const ready = data.initializeDatabase();

test.after(() => {
  data.db.close();
});

test('fresh database seeds the documented demo fixture', async () => {
  await ready;
  const snapshot = await data.getHeatmapData();

  assert.equal(snapshot.employees.length, 20);
  assert.equal(snapshot.skills.length, 16);

  const billing = snapshot.skills.find((skill) => skill.name === 'Legacy Billing Recovery');
  const proficiencyFor = (name) => {
    const employee = snapshot.employees.find((candidate) => candidate.name === name);
    return snapshot.matrix.find(
      (edge) => edge.employeeId === employee.id && edge.skillId === billing.id,
    )?.proficiency;
  };

  assert.equal(proficiencyFor('Liam Chen'), 5);
  assert.equal(proficiencyFor('Mason Green'), 2);
});

test('seeded ids are integers and proficiency stays within 1-5', async () => {
  await ready;
  const snapshot = await data.getHeatmapData();

  for (const employee of snapshot.employees) {
    assert.ok(Number.isInteger(employee.id));
  }

  for (const edge of snapshot.matrix) {
    assert.ok(Number.isInteger(edge.employeeId));
    assert.ok(Number.isInteger(edge.skillId));
    assert.ok(edge.proficiency >= 1 && edge.proficiency <= 5);
  }
});

test('foreign keys are enforced on the connection', async () => {
  await ready;
  const [row] = await data.all('PRAGMA foreign_keys');

  assert.equal(row.foreign_keys, 1);
});

test('foreign keys block an orphan employee_skills row', async () => {
  await ready;

  await assert.rejects(
    () => data.run('INSERT INTO employee_skills (employee_id, skill_id, proficiency) VALUES (?, ?, ?)', [9999, 9999, 3]),
  );
});

test('unknown skill ids are rejected with a client error', async () => {
  await ready;

  await assert.rejects(() => data.assertSkillIdsExist([9999]), { status: 400 });
});

test('a rejected target update leaves existing targets untouched', async () => {
  await ready;
  const before = await data.getFutureSkillTargets();
  const valid = before[0];

  await assert.rejects(
    () => data.replaceFutureSkillTargets([
      { id: valid.id, targetPeople: valid.targetPeople + 3 },
      { id: 9999, targetPeople: 1 },
    ]),
    { status: 400 },
  );

  const after = await data.getFutureSkillTargets();
  assert.deepEqual(after, before);
});

test('valid target updates persist and are read back', async () => {
  await ready;
  const before = await data.getFutureSkillTargets();
  const target = before[0];

  await data.replaceFutureSkillTargets([{ id: target.id, targetPeople: target.targetPeople + 2 }]);

  const after = await data.getFutureSkillTargets();
  const updated = after.find((entry) => entry.id === target.id);

  assert.equal(updated.targetPeople, target.targetPeople + 2);
});

test('gap analysis reflects a persisted target change', async () => {
  await ready;
  const targets = await data.getFutureSkillTargets();
  const target = targets[0];

  await data.replaceFutureSkillTargets([{ id: target.id, targetPeople: 99 }]);

  const gaps = await data.getGapAnalysis();
  const entry = gaps.find((row) => row.id === target.id);

  assert.equal(entry.targetPeople, 99);
  assert.equal(entry.gap, 99 - entry.currentPeople);
});
