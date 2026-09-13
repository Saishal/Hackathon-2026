// Keystone Assistant brain: a deterministic intent matcher over a small curated catalog. It explains
// features and suggests where to go; it never reads workforce data, calls a model or gives advice about
// people. Anything it cannot match confidently gets the fixed FALLBACK pointing to the Help Center.
import { isViewAllowed } from '../views.js';
export const FALLBACK = 'I can help you find Keystone features and explain the guide. For that question, please search the Help Center or review the relevant guide.';
export const QUICK_PROMPTS = ['Where do I manage users?', 'How do I view skill risks?', 'Where is the heat map?', 'How do I export a skill map?', 'What does dependency score mean?', 'How do I update employee evidence?', 'How do I archive an employee?', 'How do I save a filter?'];
const intents = [
  { id: 'export', match: /\b(export|download|csv|reports?)\b/, text: 'Open Skill map, apply your filters and choose Download CSV. The export contains only the evidence you are allowed to see.', view: 'network', topic: 'export-skill-map' },
  { id: 'directory', match: /\b(archive|archived|archiving|directory|new hire|hire|leaver|add (an? )?employee|reporting line|restore)\b/, text: 'Open Employee directory to add people, change who they report to, or archive someone who leaves. Archiving previews the impact first and keeps their history.', view: 'directory', label: 'Open Employee directory', topic: 'archive-employee' },
  { id: 'search', match: /\b(search|find|look ?up|jump to)\b/, text: 'Use the search box in the top bar. It finds people, skills, roles, departments, risks, data issues, scenarios, change requests and help topics, limited to what your role can see.', topic: 'search' },
  { id: 'filters', match: /\b(filters?|saved views?|save (a |the )?view|chips?|bookmark|share (a |the )?link)\b/, text: 'Every decision table has a filter bar. Active filters appear as chips and in the page address, so you can bookmark or share the link. Save view keeps a named set of filters for you.', view: 'overview', label: 'Open Overview', topic: 'filters' },
  { id: 'suggestions', match: /\b(suggestions?|suggested|next steps?|dismiss)\b/, text: 'Suggested next steps sit on the Overview. Each one states a fact from data you can see, labelled by how official that fact is, with a link to act. Dismiss what you have handled; nothing is changed automatically.', view: 'overview', label: 'Open Overview', topic: 'suggestions' },
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
  // The checks run from strictest to loosest:
  // 1. decision, ranking or credential words always fall back, even inside an otherwise valid question;
  // 2. longer input must start like a navigation/definition question ("where", "how do", "what is");
  // 3. every word must come from a small vocabulary, so names or specifics ("Liam", "salaries") fall back;
  // 4. the first matching intent wins, which is why `intents` is ordered from most to least specific.
  if (input.length > 200 || /\b(fire|firing|lay ?off|terminate|salary|promote|recommend|should|best|worst|rank|who|which employee|predict|ignore|password|token|secret)\b/.test(input)) return fallback;
  if (!/^(where\b|how (do|can|to)\b|what (is|are|does)\b|open\b|show me\b|explain\b)/.test(input) && input.split(/\s+/).length > 3) return fallback;
  const words = input.replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(Boolean);
  const basicWords = new Set('where how do does can to what is are the a an i me my we our you find view open show manage update see use get about explain mean means keystone features skill skills map heat heatmap matrix network risk risks gap gaps dependency bus factor score scores users user roles role admin permissions permission accounts account export exports exporting download csv report reports employees employee people evidence profile help guide archive archived archiving directory new hire leaver reporting line restore search find look lookup jump filter filters saved save views chips chip bookmark share link suggestions suggestion suggested next steps step dismiss'.split(' '));
  if (words.some((word) => !basicWords.has(word))) return fallback;
  const intent = intents.find((entry) => entry.match.test(input));
  if (!intent) return fallback;
  const view = intent.id === 'evidence' && session?.user?.role === 'employee' ? 'profile' : intent.view;
  const allowed = !view || isViewAllowed(session, view);
  const shortcuts = [{ label: 'Open Help Center', href: `#/help?topic=${intent.topic}` }];
  if (view && allowed) shortcuts.unshift({ label: intent.label ?? `Open ${view === 'profile' ? 'My profile' : view === 'data' ? 'Data & evidence' : view === 'overview' ? 'Overview' : 'Skill map'}`, href: `#/${view}${intent.params ?? ''}` });
  return { id: intent.id, text: allowed ? intent.text : 'That page is restricted for your role. The Help Center explains the feature and access requirements.', shortcuts };
}
