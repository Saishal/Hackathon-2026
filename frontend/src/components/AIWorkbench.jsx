import { useState } from 'react';
import { keystoneApi } from '../api/keystone';
import { plural } from './format';
import Icon from './Icon';

const labels = { training: 'Training', mentoring: 'Mentoring', certification: 'Certification', job_rotation: 'Job rotation', project_experience: 'Project experience' };
const editableRequirements = (requirements) => requirements.map(({ requirementId: _id, coverage: _coverage, ...requirement }) => requirement);
const sentence = (text) => {
  const words = text.replaceAll('_', ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
};

// Without a provider key the backend answers with deterministic rules; say so rather than calling it AI.
function ModeTag({ mode }) {
  return mode === 'live-ai'
    ? <span className="tag tag-accent"><Icon name="ai" size={14} /> AI draft</span>
    : <span className="tag">Demo rules, no AI key</span>;
}

// A reviewed action becomes planned development in Time Machine, not completed training:
// it is scheduled as unverified, so projected coverage only changes once someone marks the
// outcome verified there.
const toIntervention = (action) => ({
  employeeId: action.employeeId,
  skillId: action.skillId,
  mentorId: action.mentorId,
  startMonth: 0,
  completionMonth: Math.min(60, action.estimatedDurationMonths ?? 6),
  targetProficiency: action.targetProficiency,
  assumeVerified: false,
  source: labels[action.category],
});

export default function AIWorkbench({ workforce, onRequirementsSaved, onSchedule }) {
  const [skillId, setSkillId] = useState('');
  const [plan, setPlan] = useState(null);
  const [reviewedActions, setReviewedActions] = useState(new Set());
  const [scheduledActions, setScheduledActions] = useState(new Set());
  const [direction, setDirection] = useState('');
  const [proposal, setProposal] = useState(null);
  const [draft, setDraft] = useState([]);
  const [reviewed, setReviewed] = useState(false);
  const [horizon, setHorizon] = useState(12);
  const [preview, setPreview] = useState(null);
  const [savedRequirements, setSavedRequirements] = useState([]);
  // Which request is running: 'plan', 'strategy', 'preview' or 'save'. Every control waits on any of them.
  const [pending, setPending] = useState('');
  const [error, setError] = useState('');
  const busy = pending !== '';

  async function run(kind, action) {
    setPending(kind); setError('');
    try { await action(); } catch (err) { setError(err.message); } finally { setPending(''); }
  }
  function clearPlan() {
    setPlan(null); setReviewedActions(new Set()); setScheduledActions(new Set());
  }
  function toggleReviewed(id, checked) {
    setReviewedActions((current) => {
      const next = new Set(current);
      if (checked) next.add(id); else next.delete(id);
      return next;
    });
  }
  function schedule(action) {
    onSchedule(toIntervention(action));
    setScheduledActions((current) => new Set(current).add(action.id));
  }
  function update(index, field, value) {
    setDraft((current) => current.map((item, i) => i === index ? { ...item, [field]: Number(value) } : item));
    setReviewed(false); setPreview(null);
  }
  function changeDirection(value) {
    setDirection(value); setProposal(null); setDraft([]); setPreview(null); setReviewed(false);
  }
  async function saveRequirements() {
    const saved = [];
    for (const requirement of draft) {
      saved.push(await keystoneApi.addFutureRequirement({
        skillId: requirement.skillId,
        skillName: requirement.skillName,
        requiredHolders: requirement.requiredHolders,
        targetProficiency: requirement.targetProficiency,
        criticality: requirement.criticality,
        effectiveMonth: requirement.effectiveMonth,
        status: 'reviewed',
        provenance: `Reviewed strategy: ${direction.trim()}`,
      }));
    }
    setSavedRequirements(saved);
    setDraft((current) => current.map((requirement, index) => ({ ...requirement, skillId: saved[index].skillId,
      skillName: saved[index].skillName })));
    setPreview(null);
    await onRequirementsSaved?.();
  }
  const employeeName = (id) => workforce?.employees.find((employee) => employee.id === id)?.name || 'Not assigned';

  return <div>
    {error && <p role="alert" className="alert">{error}</p>}

    <section className="panel">
      <div className="panel-head">
        <div>
          <h2>Develop a skill</h2>
          <p>Get a draft plan that covers training, mentoring, certification, job rotation and project work. Without an AI key, Keystone uses labeled demo rules.</p>
        </div>
      </div>
      <form className="form-row" onSubmit={(event) => { event.preventDefault(); clearPlan(); run('plan', async () => setPlan(await keystoneApi.developmentPlan(Number(skillId)))); }}>
        <label className="field grow max-sm">Skill
          <select disabled={busy} value={skillId} onChange={(event) => { setSkillId(event.target.value); clearPlan(); }}>
            <option value="">Select a skill</option>
            {workforce?.skills.map((skill) => <option key={skill.id} value={skill.id}>{skill.name}</option>)}
          </select>
        </label>
        <button className="btn btn-primary" disabled={busy || !skillId}>{pending === 'plan' ? 'Generating…' : 'Generate development plan'}</button>
      </form>

      {plan && <div aria-live="polite">
        <p className="source-line"><ModeTag mode={plan.mode} /> {plan.message}</p>
        {onSchedule && scheduledActions.size > 0 && <p className="status-line" role="status">
          <Icon name="check" size={16} />
          <span>{plural(scheduledActions.size, 'action')} added to Time Machine as not verified. They count toward coverage once you mark them verified there.</span>
        </p>}
        <div className="card-grid">
          {plan.actions.map((action) => {
            const applicable = action.status !== 'not_applicable';
            const scheduled = scheduledActions.has(action.id);
            return <article className="card" key={action.id}>
              <header className="card-head">
                <h3>{labels[action.category]}</h3>
                <span className={applicable ? 'tag tag-accent' : 'tag'}>{sentence(action.status)}</span>
              </header>
              <p>{action.rationale}</p>
              <p>{action.action}</p>
              <dl className="meta">
                {applicable && <><dt>Participant</dt><dd>{employeeName(action.employeeId)}</dd></>}
                {applicable && action.mentorId !== null && <><dt>Mentor</dt><dd>{employeeName(action.mentorId)}</dd></>}
                <dt>Target level</dt><dd>{action.targetProficiency} of 5</dd>
                <dt>Duration</dt><dd>{action.estimatedDurationMonths === null ? 'Not estimated' : `About ${plural(action.estimatedDurationMonths, 'month')}`}</dd>
                {action.resource && <><dt>Resource</dt><dd>{action.resource.title}</dd></>}
                <dt>Milestone</dt><dd>{action.milestone}</dd>
                <dt>Verified by</dt><dd>{action.verificationMethod}</dd>
              </dl>
              <details><summary>Assumptions</summary><ul>{action.assumptions.map((assumption, i) => <li key={i}>{assumption}</li>)}</ul></details>
              {onSchedule && applicable && action.employeeId !== null && <footer className="card-foot">
                <label className="check"><input type="checkbox" disabled={scheduled} checked={reviewedActions.has(action.id)}
                  onChange={(event) => toggleReviewed(action.id, event.target.checked)} /> I reviewed this action</label>
                <button type="button" className="btn btn-secondary btn-sm" disabled={!reviewedActions.has(action.id) || scheduled} onClick={() => schedule(action)}>
                  {scheduled ? <><Icon name="check" size={16} /> Scheduled</> : 'Schedule in Time Machine'}
                </button>
              </footer>}
            </article>;
          })}
        </div>
      </div>}
    </section>

    <section className="panel">
      <div className="panel-head">
        <div>
          <h2>Plan for future skills</h2>
          <p>Describe where the business is heading. Keystone proposes the skills you will need, and nothing is saved until you review it.</p>
        </div>
      </div>
      <form className="strategy-form" onSubmit={(event) => {
        event.preventDefault();
        setProposal(null); setPreview(null); setReviewed(false); setDraft([]); setSavedRequirements([]);
        run('strategy', async () => { const response = await keystoneApi.strategy(direction); setProposal(response); setDraft(editableRequirements(response.requirements)); });
      }}>
        <label className="field">Business direction
          <textarea rows={2} disabled={busy} value={direction} maxLength={2000} onChange={(event) => changeDirection(event.target.value)}
            placeholder="For example: We are expanding into e-commerce" />
        </label>
        <button className="btn btn-primary" disabled={busy || !direction.trim()}>{pending === 'strategy' ? 'Proposing…' : 'Propose future skills'}</button>
      </form>

      {proposal && <p className="source-line"><ModeTag mode={proposal.mode} /> {proposal.message}</p>}

      {draft.length > 0 && <>
        <div className="req-list">
          {draft.map((requirement, index) => <article className="card" key={`${requirement.skillId}-${requirement.skillName}`}>
            <header className="card-head">
              <h3>{requirement.skillName}</h3>
              <span className="tag">{requirement.skillId === null ? 'New skill' : 'Existing skill'}</span>
            </header>
            <p>{requirement.rationale}</p>
            <p className="muted">Suggested path: {requirement.sourcing}. {requirement.sourcingRationale}</p>
            <div className="form-grid">
              <label className="field">Target level
                <input disabled={busy} type="number" min="1" max="5" value={requirement.targetProficiency} onChange={(event) => update(index, 'targetProficiency', event.target.value)} />
              </label>
              <label className="field">People needed
                <input disabled={busy} type="number" min="1" max="10000" value={requirement.requiredHolders} onChange={(event) => update(index, 'requiredHolders', event.target.value)} />
              </label>
              <label className="field">Criticality
                <input disabled={busy} type="number" min="1" max="5" value={requirement.criticality} onChange={(event) => update(index, 'criticality', event.target.value)} />
              </label>
              <label className="field">Starts in month
                <input disabled={busy} type="number" min="0" max="60" value={requirement.effectiveMonth} onChange={(event) => update(index, 'effectiveMonth', event.target.value)} />
              </label>
            </div>
            <details><summary>Assumptions</summary><ul>{requirement.assumptions.map((assumption, i) => <li key={i}>{assumption}</li>)}</ul></details>
          </article>)}
        </div>

        <div className="review-bar">
          <label className="check"><input disabled={busy} type="checkbox" checked={reviewed}
            onChange={(event) => { setReviewed(event.target.checked); setPreview(null); }} /> I reviewed these requirements and their assumptions</label>
          <div className="form-row">
            <label className="field">Preview at
              <select disabled={busy} value={horizon} onChange={(event) => { setHorizon(Number(event.target.value)); setPreview(null); }}>
                <option value={0}>Today</option><option value={12}>1 year</option><option value={36}>3 years</option><option value={60}>5 years</option>
              </select>
            </label>
            <button type="button" className="btn btn-secondary" disabled={busy || !reviewed}
              onClick={() => run('preview', async () => setPreview(await keystoneApi.previewStrategy({ reviewed, horizonMonths: horizon, requirements: draft })))}>
              {pending === 'preview' ? 'Previewing…' : 'Preview gaps'}
            </button>
            <button type="button" className="btn btn-primary" disabled={busy || !reviewed || savedRequirements.length > 0}
              onClick={() => run('save', saveRequirements)}>
              {pending === 'save' ? 'Saving…' : savedRequirements.length > 0 ? 'Requirements saved' : 'Save reviewed requirements'}
            </button>
          </div>
        </div>
        {savedRequirements.length > 0 && <p className="status-line" role="status">
          <Icon name="check" size={16} />
          <span>Saved {plural(savedRequirements.length, 'requirement')}. Time Machine applies each one from its start month.</span>
        </p>}
      </>}

      {preview && <div className="preview" aria-live="polite">
        <h3>Gap preview</h3>
        <p className="muted">
          Uses your reviewed numbers in place of current targets and assumes no departures or new training.
          {savedRequirements.length > 0 ? ' These requirements are saved.' : ' Nothing has been saved yet.'}
        </p>
        <ul className="plain-list">{preview.requirements.map((requirement) => <li key={requirement.requirementId}>
          <strong>{requirement.skillName}:</strong>{' '}
          {requirement.active
            ? `${requirement.coverage.recordedQualifiedHolders} qualified on record, gap of ${requirement.coverage.gap}, dependency score ${requirement.coverage.keystoneScore}/100.`
            : `Not in effect yet. Starts in month ${requirement.effectiveMonth}.`}
        </li>)}</ul>
      </div>}
    </section>
  </div>;
}
