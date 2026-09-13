const { analyze, roleCandidatesFor } = require('./risk');
const { addMonths } = require('./clock');

// Deterministic data-quality rules. Pure: same inputs, same issues, in the same order. Each issue has a
// stable fingerprint (rule, entity) so its acknowledgement survives re-evaluation, and lists the people it
// concerns so managers only see issues about their own team.
//
// Severity is about consequence, not alarm: critical means scores or succession are wrong or unsafe to
// rely on today; warning means a real gap that needs an owner; info is housekeeping.

const SEVERITY_ORDER = { critical: 0, warning: 1, info: 2 };
const WEIGHTS = { critical: 10, warning: 3, info: 1 };

function helpers(workforce, issues) {
  const employeeById = new Map(workforce.employees.map((employee) => [employee.id, employee]));
  const skillById = new Map(workforce.skills.map((skill) => [skill.id, skill]));
  return {
    employeeById,
    skillById,
    nameOf: (id) => employeeById.get(id)?.name ?? `Employee ${id}`,
    skillName: (id) => skillById.get(id)?.name
      ?? workforce.futureRequirements?.find((requirement) => requirement.skillId === id)?.skillName ?? `Skill ${id}`,
    add: (issue) => issues.push({
      employeeIds: [],
      link: null,
      ...issue,
      entityId: issue.entityId === undefined || issue.entityId === null ? null : String(issue.entityId),
      fingerprint: `${issue.ruleCode}:${issue.entityType}:${issue.entityId}`,
    }),
  };
}

const sortIssues = (issues) => issues.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
  || a.ruleCode.localeCompare(b.ruleCode) || String(a.entityLabel).localeCompare(String(b.entityLabel)));

// Checks one scenario, saved or still being edited, for plans that cannot work as written.
function evaluateScenario(workforce, scenario, analysis = analyze(workforce)) {
  const issues = [];
  const { employeeById, skillById, nameOf, skillName, add } = helpers(workforce, issues);
  const link = { view: 'timemachine', scenarioId: scenario.id };
  const qualifiedHolders = (skillId) => {
    const skill = skillById.get(skillId);
    return skill ? workforce.matrix.filter((edge) => edge.skillId === skillId && edge.proficiency >= skill.targetProficiency).map((edge) => edge.employeeId) : [];
  };

  for (const departure of scenario.departures) {
    const employee = employeeById.get(departure.employeeId);
    if (!employee) continue;
    const role = workforce.roles.find((entry) => entry.name === employee.role);
    const ready = role ? roleCandidatesFor(workforce, role, [employee.id]).some((candidate) => candidate.status === 'ready') : false;
    if (ready) continue;
    const soleCritical = analysis.skills.some((skill) => skill.criticality >= 4 && skill.busFactor === 1 && skill.holderIds[0] === employee.id);
    add({ ruleCode: 'SCENARIO_DEPARTURE_NO_SUCCESSOR', severity: soleCritical ? 'critical' : 'warning', title: 'Departure without a ready successor',
      explanation: role
        ? `In "${scenario.name}", ${employee.name} leaves in month ${departure.month}, and nobody else meets every ${role.name} requirement on record.`
        : `In "${scenario.name}", ${employee.name} leaves in month ${departure.month}, and the ${employee.role} role has no succession requirements recorded.`,
      entityType: 'scenario', entityId: `${scenario.id}:departure:${employee.id}`, entityLabel: `${scenario.name} · ${employee.name}`,
      employeeIds: [employee.id], link,
      suggestedAction: 'Plan verified development that completes before the departure, or record evidence for a potential successor.' });
  }

  for (const item of scenario.interventions) {
    const learner = nameOf(item.employeeId);
    if (item.mentorId !== null && item.mentorId !== undefined) {
      const mentorEdge = workforce.matrix.find((edge) => edge.employeeId === item.mentorId && edge.skillId === item.skillId);
      const needed = Math.max(4, item.targetProficiency);
      if (!mentorEdge || mentorEdge.proficiency < needed) {
        add({ ruleCode: 'SCENARIO_MENTOR_BELOW_LEVEL', severity: 'warning', title: 'Mentor below the required level',
          explanation: `In "${scenario.name}", ${nameOf(item.mentorId)} mentors ${learner} in ${skillName(item.skillId)} but is recorded at ${mentorEdge ? `level ${mentorEdge.proficiency}` : 'no level'}; mentors need level ${needed}+.`,
          entityType: 'scenario', entityId: `${scenario.id}:mentor:${item.employeeId}:${item.skillId}`, entityLabel: `${scenario.name} · ${learner}`,
          employeeIds: [item.mentorId, item.employeeId], link,
          suggestedAction: 'Choose a mentor recorded at level 4 or higher, or record verified evidence for this mentor.' });
      }
    }

    // The departure that removes the last qualified holder is the event this development should prevent.
    const holders = qualifiedHolders(item.skillId);
    const leaving = scenario.departures.filter((departure) => holders.includes(departure.employeeId)).sort((a, b) => a.month - b.month);
    let remaining = holders.length;
    let gapMonth = null;
    for (const departure of leaving) {
      remaining -= 1;
      if (remaining === 0) { gapMonth = departure.month; break; }
    }
    if (gapMonth !== null && item.completionMonth >= gapMonth) {
      add({ ruleCode: 'SCENARIO_INTERVENTION_AFTER_RISK', severity: 'warning', title: 'Development finishes after the coverage gap opens',
        explanation: `In "${scenario.name}", ${learner}'s ${skillName(item.skillId)} development completes in month ${item.completionMonth}, but the last qualified holder leaves in month ${gapMonth}.`,
        entityType: 'scenario', entityId: `${scenario.id}:late:${item.employeeId}:${item.skillId}`, entityLabel: `${scenario.name} · ${learner}`,
        employeeIds: [item.employeeId, ...leaving.map((departure) => departure.employeeId)], link,
        suggestedAction: `Complete the development before month ${gapMonth}, or confirm whether the departure date can move.` });
    }
  }
  return sortIssues(issues);
}

function evaluateDataQuality({
  workforce, scenarios = [], changeRequests = [], users = [], externalReporting = new Set(), organization, today,
}) {
  const analysis = analyze(workforce);
  const issues = [];
  const { employeeById, skillById, nameOf, skillName, add } = helpers(workforce, issues);
  const staleBefore = addMonths(today, -organization.evidenceStaleMonths);

  // Evidence records ------------------------------------------------------------------------------
  const pairCounts = new Map();
  for (const edge of workforce.matrix) {
    const key = `${edge.employeeId}:${edge.skillId}`;
    const label = `${nameOf(edge.employeeId)} · ${skillName(edge.skillId)}`;
    const link = { view: 'data', tab: 'evidence', query: nameOf(edge.employeeId) };
    const skill = skillById.get(edge.skillId);
    pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);

    if (!Number.isInteger(edge.proficiency) || edge.proficiency < 1 || edge.proficiency > 5) {
      add({ ruleCode: 'EVIDENCE_INVALID_PROFICIENCY', severity: 'critical', title: 'Proficiency outside the 1–5 scale',
        explanation: `${label} is recorded at "${edge.proficiency}", which scoring cannot interpret.`,
        entityType: 'employee_skill', entityId: key, entityLabel: label, employeeIds: [edge.employeeId], link,
        suggestedAction: 'Correct the recorded level to a whole number from 1 to 5.' });
      continue;
    }
    if (typeof edge.evidenceSource !== 'string' || edge.evidenceSource.trim() === '') {
      add({ ruleCode: 'EVIDENCE_MISSING_SOURCE', severity: 'warning', title: 'Evidence has no source',
        explanation: `${label} is recorded at level ${edge.proficiency} without saying where that level came from.`,
        entityType: 'employee_skill', entityId: key, entityLabel: label, employeeIds: [edge.employeeId], link,
        suggestedAction: 'Record the evidence source, such as a project review or assessment.' });
    }

    const countsTowardCoverage = Boolean(skill) && edge.proficiency >= skill.targetProficiency;
    if (edge.lastVerifiedAt === null || edge.lastVerifiedAt === undefined) {
      if (countsTowardCoverage && skill.criticality >= 4) {
        add({ ruleCode: 'EVIDENCE_UNVERIFIED', severity: 'warning', title: 'Unverified evidence counts toward a critical skill',
          explanation: `${label} (level ${edge.proficiency}) counts as coverage for a criticality ${skill.criticality}/5 skill, but its verification date is unknown.`,
          entityType: 'employee_skill', entityId: key, entityLabel: label, employeeIds: [edge.employeeId], link,
          suggestedAction: 'Confirm the level with a review or assessment and record the verification date.' });
      }
    } else if (edge.lastVerifiedAt > today) {
      add({ ruleCode: 'EVIDENCE_VERIFIED_IN_FUTURE', severity: 'warning', title: 'Verification date is in the future',
        explanation: `${label} says it was verified on ${edge.lastVerifiedAt}, which is after today.`,
        entityType: 'employee_skill', entityId: key, entityLabel: label, employeeIds: [edge.employeeId], link,
        suggestedAction: 'Correct the verification date.' });
    } else if (edge.lastVerifiedAt < staleBefore) {
      add({ ruleCode: 'EVIDENCE_STALE', severity: countsTowardCoverage ? 'warning' : 'info', title: 'Evidence is due for re-verification',
        explanation: `${label} was last verified on ${edge.lastVerifiedAt}, more than ${organization.evidenceStaleMonths} months ago${countsTowardCoverage ? ', and it still counts toward coverage' : ''}.`,
        entityType: 'employee_skill', entityId: key, entityLabel: label, employeeIds: [edge.employeeId], link,
        suggestedAction: 'Re-verify the level and update the verification date.' });
    }
  }
  for (const [key, count] of pairCounts) {
    if (count < 2) continue;
    const [employeeId, skillId] = key.split(':').map(Number);
    add({ ruleCode: 'EVIDENCE_DUPLICATE', severity: 'critical', title: 'Duplicate evidence records',
      explanation: `${nameOf(employeeId)} has ${count} separate records for ${skillName(skillId)}, so coverage could be counted twice.`,
      entityType: 'employee_skill', entityId: key, entityLabel: `${nameOf(employeeId)} · ${skillName(skillId)}`, employeeIds: [employeeId],
      link: { view: 'data', tab: 'evidence', query: nameOf(employeeId) }, suggestedAction: 'Keep the record with the best evidence and remove the others.' });
  }

  const competing = new Map();
  for (const request of changeRequests) {
    if (request.type !== 'employee_skill' || request.status !== 'submitted') continue;
    competing.set(request.targetKey, [...(competing.get(request.targetKey) ?? []), request]);
  }
  for (const [key, requests] of competing) {
    if (requests.length < 2) continue;
    add({ ruleCode: 'EVIDENCE_DUPLICATE_SUBMISSION', severity: 'warning', title: 'Competing evidence submissions',
      explanation: `${requests.length} pending submissions propose values for ${requests[0].targetLabel}; approving both would overwrite one with the other.`,
      entityType: 'employee_skill', entityId: key, entityLabel: requests[0].targetLabel, employeeIds: [requests[0].subjectEmployeeId],
      link: { view: 'reviews' }, suggestedAction: 'Approve the submission with the stronger evidence and reject the other.' });
  }

  // Requirements and coverage ---------------------------------------------------------------------
  for (const role of workforce.roles) {
    for (const requirement of role.requirements) {
      const met = workforce.matrix.some((edge) => edge.skillId === requirement.skillId && edge.proficiency >= requirement.minimumProficiency);
      if (met) continue;
      add({ ruleCode: 'ROLE_SKILL_NO_EVIDENCE', severity: role.criticality >= 4 ? 'critical' : 'warning',
        title: 'Role requirement nobody meets on record',
        explanation: `${role.name} requires ${skillName(requirement.skillId)} at level ${requirement.minimumProficiency}+, and no employee has evidence at that level.`,
        entityType: 'role_requirement', entityId: `${role.id}:${requirement.skillId}`, entityLabel: `${role.name} · ${skillName(requirement.skillId)}`,
        link: { view: 'network', skillId: requirement.skillId },
        suggestedAction: 'Record evidence for anyone who holds this skill, or plan development before relying on succession for this role.' });
    }
  }

  for (const skill of analysis.skills) {
    if (skill.metadataSource === 'unspecified') {
      add({ ruleCode: 'SKILL_REQUIREMENT_UNSPECIFIED', severity: 'info', title: 'Skill requirement not configured',
        explanation: `${skill.name} uses default criticality and coverage because no requirement was recorded.`,
        entityType: 'skill', entityId: skill.id, entityLabel: skill.name, link: { view: 'data', tab: 'skills', query: skill.name },
        suggestedAction: 'Set the criticality, target level and people needed for this skill.' });
    }
    if (skill.criticality < 4) continue;
    if (skill.busFactor === 0) {
      add({ ruleCode: 'CRITICAL_SKILL_UNCOVERED', severity: 'critical', title: 'Critical skill with no qualified holder',
        explanation: `${skill.name} has criticality ${skill.criticality}/5 and nobody holds it at level ${skill.targetProficiency}+ on record.`,
        entityType: 'skill', entityId: skill.id, entityLabel: skill.name, link: { view: 'network', skillId: skill.id },
        suggestedAction: 'Plan development or hiring, and check whether unrecorded expertise exists.' });
    } else if (skill.busFactor === 1) {
      const [holderId] = skill.holderIds;
      add({ ruleCode: 'CRITICAL_SKILL_SINGLE_HOLDER', severity: skill.criticality === 5 ? 'critical' : 'warning',
        title: 'Critical skill held by one person',
        explanation: `${skill.name} (criticality ${skill.criticality}/5) depends on ${nameOf(holderId)} alone at level ${skill.targetProficiency}+.`,
        entityType: 'skill', entityId: skill.id, entityLabel: skill.name, employeeIds: [holderId], link: { view: 'people', employeeId: holderId },
        suggestedAction: 'Develop a second qualified person and record an owner for the risk.' });
    }
  }

  for (const requirement of workforce.futureRequirements ?? []) {
    if (requirement.status !== 'proposed') continue;
    const effectiveDate = addMonths(organization.planStartDate, requirement.effectiveMonth);
    if (effectiveDate >= today) continue;
    add({ ruleCode: 'FUTURE_REQUIREMENT_PAST_EFFECTIVE', severity: 'warning', title: 'Proposed requirement already past its effective date',
      explanation: `${requirement.skillName} was due to apply from ${effectiveDate} (month ${requirement.effectiveMonth} of the plan) but is still only proposed.`,
      entityType: 'future_requirement', entityId: requirement.id, entityLabel: requirement.skillName, link: { view: 'data', tab: 'future', query: requirement.skillName },
      suggestedAction: 'Approve it with a future effective month, or remove it from the plan.' });
  }

  for (const resource of workforce.learningResources ?? []) {
    if (!resource.verified || resource.url || resource.provider) continue;
    add({ ruleCode: 'RESOURCE_VERIFIED_WITHOUT_SOURCE', severity: 'warning', title: 'Verified resource without a provider or link',
      explanation: `"${resource.title}" is marked verified, so AI plans may recommend it, but it names no provider or URL that confirms it exists.`,
      entityType: 'resource', entityId: resource.id, entityLabel: resource.title, link: { view: 'data', tab: 'learning', query: resource.title },
      suggestedAction: 'Add the provider or a link, or mark the entry unverified until someone confirms it.' });
  }

  // Saved scenarios -------------------------------------------------------------------------------
  for (const scenario of scenarios) issues.push(...evaluateScenario(workforce, scenario, analysis));

  // Relationships ---------------------------------------------------------------------------------
  const roleNames = new Set(workforce.roles.map((role) => role.name));
  for (const employee of workforce.employees) {
    const link = { view: 'data', tab: 'people', query: employee.name };
    if (employee.managerId === null || employee.managerId === undefined) {
      if (!externalReporting.has(employee.id)) {
        add({ ruleCode: 'EMPLOYEE_MISSING_MANAGER', severity: 'warning', title: 'No manager recorded',
          explanation: `${employee.name} has no reporting line, so no manager can see their team insights or review their evidence.`,
          entityType: 'employee', entityId: employee.id, entityLabel: employee.name, employeeIds: [employee.id], link,
          suggestedAction: 'Record the manager, or mark the person as reporting outside this organization.' });
      }
    } else if (!employeeById.has(employee.managerId) || employee.managerId === employee.id) {
      add({ ruleCode: 'EMPLOYEE_MANAGER_INVALID', severity: 'critical', title: 'Manager reference is invalid',
        explanation: `${employee.name}'s manager points to a record that does not exist, or to themselves.`,
        entityType: 'employee', entityId: employee.id, entityLabel: employee.name, employeeIds: [employee.id], link,
        suggestedAction: 'Correct the reporting line.' });
    } else {
      const seen = new Set([employee.id]);
      for (let current = employee.managerId; current !== null && current !== undefined; current = employeeById.get(current)?.managerId) {
        if (seen.has(current)) {
          add({ ruleCode: 'EMPLOYEE_REPORTING_CYCLE', severity: 'critical', title: 'Reporting line loops',
            explanation: `Following ${employee.name}'s managers leads back to someone already in the chain, so team scoping is unreliable.`,
            entityType: 'employee', entityId: employee.id, entityLabel: employee.name, employeeIds: [employee.id], link,
            suggestedAction: 'Correct one of the manager links in the loop.' });
          break;
        }
        seen.add(current);
      }
    }
    if (!roleNames.has(employee.role)) {
      add({ ruleCode: 'EMPLOYEE_ROLE_UNDEFINED', severity: 'warning', title: 'Role has no requirements',
        explanation: `${employee.name}'s role "${employee.role}" has no succession requirements, so readiness for it cannot be assessed.`,
        entityType: 'employee', entityId: employee.id, entityLabel: employee.name, employeeIds: [employee.id], link,
        suggestedAction: 'Define the role and the skills a successor needs.' });
    }
  }

  for (const user of users) {
    if (user.disabled) continue;
    const linked = user.employeeId !== null && user.employeeId !== undefined && employeeById.has(user.employeeId);
    if ((user.role === 'employee' || user.role === 'manager') && !linked) {
      add({ ruleCode: 'USER_EMPLOYEE_LINK_MISSING', severity: 'warning', title: 'Account not linked to an employee',
        explanation: `${user.displayName} signs in as ${user.role} but is not linked to an employee record, so they see no profile or team.`,
        entityType: 'user', entityId: user.id, entityLabel: user.displayName, link: { view: 'users' },
        suggestedAction: 'Link the account to the matching employee in user management.' });
    }
    if (user.role === 'manager' && linked && !workforce.employees.some((employee) => employee.managerId === user.employeeId)) {
      add({ ruleCode: 'MANAGER_WITHOUT_REPORTS', severity: 'info', title: 'Manager has no recorded reports',
        explanation: `${user.displayName} has the manager role, but nobody reports to ${nameOf(user.employeeId)} in this dataset.`,
        entityType: 'user', entityId: user.id, entityLabel: user.displayName, employeeIds: [user.employeeId], link: { view: 'users' },
        suggestedAction: 'Record the reporting lines, or change the account role.' });
    }
  }

  return sortIssues(issues);
}

// Health score: records checked versus weighted open issues, so a large clean dataset with a few gaps is
// not rated the same as a small one full of them. Acknowledged issues weigh half. The counts are always
// reported with the score, so it never hides how many problems exist.
function summarizeDataQuality(issues, evaluatedRecords) {
  const active = issues.filter((issue) => issue.status !== 'resolved');
  const counts = { critical: 0, warning: 0, info: 0 };
  let penalty = 0;
  for (const issue of active) {
    counts[issue.severity] += 1;
    penalty += WEIGHTS[issue.severity] * (issue.status === 'acknowledged' ? 0.5 : 1);
  }
  const score = evaluatedRecords > 0 ? Math.round((100 * evaluatedRecords) / (evaluatedRecords + penalty)) : 100;
  return {
    score,
    health: score >= 90 ? 'good' : score >= 75 ? 'needs_attention' : 'at_risk',
    counts,
    open: active.filter((issue) => issue.status === 'open').length,
    acknowledged: active.filter((issue) => issue.status === 'acknowledged').length,
    resolved: issues.length - active.length,
    evaluatedRecords,
    method: 'score = 100 × records checked ÷ (records checked + weighted open issues); critical 10, warning 3, info 1; acknowledged issues count half',
  };
}

const countEvaluatedRecords = (workforce, scenarios) => workforce.employees.length + workforce.matrix.length
  + workforce.roles.reduce((total, role) => total + role.requirements.length, 0)
  + (workforce.learningResources?.length ?? 0) + (workforce.futureRequirements?.length ?? 0) + scenarios.length;

module.exports = { evaluateDataQuality, evaluateScenario, summarizeDataQuality, countEvaluatedRecords };
