// All help text in one place, written for a first-time HR leader, manager or employee.
// Three kinds of entry:
//   GLOSSARY  – what a term means, one short line and one fuller explanation
//   TASKS     – how to do something, as numbered steps
//   VIEW_HELP – what each page is for and which terms and tasks matter there
// Every id is stable: contextual "?" buttons, the drawer and the #/help guide all link by id.

export const GLOSSARY = {
  'keystone-score': {
    term: 'Keystone Score',
    short: 'A 0–100 ranking of how much the organisation depends on too few people for a skill.',
    long: [
      'The score combines three things: how few people hold the skill at the required level, how far short of the coverage target that is, and how critical the skill is. Higher means more concentrated risk.',
      'It is a priority ranking, not a probability. A score of 80 does not mean an 80% chance of anything — it means this skill should be looked at before one scoring 40.',
      'It is computed only from recorded, official evidence. Pending proposals and Time Machine scenarios never change it.',
    ],
    related: ['bus-factor', 'coverage-target', 'evidence-trust'],
  },
  'bus-factor': {
    term: 'Bus Factor',
    short: 'How many people hold a skill at the required level. 1 means one departure removes it entirely.',
    long: [
      'The name comes from the question "what happens if this person were hit by a bus?" A Bus Factor of 1 means exactly one person can do the work; 0 means nobody can right now.',
      'Only recorded evidence at or above the skill\'s target level counts. Someone who is probably capable but has no record does not raise the Bus Factor — Keystone never guesses.',
    ],
    related: ['keystone-score', 'coverage-target', 'unknown-vs-unmet'],
  },
  'coverage-target': {
    term: 'Coverage target',
    short: 'How many qualified people a skill needs so that one absence is not a crisis.',
    long: [
      'Each skill has a required number of holders and a target proficiency level. Together they say: "we need at least N people at level L or above." That is the coverage target. It is set by a person, not calculated.',
      'This is different from hiring demand. A skill can have zero planned hires and still need two qualified holders, so the two numbers are shown separately.',
    ],
    related: ['bus-factor', 'keystone-score', 'future-requirement'],
  },
  'evidence-trust': {
    term: 'Verified versus unverified evidence',
    short: 'A recorded skill level with a verification date is verified; one without is unverified.',
    long: [
      'Every skill level in Keystone is a piece of evidence with a source (a review, an assessment, a certification record) and, ideally, the date someone confirmed it.',
      'Official coverage counts recorded levels at the skill target, with verification shown separately. Unverified evidence is recorded but nobody has confirmed it yet — it is shown with a label, and the data-quality rules flag it when it props up a critical skill.',
      'Stale evidence is verified evidence that is older than the organisation\'s re-verification period. It still counts, but it is flagged so someone can re-check it.',
    ],
    related: ['unknown-vs-unmet', 'data-quality-health', 'pending-vs-approved'],
  },
  'unknown-vs-unmet': {
    term: 'Unknown versus unmet requirement',
    short: 'Unknown means no record exists. Unmet means a record exists and it is below what is needed.',
    long: [
      'These look similar in a table but mean opposite things. Unknown (shown as a dash) means Keystone has no evidence either way — the person may well have the skill. Unmet means there is a record and it is below the level a role or skill requires.',
      'Keystone never turns "unknown" into "zero". A missing record is never presented as proof that someone lacks a skill.',
    ],
    related: ['evidence-trust', 'bus-factor', 'succession-readiness'],
  },
  'data-quality-health': {
    term: 'Data-quality health score',
    short: 'A 0–100 measure of how many records have problems that could distort the risk scores.',
    long: [
      'Keystone runs a set of fixed rules over the data — duplicate evidence, missing sources, stale verification, a critical skill with a single holder, a manager with no reports — and each problem found is an issue with a severity.',
      'The health score is records checked divided by records checked plus weighted open issues. Critical issues weigh 10, warnings 3, informational 1, and acknowledged issues count half. The severity counts are always shown beside the score so it cannot hide how many problems exist.',
      'Acknowledging an issue says "we know, and here is the plan." It keeps the issue visible but stops it being treated as new.',
    ],
    related: ['evidence-trust', 'risk-acknowledgement'],
  },
  'pending-vs-approved': {
    term: 'Pending change versus approved data',
    short: 'A pending change is a proposal waiting for review. Only approved changes become official data.',
    long: [
      'Anyone with permission can propose a change to evidence — an employee about themselves, a manager about their team, HR about anyone. The proposal sits beside the official record as a change request until a reviewer approves or rejects it.',
      'Until approval, the official numbers do not move. Scores, coverage and the Bus Factor are always calculated from approved data only. The Time Machine can model pending changes if you ask it to, and labels them as provisional when it does.',
      'Admins can make direct corrections that take effect immediately. Those are still recorded in the audit history with who did it and what changed.',
    ],
    related: ['evidence-trust', 'time-machine-assumptions'],
  },
  'time-machine-assumptions': {
    term: 'Time Machine assumptions',
    short: 'A scenario is a set of "what if" statements. The results are only as good as those assumptions.',
    long: [
      'Every scenario lists what it assumed: who leaves and when, who is developed to which level by when, whether that development is assumed to succeed, and which future requirements are in effect at the horizon.',
      'The baseline — today\'s official data — is never changed by a scenario. Development is only counted if you tick "assume verified at completion"; otherwise the plan is shown but does not change projected coverage, because Keystone does not assume training worked.',
      'If a mentor leaves before the learner finishes, or the mentor has no recorded time, the Time Machine says so rather than quietly counting the transfer.',
    ],
    related: ['pending-vs-approved', 'coverage-target', 'future-requirement'],
  },
  'future-requirement': {
    term: 'Future-skill requirement',
    short: 'A coverage target that starts applying at a future month, for a skill the organisation will need.',
    long: [
      'Future requirements come from strategy — "we are moving into payments, so we will need three people at level 3 in Payments Compliance by month 12." They are proposed, reviewed, and only an approved one enters Time Machine scenarios automatically.',
      'A requirement for a skill nobody holds yet creates that skill in the catalogue, but the skill stays out of today\'s risk picture until someone actually records evidence for it.',
    ],
    related: ['coverage-target', 'time-machine-assumptions', 'pending-vs-approved'],
  },
  'risk-acknowledgement': {
    term: 'Risk acknowledgement',
    short: 'Naming an owner, a plan and a review date for a risk. It does not change the score.',
    long: [
      'Acknowledging a risk means someone has looked at it and taken responsibility: an owner (an admin, HR leader or manager), a note about what will be done, a due date and a date to review it again.',
      'The score stays exactly the same — acknowledgement is about ownership, not about pretending the risk is smaller. The dashboard lists owned risks separately and flags any that are overdue or due for review.',
    ],
    related: ['keystone-score', 'data-quality-health'],
  },
  'user-roles': {
    term: 'User roles',
    short: 'Admin, HR / People Leader, Manager and Employee. Each sees and can do a fixed set of things, enforced by the server.',
    long: [
      'A role is not a label — it is the list of permissions the server checks on every request. Hiding a button in the interface is never what stops someone; the server refuses the request.',
      'Admin sees everything and manages accounts. HR sees everything and reviews evidence but cannot manage accounts. A manager sees only the people who report to them. An employee sees only their own profile.',
      'Changing a role or disabling an account signs the person out everywhere at once; the new permissions apply on their next sign-in. The last active admin can never be removed, and an admin cannot lock themselves out.',
    ],
    related: ['pending-vs-approved', 'risk-acknowledgement'],
  },
  'employment-status': {
    term: 'Active versus archived employee',
    short: 'Active people count in every score and team. Archived people keep their history but count nowhere.',
    long: [
      'When someone leaves, archive them rather than deleting them. Their record, skill evidence and audit history stay intact, but they drop out of the workforce snapshot: no Bus Factor, no succession candidate, no team member, no scope.',
      'Archiving a manager needs a new manager for their reports, chosen at the same time, so nobody is left reporting to a person who is gone. A linked sign-in account is disabled and signed out everywhere in the same step.',
      'Restoring is one click and brings back every score exactly as the evidence supports. It does not re-enable the sign-in account; that is a separate, deliberate decision in Users & settings.',
    ],
    related: ['bus-factor', 'succession-readiness', 'user-roles'],
  },
  'suggestions': {
    term: 'Suggested next steps',
    short: 'Practical actions derived from data already on screen. They never change anything by themselves.',
    long: [
      'Each suggestion comes from a fixed rule over existing data: a skill with one qualified holder, a risk with no owner, evidence that has gone stale, a scenario where development finishes after the gap opens, a candidate one requirement away from succession readiness. Nothing is predicted or invented.',
      'The label on each card says what it is based on: current official data, an approved plan, a pending proposal, unverified evidence, or a Time Machine scenario. A suggestion based on a pending proposal or a scenario is not a statement about today.',
      'Actions only open the relevant record, start a draft, or open a queue. Dismissing a suggestion hides it for you alone; it returns on its own if the underlying fact changes.',
    ],
    related: ['keystone-score', 'risk-acknowledgement', 'pending-vs-approved', 'time-machine-assumptions'],
  },
  'succession-readiness': {
    term: 'Succession readiness',
    short: 'Whether someone could step into a role, judged against every skill that role requires.',
    long: [
      'Each critical role lists the skills a successor must already hold. A candidate is ready if they meet all of them on record, developable if they are below on some, evidence missing if a required skill has no record for them at all, and unknown if the role has no requirements recorded.',
      'Evidence missing is not the same as unable. It means nobody has recorded whether they can — which is itself something to fix.',
    ],
    related: ['unknown-vs-unmet', 'evidence-trust'],
  },
};

export const TASKS = {
  'assign-risk-owner': {
    title: 'Assign a risk owner',
    intro: 'Give a skill risk a named person, a plan and a review date.',
    steps: [
      'Open Overview. Skills at risk without an owner are listed first.',
      'Choose "Acknowledge" on the skill. Only admins, HR leaders and managers can be owners.',
      'Pick the owner, write a short note saying what will be done, and set a due date and a next-review date.',
      'Save. The skill moves to the "Acknowledged risks" list. Its score does not change.',
      'When the plan is done, close the acknowledgement from the same place. The history stays in the audit log.',
    ],
    related: ['risk-acknowledgement', 'keystone-score'],
    view: 'overview',
  },
  'propose-evidence': {
    title: 'Propose a skill evidence change',
    intro: 'Record or correct a skill level for yourself or someone on your team, for a reviewer to approve.',
    steps: [
      'Open My profile (for yourself) or Data & evidence (for your team, if you are a manager).',
      'Find the skill, or add a new one, and choose "Propose a change".',
      'Enter the level (1–5), the source of the evidence, and the verification date if one exists. A level of 4 or 5 needs a verification date.',
      'Write a short justification and submit. It is now a pending change and does not affect any score.',
      'A reviewer approves or rejects it. You can see the status and any comment under Submissions.',
    ],
    related: ['pending-vs-approved', 'evidence-trust'],
    view: 'profile',
  },
  'review-change': {
    title: 'Review a proposed change',
    intro: 'Approve or reject a pending change so it does, or does not, become official data.',
    steps: [
      'Open Review queue. "Awaiting your review" shows what you can act on. You never see your own submissions here.',
      'Open a request. It shows the current official value, the proposed value, the justification and who submitted it.',
      'If the record changed since it was submitted, the request says so — check the proposal still makes sense.',
      'Approve to write the change to official data, or reject with a comment explaining why. Both are recorded.',
      'After approval, scores and coverage refresh. Check Overview if the change touched a critical skill.',
    ],
    related: ['pending-vs-approved', 'evidence-trust'],
    view: 'reviews',
  },
  'create-scenario': {
    title: 'Create a Time Machine scenario',
    intro: 'Model a departure, plan development to cover it, and see whether coverage survives.',
    steps: [
      'Open Time Machine and choose a horizon: 1, 3 or 5 years. Month numbers must fall inside it.',
      'Add a departure: who leaves and in which month.',
      'Add planned development: the skill, the learner, an optional mentor (only people at level 4+ are offered), and the completion month.',
      'Tick "assume verified at completion" only if you are willing to assume the learner really reaches the level.',
      'Compare scenarios. Grey is today, red is the future without your plan, green is with it. Read the assumptions list underneath.',
      'Save the scenario if you want to come back to it or share it. Saved scenarios never change official data.',
    ],
    related: ['time-machine-assumptions', 'coverage-target'],
    view: 'timemachine',
  },
  'interpret-succession': {
    title: 'Interpret a succession gap',
    intro: 'Understand what it means when a role has no ready successor.',
    steps: [
      'Open Key people and open a person\'s row to see the skills that would lose coverage if they were away.',
      'For each affected skill, the candidates are listed with a readiness label: ready, developable, evidence missing, or unknown.',
      'Ready means they meet every requirement on record. Developable means they are below on at least one — the shortfall is shown.',
      'Evidence missing means nobody has recorded whether they can. Treat that as a data gap to close, not as proof they cannot.',
      'If a candidate is one requirement away, that is usually the cheapest fix: propose evidence if it exists, or plan development in the Time Machine.',
    ],
    related: ['succession-readiness', 'unknown-vs-unmet'],
    view: 'people',
  },
  'manage-user': {
    title: 'Change a role, disable an account, or unlink a profile',
    intro: 'Adjust what a person can access, with a confirmation of exactly what will change.',
    steps: [
      'Open Users & settings and find the account. Use the search box or filter by role and status.',
      'Choose Edit. When you pick a role, a summary appears of what that role sees, can do, and cannot do — read it before saving.',
      'If the change affects access — a different role, disabling the account, or unlinking the employee — the dialog lists the consequences and asks you to confirm.',
      'Tick "I understand" and choose Confirm and save. The person is signed out everywhere at once.',
      'Every change is recorded. Choose History on the row to see the account\'s audit trail.',
    ],
    related: ['user-roles'],
    view: 'users',
  },
  'add-employee': {
    title: 'Add an employee',
    intro: 'Create a record for a new person so their skills can be recorded and counted.',
    steps: [
      'Open Employee directory and choose Add employee.',
      'Enter their name, job role and department. The role must be one of the defined roles, because roles carry the skill requirements used for succession.',
      'Choose their manager if known. Only active employees are offered, and the server refuses a reporting loop.',
      'Record mentoring hours only if you actually know them. Blank means unknown and is shown as a dash.',
      'Save. The person appears in the workforce, risk and succession views immediately, with no skills yet — add evidence from their profile.',
    ],
    related: ['employment-status', 'unknown-vs-unmet'],
    view: 'directory',
  },
  'archive-employee': {
    title: 'Archive an employee who has left',
    intro: 'Remove someone from every score and team while keeping their history.',
    steps: [
      'Open Employee directory, find the person, and choose Archive.',
      'Read the impact first: which skills lose their only qualified holder, who reports to them, and whether a sign-in account will be disabled.',
      'If a skill would be left uncovered, consider planning a replacement in the Time Machine before you continue.',
      'If they manage people, choose who those people report to now. This is required.',
      'Tick the confirmation and archive. Everything is recorded in the audit history and can be reversed with Restore.',
    ],
    related: ['employment-status', 'bus-factor'],
    view: 'directory',
  },
  'export-report': {
    title: 'Export a report',
    intro: 'Download the risk register or the data-quality issues as a CSV file.',
    steps: [
      'Open Overview (for the risk register) or Data quality (for issues).',
      'Choose Export. The file contains exactly what you can see — a manager\'s export covers only their team.',
      'Open it in a spreadsheet. Values that could be mistaken for formulas are protected, so it is safe to open directly.',
      'Every export is recorded in the audit history with who downloaded it and when.',
    ],
    related: ['keystone-score', 'data-quality-health'],
    view: 'overview',
  },
};

export const VIEW_HELP = {
  home: { purpose: 'Start with a workspace shortcut. Open detailed Overview whenever you want the operational dashboard.', topics: ['keystone-score', 'coverage-target'], tasks: [] },
  overview: {
    purpose: 'Where the organisation depends on too few people, at a glance. Start here, then open a page for detail.',
    topics: ['suggestions', 'keystone-score', 'bus-factor', 'coverage-target', 'risk-acknowledgement'],
    tasks: ['assign-risk-owner', 'export-report'],
  },
  people: {
    purpose: 'The people the organisation depends on most: if they were away, which skills would have nobody left who can do them.',
    topics: ['keystone-score', 'succession-readiness', 'unknown-vs-unmet'],
    tasks: ['interpret-succession'],
  },
  network: {
    purpose: 'A map of who holds which skill. Red skills have nobody qualified; amber skills rest on one person.',
    topics: ['bus-factor', 'evidence-trust', 'unknown-vs-unmet'],
    tasks: [],
  },
  data: {
    purpose: 'The evidence behind every number. If a score looks wrong, this is where you check what it was computed from.',
    topics: ['evidence-trust', 'unknown-vs-unmet', 'coverage-target', 'pending-vs-approved'],
    tasks: ['propose-evidence'],
  },
  timemachine: {
    purpose: 'Ask "what if": model someone leaving, plan development to replace them, and see whether coverage survives. Nothing here changes real data.',
    topics: ['time-machine-assumptions', 'coverage-target', 'future-requirement', 'pending-vs-approved'],
    tasks: ['create-scenario'],
  },
  ai: {
    purpose: 'Draft development plans for a skill, or describe a business direction and see which skills it will need. Nothing is saved until a person reviews it.',
    topics: ['future-requirement', 'evidence-trust', 'pending-vs-approved'],
    tasks: [],
  },
  quality: {
    purpose: 'Problems that could distort the scores, who has acknowledged them, and what to do next.',
    topics: ['data-quality-health', 'evidence-trust', 'unknown-vs-unmet'],
    tasks: ['export-report'],
  },
  reviews: {
    purpose: 'Proposed changes waiting for review. Only an approved change reaches official data and scoring.',
    topics: ['pending-vs-approved', 'evidence-trust'],
    tasks: ['review-change', 'propose-evidence'],
  },
  audit: {
    purpose: 'An append-only record of every sign-in, change, review and planning decision. Nothing here can be edited or deleted.',
    topics: ['pending-vs-approved', 'risk-acknowledgement'],
    tasks: [],
  },
  directory: {
    purpose: 'Administrative records for every employee, including archived ones. Changes here take effect immediately and are audited.',
    topics: ['employment-status', 'unknown-vs-unmet', 'succession-readiness'],
    tasks: ['add-employee', 'archive-employee'],
  },
  users: {
    purpose: 'Accounts, roles and organisation settings. Every permission shown here is also enforced by the server.',
    topics: ['user-roles'],
    tasks: ['manage-user'],
  },
  activity: {
    purpose: 'Commits from every team branch, newest first. A build log, not part of the product.',
    topics: [],
    tasks: [],
  },
  profile: {
    purpose: 'Your recorded skills, what your role asks of you, and the changes you have proposed.',
    topics: ['evidence-trust', 'unknown-vs-unmet', 'succession-readiness'],
    tasks: ['propose-evidence'],
  },
  help: {
    purpose: 'How Keystone works: every term, every task, in one place.',
    topics: Object.keys(GLOSSARY),
    tasks: Object.keys(TASKS),
  },
};

export const guideHref = (id) => `#/help?topic=${encodeURIComponent(id)}`;

export function topicFor(id) {
  if (GLOSSARY[id]) return { kind: 'term', id, ...GLOSSARY[id] };
  if (TASKS[id]) return { kind: 'task', id, ...TASKS[id] };
  return null;
}
