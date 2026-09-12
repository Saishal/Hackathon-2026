// Shared by AI proposals and simulation. Punctuation can define a different skill (C/C++/C#).
const aliases = new Map([
  ['node.js', 'nodejs'], ['node js', 'nodejs'],
  ['ml', 'machine learning'],
  ['e-commerce', 'ecommerce'], ['e commerce', 'ecommerce'],
  ['e-commerce operations', 'ecommerce operations'], ['e commerce operations', 'ecommerce operations'],
]);

function normalizeName(value) {
  if (typeof value !== 'string') throw new Error('Skill name must be a string');
  const normalized = value.normalize('NFKC').toLowerCase().trim().replace(/\s+/gu, ' ');
  if (!normalized) throw new Error('Empty skill name');
  return aliases.get(normalized) || normalized;
}

function resolveSkillIdentity(workforce, { skillId, skillName }) {
  const namedKey = skillName === undefined ? null : normalizeName(skillName);
  const matches = namedKey === null ? [] : workforce.skills.filter((skill) => normalizeName(skill.name) === namedKey);
  if (matches.length > 1) throw new Error('Ambiguous catalog skill');
  let match = matches[0];
  if (skillId != null) {
    if (!Number.isSafeInteger(skillId) || skillId <= 0) throw new Error('Invalid skill ID');
    const specified = workforce.skills.find((skill) => skill.id === skillId);
    if (!specified) throw new Error('Unknown skill ID');
    if (namedKey !== null && normalizeName(specified.name) !== namedKey) throw new Error('Mismatched skill ID/name');
    match = specified;
  } else if (namedKey === null) throw new Error('New skill requires a name');
  return { skillId: match?.id ?? null, skillName: match?.name ?? skillName.trim(),
    key: match ? `id:${match.id}` : `name:${namedKey}` };
}

module.exports = { normalizeName, resolveSkillIdentity };
