const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { parseCsv } = require('../data/csv');
const { DEFAULT_SEED_DIR, readSeedDataset } = require('../data/dataset');

test('parser handles quoted commas, doubled quotes, line breaks, CRLF and a byte-order mark', () => {
  const rows = parseCsv('﻿name,note\r\n"Chen, Liam","said ""hi"""\r\n\r\n"multi\nline",x\r\nlast,row');

  assert.deepEqual(rows.map((row) => row.values), [
    ['name', 'note'],
    ['Chen, Liam', 'said "hi"'],
    ['multi\nline', 'x'],
    ['last', 'row'],
  ]);
  assert.deepEqual(rows.map((row) => row.line), [1, 2, 4, 6]);
});

test('an unterminated quote is reported with the line it started on', () => {
  assert.throws(() => parseCsv('a,b\nc,"d\n'), /Unterminated quoted field starting on line 2/);
});

test('the demo dataset is internally consistent and keeps the billing story', () => {
  const dataset = readSeedDataset(DEFAULT_SEED_DIR);
  const roles = new Set(dataset.roles.map((role) => role.name));

  assert.ok(dataset.employees.every((employee) => roles.has(employee.role)));
  assert.ok(
    dataset.roles.every((role) => dataset.employees.some((employee) => employee.role === role.name)),
    'every demo role has an incumbent',
  );

  const billing = dataset.employeeSkills
    .filter((edge) => edge.skill === 'Legacy Billing Recovery')
    .map((edge) => `${edge.employee}:${edge.proficiency}`)
    .sort();
  assert.deepEqual(billing, ['Fatima Zahra:2', 'Liam Chen:5', 'Mason Green:2']);

  assert.ok(dataset.employees.some((employee) => employee.mentoringHoursPerMonth === null), 'blank capacity stays unknown');
  assert.equal(dataset.skills.find((skill) => skill.name === 'React').demandTarget, null);
});

function seedDirWith(file, edit) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'keystone-seed-'));
  fs.cpSync(DEFAULT_SEED_DIR, dir, { recursive: true });
  const target = path.join(dir, file);
  fs.writeFileSync(target, edit(fs.readFileSync(target, 'utf8')));
  return dir;
}

test('invalid rows are rejected with the file and line that caused them', () => {
  const cases = [
    ['employees.csv', (text) => text.replace('Mason Green,Backend Engineer', 'Mason Green,Backend Enginer'),
      /^employees\.csv:4: unknown role "Backend Enginer"$/],
    ['employee_skills.csv', (text) => `${text}Liam Chen,Legacy Billing Recovery,4,Manager assessment,\n`,
      /^employee_skills\.csv:\d+: duplicate evidence for Liam Chen \/ Legacy Billing Recovery$/],
    ['employee_skills.csv', (text) => `${text}Mason Green,Kubernetes,6,Manager assessment,\n`,
      /proficiency must be an integer from 1 to 5, got "6"/],
    ['employee_skills.csv', (text) => `${text}Mason Green,Kubernetes,3,Manager assessment,last week\n`,
      /last_verified_at must be blank or YYYY-MM-DD, got "last week"/],
    ['learning_resources.csv', (text) => text.replace('Legacy Billing Recovery,true', 'Legacy Billng Recovery,true'),
      /^learning_resources\.csv:2: unknown skill "Legacy Billng Recovery"$/],
    ['future_requirements.csv', (text) => text.replace(',proposed,', ',approved,'),
      /^future_requirements\.csv:2: status must be one of proposed, reviewed, got "approved"$/],
    ['skills.csv', (text) => text.replace('name,criticality', 'skill,criticality'),
      /^skills\.csv is missing column\(s\): name$/],
  ];

  for (const [file, edit, expected] of cases) {
    const dir = seedDirWith(file, edit);

    try {
      assert.throws(() => readSeedDataset(dir), { message: expected });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});
