// Practical next steps derived from data the caller has already scoped. Every suggestion names
// what it is based on - official data, a pending proposal, unverified evidence, a Time Machine
// scenario - and offers only safe actions: open a record, start a draft, open a queue. Nothing here
// changes data, and nothing is invented: each rule reads a fact that is already on the screen
// somewhere and turns it into one sentence and a link.

const SEVERITY_ORDER = { critical: 0, warning: 1, info: 2 };
const BASIS_LABELS = {
  official: 'Current official data',
  'approved-plan': 'Approved plan',
  pending: 'Pending proposal',
  unverified: 'Unverified evidence',
  scenario: 'Time Machine scenario',
};

const KIND_CAPS = { succession: 6, evidence: 8, ownership: 8 };
const SCENARIO_RULES = new Set(['SCENARIO_DEPARTURE_NO_SUCCESSOR', 'SCENARIO_MENTOR_BELOW_LEVEL', 'SCENARIO_INTERVENTION_AFTER_RISK']);

function buildSuggestions({
  workforce, risks = null, acknowledgements = [], issues = [], succession = null, permissions = new Set(),
}) {
  const out = [];
  const seen = new Set();
  const add = (suggestion) => {
    if (seen.has(suggestion.key)) return;
    seen.add(suggestion.key);
    out.push({ severity: 'info', basis: 'official', actions: [], ...suggestion, basisLabel: BASIS_LABELS[suggestion.basis ?? 'official'] });
  };
  const has = (permission) => permissions.has(permission);
  const employeeName = (id) => workforce.employees.find((employee) => employee.id === id)?.name ?? null;
  const skillHref = (id) => `#/network?skill=${id}`;
  const planAction = has('ai.development') ? [{ label: 'Draft a development plan', href: '#/ai' }] : [];
  const owned = new Map(acknowledgements.filter((item) => item.status === 'active').map((item) => [`${item.riskType}:${item.entityId}`, item]));

  // Coverage: uncovered and single-holder skills.
  for (const skill of risks?.skills ?? []) {
    if (skill.busFactor === 0) {
      add({
        key: `coverage:uncovered:${skill.id}`, kind: 'coverage', severity: 'critical',
        title: `${skill.name} has nobody qualified.`,
        detail: `Criticality ${skill.criticality}/5, ${skill.requiredHolders} needed at level ${skill.targetProficiency}+. Nothing recorded meets the target today.`,
        entity: { type: 'skill', id: skill.id, label: skill.name },
        actions: [{ label: 'See who is closest', href: skillHref(skill.id) }, ...planAction],
      });
    } else if (skill.busFactor === 1) {
      const holderId = skill.holderIds[0];
      const holder = holderId !== undefined ? employeeName(holderId) : null;
      add({
        key: `coverage:single:${skill.id}`, kind: 'coverage', severity: 'warning',
        title: `${skill.name} has only one qualified holder${holder ? `, ${holder}` : ''}.`,
        detail: holder
          ? `If ${holder} were away, nobody on record could do this. Plan a backup before it is urgent.`
          : 'The one qualified person is outside your team. Plan a backup within your team if the skill matters to it.',
        entity: { type: 'skill', id: skill.id, label: skill.name },
        actions: [
          { label: 'See who could step in', href: skillHref(skill.id) },
          ...(has('scenario.run') ? [{ label: 'Model their departure', href: '#/timemachine' }] : []),
          ...planAction,
        ],
      });
    }
  }

  // Ownership: risks without an owner, and owned risks that are overdue or due for review.
  if (has('risk.acknowledge')) {
    for (const skill of risks?.skills ?? []) {
      if (skill.busFactor > 1 || owned.has(`skill:${skill.id}`)) continue;
      add({
        key: `ownership:none:${skill.id}`, kind: 'ownership', severity: 'warning',
        title: `The risk on ${skill.name} has no owner or review date.`,
        detail: 'Naming an owner does not change the score; it records who is responsible and when to look again.',
        entity: { type: 'skill', id: skill.id, label: skill.name },
        actions: [{ label: 'Assign an owner', href: '#/overview' }],
      });
    }
    for (const item of acknowledgements) {
      if (item.status !== 'active' || !(item.overdue || item.reviewDue)) continue;
      add({
        key: `ownership:${item.overdue ? 'overdue' : 'review'}:${item.id}`, kind: 'ownership', severity: item.overdue ? 'warning' : 'info',
        title: `${item.entityLabel}, owned by ${item.owner.name}, is ${item.overdue ? `overdue (due ${item.dueDate})` : `due for review (${item.nextReviewDate})`}.`,
        detail: item.note ? `Plan on record: ${item.note}` : 'No plan was recorded with the acknowledgement.',
        entity: { type: item.riskType, id: item.entityId, label: item.entityLabel },
        actions: [{ label: 'Open acknowledged risks', href: '#/overview' }],
      });
    }
  }

  // Data quality: only the rules with an obvious next step become suggestions.
  for (const issue of issues) {
    const people = issue.employeeIds.map(employeeName).filter(Boolean);
    const who = people.length ? people.join(', ') : issue.entityLabel;
    const evidenceHref = issue.link ?? (people[0] ? `#/data?tab=evidence&q=${encodeURIComponent(people[0])}` : '#/quality');
    if (issue.ruleCode === 'EVIDENCE_STALE' || issue.ruleCode === 'EVIDENCE_UNVERIFIED') {
      add({
        key: `evidence:${issue.fingerprint}`, kind: 'evidence', severity: issue.severity, basis: 'unverified',
        title: issue.ruleCode === 'EVIDENCE_STALE' ? `Evidence for ${who} is stale.` : `Evidence for ${who} is unverified and props up a critical skill.`,
        detail: issue.ruleCode === 'EVIDENCE_STALE' ? 'Ask the employee or their manager to re-verify it; until then it still counts but is flagged.' : 'A verification date would let the score rely on it.',
        entity: { type: issue.entityType, id: issue.entityId, label: issue.entityLabel },
        actions: [{ label: 'Propose an evidence update', href: evidenceHref }],
      });
    } else if (issue.ruleCode === 'MANAGER_WITHOUT_REPORTS' || issue.ruleCode === 'EMPLOYEE_MISSING_MANAGER' || issue.ruleCode === 'EMPLOYEE_MANAGER_INVALID') {
      add({
        key: `reporting:${issue.fingerprint}`, kind: 'reporting', severity: issue.severity,
        title: issue.ruleCode === 'MANAGER_WITHOUT_REPORTS' ? `${who} has no team members recorded.` : `${who} has no valid manager recorded.`,
        detail: 'Team scope and succession rely on the reporting line. Check it in the directory.',
        entity: { type: issue.entityType, id: issue.entityId, label: issue.entityLabel },
        actions: [{ label: 'Check the reporting line', href: has('employee.edit') ? '#/directory' : '#/quality' }],
      });
    } else if (issue.ruleCode === 'RESOURCE_VERIFIED_WITHOUT_SOURCE') {
      add({
        key: `catalogue:${issue.fingerprint}`, kind: 'catalogue', severity: issue.severity,
        title: `${issue.entityLabel} is marked verified but has no provider or link.`,
        detail: 'A verified learning resource should say where it comes from, or the AI advisor may cite something nobody can find.',
        entity: { type: issue.entityType, id: issue.entityId, label: issue.entityLabel },
        actions: [{ label: 'Open the catalogue', href: '#/data?tab=learning' }],
      });
    } else if (issue.ruleCode === 'FUTURE_REQUIREMENT_PAST_EFFECTIVE') {
      add({
        key: `planning:${issue.fingerprint}`, kind: 'planning', severity: issue.severity, basis: 'pending',
        title: `${issue.entityLabel} is still pending review, and its effective date has passed.`,
        detail: 'It is not part of the official baseline until approved, so no score reflects it yet.',
        entity: { type: issue.entityType, id: issue.entityId, label: issue.entityLabel },
        actions: [{ label: 'Open the review queue', href: '#/reviews' }],
      });
    } else if (SCENARIO_RULES.has(issue.ruleCode)) {
      add({
        key: `scenario:${issue.fingerprint}`, kind: 'scenario', severity: issue.severity, basis: 'scenario',
        title: issue.title + (issue.entityLabel ? ` in "${issue.entityLabel}".` : '.'),
        detail: issue.ruleCode === 'SCENARIO_INTERVENTION_AFTER_RISK'
          ? 'A coverage gap opens before this development completes. Move the completion date earlier, or plan a second backup.'
          : issue.explanation ?? issue.suggestedAction ?? '',
        entity: { type: issue.entityType, id: issue.entityId, label: issue.entityLabel },
        actions: [{ label: 'Open the scenario', href: issue.entityType === 'scenario' && issue.entityId ? `#/timemachine?scenario=${issue.entityId}` : '#/timemachine' }],
      });
    }
  }

  // Pending future requirements that are not yet effective still deserve a nudge if they are old.
  for (const requirement of workforce.futureRequirements ?? []) {
    if (requirement.status !== 'proposed' || !has('changes.review.planning')) continue;
    add({
      key: `planning:proposed:${requirement.id}`, kind: 'planning', severity: 'info', basis: 'pending',
      title: `The future requirement for ${requirement.skillName} is still waiting for review.`,
      detail: `${requirement.requiredHolders} people at level ${requirement.targetProficiency}+ from month ${requirement.effectiveMonth}. Not in the official baseline until approved.`,
      entity: { type: 'future_requirement', id: requirement.id, label: requirement.skillName },
      actions: [{ label: 'Review it', href: '#/reviews' }],
    });
  }

  // Succession: someone one requirement away from being ready for a role.
  for (const role of succession?.roles ?? []) {
    const candidates = [...role.pipeline, ...role.incumbents.flatMap((incumbent) => incumbent.candidates)];
    for (const candidate of candidates) {
      if (candidate.redacted || candidate.status !== 'developable' || candidate.shortfallCount !== 1 || candidate.unknownCount > 0) continue;
      const gap = candidate.requirements.find((entry) => entry.status === 'below_requirement');
      add({
        key: `succession:${role.id}:${candidate.employeeId}`, kind: 'succession', severity: 'info',
        title: `${candidate.name} is one requirement away from succession readiness for ${role.name}.`,
        detail: gap ? `Only ${gap.skillName ?? 'one skill'} is below the level the role needs.` : 'One recorded skill is below the level the role needs.',
        entity: { type: 'employee', id: candidate.employeeId, label: candidate.name },
        actions: [{ label: 'Open their profile', href: `#/people?employee=${candidate.employeeId}` }, ...planAction],
      });
    }
  }

  // Keep the list readable: the noisier kinds are capped, highest severity first within each.
  const sorted = out.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.title.localeCompare(b.title));
  const perKind = new Map();
  return sorted.filter((item) => {
    const count = (perKind.get(item.kind) ?? 0) + 1;
    perKind.set(item.kind, count);
    return count <= (KIND_CAPS[item.kind] ?? Infinity);
  }).slice(0, 40);
}

module.exports = { buildSuggestions, BASIS_LABELS };
