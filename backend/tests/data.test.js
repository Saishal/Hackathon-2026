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
const { readSeedDataset } = require('../data/dataset');

const ready = data.initializeDatabase();

test.after(() => {
  data.db.close();
});

test('fresh database seeds every row of the CSV demo dataset', async () => {
  await ready;
  const dataset = readSeedDataset();
  const snapshot = await data.getHeatmapData();

  assert.equal(snapshot.employees.length, dataset.employees.length);
  assert.equal(snapshot.skills.length, dataset.skills.length);
  assert.equal(snapshot.matrix.length, dataset.employeeSkills.length);

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

test('snapshot carries recorded evidence, with unknown verification dates left null', async () => {
  await ready;
  const workforce = await data.loadWorkforce();

  assert.equal(workforce.schemaVersion, 1);
  assert.ok(workforce.matrix.every((edge) => typeof edge.evidenceSource === 'string' && edge.evidenceSource !== ''));
  assert.ok(workforce.matrix.every((edge) => edge.lastVerifiedAt === null || /^\d{4}-\d{2}-\d{2}$/.test(edge.lastVerifiedAt)));
  assert.ok(workforce.matrix.some((edge) => edge.lastVerifiedAt === null), 'blank CSV dates must stay unknown');
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

test('the persisted catalogue keeps the shape AI grounding filters on', async () => {
  await ready;
  const workforce = await data.loadWorkforce();
  const skillIds = new Set(workforce.skills.map((skill) => skill.id));

  assert.ok(workforce.learningResources.length > 0);

  for (const resource of workforce.learningResources) {
    assert.equal(typeof resource.id, 'string');
    assert.equal(typeof resource.verified, 'boolean');
    assert.ok(Array.isArray(resource.skillIds));
    assert.ok(resource.skillIds.every((id) => skillIds.has(id)));
    // Titles read like a real catalogue; the stored provenance is what says they are invented.
    assert.match(resource.provenance, /fictional/i);
  }
});

test('a multi-skill catalogue entry maps to every skill it serves', async () => {
  await ready;
  const workforce = await data.loadWorkforce();
  const rotation = workforce.learningResources.find((resource) => resource.id === 'rot-platform-team');
  const named = ['Cloud Architecture', 'DevOps', 'Test Automation']
    .map((name) => workforce.skills.find((skill) => skill.name === name).id)
    .sort();

  assert.deepEqual([...rotation.skillIds].sort(), named);
});

test('unrecorded mentoring capacity is omitted rather than reported as zero', async () => {
  await ready;
  const workforce = await data.loadWorkforce();
  const recorded = workforce.employees.filter((employee) => 'mentoringHoursPerMonth' in employee);
  const unrecorded = workforce.employees.filter((employee) => !('mentoringHoursPerMonth' in employee));

  assert.ok(recorded.length > 0);
  assert.ok(unrecorded.length > 0);
  assert.ok(recorded.every((employee) => employee.mentoringHoursPerMonth > 0));
});

test('an employee skill edit requires evidence and a known pair', async () => {
  await ready;
  const snapshot = await data.getHeatmapData();
  const employeeId = snapshot.employees[0].id;
  const skillId = snapshot.skills[0].id;

  await assert.rejects(() => data.saveEmployeeSkill({ employeeId: 9999, skillId, proficiency: 3, evidenceSource: 'review' }), { status: 400 });
  await assert.rejects(() => data.saveEmployeeSkill({ employeeId, skillId: 9999, proficiency: 3, evidenceSource: 'review' }), { status: 400 });
  await assert.rejects(() => data.saveEmployeeSkill({ employeeId, skillId, proficiency: 9, evidenceSource: 'review' }), { status: 400 });
  await assert.rejects(() => data.saveEmployeeSkill({ employeeId, skillId, proficiency: 3, evidenceSource: '   ' }), { status: 400 });
  await assert.rejects(() => data.saveEmployeeSkill({ employeeId, skillId, proficiency: 3, evidenceSource: 'review', lastVerifiedAt: 'last tuesday' }), { status: 400 });
});

test('a valid employee skill edit persists with its evidence', async () => {
  await ready;
  const snapshot = await data.getHeatmapData();
  const employeeId = snapshot.employees[0].id;
  const skillId = snapshot.skills[0].id;

  await data.saveEmployeeSkill({
    employeeId,
    skillId,
    proficiency: 4,
    evidenceSource: 'manager review',
    lastVerifiedAt: '2026-09-12',
  });

  const workforce = await data.loadWorkforce();
  const edge = workforce.matrix.find((row) => row.employeeId === employeeId && row.skillId === skillId);

  assert.equal(edge.proficiency, 4);
  assert.equal(edge.evidenceSource, 'manager review');
  assert.equal(edge.lastVerifiedAt, '2026-09-12');
});

test('future requirements validate and default to proposed', async () => {
  await ready;
  const snapshot = await data.getHeatmapData();
  const skillId = snapshot.skills[0].id;

  await assert.rejects(() => data.addFutureRequirement({ skillId: 9999, requiredHolders: 2, targetProficiency: 3, effectiveMonth: 12, provenance: 'planning' }), { status: 400 });
  await assert.rejects(() => data.addFutureRequirement({ skillId, requiredHolders: 0, targetProficiency: 3, effectiveMonth: 12, provenance: 'planning' }), { status: 400 });
  await assert.rejects(() => data.addFutureRequirement({ skillId, requiredHolders: 2, targetProficiency: 3, effectiveMonth: 99, provenance: 'planning' }), { status: 400 });
  await assert.rejects(() => data.addFutureRequirement({ skillId, requiredHolders: 2, targetProficiency: 3, effectiveMonth: 12, provenance: '' }), { status: 400 });
  await assert.rejects(() => data.addFutureRequirement({ skillId, requiredHolders: 2, targetProficiency: 3, effectiveMonth: 12, provenance: 'planning', status: 'active' }), { status: 400 });

  const created = await data.addFutureRequirement({
    skillId,
    requiredHolders: 4,
    targetProficiency: 3,
    effectiveMonth: 12,
    provenance: 'planning workshop',
  });

  assert.equal(created.status, 'proposed');

  const workforce = await data.loadWorkforce();
  const stored = workforce.futureRequirements.find((entry) => entry.id === created.id);
  assert.equal(stored.effectiveMonth, 12);
  assert.equal(stored.status, 'proposed');
});

test('a provisional future skill receives a stable id without entering today\'s inventory', async () => {
  await ready;
  const created = await data.addFutureRequirement({
    skillId: -42,
    skillName: 'Quantum Readiness',
    requiredHolders: 2,
    targetProficiency: 4,
    criticality: 5,
    effectiveMonth: 12,
    status: 'reviewed',
    provenance: 'reviewed strategy workshop',
  });

  assert.ok(created.skillId > 0);
  assert.equal(created.provisionalSkillId, -42);
  assert.equal(created.createdSkill, true);

  const workforce = await data.loadWorkforce();
  assert.equal(workforce.skills.some((skill) => skill.id === created.skillId), false);
  assert.equal(workforce.futureRequirements.find((entry) => entry.id === created.id).criticality, 5);

  const { simulate } = require('../services/simulation');
  const result = simulate(workforce, { horizonMonths: 12 });
  assert.equal(result.requirementsSource, 'persisted-reviewed');
  assert.equal(result.baseline.skills.some((skill) => skill.id === created.skillId), false);
  assert.equal(result.projected.skills.find((skill) => skill.id === created.skillId).gap, 2);
});

test('fixture matches the live snapshot shape so it cannot drift silently', async () => {
  await ready;
  const live = await data.loadWorkforce();
  const fixture = data.createWorkforceFixture();
  const keys = (value) => Object.keys(value).sort();

  assert.deepEqual(keys(fixture), keys(live));

  // mentoringHoursPerMonth is intentionally optional, so it is compared separately.
  const required = (value) => keys(value).filter((key) => key !== 'mentoringHoursPerMonth');

  for (const section of ['employees', 'skills', 'roles', 'learningResources', 'futureRequirements', 'matrix']) {
    assert.ok(fixture[section].length > 0, `fixture ${section} is empty`);
    assert.deepEqual(required(fixture[section][0]), required(live[section][0]), `${section} shape drifted`);
  }
});

test('fixture is independent between calls and drives the demo story', async () => {
  const { analyze } = require('../services/risk');
  const first = data.createWorkforceFixture();
  first.skills[0].criticality = 1;

  assert.equal(data.createWorkforceFixture().skills[0].criticality, 5);

  const billing = analyze(data.createWorkforceFixture()).skills.find((skill) => skill.id === 1);
  assert.equal(billing.busFactor, 1);
  assert.deepEqual(billing.holderIds, [1]);
  assert.equal(billing.gap, 1);
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
