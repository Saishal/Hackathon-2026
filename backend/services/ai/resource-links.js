// Resource references are checked by catalog ID elsewhere. These checks cover links in prose,
// without mistaking technology identifiers for resource websites.
const domains = () => /\b(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+(?:com|org|net|io|edu|co|ai|dev|app|gov|uk|ca)\b/gi;
const technologyIdentifiers = ['asp.net', 'vb.net', 'socket.io'];
function hasUnverifiedLink(value, catalogSkillNames = []) {
  if (/https?:\/\/|www\./i.test(value)) return true;
  const identifiers = new Set(technologyIdentifiers);
  for (const name of catalogSkillNames) {
    if (/https?:\/\/|www\./i.test(name)) continue;
    for (const token of name.match(domains()) || []) identifiers.add(token.toLowerCase());
  }
  return (value.match(domains()) || []).some((token) => !identifiers.has(token.toLowerCase()));
}
function developmentProse(action) {
  return [action.rationale, action.action, action.milestone, action.verificationMethod, ...action.assumptions].join('\n');
}
function strategyProse(requirement) {
  return [requirement.skillName, requirement.rationale, requirement.sourcingRationale, ...requirement.assumptions].join('\n');
}
module.exports = { hasUnverifiedLink, developmentProse, strategyProse };
