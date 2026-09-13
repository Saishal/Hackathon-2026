import { isViewAllowed } from '../views.js';
export const FALLBACK = 'I can help you find Keystone features and explain the guide. For that question, please search the Help Center or review the relevant guide.';
export const QUICK_PROMPTS = ['Where do I manage users?', 'How do I view skill risks?', 'Where is the heat map?', 'How do I export a skill map?', 'What does dependency score mean?', 'How do I update employee evidence?'];
const intents = [
  { id: 'export', match: /\b(export|download|csv|reports?)\b/, text: 'Open Skill map, apply your filters and choose Download CSV. The export contains only the evidence you are allowed to see.', view: 'network', topic: 'export-skill-map' },
  { id: 'users', match: /\b(users?|roles?|admin|permissions?|accounts?)\b/, text: 'You can manage accounts, roles, and access in Users & settings.', view: 'users', label: 'Open Users & settings', topic: 'users' },
  { id: 'map', match: /\b(heat ?map|skill map|map|matrix)\b/, text: 'Open Skill map and choose Heat map from the view selector.', view: 'network', topic: 'heat-map', label: 'Open Skill map', params: '?mode=heatmap' },
  { id: 'dependency', match: /\b(dependency|bus factor|keystone score)\b/, text: 'A dependency score ranks how much the organization relies on too few people for a skill. It combines holder count, coverage shortfall and criticality. It is not a departure probability or an employee rating.', topic: 'keystone-score' },
  { id: 'risks', match: /\b(risks?|gaps?)\b/, text: 'The detailed Overview shows skill coverage and dependency scores. Review the evidence before making decisions.', view: 'overview', topic: 'home' },
  { id: 'evidence', match: /\b(employees?|people|evidence|profile)\b/, text: 'Open your profile for your own evidence and development. Data & evidence is available for authorized workforce readers. Proposed updates follow the existing review process.', view: 'data', topic: 'propose-evidence' },
  { id: 'help', match: /\b(help|guide|explain)\b/, text: 'Search the Help Center for feature guides and plain-language definitions.', topic: 'assistant' },
];
export function answerQuestion(question, session) {
  const input = question.trim().toLowerCase();
  const fallback = { id: 'fallback', text: FALLBACK, shortcuts: [{ label: 'Open Help Center', href: '#/help' }, { label: 'Search Help Center', href: '#/help?search=1' }] };
  // Only basic navigation or definition requests qualify. Never infer a workforce decision from keywords.
  if (input.length > 200 || /\b(fire|firing|lay ?off|terminate|salary|promote|recommend|should|best|worst|rank|who|which employee|predict|ignore|password|token|secret)\b/.test(input)) return fallback;
  if (!/^(where\b|how (do|can|to)\b|what (is|are|does)\b|open\b|show me\b|explain\b)/.test(input) && input.split(/\s+/).length > 3) return fallback;
  const words = input.replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(Boolean);
  const basicWords = new Set('where how do does can to what is are the a an i me my we our you find view open show manage update see use get about explain mean means keystone features skill skills map heat heatmap matrix network risk risks gap gaps dependency bus factor score scores users user roles role admin permissions permission accounts account export exports exporting download csv report reports employees employee people evidence profile help guide'.split(' '));
  if (words.some((word) => !basicWords.has(word))) return fallback;
  const intent = intents.find((entry) => entry.match.test(input));
  if (!intent) return fallback;
  const view = intent.id === 'evidence' && session?.user?.role === 'employee' ? 'profile' : intent.view;
  const allowed = !view || isViewAllowed(session, view);
  const shortcuts = [{ label: 'Open Help Center', href: `#/help?topic=${intent.topic}` }];
  if (view && allowed) shortcuts.unshift({ label: intent.label ?? `Open ${view === 'profile' ? 'My profile' : view === 'data' ? 'Data & evidence' : view === 'overview' ? 'Overview' : 'Skill map'}`, href: `#/${view}${intent.params ?? ''}` });
  return { id: intent.id, text: allowed ? intent.text : 'That page is restricted for your role. The Help Center explains the feature and access requirements.', shortcuts };
}
