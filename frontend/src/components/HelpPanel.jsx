import { useEffect, useRef } from 'react';

// Help is written for someone opening Keystone for the first time. Every entry answers
// three things: what this screen is for, what each control does, and what the numbers mean.
// Terms that appear on more than one screen live in the glossary at the bottom.

const HELP = {
  overview: {
    purpose: 'A one-glance summary of where the organisation depends on too few people. Use it to decide which section to open next.',
    controls: [
      ['Single-holder skills', 'How many skills only one person can do at the required level. Each one is a risk: one departure removes the capability.'],
      ['Uncovered skills', 'Skills nobody currently holds at the required level. These are gaps that already exist today.'],
      ['Top dependency', 'The skill with the highest Keystone Score — the single most concentrated risk right now.'],
      ['Risk summary', 'Lists every single-holder or uncovered skill with a plain-language explanation of its score.'],
    ],
  },
  people: {
    purpose: 'Ranks people by how much the organisation depends on them. It is not a prediction that anyone will leave — it answers "what would break if they did".',
    controls: [
      ['Score out of 100', 'How much worse coverage becomes if this person left today, across every skill they hold. Higher means more depended-on.'],
      ['"Qualified in N skills"', 'The number of skills this person holds at or above the required level.'],
      ['"N would have no recorded holder left"', 'Of those skills, how many would have nobody else qualified. This is the part that matters most.'],
      ['Show affected skills', 'Opens the list of skills that would lose coverage, and for each one, who else could step in and whether they are ready or would need development.'],
    ],
  },
  network: {
    purpose: 'A map of who holds which skill. People are on the left, skills on the right, and each line is a recorded proficiency at or above the chosen level.',
    controls: [
      ['Department', 'Show only people from one department.'],
      ['Show lines from level', 'Hide weaker proficiencies. "3+" shows only people who can work independently; "4+" shows only people who could mentor.'],
      ['Only single-holder or uncovered skills', 'Focus on the risky skills and hide everything that is well covered.'],
      ['Red / amber / green dots', 'Red: nobody qualified. Amber: exactly one person qualified. Green: two or more.'],
      ['Click a person or skill', 'Opens the evidence panel showing the recorded proficiencies behind the lines, with their source and verification date.'],
    ],
  },
  timemachine: {
    purpose: 'Ask "what if". Model someone leaving, plan mentoring so someone else can take over, and see whether the skill stays covered. Nothing here changes real data — it is a projection.',
    controls: [
      ['Horizon', 'How far ahead to look: 1, 3 or 5 years. Month numbers below must fall inside it. "Baseline" means today with no time passing, so the forms are off.'],
      ['Departure', 'Who leaves and in which month. Month 9 with a 1-year horizon means "nine months from now".'],
      ['Planned development', 'Someone (the learner) reaches a target level in a skill by a completion month, optionally taught by a mentor.'],
      ['Mentor', 'Only people already at level 4 or above in that skill are offered. The number in brackets is their recorded mentoring hours per month; a dash means unknown.'],
      ['Assume verified at completion', 'Tick this if you are willing to assume the learner really reaches the level. Unticked, the plan is shown but does not change coverage — the app never assumes training worked.'],
      ['Compare scenarios', 'Runs three projections side by side: today, the future with no development, and the future with your plan. Grey, red and green bars show the number of qualified holders in each.'],
      ['Blocked development', 'A plan that cannot happen — for example, the mentor leaves before the learner finishes. The app refuses to count it rather than pretend.'],
    ],
  },
  ai: {
    purpose: 'Two tools. Development advisor: pick a skill and get a reviewable plan for closing its gap. Future strategy: describe where the business is going and see which skills that will need.',
    controls: [
      ['Skill to develop', 'Choose a skill; the advisor proposes actions in five categories: training, mentoring, certification, job rotation and project experience.'],
      ['Demo fallback vs AI draft', 'Without an AI provider configured, plans come from fixed rules and are labelled as such. With a provider, an AI drafts them — but it can only cite catalogue resources that a person has marked verified, and can never invent a course.'],
      ['I reviewed this action', 'Actions are proposals. Ticking this is you taking responsibility for one. Only then can it be scheduled.'],
      ['Schedule in Time Machine', 'Sends the action to the Time Machine as planned development — marked not verified, so it will not change projected coverage until you say it did.'],
      ['Business direction', 'A sentence like "We are expanding into e-commerce". The advisor proposes the skills it would require, with how many people and at what level.'],
      ['Preview reviewed gaps', 'Shows the coverage gap those proposed requirements would create at a chosen horizon, without saving anything.'],
      ['Save reviewed requirements', 'Stores them so the Time Machine applies them automatically from their effective month. New skills get a real identity in the system at this point.'],
    ],
  },
  data: {
    purpose: 'The evidence behind every score. If a number elsewhere looks wrong, this is where you check what it was computed from.',
    controls: [
      ['Search the inventory', 'Filter every table by a person, role, department or skill name.'],
      ['Criticality', 'How much it matters if this skill is lost, 1 to 5. Set by a person, not calculated.'],
      ['Target proficiency', 'The level someone must reach to count as a holder. 3 is the usual threshold.'],
      ['Required holders', 'How many qualified people are needed to avoid a single point of failure. This is the coverage requirement.'],
      ['Demand target', 'Separately, how many people the business plans to have in this skill. A skill can need coverage even with zero hiring demand, so the two are shown apart.'],
      ['Source badges', 'Where each value came from. "fictional demo" means it was seeded for the demo and is not a real finding.'],
      ['Dash (—)', 'Unknown. Never zero. The app does not guess.'],
    ],
  },
  activity: {
    purpose: 'A log of what the team changed in the codebase, generated from git history. Useful during the hackathon; not part of the product.',
    controls: [],
  },
};

const GLOSSARY = [
  ['Proficiency', 'How well someone can do a skill, 1 to 5. 3 means they can work independently. 4 or above means they could mentor someone else.'],
  ['Bus Factor', 'How many people hold a skill at the required level. 1 means one departure removes the capability; 0 means it is already uncovered. Named after the question "what if they were hit by a bus".'],
  ['Keystone Score', 'A 0–100 priority score combining how few people hold a skill, how short of the requirement it is, and how critical it is. It ranks risks; it is not a probability that anyone leaves.'],
  ['Coverage', 'Whether enough qualified people hold a skill to survive a departure.'],
  ['Evidence', 'Every proficiency has a recorded source and, where known, a verification date. Scores are only ever computed from recorded evidence.'],
  ['Verified', 'Confirmed by a person. An unverified plan or an unverified catalogue entry is shown but not relied on.'],
  ['Baseline', 'Today, as recorded. Projections are always compared against it and never change it.'],
];

export default function HelpPanel({ view, open, onClose }) {
  const panel = useRef(null);
  const entry = HELP[view] ?? HELP.overview;

  useEffect(() => {
    if (open) panel.current?.focus();
  }, [open, view]);

  return (
    <>
      <div className={`help-backdrop ${open ? 'open' : ''}`} onClick={onClose} aria-hidden="true" />
      <aside ref={panel} tabIndex={-1} className={`help-panel ${open ? 'open' : ''}`}
        role="dialog" aria-modal="true" aria-labelledby="help-title" hidden={!open}>
        <header className="help-header">
          <h2 id="help-title">Help</h2>
          <button type="button" onClick={onClose} aria-label="Close help">✕</button>
        </header>

        <section>
          <h3>This screen</h3>
          <p>{entry.purpose}</p>
          {entry.controls.length > 0 && <dl className="help-list">
            {entry.controls.map(([term, text]) => (
              <div key={term}><dt>{term}</dt><dd>{text}</dd></div>
            ))}
          </dl>}
        </section>

        <section>
          <h3>Words used everywhere</h3>
          <dl className="help-list">
            {GLOSSARY.map(([term, text]) => (
              <div key={term}><dt>{term}</dt><dd>{text}</dd></div>
            ))}
          </dl>
        </section>

        <section>
          <h3>Try the demo story</h3>
          <ol className="help-steps">
            <li>Open <strong>People &amp; Risk</strong>. Liam Chen is at the top: he is the only person who can do Legacy Billing Recovery.</li>
            <li>Open <strong>Time Machine</strong>. Add a departure: Liam Chen, month 9.</li>
            <li>Add development: skill Legacy Billing Recovery, learner Mason Green, mentor Liam Chen, completion month 6, verified ticked.</li>
            <li>Press <strong>Compare scenarios</strong>. Without development the skill drops to 0 holders; with it, coverage survives.</li>
            <li>Change the completion month to 10 and compare again. The plan is now blocked — Liam is gone before Mason finishes.</li>
          </ol>
        </section>

        <p className="help-footer">Press <kbd>?</kbd> anywhere to open this panel, <kbd>Esc</kbd> to close it.</p>
      </aside>
    </>
  );
}
