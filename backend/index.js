const express = require('express');
const cors = require('cors');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const PORT = process.env.PORT || 4000;
const DB_PATH = path.join(__dirname, 'skillsight.db');

app.use(cors());
app.use(express.json());

const db = new sqlite3.Database(DB_PATH);

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

const profileForEmployee = (employee) => {
  const base = { ...(roleSkillProfiles[employee.role] || {}) };
  const charTotal = employee.name.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);

  adjacencySkills.forEach((skill, index) => {
    if (!base[skill] && (charTotal + index) % 5 === 0) {
      base[skill] = 2;
    }
  });

  return base;
};

async function initializeDatabase() {
  await run(`
    CREATE TABLE IF NOT EXISTS employees (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      role TEXT NOT NULL,
      department TEXT NOT NULL
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS skills (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS employee_skills (
      employee_id INTEGER NOT NULL,
      skill_id INTEGER NOT NULL,
      proficiency INTEGER NOT NULL CHECK (proficiency BETWEEN 1 AND 5),
      PRIMARY KEY (employee_id, skill_id),
      FOREIGN KEY (employee_id) REFERENCES employees(id),
      FOREIGN KEY (skill_id) REFERENCES skills(id)
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS future_skill_targets (
      skill_id INTEGER PRIMARY KEY,
      target_people INTEGER NOT NULL CHECK (target_people >= 0),
      FOREIGN KEY (skill_id) REFERENCES skills(id)
    )
  `);

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

  const futureTargets = [
    { skill: 'AI Governance', targetPeople: 6 },
    { skill: 'Machine Learning', targetPeople: 7 },
    { skill: 'Cloud Architecture', targetPeople: 10 },
    { skill: 'Cybersecurity', targetPeople: 5 },
    { skill: 'Test Automation', targetPeople: 8 },
    { skill: 'Data Analysis', targetPeople: 9 },
    { skill: 'Leadership', targetPeople: 8 },
  ];

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

async function getHeatmapData() {
  const employeesRows = await all(
    'SELECT id, name, role, department FROM employees ORDER BY name ASC',
  );
  const skillsRows = await all('SELECT id, name FROM skills ORDER BY name ASC');
  const matrix = await all(
    'SELECT employee_id AS employeeId, skill_id AS skillId, proficiency FROM employee_skills',
  );

  return {
    employees: employeesRows,
    skills: skillsRows,
    matrix,
  };
}

async function getAtRiskSkills() {
  return all(`
    SELECT
      s.id,
      s.name,
      SUM(CASE WHEN es.proficiency >= 3 THEN 1 ELSE 0 END) AS holderCount,
      GROUP_CONCAT(CASE WHEN es.proficiency >= 3 THEN e.name END, ', ') AS holders
    FROM skills s
    LEFT JOIN employee_skills es ON es.skill_id = s.id
    LEFT JOIN employees e ON e.id = es.employee_id
    GROUP BY s.id, s.name
    HAVING holderCount < 2
    ORDER BY holderCount ASC, s.name ASC
  `);
}

async function getGapAnalysis() {
  return all(`
    SELECT
      s.id,
      s.name,
      fst.target_people AS targetPeople,
      COALESCE(curr.currentPeople, 0) AS currentPeople,
      fst.target_people - COALESCE(curr.currentPeople, 0) AS gap
    FROM future_skill_targets fst
    JOIN skills s ON s.id = fst.skill_id
    LEFT JOIN (
      SELECT skill_id, COUNT(*) AS currentPeople
      FROM employee_skills
      WHERE proficiency >= 3
      GROUP BY skill_id
    ) curr ON curr.skill_id = s.id
    ORDER BY gap DESC, s.name ASC
  `);
}

async function getRecommendations() {
  const gaps = await getGapAnalysis();

  return gaps
    .filter((entry) => entry.gap > 0)
    .slice(0, 5)
    .map((entry) => {
      if (entry.gap >= 4) {
        return {
          skill: entry.name,
          action: 'Launch a structured training cohort',
          detail: `Gap of ${entry.gap}. Prioritize a team-wide training program and certification path.`,
        };
      }

      if (entry.gap >= 2) {
        return {
          skill: entry.name,
          action: 'Start mentoring circles',
          detail: `Gap of ${entry.gap}. Pair current experts with 2-3 mentees for practical projects.`,
        };
      }

      return {
        skill: entry.name,
        action: 'Offer targeted certification support',
        detail: `Gap of ${entry.gap}. Sponsor one employee to certify and share learnings with peers.`,
      };
    });
}

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.get('/api/heatmap', async (_req, res) => {
  const payload = await getHeatmapData();
  res.json(payload);
});

app.get('/api/critical-skills', async (_req, res) => {
  const payload = await getAtRiskSkills();
  res.json(payload);
});

app.get('/api/gap-analysis', async (_req, res) => {
  const payload = await getGapAnalysis();
  res.json(payload);
});

app.get('/api/recommendations', async (_req, res) => {
  const payload = await getRecommendations();
  res.json(payload);
});

app.get('/api/future-skills', async (_req, res) => {
  const payload = await all(`
    SELECT s.id, s.name, fst.target_people AS targetPeople
    FROM future_skill_targets fst
    JOIN skills s ON s.id = fst.skill_id
    ORDER BY s.name ASC
  `);

  res.json(payload);
});

app.put('/api/future-skills', async (req, res) => {
  const { targets } = req.body;

  if (!Array.isArray(targets)) {
    res.status(400).json({ error: 'targets must be an array' });
    return;
  }

  for (const target of targets) {
    if (!Number.isInteger(target.id) || !Number.isInteger(target.targetPeople) || target.targetPeople < 0) {
      res.status(400).json({ error: 'Each target needs integer id and non-negative integer targetPeople' });
      return;
    }
  }

  await run('BEGIN TRANSACTION');

  try {
    for (const target of targets) {
      await run(
        `INSERT INTO future_skill_targets (skill_id, target_people)
         VALUES (?, ?)
         ON CONFLICT(skill_id) DO UPDATE SET target_people = excluded.target_people`,
        [target.id, target.targetPeople],
      );
    }

    await run('COMMIT');
  } catch (error) {
    await run('ROLLBACK');
    throw error;
  }

  const payload = await getGapAnalysis();
  res.json(payload);
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Unexpected server error' });
});

initializeDatabase()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`SkillSight backend listening on port ${PORT}`);
    });
  })
  .catch((error) => {
    console.error('Failed to initialize database', error);
    process.exit(1);
  });
