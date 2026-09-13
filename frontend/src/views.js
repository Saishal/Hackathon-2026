import { can } from './components/format';

// Every page, the group it belongs to in the navigation, and which roles may open it. This only decides
// what to show: the server checks the same permissions on every request, whatever the address.
const readsWorkforce = (session) => can(session, 'workforce.read.all', 'workforce.read.team');
const reviews = (session) => can(session, 'changes.review.people', 'changes.review.planning');

export const VIEWS = [
  { id: 'overview', group: 'Workforce', icon: 'overview', label: 'Overview',
    description: 'Skills that depend on too few people. Scores measure dependency, not who is likely to leave.',
    allowed: (session) => can(session, 'risk.read.org', 'risk.read.team') },
  { id: 'people', group: 'Workforce', icon: 'people', label: 'Key people',
    description: 'People whose absence would leave a skill without enough qualified colleagues.',
    allowed: (session) => can(session, 'risk.read.org', 'risk.read.team') },
  { id: 'network', group: 'Workforce', icon: 'network', label: 'Skill map',
    description: 'Who holds each skill, at what level, and the evidence behind it.',
    allowed: readsWorkforce },
  { id: 'data', group: 'Workforce', icon: 'data', label: 'Data & evidence',
    description: 'The official records behind every score, with their source, verification and review status.',
    allowed: readsWorkforce },
  { id: 'timemachine', group: 'Planning', icon: 'timemachine', label: 'Time Machine',
    description: 'Model departures and development. Scenarios are assumptions and never change official data.',
    allowed: (session) => can(session, 'scenario.run') },
  { id: 'ai', group: 'Planning', icon: 'ai', label: 'AI advisor',
    description: 'Draft development plans and future skill needs. Nothing is saved until a person reviews it.',
    allowed: (session) => can(session, 'ai.development', 'ai.strategy') },
  { id: 'quality', group: 'Governance', icon: 'shield', label: 'Data quality',
    description: 'Problems that could distort scoring, who has acknowledged them, and what to do next.',
    allowed: (session) => can(session, 'dataQuality.read.org', 'dataQuality.read.team') },
  { id: 'reviews', group: 'Governance', icon: 'inbox', label: (session) => (reviews(session) ? 'Review queue' : 'Submissions'),
    description: 'Proposed changes, which affect official analytics only after a reviewer approves them.',
    allowed: (session) => reviews(session) || (can(session, 'changes.submit') && session.user.role !== 'employee') },
  { id: 'audit', group: 'Governance', icon: 'audit', label: 'Audit history',
    description: 'An append-only record of sign-ins, data changes, reviews and planning decisions.',
    allowed: (session) => can(session, 'audit.read') },
  { id: 'users', group: 'Governance', icon: 'settings', label: 'Users & settings',
    description: 'Accounts, roles and organization settings.',
    allowed: (session) => can(session, 'users.manage') },
  { id: 'activity', group: 'Governance', icon: 'activity', label: 'Repository log',
    description: 'Commits from every team branch, newest first.',
    allowed: (session) => can(session, 'repository.log') },
  { id: 'profile', group: 'You', icon: 'user', label: 'My profile',
    description: 'Your recorded skills, what your role asks of you, and the changes you have proposed.',
    allowed: (session) => session.user.employeeId !== null },
];

export const viewLabel = (view, session) => (typeof view.label === 'function' ? view.label(session) : view.label);

export function isViewAllowed(session, id) {
  const view = VIEWS.find((entry) => entry.id === id);
  return Boolean(view && session && view.allowed(session));
}
