const { run, all, get } = require('./db');

// All people, skills and proficiencies below are fictional demo data.
const employees = [
  { name: 'Ava Patel', role: 'Frontend Engineer', department: 'Engineering' },
  { name: 'Liam Chen', role: 'Backend Engineer', department: 'Engineering' },
  { name: 'Noah Rivera', role: 'Data Analyst', department: 'Data' },
  { name: 'Mia Thompson', role: 'Product Manager', department: 'Product' },
  { name: 'Ethan Brooks', role: 'DevOps Engineer', department: 'Platform' },
  { name: 'Sophia Nguyen', role: 'QA Engineer', department: 'Engineering' },
  { name: 'Lucas Kim', role: 'UX Designer', department: 'Design' },
  { name: 'Isabella Ross', role: 'Security Analyst', department: 'Security' },
  { name: 'Mason Green', role: 'Backend Engineer', department: 'Engineering' },
  { name: 'Amelia Diaz', role: 'Frontend Engineer', department: 'Engineering' },
  { name: 'James Carter', role: 'Data Scientist', department: 'Data' },
  { name: 'Harper White', role: 'Project Lead', department: 'Operations' },
  { name: 'Benjamin Hall', role: 'QA Engineer', department: 'Engineering' },
  { name: 'Evelyn Scott', role: 'Business Analyst', department: 'Operations' },
  { name: 'Henry Adams', role: 'Cloud Engineer', department: 'Platform' },
  { name: 'Abigail Lewis', role: 'People Manager', department: 'People Ops' },
  { name: 'Jack Turner', role: 'Solutions Architect', department: 'Platform' },
  { name: 'Ella Walker', role: 'Technical Writer', department: 'Operations' },
  { name: 'Daniel Young', role: 'Support Engineer', department: 'Customer Success' },
  { name: 'Grace King', role: 'AI Specialist', department: 'Innovation' },
];

const skills = [
  'React',
  'Node.js',
  'SQLite',
  'Python',
  'Data Analysis',
  'Project Management',
  'UX Research',
  'DevOps',
  'Cloud Architecture',
  'Cybersecurity',
  'Machine Learning',
  'Communication',
  'Leadership',
  'Test Automation',
  'AI Governance',
  'Legacy Billing Recovery',
];

const roleSkillProfiles = {
  'Frontend Engineer': {
    React: 5,
    'Node.js': 3,
    'UX Research': 3,
    Communication: 4,
    'Test Automation': 3,
  },
  'Backend Engineer': {
    'Node.js': 5,
    SQLite: 4,
    'Cloud Architecture': 3,
    Communication: 3,
    'Test Automation': 4,
  },
  'Data Analyst': {
    Python: 4,
    'Data Analysis': 5,
    Communication: 4,
    'Project Management': 2,
  },
  'Product Manager': {
    'Project Management': 5,
    Communication: 5,
    Leadership: 4,
    'UX Research': 3,
  },
  'DevOps Engineer': {
    DevOps: 5,
    'Cloud Architecture': 4,
    'Node.js': 3,
    Cybersecurity: 2,
    Communication: 3,
  },
  'QA Engineer': {
    'Test Automation': 5,
    Communication: 4,
    'Node.js': 3,
    React: 2,
  },
  'UX Designer': {
    'UX Research': 5,
    Communication: 4,
    React: 2,
    'Project Management': 2,
  },
  'Security Analyst': {
    Cybersecurity: 5,
    'Cloud Architecture': 3,
    Communication: 3,
    DevOps: 2,
  },
  'Data Scientist': {
    Python: 5,
    'Machine Learning': 5,
    'Data Analysis': 4,
    Communication: 3,
  },
  'Project Lead': {
    Leadership: 5,
    'Project Management': 5,
    Communication: 5,
    'Data Analysis': 2,
  },
  'Business Analyst': {
    'Data Analysis': 4,
    Communication: 5,
    'Project Management': 3,
    Leadership: 2,
  },
  'Cloud Engineer': {
    'Cloud Architecture': 5,
    DevOps: 4,
    'Node.js': 3,
    Cybersecurity: 2,
  },
  'People Manager': {
    Leadership: 5,
    Communication: 5,
    'Project Management': 3,
  },
  'Solutions Architect': {
    'Cloud Architecture': 5,
    'Node.js': 4,
    Leadership: 3,
    Communication: 4,
    SQLite: 3,
  },
  'Technical Writer': {
    Communication: 5,
    Leadership: 2,
    'Project Management': 2,
  },
  'Support Engineer': {
    Communication: 4,
    'Node.js': 3,
    SQLite: 2,
    'Project Management': 2,
  },
  'AI Specialist': {
    Python: 5,
    'Machine Learning': 5,
    'AI Governance': 2,
    Communication: 3,
  },
};

const adjacencySkills = ['React', 'Node.js', 'Python', 'Communication', 'Leadership', 'DevOps'];

const futureTargets = [
  { skill: 'AI Governance', targetPeople: 6 },
  { skill: 'Machine Learning', targetPeople: 7 },
  { skill: 'Cloud Architecture', targetPeople: 10 },
  { skill: 'Cybersecurity', targetPeople: 5 },
  { skill: 'Test Automation', targetPeople: 8 },
  { skill: 'Data Analysis', targetPeople: 9 },
  { skill: 'Leadership', targetPeople: 8 },
];

const profileForEmployee = (employee) => {
  const base = { ...(roleSkillProfiles[employee.role] || {}) };
  if (employee.name === 'Liam Chen') base['Legacy Billing Recovery'] = 5;
  if (employee.name === 'Mason Green') base['Legacy Billing Recovery'] = 2;
  const charTotal = employee.name.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);

  adjacencySkills.forEach((skill, index) => {
    if (!base[skill] && (charTotal + index) % 5 === 0) {
      base[skill] = 2;
    }
  });

  return base;
};

// Existing databases are left untouched; point DB_PATH at a new file for fresh demo data.
async function seedDemoData() {
  const existing = await get('SELECT COUNT(*) AS count FROM employees');

  if (existing.count > 0) {
    return;
  }

  for (const employee of employees) {
    await run(
      'INSERT INTO employees (name, role, department) VALUES (?, ?, ?)',
      [employee.name, employee.role, employee.department],
    );
  }

  for (const skill of skills) {
    await run('INSERT INTO skills (name) VALUES (?)', [skill]);
  }

  const dbEmployees = await all('SELECT id, name, role FROM employees');
  const dbSkills = await all('SELECT id, name FROM skills');
  const skillIdByName = new Map(dbSkills.map((skill) => [skill.name, skill.id]));

  for (const employee of dbEmployees) {
    const profile = profileForEmployee(employee);

    for (const [skillName, proficiency] of Object.entries(profile)) {
      const skillId = skillIdByName.get(skillName);
      if (!skillId) {
        continue;
      }

      await run(
        'INSERT INTO employee_skills (employee_id, skill_id, proficiency) VALUES (?, ?, ?)',
        [employee.id, skillId, proficiency],
      );
    }
  }

  for (const target of futureTargets) {
    const skillId = skillIdByName.get(target.skill);
    if (!skillId) {
      continue;
    }

    await run(
      'INSERT INTO future_skill_targets (skill_id, target_people) VALUES (?, ?)',
      [skillId, target.targetPeople],
    );
  }
}

// Roles and their skill requirements are derived from the existing fictional role
// profiles, not invented. Criticality starts neutral and is meant to be edited.
async function backfillRoles() {
  const roles = await all('SELECT DISTINCT role FROM employees ORDER BY role ASC');

  for (const { role } of roles) {
    await run(
      "INSERT OR IGNORE INTO critical_roles (name, criticality, metadata_source) VALUES (?, 3, 'fictional demo default')",
      [role],
    );
  }

  const dbRoles = await all('SELECT id, name FROM critical_roles');
  const dbSkills = await all('SELECT id, name FROM skills');
  const skillIdByName = new Map(dbSkills.map((skill) => [skill.name, skill.id]));

  for (const dbRole of dbRoles) {
    const profile = roleSkillProfiles[dbRole.name];

    if (!profile) {
      continue;
    }

    for (const [skillName, proficiency] of Object.entries(profile)) {
      const skillId = skillIdByName.get(skillName);

      if (!skillId) {
        continue;
      }

      await run(
        'INSERT OR IGNORE INTO role_skill_requirements (role_id, skill_id, minimum_proficiency) VALUES (?, ?, ?)',
        [dbRole.id, skillId, proficiency],
      );
    }
  }
}

module.exports = {
  employees,
  skills,
  roleSkillProfiles,
  adjacencySkills,
  futureTargets,
  profileForEmployee,
  seedDemoData,
  backfillRoles,
};
