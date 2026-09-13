const express = require('express');
const { requirePermission } = require('../middleware/auth');
const { validateBody, humanize } = require('../validation/ajv');
const schemas = require('../validation/schemas');
const { can, ROLES, ROLE_LABELS, describeRole } = require('../security/permissions');
const { scopeFor, scopeIssues, scopeRisks, scopeWorkforce, scopeSuccession, inScope } = require('../security/scope');
const { destroyUserSessions } = require('../security/sessions');
const { conflict, notFound, validationError } = require('../errors');
const { withTransaction } = require('../data/transactions');
const { recordAudit, auditContext, queryAudit, auditFacets, getAuditEntry, lastDataChange } = require('../data/audit');
const users = require('../data/users');
const organization = require('../data/organization');
const changeRequests = require('../data/change-requests');
const scenarios = require('../data/scenarios');
const acknowledgements = require('../data/acknowledgements');
const dataQuality = require('../data/data-quality-store');
const writes = require('../data/workforce-writes');
const queries = require('../data/queries');
const { loadWorkforce } = require('../data/workforce');
const { analyze, analyzeEmployees } = require('../services/risk');
const { simulate } = require('../services/simulation');
const { summarizeDataQuality, evaluateScenario } = require('../services/data-quality');
const { buildProfile } = require('../services/profile');
const { buildSkillMap, heatState } = require('../../shared/skill-map.mjs');
const { toCsv } = require('../services/csv');
const { search } = require('../services/search');
const { buildSuggestions } = require('../services/suggestions');
const dismissals = require('../data/suggestion-dismissals');
const savedViews = require('../data/saved-views');
const { analyzeSuccession } = require('../services/risk');
const { today, isCalendarDate, addMonths } = require('../services/clock');

// Governance API: organization settings, audit history, data quality, change review, risk ownership,
// saved scenarios, exports, user administration and audited admin edits. Every route requires a
// session (enforced in app.js) and checks its own permission here.

// ---- query and parameter parsing (query strings are text; nothing is coerced silently) ----
function single(req, name) {
  const value = req.query[name];
  if (value === undefined || value === '') return undefined;
  if (typeof value !== 'string') throw validationError([{ field: name, code: 'invalid_type', message: `${humanize(name)} must be given once.` }]);
  return value;
}

function queryInt(req, name, { min = 1, max = 1_000_000_000, fallback } = {}) {
  const raw = single(req, name);
  if (raw === undefined) return fallback;
  if (!/^\d{1,10}$/.test(raw) || Number(raw) < min || Number(raw) > max) {
    throw validationError([{ field: name, code: 'out_of_range', message: `${humanize(name)} must be a whole number from ${min} to ${max}.` }]);
  }
  return Number(raw);
}

function queryDate(req, name) {
  const raw = single(req, name);
  if (raw === undefined) return undefined;
  if (!isCalendarDate(raw)) throw validationError([{ field: name, code: 'invalid_date', message: `${humanize(name)} must be a real date in YYYY-MM-DD format.` }]);
  return raw;
}

function queryEnum(req, name, allowed) {
  const raw = single(req, name);
  if (raw === undefined) return undefined;
  if (!allowed.includes(raw)) throw validationError([{ field: name, code: 'invalid_option', message: `${humanize(name)} must be one of: ${allowed.join(', ')}.` }]);
  return raw;
}

function queryText(req, name, max = 200) {
  const raw = single(req, name);
  if (raw === undefined) return undefined;
  if (raw.length > max) throw validationError([{ field: name, code: 'too_long', message: `${humanize(name)} must be ${max} characters or fewer.` }]);
  return raw.trim() || undefined;
}

function paramId(req, name = 'id') {
  const raw = req.params[name];
  if (!/^\d{1,12}$/.test(raw)) throw notFound();
  return Number(raw);
}

function sendCsv(res, filename, csv) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  // The byte-order mark makes spreadsheet applications read the file as UTF-8.
  res.send(`﻿${csv}`);
}

const pickUser = (user) => ({ email: user.email, displayName: user.displayName, role: user.role, employeeId: user.employeeId, disabled: user.disabled });
const pickOrganization = ({ name, planStartDate, evidenceStaleMonths }) => ({ name, planStartDate, evidenceStaleMonths });
const pickEmployee = ({ name, role, department, managerId, reportsExternally, mentoringHoursPerMonth, startDate, employmentStatus }) =>
  ({ name, role, department, managerId, reportsExternally, mentoringHoursPerMonth, startDate, employmentStatus });

// Validation shared by create and edit: the role must be defined and the manager must be a
// different, active employee who does not already report to this person.
async function employeeReferenceProblems(body, selfId = null) {
  const details = [];
  if (body.role !== undefined && !(await writes.roleExists(body.role.trim()))) {
    details.push({ field: 'role', code: 'unknown_reference', message: 'Role must match a defined role.' });
  }
  if (body.managerId !== undefined && body.managerId !== null) {
    const manager = await writes.getEmployee(body.managerId);
    if (selfId !== null && body.managerId === selfId) details.push({ field: 'managerId', code: 'invalid_reference', message: 'An employee cannot manage themselves.' });
    else if (!manager) details.push({ field: 'managerId', code: 'unknown_reference', message: 'Manager does not exist.' });
    else if (manager.employmentStatus !== 'active') details.push({ field: 'managerId', code: 'invalid_reference', message: `${manager.name} is archived and cannot be a manager.` });
    else if (selfId !== null && (await writes.wouldCreateCycle(selfId, body.managerId))) {
      details.push({ field: 'managerId', code: 'reporting_cycle', message: 'That manager already reports to this employee, which would create a loop.' });
    }
  }
  if (body.startDate !== undefined && body.startDate !== null && body.startDate > today()) {
    details.push({ field: 'startDate', code: 'date_in_future', message: 'Start date cannot be in the future.' });
  }
  return details;
}

// What archiving this person would change, so the admin sees it before confirming: who loses
// their manager, which account is disabled, and which skills lose recorded coverage.
async function archiveImpact(id) {
  const employee = await writes.getEmployee(id);
  if (!employee) throw notFound('The employee');
  const reports = await writes.activeDirectReports(id);
  const account = await users.getUserByEmployee(id);
  let coverage = null;
  if (employee.employmentStatus === 'active') {
    const workforce = await loadWorkforce();
    const risk = analyzeEmployees(workforce).employees.find((entry) => entry.id === id);
    coverage = risk ? {
      keystoneScore: risk.keystoneScore,
      newlyUncovered: risk.newlyUncovered,
      affectedSkills: risk.affectedSkills.map(({ id: skillId, name, busFactorBefore, busFactorAfter, becomesUncovered }) =>
        ({ id: skillId, name, busFactorBefore, busFactorAfter, becomesUncovered })),
    } : { keystoneScore: 0, newlyUncovered: [], affectedSkills: [] };
  }
  return { employee, directReports: reports, account: account ? { id: account.id, email: account.email, disabled: account.disabled } : null, coverage };
}

async function scopedQuality(req) {
  const result = await dataQuality.refreshDataQuality();
  const scope = scopeFor(req.user, result.workforce);
  const issues = scopeIssues(scope, result.issues);
  const records = scope.employeeIds === null
    ? result.evaluatedRecords
    : result.workforce.employees.filter((employee) => inScope(scope, employee.id)).length
      + result.workforce.matrix.filter((edge) => inScope(scope, edge.employeeId)).length;
  return { issues, summary: summarizeDataQuality(issues, records), evaluatedAt: result.evaluatedAt, visibility: scope.kind, result };
}

function filterIssues(issues, { status, severity, ruleCode, q }) {
  const needle = q?.toLowerCase();
  return issues.filter((issue) => (!status || (status === 'active' ? issue.status !== 'resolved' : issue.status === status))
    && (!severity || issue.severity === severity)
    && (!ruleCode || issue.ruleCode === ruleCode)
    && (!needle || `${issue.title} ${issue.entityLabel} ${issue.explanation}`.toLowerCase().includes(needle)));
}

async function checkScenario(body) {
  const workforce = await loadWorkforce();
  try {
    simulate(workforce, {
      horizonMonths: body.horizonMonths,
      departures: body.departures,
      interventions: body.interventions.map(({ source: _source, ...item }) => item),
      requirements: [],
    });
  } catch (error) {
    if (error.status === 400) throw validationError([{ field: 'scenario', code: 'invalid_reference', message: error.message }]);
    throw error;
  }
  return workforce;
}

async function assertLinkable(role, employeeId, userId) {
  if ((role === 'employee' || role === 'manager') && employeeId === null) {
    throw validationError([{ field: 'employeeId', code: 'employee_required', message: `${ROLE_LABELS[role]} accounts must be linked to an employee.` }]);
  }
  if (employeeId === null) return;
  const employee = await writes.getEmployee(employeeId);
  if (!employee) {
    throw validationError([{ field: 'employeeId', code: 'unknown_reference', message: 'Employee does not exist.' }]);
  }
  if (employee.employmentStatus === 'archived') {
    throw validationError([{ field: 'employeeId', code: 'invalid_reference', message: `${employee.name} is archived. Restore them in the Employee directory before linking an account.` }]);
  }
  const linked = await users.getUserByEmployee(employeeId);
  if (linked && linked.id !== userId) throw conflict(`${linked.displayName} is already linked to that employee.`, 'employee_already_linked');
}

const DECISION_VERBS = { reviewed: 'marked as reviewed', unreviewed: 'withdrew the review of', scheduled: 'scheduled', dismissed: 'dismissed' };
const CATEGORY_LABELS = { training: 'training', mentoring: 'mentoring', certification: 'certification', job_rotation: 'job rotation', project_experience: 'project experience' };

module.exports = function governanceRoutes() {
  const router = express.Router();

  // ---- organization ----
  router.get('/organization', async (_req, res) => {
    res.json({ ...(await organization.getOrganization()), dataUpdatedAt: await lastDataChange() });
  });

  router.patch('/organization', requirePermission('organization.manage'), validateBody(schemas.organizationUpdate), async (req, res) => {
    const updated = await withTransaction(async () => {
      const before = await organization.getOrganization();
      const after = await organization.updateOrganization(req.body, req.user.id);
      await recordAudit({
        ...auditContext(req), action: 'organization.updated', entityType: 'organization', entityId: 1, entityLabel: after.name,
        summary: `${req.user.displayName} updated the organization settings`, before: pickOrganization(before), after: pickOrganization(after),
      });
      return after;
    });
    res.json(updated);
  });

  // ---- audit history ----
  router.get('/audit-log', requirePermission('audit.read'), async (req, res) => {
    const filters = {
      page: queryInt(req, 'page', { fallback: 1, max: 100000 }),
      pageSize: queryInt(req, 'pageSize', { fallback: 25, max: 100 }),
      from: queryDate(req, 'from'),
      to: queryDate(req, 'to'),
      actorUserId: queryInt(req, 'actorUserId'),
      actionType: queryText(req, 'actionType', 80),
      entityType: queryText(req, 'entityType', 80),
      entityId: queryText(req, 'entityId', 120),
      q: queryText(req, 'q', 200),
      highSignal: queryEnum(req, 'highSignal', ['true', 'false']) === 'true',
    };
    if (filters.from && filters.to && filters.from > filters.to) {
      throw validationError([{ field: 'to', code: 'invalid_range', message: 'The end date must be on or after the start date.' }]);
    }
    const [result, facets] = await Promise.all([queryAudit(filters), auditFacets()]);
    res.json({ ...result, facets });
  });

  router.get('/audit-log/:id', requirePermission('audit.read'), async (req, res) => {
    const entry = await getAuditEntry(paramId(req));
    if (!entry) throw notFound('The audit entry');
    res.json(entry);
  });

  // ---- data quality ----
  router.get('/data-quality', requirePermission('dataQuality.read'), async (req, res) => {
    const filters = {
      status: queryEnum(req, 'status', ['open', 'acknowledged', 'resolved', 'active']),
      severity: queryEnum(req, 'severity', ['critical', 'warning', 'info']),
      ruleCode: queryText(req, 'ruleCode', 60),
      q: queryText(req, 'q', 200),
    };
    const quality = await scopedQuality(req);
    res.json({
      summary: quality.summary,
      evaluatedAt: quality.evaluatedAt,
      visibility: quality.visibility,
      total: quality.issues.length,
      rules: [...new Set(quality.issues.map((issue) => issue.ruleCode))].sort(),
      issues: filterIssues(quality.issues, filters),
    });
  });

  router.post('/data-quality/:fingerprint/acknowledge', requirePermission('dataQuality.manage'), validateBody(schemas.issueAcknowledge), async (req, res) => {
    res.json(await dataQuality.acknowledgeIssue(req.params.fingerprint.slice(0, 300), req.body.note, req.user, auditContext(req)));
  });

  router.post('/data-quality/:fingerprint/reopen', requirePermission('dataQuality.manage'), async (req, res) => {
    res.json(await dataQuality.reopenIssue(req.params.fingerprint.slice(0, 300), req.user, auditContext(req)));
  });

  // ---- change requests (review workflow) ----
  router.get('/change-requests', async (req, res) => {
    const status = queryEnum(req, 'status', ['draft', 'submitted', 'approved', 'rejected', 'cancelled']);
    const type = queryEnum(req, 'type', ['employee_skill', 'future_requirement', 'resource']);
    const mine = queryEnum(req, 'mine', ['true', 'false']) === 'true';
    const scope = scopeFor(req.user, await loadWorkforce());
    let items = await changeRequests.listChangeRequests({ status, type }, req.user, scope);
    if (mine) items = items.filter((item) => item.requestedBy.id === req.user.id);
    res.json({ items, awaitingMyReview: items.filter((item) => item.canReview).length });
  });

  router.get('/change-requests/:id', async (req, res) => {
    const scope = scopeFor(req.user, await loadWorkforce());
    res.json(await changeRequests.getChangeRequestForUser(paramId(req), req.user, scope));
  });

  router.post('/change-requests', requirePermission('changes.submit'), validateBody(schemas.changeRequestCreate), async (req, res) => {
    const scope = scopeFor(req.user, await loadWorkforce());
    res.status(201).json(await changeRequests.createChangeRequest(req.body, req.user, scope, auditContext(req)));
  });

  router.patch('/change-requests/:id', validateBody(schemas.changeRequestUpdate), async (req, res) => {
    const scope = scopeFor(req.user, await loadWorkforce());
    res.json(await changeRequests.updateDraft(paramId(req), req.body, req.user, scope, auditContext(req)));
  });

  router.post('/change-requests/:id/submit', async (req, res) => {
    res.json(await changeRequests.submitDraft(paramId(req), req.user, auditContext(req)));
  });

  router.post('/change-requests/:id/cancel', async (req, res) => {
    res.json(await changeRequests.cancelRequest(paramId(req), req.user, auditContext(req)));
  });

  router.post('/change-requests/:id/approve', requirePermission('changes.review'), validateBody(schemas.approveDecision), async (req, res) => {
    res.json(await changeRequests.reviewChangeRequest(paramId(req), { decision: 'approved', comment: req.body.comment }, req.user, auditContext(req)));
  });

  router.post('/change-requests/:id/reject', requirePermission('changes.review'), validateBody(schemas.rejectDecision), async (req, res) => {
    res.json(await changeRequests.reviewChangeRequest(paramId(req), { decision: 'rejected', comment: req.body.comment }, req.user, auditContext(req)));
  });

  // ---- the signed-in person's own profile ----
  router.get('/me/profile', async (req, res) => {
    const quality = await dataQuality.refreshDataQuality();
    const scope = scopeFor(req.user, quality.workforce);
    const requests = (await changeRequests.listChangeRequests({}, req.user, scope))
      .filter((request) => request.requestedBy.id === req.user.id
        || (req.user.employeeId !== null && request.subjectEmployeeId === req.user.employeeId));
    const staleBefore = addMonths(today(), -quality.organization.evidenceStaleMonths);
    res.json({
      profile: req.user.employeeId === null ? null : buildProfile({
        workforce: quality.workforce, employeeId: req.user.employeeId, issues: quality.issues, changeRequests: requests, staleBefore,
      }),
      changeRequests: requests,
      evidenceStaleMonths: quality.organization.evidenceStaleMonths,
      skills: quality.workforce.skills.map(({ id, name, targetProficiency }) => ({ id, name, targetProficiency })),
    });
  });

  // ---- risk acknowledgements ----
  router.get('/risk-acknowledgements', requirePermission('risk.read'), async (req, res) => {
    const status = queryEnum(req, 'status', ['active', 'closed']);
    let items = await acknowledgements.listAcknowledgements({ status });
    if (!can(req.user, 'risk.read.org')) {
      const scope = scopeFor(req.user, await loadWorkforce());
      items = items.filter((item) => item.riskType === 'skill' || inScope(scope, item.entityId));
    }
    res.json({ items });
  });

  router.post('/risk-acknowledgements', requirePermission('risk.acknowledge'), validateBody(schemas.acknowledgementCreate), async (req, res) => {
    res.status(201).json(await acknowledgements.createAcknowledgement(req.body, req.user, auditContext(req)));
  });

  router.patch('/risk-acknowledgements/:id', requirePermission('risk.acknowledge'), validateBody(schemas.acknowledgementUpdate), async (req, res) => {
    res.json(await acknowledgements.updateAcknowledgement(paramId(req), req.body, req.user, auditContext(req)));
  });

  router.post('/risk-acknowledgements/:id/close', requirePermission('risk.acknowledge'), validateBody(schemas.acknowledgementClose), async (req, res) => {
    res.json(await acknowledgements.closeAcknowledgement(paramId(req), req.body.note, req.user, auditContext(req)));
  });

  // ---- saved scenarios ----
  router.get('/scenarios', requirePermission('scenario.run'), async (_req, res) => {
    const [items, workforce] = await Promise.all([scenarios.listScenarios(), loadWorkforce()]);
    res.json({ items: items.map((scenario) => ({ ...scenario, warnings: evaluateScenario(workforce, scenario) })) });
  });

  router.post('/scenarios', requirePermission('scenario.save'), validateBody(schemas.scenario), async (req, res) => {
    const workforce = await checkScenario(req.body);
    const saved = await scenarios.createScenario(req.body, req.user, auditContext(req));
    res.status(201).json({ ...saved, warnings: evaluateScenario(workforce, saved) });
  });

  router.put('/scenarios/:id', requirePermission('scenario.save'), validateBody(schemas.scenario), async (req, res) => {
    const workforce = await checkScenario(req.body);
    const saved = await scenarios.updateScenario(paramId(req), req.body, req.user, auditContext(req));
    res.json({ ...saved, warnings: evaluateScenario(workforce, saved) });
  });

  router.delete('/scenarios/:id', requirePermission('scenario.save'), async (req, res) => {
    await scenarios.deleteScenario(paramId(req), req.user, auditContext(req));
    res.status(204).end();
  });

  // ---- AI recommendation decisions (audit only; they never change official data) ----
  router.post('/ai/decisions', requirePermission('ai.development'), validateBody(schemas.aiDecision), async (req, res) => {
    const { skillId, category, decision, employeeId = null, mentorId = null, mode, note } = req.body;
    const [skill, employee, mentor] = await Promise.all([
      writes.getSkill(skillId),
      employeeId === null ? null : writes.getEmployee(employeeId),
      mentorId === null ? null : writes.getEmployee(mentorId),
    ]);
    const details = [];
    if (!skill) details.push({ field: 'skillId', code: 'unknown_reference', message: 'Skill does not exist.' });
    if (employeeId !== null && !employee) details.push({ field: 'employeeId', code: 'unknown_reference', message: 'Participant does not exist.' });
    if (mentorId !== null && !mentor) details.push({ field: 'mentorId', code: 'unknown_reference', message: 'Mentor does not exist.' });
    if (details.length > 0) throw validationError(details);

    const auditId = await recordAudit({
      ...auditContext(req), action: `ai_recommendation.${decision}`, entityType: 'ai_recommendation',
      entityId: `skill-${skillId}-${category}`, entityLabel: `${skill.name} · ${CATEGORY_LABELS[category]}`,
      summary: `${req.user.displayName} ${DECISION_VERBS[decision]} the ${skill.name} ${CATEGORY_LABELS[category]} recommendation${employee ? ` for ${employee.name}` : ''}${mentor ? `, mentored by ${mentor.name}` : ''}`,
      after: { decision, employeeId, mentorId },
      metadata: { mode, note: note?.trim() || null },
    });
    res.status(201).json({ auditId });
  });

  // ---- exports (scoped exactly like the screens they come from) ----
  router.get('/exports/skill-map.csv', requirePermission('workforce.read.all', 'workforce.read.team'), async (req, res) => {
    const filters = {
      department: queryText(req, 'department') ?? 'all',
      q: queryText(req, 'q') ?? '',
      minProficiency: queryInt(req, 'minProficiency', { min: 1, max: 5, fallback: 3 }),
      concentratedOnly: queryEnum(req, 'concentratedOnly', ['true', 'false']) === 'true',
    };
    const workforce = await loadWorkforce();
    const scope = scopeFor(req.user, workforce);
    const analysis = scopeRisks(scope, analyze(workforce));
    const map = buildSkillMap(scopeWorkforce(scope, workforce), analysis, filters);
    // One row per visible employee-skill record. Holder counts and risk level describe the whole filtered
    // scope (so they repeat on every row of a skill); target and dependency score stay organization-wide.
    const rows = map.edges.map((edge) => {
      const person = map.employeeById.get(edge.employeeId);
      const skill = map.skillById.get(edge.skillId);
      // Qualification uses the stricter of the selected minimum and the skill's own target level.
      const level = Math.max(filters.minProficiency, skill.targetProficiency);
      const visibleRecords = map.matrix.filter((entry) => entry.skillId === skill.id && map.personIds.has(entry.employeeId));
      const qualified = map.countAtLeast(skill.id, level);
      // Same rule as the heat map: coverage is Unknown unless some evidence is verified and every
      // qualifying record is verified, so unconfirmed levels never read as healthy or critical.
      const known = visibleRecords.some((entry) => entry.lastVerifiedAt)
        && visibleRecords.filter((entry) => entry.proficiency >= level).every((entry) => entry.lastVerifiedAt);
      return {
        employee_id: person.id, employee_name: person.name, role: person.role, department: person.department,
        skill_id: skill.id, skill_name: skill.name, skill_category: skill.category,
        proficiency: edge.proficiency, verified: Boolean(edge.lastVerifiedAt), evidence_source: edge.evidenceSource,
        last_verified_at: edge.lastVerifiedAt, skill_criticality: skill.criticality,
        required_holders: skill.requiredHolders, qualified_holders: qualified,
        dependency_score: map.riskScore(skill.id), risk_level: heatState(qualified, skill.requiredHolders, known),
        coverage_scope: scope.kind === 'team' ? 'visible team' : filters.department === 'all' ? 'organization' : 'selected department',
        target_scope: 'organization', dependency_score_scope: 'organization',
      };
    });
    if (!rows.length) return res.status(422).json({ code: 'empty_export', error: 'No filtered skill-map rows to export. Try clearing the filters.' });
    const columns = Object.keys(rows[0]).map((key) => ({ label: key, value: key }));
    await recordAudit({
      ...auditContext(req), action: 'export.generated', entityType: 'report', entityId: 'skill-map', entityLabel: 'Skill map',
      summary: `Skill map exported (${rows.length} rows)`,
      // Search text may contain personal information: record only whether it was applied.
      metadata: { rows: rows.length, exportType: 'skill-map', filters: { department: filters.department, minProficiency: filters.minProficiency, concentratedOnly: filters.concentratedOnly, searchApplied: Boolean(filters.q) }, visibility: scope.kind },
    });
    res.setHeader('Cache-Control', 'no-store');
    sendCsv(res, `keystone-skill-map-${today()}.csv`, toCsv(columns, rows));
  });
  router.get('/exports/risks.csv', requirePermission('export.risks'), async (req, res) => {
    const filter = queryEnum(req, 'filter', ['all', 'at-risk']) ?? 'all';
    const workforce = await loadWorkforce();
    const scope = scopeFor(req.user, workforce);
    const analysis = scopeRisks(scope, analyze(workforce));
    const names = new Map(workforce.employees.map((employee) => [employee.id, employee.name]));
    const owners = new Map((await acknowledgements.listAcknowledgements({ status: 'active' }))
      .filter((item) => item.riskType === 'skill').map((item) => [item.entityId, item]));
    const rows = analysis.skills.filter((skill) => filter === 'all' || skill.busFactor <= 1);

    const csv = toCsv([
      { label: 'Skill', value: 'name' },
      { label: 'Criticality (1-5)', value: 'criticality' },
      { label: 'Target level', value: 'targetProficiency' },
      { label: 'People needed', value: 'requiredHolders' },
      { label: 'Qualified people', value: 'busFactor' },
      { label: 'Gap', value: 'gap' },
      { label: 'Dependency score (0-100)', value: 'keystoneScore' },
      { label: 'Qualified holders', value: (skill) => skill.holderIds.map((id) => names.get(id)).join('; ') },
      ...(scope.kind === 'team' ? [{ label: 'Qualified holders outside your team', value: 'holdersOutsideScope' }] : []),
      { label: 'Risk owner', value: (skill) => owners.get(skill.id)?.owner.name ?? '' },
      { label: 'Owner due date', value: (skill) => owners.get(skill.id)?.dueDate ?? '' },
      { label: 'Next review', value: (skill) => owners.get(skill.id)?.nextReviewDate ?? '' },
      { label: 'Basis', value: () => 'Recorded evidence. Measures dependency, not likelihood of leaving.' },
    ], rows);

    await recordAudit({
      ...auditContext(req), action: 'export.generated', entityType: 'report', entityId: 'skill-risks', entityLabel: 'Skill risk register',
      summary: `${req.user.displayName} exported the skill risk register (${rows.length} rows)`,
      metadata: { rows: rows.length, filter, visibility: scope.kind },
    });
    sendCsv(res, `keystone-skill-risks-${today()}.csv`, csv);
  });

  router.get('/exports/data-quality.csv', requirePermission('export.dataQuality'), async (req, res) => {
    const filters = {
      status: queryEnum(req, 'status', ['open', 'acknowledged', 'resolved', 'active']),
      severity: queryEnum(req, 'severity', ['critical', 'warning', 'info']),
      ruleCode: queryText(req, 'ruleCode', 60),
      q: queryText(req, 'q', 200),
    };
    const quality = await scopedQuality(req);
    const rows = filterIssues(quality.issues, filters);
    const csv = toCsv([
      { label: 'Severity', value: 'severity' },
      { label: 'Status', value: 'status' },
      { label: 'Rule', value: 'ruleCode' },
      { label: 'Issue', value: 'title' },
      { label: 'Affected record', value: 'entityLabel' },
      { label: 'Explanation', value: 'explanation' },
      { label: 'Suggested action', value: 'suggestedAction' },
      { label: 'First detected', value: 'firstDetectedAt' },
      { label: 'Acknowledged by', value: (issue) => issue.acknowledgedBy?.name ?? '' },
      { label: 'Acknowledgement note', value: (issue) => issue.acknowledgementNote ?? '' },
      { label: 'Resolved', value: (issue) => issue.resolvedAt ?? '' },
    ], rows);

    await recordAudit({
      ...auditContext(req), action: 'export.generated', entityType: 'report', entityId: 'data-quality', entityLabel: 'Data-quality issues',
      summary: `${req.user.displayName} exported ${rows.length} data-quality issue(s)`,
      metadata: { rows: rows.length, filters, visibility: quality.visibility },
    });
    sendCsv(res, `keystone-data-quality-${today()}.csv`, csv);
  });

  // ---- user administration ----
  router.get('/users', requirePermission('users.manage'), async (_req, res) => {
    res.json({ items: await users.listUsers(), roles: ROLES.map((role) => ({ value: role, label: ROLE_LABELS[role], summary: describeRole(role) })) });
  });

  router.get('/users/assignable-owners', requirePermission('risk.acknowledge'), async (_req, res) => {
    res.json({ items: await users.assignableOwners() });
  });

  router.post('/users', requirePermission('users.manage'), validateBody(schemas.userCreate), async (req, res) => {
    const { email, displayName, role, employeeId = null, password } = req.body;
    await assertLinkable(role, employeeId, null);
    if (await users.getUserByEmail(email)) throw conflict('An account with this email already exists.', 'duplicate_email');
    const created = await withTransaction(async () => {
      const user = await users.createUser({ email, displayName, role, employeeId, password });
      await recordAudit({
        ...auditContext(req), action: 'user.created', entityType: 'user', entityId: user.id, entityLabel: user.email,
        summary: `${req.user.displayName} created ${user.email} with the ${ROLE_LABELS[role]} role`, after: pickUser(user),
      });
      return user;
    });
    res.status(201).json(created);
  });

  router.patch('/users/:id', requirePermission('users.manage'), validateBody(schemas.userUpdate), async (req, res) => {
    const id = paramId(req);
    const target = await users.getUser(id);
    if (!target) throw notFound('The user');
    const removesAdmin = target.role === 'admin' && !target.disabled
      && ((req.body.role !== undefined && req.body.role !== 'admin') || req.body.disabled === true);
    if (id === req.user.id && removesAdmin) throw conflict('You cannot disable your own account or remove your own admin role.', 'self_lockout');
    if (removesAdmin && (await users.countActiveAdmins()) <= 1) throw conflict('At least one active admin account is required.', 'last_admin');
    await assertLinkable(req.body.role ?? target.role, req.body.employeeId !== undefined ? req.body.employeeId : target.employeeId, id);

    const updated = await withTransaction(async () => {
      const after = await users.updateUser(id, req.body);
      const base = { ...auditContext(req), entityType: 'user', entityId: id, entityLabel: after.email, before: pickUser(target), after: pickUser(after) };
      if (target.role !== after.role) {
        await recordAudit({ ...base, action: 'user.role_changed',
          summary: `${req.user.displayName} changed ${after.displayName}'s role from ${ROLE_LABELS[target.role]} to ${ROLE_LABELS[after.role]}` });
      }
      if (target.disabled !== after.disabled) {
        await recordAudit({ ...base, action: after.disabled ? 'user.disabled' : 'user.enabled',
          summary: `${req.user.displayName} ${after.disabled ? 'disabled' : 're-enabled'} ${after.displayName}'s account` });
      }
      if (target.displayName !== after.displayName || target.employeeId !== after.employeeId) {
        await recordAudit({ ...base, action: 'user.updated', summary: `${req.user.displayName} updated ${after.displayName}'s account details` });
      }
      // New permissions and disabled accounts take effect on the next request, not at session expiry.
      if (after.disabled || target.role !== after.role) await destroyUserSessions(id);
      return after;
    });
    res.json(updated);
  });

  router.post('/users/:id/reset-password', requirePermission('users.manage'), validateBody(schemas.passwordReset), async (req, res) => {
    const id = paramId(req);
    const target = await users.getUser(id);
    if (!target) throw notFound('The user');
    await withTransaction(async () => {
      await users.setPassword(id, req.body.password);
      await destroyUserSessions(id);
      await recordAudit({
        ...auditContext(req), action: 'user.password_reset', entityType: 'user', entityId: id, entityLabel: target.email,
        summary: `${req.user.displayName} reset the password for ${target.displayName} and signed them out`,
      });
    });
    res.status(204).end();
  });

  // ---- audited direct edits to official data (admin) ----
  router.delete('/employee-skills/:employeeId/:skillId', requirePermission('evidence.write'), async (req, res) => {
    const employeeId = paramId(req, 'employeeId');
    const skillId = paramId(req, 'skillId');
    await withTransaction(async () => {
      const current = await writes.getEvidence(employeeId, skillId);
      if (!current) throw notFound('The evidence record');
      const before = analyze(await loadWorkforce());
      await writes.deleteEvidence(employeeId, skillId);
      const ctx = auditContext(req);
      await recordAudit({
        ...ctx, action: 'employee_skill.removed', entityType: 'employee_skill', entityId: `${employeeId}:${skillId}`,
        entityLabel: `${current.employeeName} · ${current.skillName}`,
        summary: `${req.user.displayName} removed ${current.employeeName}'s ${current.skillName} evidence (was level ${current.proficiency})`,
        before: { proficiency: current.proficiency, evidenceSource: current.evidenceSource, lastVerifiedAt: current.lastVerifiedAt },
        after: null, metadata: { direct: true },
      });
      await changeRequests.recordCoverageChanges(before, analyze(await loadWorkforce()), ctx, { direct: true });
    });
    res.status(204).end();
  });

  // Global search. Each source is included only if the user may read it, and every source is
  // scoped first, so a manager never sees a name outside their team. Not audited: typing is not
  // an administrative action.
  router.get('/search', async (req, res) => {
    const query = String(req.query.q ?? '').slice(0, 100);
    const workforce = await loadWorkforce();
    const scope = scopeFor(req.user, workforce);
    const canWorkforce = can(req.user, 'workforce.read');
    const visible = canWorkforce ? scopeWorkforce(scope, workforce) : { ...workforce, employees: [], matrix: [], roles: [] };
    const risks = can(req.user, 'risk.read') ? scopeRisks(scope, analyze(workforce)) : null;
    const issues = can(req.user, 'dataQuality.read') ? (await scopedQuality(req)).issues : [];
    const scenarioList = can(req.user, 'scenario.run') ? await scenarios.listScenarios() : [];
    const changes = can(req.user, 'changes.submit') ? await changeRequests.listChangeRequests({}, req.user, scope) : [];
    const permissions = new Set(['workforce.read', 'risk.read', 'dataQuality.read'].filter((permission) => can(req.user, permission)));
    res.json({ ...search({ query, workforce: visible, risks, issues, scenarios: scenarioList, changes, permissions }), visibility: scope.kind });
  });

  // Suggestions: deterministic next steps from the same scoped data the pages show. Each says
  // what it is based on; dismissing one is a personal preference and is not audited.
  router.get('/suggestions', async (req, res) => {
    const workforce = await loadWorkforce();
    const scope = scopeFor(req.user, workforce);
    const permissions = new Set(['risk.read', 'risk.acknowledge', 'scenario.run', 'ai.development', 'employee.edit', 'changes.review.planning', 'dataQuality.read']
      .filter((permission) => can(req.user, permission)));
    const visible = can(req.user, 'workforce.read') ? scopeWorkforce(scope, workforce) : { ...workforce, employees: [], matrix: [], roles: [] };
    const risks = permissions.has('risk.read') ? scopeRisks(scope, analyze(workforce)) : null;
    let acknowledgementList = [];
    if (permissions.has('risk.read')) {
      acknowledgementList = await acknowledgements.listAcknowledgements({ status: 'active' });
      if (!can(req.user, 'risk.read.org')) acknowledgementList = acknowledgementList.filter((item) => item.riskType === 'skill' || inScope(scope, item.entityId));
    }
    const issues = permissions.has('dataQuality.read') ? (await scopedQuality(req)).issues : [];
    const successionData = can(req.user, 'succession.read') ? scopeSuccession(scope, analyzeSuccession(workforce)) : null;
    const items = buildSuggestions({ workforce: visible, risks, acknowledgements: acknowledgementList, issues, succession: successionData, permissions });
    const dismissed = new Map((await dismissals.listDismissed(req.user.id)).map((row) => [row.key, row.dismissedAt]));
    res.json({
      items: items.filter((item) => !dismissed.has(item.key)),
      dismissed: items.filter((item) => dismissed.has(item.key)).map((item) => ({ ...item, dismissedAt: dismissed.get(item.key) })),
      visibility: scope.kind,
    });
  });

  router.post('/suggestions/dismiss', validateBody(schemas.suggestionKey), async (req, res) => {
    await dismissals.dismiss(req.user.id, req.body.key, new Date().toISOString());
    res.status(204).end();
  });

  router.post('/suggestions/restore', validateBody(schemas.suggestionKey), async (req, res) => {
    await dismissals.restore(req.user.id, req.body.key);
    res.status(204).end();
  });

  // Saved views: a user's own named filter sets, per page. Personal, private, not audited.
  router.get('/saved-views', async (req, res) => {
    const view = typeof req.query.view === 'string' && /^[a-z]+$/.test(req.query.view) ? req.query.view : undefined;
    res.json({ items: await savedViews.listSavedViews(req.user.id, view) });
  });

  router.post('/saved-views', validateBody(schemas.savedViewCreate), async (req, res) => {
    const saved = await savedViews.saveView(req.user.id, { view: req.body.view, name: req.body.name.trim(), filters: req.body.filters }, new Date().toISOString());
    res.status(201).json(saved);
  });

  router.delete('/saved-views/:id', async (req, res) => {
    const removed = await savedViews.deleteView(req.user.id, paramId(req));
    if (!removed) throw notFound('The saved view');
    res.status(204).end();
  });

  router.get('/employees', requirePermission('employee.edit'), async (_req, res) => {
    res.json({ items: await writes.listEmployees() });
  });

  router.post('/employees', requirePermission('employee.edit'), validateBody(schemas.employeeCreate), async (req, res) => {
    const details = await employeeReferenceProblems(req.body);
    if (details.length > 0) throw validationError(details);
    const fields = { ...req.body };
    for (const key of ['name', 'role', 'department']) if (typeof fields[key] === 'string') fields[key] = fields[key].trim();
    if (fields.managerId !== undefined && fields.managerId !== null && fields.reportsExternally === undefined) fields.reportsExternally = false;

    const created = await withTransaction(async () => {
      let employee;
      try {
        employee = await writes.createEmployee(fields);
      } catch (error) {
        if (String(error.code).startsWith('SQLITE_CONSTRAINT')) throw conflict('Another employee already has that name.', 'duplicate_name');
        throw error;
      }
      const set = Object.entries(pickEmployee(employee)).filter(([, value]) => value !== null && value !== undefined && value !== false).map(([key]) => humanize(key).toLowerCase());
      await recordAudit({
        ...auditContext(req), action: 'employee.created', entityType: 'employee', entityId: employee.id, entityLabel: employee.name,
        summary: `${req.user.displayName} added ${employee.name} as ${employee.role} in ${employee.department} (${set.join(', ')})`,
        after: pickEmployee(employee), metadata: { setFields: Object.keys(pickEmployee(employee)) }, highSignal: true,
      });
      return employee;
    });
    res.status(201).json(created);
  });

  router.get('/employees/:id/impact', requirePermission('employee.edit'), async (req, res) => {
    res.json(await archiveImpact(paramId(req)));
  });

  router.post('/employees/:id/archive', requirePermission('employee.edit'), validateBody(schemas.employeeArchive), async (req, res) => {
    const id = paramId(req);
    const impact = await archiveImpact(id);
    if (impact.employee.employmentStatus === 'archived') throw conflict(`${impact.employee.name} is already archived.`, 'already_archived');
    const reassignTo = req.body.reassignReportsTo ?? null;
    if (impact.directReports.length > 0) {
      if (reassignTo === null) {
        throw validationError([{ field: 'reassignReportsTo', code: 'reports_need_manager',
          message: `${impact.employee.name} manages ${impact.directReports.length} ${impact.directReports.length === 1 ? 'person' : 'people'}. Choose who they report to now.` }]);
      }
      const next = await writes.getEmployee(reassignTo);
      if (!next || next.employmentStatus !== 'active') throw validationError([{ field: 'reassignReportsTo', code: 'unknown_reference', message: 'The new manager must be an active employee.' }]);
      if (reassignTo === id) throw validationError([{ field: 'reassignReportsTo', code: 'invalid_reference', message: 'Reports cannot be reassigned to the person being archived.' }]);
      // Promoting one of the direct reports is allowed; the transaction below clears their own link to the archived person.
    }
    const now = new Date().toISOString();

    const result = await withTransaction(async () => {
      let reassigned = 0;
      if (impact.directReports.length > 0) {
        reassigned = await writes.reassignReports(id, reassignTo);
        // The new manager cannot report to the archived person, so clear that link if it existed.
        await writes.updateEmployee(reassignTo, (await writes.getEmployee(reassignTo)).managerId === id ? { managerId: null } : {});
        for (const report of impact.directReports) {
          if (report.id === reassignTo) continue;
          await recordAudit({
            ...auditContext(req), action: 'employee.updated', entityType: 'employee', entityId: report.id, entityLabel: report.name,
            summary: `${report.name} now reports to ${(await writes.getEmployee(reassignTo)).name} because ${impact.employee.name} was archived`,
            before: { managerId: id }, after: { managerId: reassignTo }, metadata: { changedFields: ['managerId'], cause: 'employee.archived' },
          });
        }
      }
      await writes.setEmploymentStatus(id, 'archived', now);
      let accountDisabled = false;
      if (impact.account && !impact.account.disabled) {
        await users.updateUser(impact.account.id, { disabled: true });
        await destroyUserSessions(impact.account.id);
        accountDisabled = true;
        await recordAudit({
          ...auditContext(req), action: 'user.disabled', entityType: 'user', entityId: impact.account.id, entityLabel: impact.account.email,
          summary: `${req.user.displayName} disabled ${impact.account.email} because ${impact.employee.name} was archived`,
          before: { disabled: false }, after: { disabled: true }, metadata: { cause: 'employee.archived' },
        });
      }
      const after = await writes.getEmployee(id);
      await recordAudit({
        ...auditContext(req), action: 'employee.archived', entityType: 'employee', entityId: id, entityLabel: after.name,
        summary: `${req.user.displayName} archived ${after.name}${reassigned ? `, moving ${reassigned} report(s) to ${(await writes.getEmployee(reassignTo)).name}` : ''}${accountDisabled ? ' and disabled their account' : ''}`,
        before: pickEmployee(impact.employee), after: pickEmployee(after),
        metadata: { reassignedReports: reassigned, reassignedTo: reassignTo, accountDisabled, newlyUncovered: impact.coverage?.newlyUncovered ?? [] },
        highSignal: true,
      });
      return { employee: after, reassignedReports: reassigned, accountDisabled, newlyUncovered: impact.coverage?.newlyUncovered ?? [] };
    });
    res.json(result);
  });

  router.post('/employees/:id/restore', requirePermission('employee.edit'), async (req, res) => {
    const id = paramId(req);
    const current = await writes.getEmployee(id);
    if (!current) throw notFound('The employee');
    if (current.employmentStatus !== 'archived') throw conflict(`${current.name} is not archived.`, 'not_archived');
    const restored = await withTransaction(async () => {
      await writes.setEmploymentStatus(id, 'active', null);
      // The manager may have been archived since. A restored person cannot report to an archived
      // manager, so the line is cleared and the response says so; the admin can set a new one.
      const manager = current.managerId === null ? null : await writes.getEmployee(current.managerId);
      const managerCleared = manager !== null && manager.employmentStatus !== 'active';
      if (managerCleared) await writes.updateEmployee(id, { managerId: null, reportsExternally: false });
      const after = await writes.getEmployee(id);
      const account = await users.getUserByEmployee(id);
      await recordAudit({
        ...auditContext(req), action: 'employee.restored', entityType: 'employee', entityId: id, entityLabel: after.name,
        summary: `${req.user.displayName} restored ${after.name}${managerCleared ? ` (no manager: ${manager.name} is archived)` : ''}${account?.disabled ? '; their account stays disabled until re-enabled' : ''}`,
        before: pickEmployee(current), after: pickEmployee(after), metadata: { managerCleared, previousManagerId: managerCleared ? manager.id : null }, highSignal: true,
      });
      return { employee: after, accountStillDisabled: Boolean(account?.disabled), managerCleared, previousManagerName: managerCleared ? manager.name : null };
    });
    res.json(restored);
  });

  router.patch('/employees/:id', requirePermission('employee.edit'), validateBody(schemas.employeeUpdate), async (req, res) => {
    const id = paramId(req);
    const updated = await withTransaction(async () => {
      const current = await writes.getEmployee(id);
      if (!current) throw notFound('The employee');
      const details = await employeeReferenceProblems(req.body, id);
      if (details.length > 0) throw validationError(details);

      const fields = { ...req.body };
      for (const key of ['name', 'role', 'department']) if (typeof fields[key] === 'string') fields[key] = fields[key].trim();
      if (fields.managerId !== undefined && fields.managerId !== null && fields.reportsExternally === undefined) fields.reportsExternally = false;
      try {
        await writes.updateEmployee(id, fields);
      } catch (error) {
        if (String(error.code).startsWith('SQLITE_CONSTRAINT')) throw conflict('Another employee already has that name.', 'duplicate_name');
        throw error;
      }
      const after = await writes.getEmployee(id);
      const changed = Object.keys(pickEmployee(after)).filter((key) => pickEmployee(after)[key] !== pickEmployee(current)[key]);
      await recordAudit({
        ...auditContext(req), action: 'employee.updated', entityType: 'employee', entityId: id, entityLabel: after.name,
        summary: `${req.user.displayName} updated ${after.name}'s profile (${changed.map(humanize).join(', ').toLowerCase() || 'no changes'})`,
        before: pickEmployee(current), after: pickEmployee(after), metadata: { changedFields: changed },
      });
      return after;
    });
    res.json(updated);
  });

  router.patch('/future-requirements/:id', requirePermission('futureRequirement.configure'), validateBody(schemas.futureRequirementUpdate), async (req, res) => {
    const id = paramId(req);
    const updated = await withTransaction(async () => {
      const current = await writes.getFutureRequirement(id);
      if (!current) throw notFound('The future requirement');
      const merged = { ...current, ...req.body };
      try {
        queries.validateFutureRequirementInput({ ...merged, skillName: undefined, skillId: current.skillId });
      } catch (error) {
        if (error.status === 400) throw validationError([{ field: '(body)', code: 'invalid', message: error.message }]);
        throw error;
      }
      await writes.updateFutureRequirement(id, req.body);
      const after = await writes.getFutureRequirement(id);
      await recordAudit({
        ...auditContext(req), action: 'future_requirement.updated', entityType: 'future_requirement', entityId: id, entityLabel: current.skillName,
        summary: `${req.user.displayName} updated the ${current.skillName} future requirement`,
        before: changeRequests.pickRequirement(current), after: changeRequests.pickRequirement(after),
      });
      return after;
    });
    res.json(updated);
  });

  router.post('/future-requirements/:id/approve', requirePermission('futureRequirement.configure'), validateBody(schemas.approveDecision), async (req, res) => {
    const id = paramId(req);
    const approved = await withTransaction(async () => {
      const current = await writes.getFutureRequirement(id);
      if (!current) throw notFound('The future requirement');
      if (current.status === 'reviewed') throw conflict('This requirement is already approved.', 'invalid_status');
      await writes.updateFutureRequirement(id, { status: 'reviewed' });
      const after = await writes.getFutureRequirement(id);
      await recordAudit({
        ...auditContext(req), action: 'future_requirement.approved', entityType: 'future_requirement', entityId: id, entityLabel: current.skillName,
        summary: `${req.user.displayName} approved the ${current.skillName} requirement: ${current.requiredHolders} people at level ${current.targetProficiency}+ from month ${current.effectiveMonth}`,
        before: changeRequests.pickRequirement(current), after: changeRequests.pickRequirement(after),
        metadata: { comment: req.body.comment?.trim() || null },
      });
      return after;
    });
    res.json(approved);
  });

  router.post('/future-requirements/:id/reject', requirePermission('futureRequirement.configure'), validateBody(schemas.rejectDecision), async (req, res) => {
    const id = paramId(req);
    const rejected = await withTransaction(async () => {
      const current = await writes.getFutureRequirement(id);
      if (!current) throw notFound('The future requirement');
      if (current.status !== 'proposed') throw conflict('Only proposed requirements can be rejected. Remove an approved one instead.', 'invalid_status');
      await writes.deleteFutureRequirement(id);
      await recordAudit({
        ...auditContext(req), action: 'future_requirement.rejected', entityType: 'future_requirement', entityId: id, entityLabel: current.skillName,
        summary: `${req.user.displayName} rejected the proposed ${current.skillName} requirement`,
        before: changeRequests.pickRequirement(current), after: null, metadata: { comment: req.body.comment.trim() },
      });
      return current;
    });
    res.json({ rejected: true, requirement: rejected });
  });

  router.delete('/future-requirements/:id', requirePermission('futureRequirement.configure'), async (req, res) => {
    const id = paramId(req);
    await withTransaction(async () => {
      const current = await writes.getFutureRequirement(id);
      if (!current) throw notFound('The future requirement');
      await writes.deleteFutureRequirement(id);
      await recordAudit({
        ...auditContext(req), action: 'future_requirement.removed', entityType: 'future_requirement', entityId: id, entityLabel: current.skillName,
        summary: `${req.user.displayName} removed the ${current.skillName} requirement from the plan`,
        before: changeRequests.pickRequirement(current), after: null,
      });
    });
    res.status(204).end();
  });

  router.put('/resources/:slug', requirePermission('resource.configure'), validateBody(schemas.resourceFields), async (req, res) => {
    const { slug } = req.params;
    if (!/^[a-z0-9][a-z0-9-]{2,79}$/.test(slug)) {
      throw validationError([{ field: 'slug', code: 'invalid_format', message: 'Identifier must use lowercase letters, digits and hyphens.' }]);
    }
    const fields = await changeRequests.validateResourceFields(req.body);
    const result = await withTransaction(async () => {
      const before = await writes.getResource(slug);
      const after = await writes.upsertResource(slug, fields);
      await changeRequests.recordResourceAudit(before, after, auditContext(req), { direct: true });
      return { after, created: !before };
    });
    res.status(result.created ? 201 : 200).json(result.after);
  });

  router.put('/roles/:roleId/requirements/:skillId', requirePermission('roleRequirement.configure'), validateBody(schemas.roleRequirement), async (req, res) => {
    const roleId = paramId(req, 'roleId');
    const skillId = paramId(req, 'skillId');
    const saved = await withTransaction(async () => {
      const [role, skill] = await Promise.all([writes.getRole(roleId), writes.getSkill(skillId)]);
      if (!role) throw notFound('The role');
      if (!skill) throw notFound('The skill');
      const before = await writes.getRoleRequirement(roleId, skillId);
      await writes.upsertRoleRequirement(roleId, skillId, req.body.minimumProficiency);
      const after = await writes.getRoleRequirement(roleId, skillId);
      await recordAudit({
        ...auditContext(req), action: before ? 'role_requirement.updated' : 'role_requirement.created',
        entityType: 'role_requirement', entityId: `${roleId}:${skillId}`, entityLabel: `${role.name} · ${skill.name}`,
        summary: before
          ? `${req.user.displayName} changed ${role.name} to need ${skill.name} at level ${after.minimumProficiency}+ (was ${before.minimumProficiency}+)`
          : `${req.user.displayName} added ${skill.name} at level ${after.minimumProficiency}+ to the ${role.name} requirements`,
        before: before ? { minimumProficiency: before.minimumProficiency } : null, after: { minimumProficiency: after.minimumProficiency },
      });
      return after;
    });
    res.json(saved);
  });

  router.delete('/roles/:roleId/requirements/:skillId', requirePermission('roleRequirement.configure'), async (req, res) => {
    const roleId = paramId(req, 'roleId');
    const skillId = paramId(req, 'skillId');
    await withTransaction(async () => {
      const [role, skill, before] = await Promise.all([writes.getRole(roleId), writes.getSkill(skillId), writes.getRoleRequirement(roleId, skillId)]);
      if (!role || !skill || !before) throw notFound('The role requirement');
      await writes.deleteRoleRequirement(roleId, skillId);
      await recordAudit({
        ...auditContext(req), action: 'role_requirement.removed', entityType: 'role_requirement', entityId: `${roleId}:${skillId}`,
        entityLabel: `${role.name} · ${skill.name}`,
        summary: `${req.user.displayName} removed ${skill.name} from the ${role.name} requirements`,
        before: { minimumProficiency: before.minimumProficiency }, after: null,
      });
    });
    res.status(204).end();
  });

  return router;
};
