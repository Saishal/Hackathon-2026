const { run, all } = require('./db');

const badRequest = (message) => {
  const error = new Error(message);
  error.status = 400;
  return error;
};

// Rejects unknown references before a write opens a transaction, so callers get
// a 400 naming the bad ids instead of an opaque constraint failure.
async function assertSkillIdsExist(ids) {
  const unique = [...new Set(ids)];

  if (unique.length === 0) {
    return;
  }

  const placeholders = unique.map(() => '?').join(', ');
  const rows = await all(`SELECT id FROM skills WHERE id IN (${placeholders})`, unique);
  const known = new Set(rows.map((row) => row.id));
  const missing = unique.filter((id) => !known.has(id));

  if (missing.length > 0) {
    throw badRequest(`Unknown skill id(s): ${missing.join(', ')}`);
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

async function getFutureSkillTargets() {
  return all(`
    SELECT s.id, s.name, fst.target_people AS targetPeople
    FROM future_skill_targets fst
    JOIN skills s ON s.id = fst.skill_id
    ORDER BY s.name ASC
  `);
}

async function replaceFutureSkillTargets(targets) {
  await assertSkillIdsExist(targets.map((target) => target.id));

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
}

module.exports = {
  assertSkillIdsExist,
  getHeatmapData,
  getAtRiskSkills,
  getGapAnalysis,
  getRecommendations,
  getFutureSkillTargets,
  replaceFutureSkillTargets,
};
