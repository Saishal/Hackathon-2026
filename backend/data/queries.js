const { run, all } = require('./db');
const { withTransaction } = require('./transactions');
const { isCalendarDate } = require('../services/clock');

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

async function assertEmployeeIdsExist(ids) {
  const unique = [...new Set(ids)];

  if (unique.length === 0) {
    return;
  }

  const placeholders = unique.map(() => '?').join(', ');
  const rows = await all(`SELECT id FROM employees WHERE id IN (${placeholders})`, unique);
  const known = new Set(rows.map((row) => row.id));
  const missing = unique.filter((id) => !known.has(id));

  if (missing.length > 0) {
    throw badRequest(`Unknown employee id(s): ${missing.join(', ')}`);
  }
}

// Evidence is mandatory because a score has to trace back to something recorded.
// A missing verification date stays null and is reported as unknown, never guessed.
async function validateEmployeeSkillEdit(edit = {}) {
  const { employeeId, skillId, proficiency, evidenceSource, lastVerifiedAt = null } = edit;

  if (!Number.isInteger(employeeId) || !Number.isInteger(skillId)) {
    throw badRequest('employeeId and skillId must be integers');
  }

  if (!Number.isInteger(proficiency) || proficiency < 1 || proficiency > 5) {
    throw badRequest('proficiency must be an integer between 1 and 5');
  }

  if (typeof evidenceSource !== 'string' || evidenceSource.trim() === '') {
    throw badRequest('evidenceSource is required so a score traces to recorded evidence');
  }

  if (lastVerifiedAt !== null && !isCalendarDate(lastVerifiedAt)) {
    throw badRequest('lastVerifiedAt must be null or a YYYY-MM-DD date');
  }

  await assertEmployeeIdsExist([employeeId]);
  await assertSkillIdsExist([skillId]);

  return { employeeId, skillId, proficiency, evidenceSource: evidenceSource.trim(), lastVerifiedAt };
}

// Writes validated evidence without opening a transaction, for callers that already hold one
// (approvals write evidence and its audit records atomically).
async function writeEmployeeSkill(evidence) {
  const { employeeId, skillId, proficiency, evidenceSource, lastVerifiedAt } = evidence;
  {
    // The first recorded evidence promotes a forecast-only skill into the current inventory.
    await run('UPDATE skills SET future_only = 0 WHERE id = ?', [skillId]);
    await run(
      `INSERT INTO skill_requirements (skill_id, criticality, target_proficiency, required_holders, metadata_source)
       SELECT s.id,
              COALESCE((SELECT fr.criticality FROM future_requirements fr WHERE fr.skill_id = s.id ORDER BY fr.effective_month ASC LIMIT 1), 3),
              COALESCE((SELECT fr.target_proficiency FROM future_requirements fr WHERE fr.skill_id = s.id ORDER BY fr.effective_month ASC LIMIT 1), 3),
              MAX(1, COALESCE((SELECT fr.required_holders FROM future_requirements fr WHERE fr.skill_id = s.id ORDER BY fr.effective_month ASC LIMIT 1), 2)),
              'promoted from recorded evidence'
       FROM skills s WHERE s.id = ?
       ON CONFLICT(skill_id) DO NOTHING`,
      [skillId],
    );
    await run(
      `INSERT INTO employee_skills (employee_id, skill_id, proficiency, evidence_source, last_verified_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(employee_id, skill_id) DO UPDATE SET
         proficiency = excluded.proficiency,
         evidence_source = excluded.evidence_source,
         last_verified_at = excluded.last_verified_at`,
      [employeeId, skillId, proficiency, evidenceSource, lastVerifiedAt],
    );
  }

  return { employeeId, skillId, proficiency, evidenceSource, lastVerifiedAt };
}

async function saveEmployeeSkill(edit = {}) {
  const evidence = await validateEmployeeSkillEdit(edit);
  return withTransaction(() => writeEmployeeSkill(evidence));
}

async function getFutureRequirements() {
  return all(`
    SELECT
      fr.id,
      fr.skill_id AS skillId,
      s.name AS skillName,
      MAX(1, fr.required_holders) AS requiredHolders,
      fr.target_proficiency AS targetProficiency,
      fr.criticality,
      fr.effective_month AS effectiveMonth,
      fr.status,
      fr.provenance
    FROM future_requirements fr
    JOIN skills s ON s.id = fr.skill_id
    ORDER BY fr.effective_month ASC, s.name ASC
  `);
}

function validateFutureRequirementInput(input = {}) {
  const {
    skillId,
    skillName,
    requiredHolders,
    targetProficiency,
    criticality = 3,
    effectiveMonth,
    provenance,
    status = 'proposed',
  } = input;

  const existingId = Number.isInteger(skillId) && skillId > 0;
  const provisionalId = Number.isInteger(skillId) && skillId < 0;
  if (!(skillId == null || existingId || provisionalId)) {
    throw badRequest('skillId must be a positive catalog id, a provisional negative id, or null');
  }

  if (skillName !== undefined && (typeof skillName !== 'string' || !skillName.trim() || skillName.trim().length > 100)) {
    throw badRequest('skillName must contain 1 to 100 characters');
  }

  if (!existingId && (typeof skillName !== 'string' || !skillName.trim() || skillName.trim().length > 100)) {
    throw badRequest('skillName is required for a new or provisional skill');
  }

  if (!Number.isInteger(requiredHolders) || requiredHolders < 1) {
    throw badRequest('requiredHolders must be an integer of at least 1; use demandTarget for zero hiring demand');
  }

  if (!Number.isInteger(targetProficiency) || targetProficiency < 1 || targetProficiency > 5) {
    throw badRequest('targetProficiency must be an integer between 1 and 5');
  }

  if (!Number.isInteger(criticality) || criticality < 1 || criticality > 5) {
    throw badRequest('criticality must be an integer between 1 and 5');
  }

  if (!Number.isInteger(effectiveMonth) || effectiveMonth < 0 || effectiveMonth > 60) {
    throw badRequest('effectiveMonth must be an integer between 0 and 60');
  }

  if (!['proposed', 'reviewed'].includes(status)) {
    throw badRequest("status must be 'proposed' or 'reviewed'");
  }

  if (typeof provenance !== 'string' || provenance.trim() === '') {
    throw badRequest('provenance is required so a requirement traces to a stated source');
  }

  return { skillId, skillName, requiredHolders, targetProficiency, criticality, effectiveMonth, status,
    provenance: provenance.trim(), existingId, provisionalId };
}

// Inserts a validated requirement without opening a transaction, allocating a stable skill ID for a
// new name. Callers that also write audit records run it inside their own transaction.
async function insertFutureRequirement(validated) {
  const { skillId, skillName, requiredHolders, targetProficiency, criticality, effectiveMonth, status, provenance,
    existingId, provisionalId } = validated;
  {
    let resolved;
    let createdSkill = false;
    if (existingId) {
      const rows = await all('SELECT id, name, future_only AS futureOnly FROM skills WHERE id = ?', [skillId]);
      [resolved] = rows;
      if (!resolved) throw badRequest(`Unknown skill id(s): ${skillId}`);
      if (skillName !== undefined && skillName.trim().toLocaleLowerCase() !== resolved.name.trim().toLocaleLowerCase()) {
        throw badRequest('skillId and skillName refer to different skills');
      }
    } else {
      const rows = await all('SELECT id, name, future_only AS futureOnly FROM skills WHERE lower(trim(name)) = lower(trim(?))', [skillName]);
      [resolved] = rows;
      if (!resolved) {
        const inserted = await run('INSERT INTO skills (name, future_only) VALUES (?, 1)', [skillName.trim()]);
        resolved = { id: inserted.lastID, name: skillName.trim(), futureOnly: 1 };
        createdSkill = true;
      }
    }

    const result = await run(
      `INSERT INTO future_requirements
         (skill_id, required_holders, target_proficiency, criticality, effective_month, status, provenance)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [resolved.id, requiredHolders, targetProficiency, criticality, effectiveMonth, status, provenance],
    );
    return { id: result.lastID, skillId: resolved.id, skillName: resolved.name,
      provisionalSkillId: provisionalId ? skillId : null, createdSkill,
      requiredHolders, targetProficiency, criticality, effectiveMonth, status, provenance };
  }
}

async function addFutureRequirement(input = {}) {
  const validated = validateFutureRequirementInput(input);
  return withTransaction(() => insertFutureRequirement(validated));
}

async function getHeatmapData() {
  const employeesRows = await all(
    'SELECT id, name, role, department FROM employees ORDER BY name ASC',
  );
  const skillsRows = await all('SELECT id, name FROM skills WHERE future_only = 0 ORDER BY name ASC');
  const matrix = await all(
    'SELECT employee_id AS employeeId, skill_id AS skillId, proficiency FROM employee_skills',
  );

  return {
    employees: employeesRows,
    skills: skillsRows,
    matrix,
  };
}

// Counts holders at each skill's own target proficiency, the same threshold the Keystone
// risk analysis uses, so a skill that needs level 4 is not shown as safe here while the
// Keystone panel flags it. Forecast-only skills are not part of today's inventory.
async function getAtRiskSkills() {
  return all(`
    SELECT
      s.id,
      s.name,
      SUM(CASE WHEN es.proficiency >= COALESCE(sr.target_proficiency, 3) THEN 1 ELSE 0 END) AS holderCount,
      GROUP_CONCAT(CASE WHEN es.proficiency >= COALESCE(sr.target_proficiency, 3) THEN e.name END, ', ') AS holders
    FROM skills s
    LEFT JOIN skill_requirements sr ON sr.skill_id = s.id
    LEFT JOIN employee_skills es ON es.skill_id = s.id
    LEFT JOIN employees e ON e.id = es.employee_id
    WHERE s.future_only = 0
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
      -- A surplus is not a gap; reporting it as a negative number read as a shortage.
      MAX(0, fst.target_people - COALESCE(curr.currentPeople, 0)) AS gap
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

  await withTransaction(async () => {
    for (const target of targets) {
      await run(
        `INSERT INTO future_skill_targets (skill_id, target_people)
         VALUES (?, ?)
         ON CONFLICT(skill_id) DO UPDATE SET target_people = excluded.target_people`,
        [target.id, target.targetPeople],
      );
    }
  });
}

module.exports = {
  assertSkillIdsExist,
  assertEmployeeIdsExist,
  validateEmployeeSkillEdit,
  writeEmployeeSkill,
  saveEmployeeSkill,
  getFutureRequirements,
  validateFutureRequirementInput,
  insertFutureRequirement,
  addFutureRequirement,
  getHeatmapData,
  getAtRiskSkills,
  getGapAnalysis,
  getRecommendations,
  getFutureSkillTargets,
  replaceFutureSkillTargets,
};
