// Global search over what the signed-in user is allowed to see. The caller passes data that has
// already been scoped (workforce, risks, issues, change requests); this module only matches and
// ranks, so scope can never widen here. Nothing is audited: typing is not an administrative act.

const GROUP_ORDER = ['employee', 'skill', 'role', 'department', 'risk', 'issue', 'scenario', 'change'];
const GROUP_LABELS = {
  employee: 'People', skill: 'Skills', role: 'Roles', department: 'Departments', risk: 'Risks',
  issue: 'Data-quality issues', scenario: 'Saved scenarios', change: 'Change requests',
};

const normalize = (value) => String(value ?? '').toLowerCase().trim();

// Rank: exact match first, then a word starting with the term, then any substring.
function score(haystack, needle) {
  const text = normalize(haystack);
  if (!text.includes(needle)) return null;
  if (text === needle) return 0;
  if (text.startsWith(needle)) return 1;
  if (text.split(/[\s/&·-]+/).some((word) => word.startsWith(needle))) return 2;
  return 3;
}

const best = (fields, needle) => fields.map((field) => score(field, needle)).filter((value) => value !== null).sort()[0] ?? null;

function coverageLabel(skillRisk) {
  if (!skillRisk) return null;
  if (skillRisk.busFactor === 0) return 'Nobody qualified';
  if (skillRisk.busFactor === 1) return 'Covered by one person';
  return `${skillRisk.busFactor} qualified`;
}

function search({ query, workforce, risks = null, issues = [], scenarios = [], changes = [], permissions = new Set() }, { limitPerGroup = 5 } = {}) {
  const needle = normalize(query);
  if (needle.length < 2) return { query, groups: [], total: 0 };
  const riskBySkill = new Map((risks?.skills ?? []).map((skill) => [skill.id, skill]));
  const found = [];
  const add = (item, rank) => { if (rank !== null) found.push({ ...item, rank }); };

  for (const employee of workforce.employees) {
    add({
      type: 'employee', id: employee.id, title: employee.name,
      description: `${employee.role} · ${employee.department}`,
      href: `#/data?tab=people&q=${encodeURIComponent(employee.name)}`,
    }, best([employee.name, employee.role, employee.department], needle));
  }

  for (const skill of workforce.skills) {
    const risk = riskBySkill.get(skill.id);
    add({
      type: 'skill', id: skill.id, title: skill.name,
      description: [coverageLabel(risk), `criticality ${skill.criticality}/5`].filter(Boolean).join(' · '),
      status: risk ? (risk.busFactor === 0 ? 'critical' : risk.busFactor === 1 ? 'warning' : 'ok') : null,
      href: `#/data?tab=skills&q=${encodeURIComponent(skill.name)}`,
    }, best([skill.name], needle));
  }

  for (const role of workforce.roles) {
    add({
      type: 'role', id: role.id, title: role.name,
      description: `${role.incumbentIds.length} ${role.incumbentIds.length === 1 ? 'person' : 'people'} · ${role.requirements.length} required ${role.requirements.length === 1 ? 'skill' : 'skills'}`,
      href: `#/data?tab=roles&q=${encodeURIComponent(role.name)}`,
    }, best([role.name], needle));
  }

  const departments = new Map();
  for (const employee of workforce.employees) departments.set(employee.department, (departments.get(employee.department) ?? 0) + 1);
  for (const [name, count] of departments) {
    add({
      type: 'department', id: name, title: name,
      description: `${count} ${count === 1 ? 'person' : 'people'} you can see`,
      href: `#/data?tab=people&q=${encodeURIComponent(name)}`,
    }, best([name], needle));
  }

  if (permissions.has('risk.read')) {
    for (const skill of risks?.skills ?? []) {
      if (skill.busFactor > 1) continue;
      add({
        type: 'risk', id: skill.id, title: skill.name,
        description: `${coverageLabel(skill)} · score ${skill.keystoneScore}/100`,
        status: skill.busFactor === 0 ? 'critical' : 'warning',
        href: `#/network?skill=${skill.id}`,
      }, best([skill.name, 'risk', coverageLabel(skill)], needle));
    }
  }

  for (const issue of issues) {
    add({
      type: 'issue', id: issue.fingerprint, title: issue.title,
      description: `${issue.severity} · ${issue.entityLabel ?? issue.entityType}${issue.status === 'acknowledged' ? ' · acknowledged' : ''}`,
      status: issue.severity,
      // The quality page reads q from the URL, so the link opens on this record's issues (any status still counted).
      href: `#/quality?q=${encodeURIComponent(issue.entityLabel ?? issue.title)}`,
    }, best([issue.title, issue.entityLabel, issue.ruleCode], needle));
  }

  for (const scenario of scenarios) {
    add({
      type: 'scenario', id: scenario.id, title: scenario.name,
      description: `${scenario.horizonMonths ? `${scenario.horizonMonths}-month horizon` : 'baseline'} · saved by ${scenario.updatedBy?.name ?? scenario.createdBy?.name ?? 'unknown'}`,
      href: `#/timemachine?scenario=${scenario.id}`,
    }, best([scenario.name], needle));
  }

  for (const change of changes) {
    add({
      type: 'change', id: change.id, title: change.targetLabel ?? `Change ${change.id}`,
      description: `${change.type.replaceAll('_', ' ')} · ${change.status}${change.requestedBy?.name ? ` · by ${change.requestedBy.name}` : ''}`,
      status: change.status,
      href: '#/reviews',
    }, best([change.targetLabel, change.type, change.status, change.requestedBy?.name], needle));
  }

  const groups = GROUP_ORDER.map((type) => {
    const items = found.filter((item) => item.type === type).sort((a, b) => a.rank - b.rank || String(a.title).localeCompare(String(b.title)));
    return { type, label: GROUP_LABELS[type], total: items.length, items: items.slice(0, limitPerGroup).map(({ rank: _rank, ...item }) => item) };
  }).filter((group) => group.total > 0);

  return { query, groups, total: found.length };
}

module.exports = { search, GROUP_LABELS };
