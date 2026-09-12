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

test('every skill has a persisted requirements row', async () => {
  await ready;
  const snapshot = await data.getHeatmapData();
  const [row] = await data.all('SELECT COUNT(*) AS count FROM skill_requirements');

  assert.equal(row.count, snapshot.skills.length);
});

test('loadWorkforce serves criticality from the database, not hardcoded values', async () => {
  await ready;
  await data.run(
    "UPDATE skill_requirements SET criticality = 1 WHERE skill_id = (SELECT id FROM skills WHERE name = 'Legacy Billing Recovery')",
  );

  const workforce = await data.loadWorkforce();
  const billing = workforce.skills.find((skill) => skill.name === 'Legacy Billing Recovery');
  assert.equal(billing.criticality, 1);

  await data.run(
    "UPDATE skill_requirements SET criticality = 5 WHERE skill_id = (SELECT id FROM skills WHERE name = 'Legacy Billing Recovery')",
  );
  const restored = await data.loadWorkforce();
  assert.equal(restored.skills.find((skill) => skill.name === 'Legacy Billing Recovery').criticality, 5);
});

test('snapshot carries evidence and mentoring fields, with unknown dates left null', async () => {
  await ready;
  const workforce = await data.loadWorkforce();

  assert.equal(workforce.schemaVersion, 1);
  assert.ok(workforce.employees.every((employee) => typeof employee.mentoringAvailable === 'boolean'));
  assert.ok(workforce.matrix.every((edge) => edge.evidenceSource === 'fictional seed'));
  assert.ok(workforce.matrix.every((edge) => edge.lastVerifiedAt === null));
});

test('zero legacy demand is reported without zeroing Keystone coverage', async () => {
  await ready;
  const [skill] = await data.all("SELECT id FROM skills WHERE name = 'Machine Learning'");

  await data.run('UPDATE future_skill_targets SET target_people = 0 WHERE skill_id = ?', [skill.id]);
  await data.run('UPDATE skill_requirements SET required_holders = 0 WHERE skill_id = ?', [skill.id]);

  const workforce = await data.loadWorkforce();
  const published = workforce.skills.find((entry) => entry.id === skill.id);

  assert.equal(published.demandTarget, 0);
  assert.ok(published.requiredHolders >= 1);
});

test('no published skill can make risk scoring divide by zero', async () => {
  await ready;
  const { analyze } = require('../services/risk');
  const workforce = await data.loadWorkforce();

  assert.ok(workforce.skills.every((skill) => skill.requiredHolders >= 1));

  for (const skill of analyze(workforce).skills) {
    assert.ok(Number.isFinite(skill.keystoneScore), `${skill.name} scored ${skill.keystoneScore}`);
    assert.ok(Number.isFinite(skill.gap));
  }
});

test('every employee role is represented as a critical role with incumbents', async () => {
  await ready;
  const snapshot = await data.getHeatmapData();
  const workforce = await data.loadWorkforce();
  const employeeRoles = new Set(snapshot.employees.map((employee) => employee.role));

  assert.equal(workforce.roles.length, employeeRoles.size);

  for (const role of workforce.roles) {
    assert.ok(employeeRoles.has(role.name));
    assert.ok(role.incumbentIds.length > 0);
    assert.ok(role.criticality >= 1 && role.criticality <= 5);
  }
});

test('role requirements reference real skills and usable proficiencies', async () => {
  await ready;
  const workforce = await data.loadWorkforce();
  const skillIds = new Set(workforce.skills.map((skill) => skill.id));
  const backend = workforce.roles.find((role) => role.name === 'Backend Engineer');

  assert.ok(backend.requirements.length > 0);

  for (const role of workforce.roles) {
    for (const requirement of role.requirements) {
      assert.ok(skillIds.has(requirement.skillId));
      assert.ok(requirement.minimumProficiency >= 1 && requirement.minimumProficiency <= 5);
    }
  }
});

test('seeded resources are labelled unverified and invent no credentials', async () => {
  await ready;
  const workforce = await data.loadWorkforce();

  assert.ok(workforce.resources.length > 0);

  for (const resource of workforce.resources) {
    assert.equal(resource.verified, false);
    assert.equal(resource.provenance, 'fictional demo entry');
    assert.equal(resource.url, null);
  }

  assert.equal(workforce.resources.some((resource) => resource.kind === 'certification'), false);
});

test('a verified resource is reported as verified', async () => {
  await ready;
  await data.run(
    `INSERT OR IGNORE INTO resources (skill_id, title, kind, url, verified, provenance)
     VALUES (NULL, 'Team runbook', 'documentation', 'https://example.invalid/runbook', 1, 'confirmed by team')`,
  );

  const workforce = await data.loadWorkforce();
  const entry = workforce.resources.find((resource) => resource.title === 'Team runbook');

  assert.equal(entry.verified, true);
  assert.equal(entry.provenance, 'confirmed by team');
});

test('re-running initialization preserves existing rows', async () => {
  await ready;
  const before = await data.getHeatmapData();

  await data.initializeDatabase();

  const after = await data.getHeatmapData();
  assert.equal(after.employees.length, before.employees.length);
  assert.equal(after.skills.length, before.skills.length);
  assert.equal(after.matrix.length, before.matrix.length);
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
