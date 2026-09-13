import { useState } from 'react';
import { keystoneApi } from '../api/keystone';
import { useSession } from '../session';
import { can, plural } from './format';
import Icon from './Icon';
import HelpTopic from './HelpTopic';
import AIProviderStatus, { fallbackSentence } from './AIProviderStatus';

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

const addTo = (set, id) => new Set(set).add(id);
const removeFrom = (set, id) => { const next = new Set(set); next.delete(id); return next; };

export default function AIWorkbench({ workforce, onRequirementsSaved, onSchedule }) {
  const session = useSession();
  const canPlan = can(session, 'ai.development');
  const canStrategy = can(session, 'ai.strategy');
  const saveDirectly = can(session, 'futureRequirement.configure');
  const canPropose = can(session, 'planning.propose');

  const [skillId, setSkillId] = useState('');
  const [plan, setPlan] = useState(null);
  const [reviewedActions, setReviewedActions] = useState(new Set());
  const [scheduledActions, setScheduledActions] = useState(new Set());
  const [dismissedActions, setDismissedActions] = useState(new Set());
  const [recording, setRecording] = useState(new Set());
  const [direction, setDirection] = useState('');
  const [proposal, setProposal] = useState(null);
  const [draft, setDraft] = useState([]);
  const [reviewed, setReviewed] = useState(false);
  const [horizon, setHorizon] = useState(12);
  const [preview, setPreview] = useState(null);
  const [saved, setSaved] = useState(null);
  // Which request is running: 'plan', 'strategy', 'preview' or 'save'. Every control waits on any of them.
  const [pending, setPending] = useState('');
  const [error, setError] = useState('');
  const busy = pending !== '';

  async function run(kind, action) {
    setPending(kind); setError('');
    try { await action(); } catch (err) { setError(err.message); } finally { setPending(''); }
  }
  function clearPlan() {
    setPlan(null); setReviewedActions(new Set()); setScheduledActions(new Set()); setDismissedActions(new Set());
  }

  // Every review, schedule and dismissal is recorded in the audit history by the server. The screen
  // only shows the new state once the server has confirmed it.
  async function decide(action, decision) {
    setRecording((current) => addTo(current, action.id));
    setError('');
    try {
      await keystoneApi.recordAiDecision({
        skillId: action.skillId,
        category: action.category,
        decision,
        employeeId: action.employeeId ?? null,
        mentorId: action.mentorId ?? null,
        mode: plan.mode === 'live-ai' ? 'live-ai' : 'demo-fallback',
      });
      return true;
    } catch (err) {
      setError(`Your decision wasn't recorded, so nothing changed. ${err.message}`);
      return false;
    } finally {
      setRecording((current) => removeFrom(current, action.id));
    }
  }

  async function toggleReviewed(action, checked) {
    if (await decide(action, checked ? 'reviewed' : 'unreviewed')) {
      setReviewedActions((current) => (checked ? addTo(current, action.id) : removeFrom(current, action.id)));
    }
  }
  async function schedule(action) {
    if (await decide(action, 'scheduled')) {
      onSchedule(toIntervention(action));
      setScheduledActions((current) => addTo(current, action.id));
    }
  }
  async function dismiss(action) {
    if (await decide(action, 'dismissed')) setDismissedActions((current) => addTo(current, action.id));
  }

  function update(index, field, value) {
    setDraft((current) => current.map((item, i) => i === index ? { ...item, [field]: Number(value) } : item));
    setReviewed(false); setPreview(null);
  }
  function changeDirection(value) {
    setDirection(value); setProposal(null); setDraft([]); setPreview(null); setReviewed(false);
  }

  const requirementFields = (requirement) => ({
    skillId: requirement.skillId,
    skillName: requirement.skillName,
    requiredHolders: requirement.requiredHolders,
    targetProficiency: requirement.targetProficiency,
    criticality: requirement.criticality,
    effectiveMonth: requirement.effectiveMonth,
    provenance: `Reviewed strategy: ${direction.trim()}`.slice(0, 300),
  });

  // Admins save approved requirements directly (audited). HR submits them for an admin's approval, and
  // they only reach Time Machine once approved.
  async function saveRequirements() {
    const results = [];
    for (const requirement of draft) {
      results.push(saveDirectly
        ? await keystoneApi.addFutureRequirement({ ...requirementFields(requirement), status: 'reviewed' })
        : await keystoneApi.createChangeRequest({
          type: 'future_requirement',
          payload: { operation: 'create', fields: requirementFields(requirement) },
          justification: `Proposed from the AI advisor after review. Business direction: ${direction.trim()}`.slice(0, 1000),
          submit: true,
        }));
    }
    setSaved({ mode: saveDirectly ? 'direct' : 'submitted', count: results.length });
    if (saveDirectly) {
      setDraft((current) => current.map((requirement, index) => ({ ...requirement, skillId: results[index].skillId,
        skillName: results[index].skillName })));
    }
    setPreview(null);
    await onRequirementsSaved?.();
  }
  const employeeName = (id) => workforce?.employees.find((employee) => employee.id === id)?.name || 'Not assigned';

  return <div>
    <AIProviderStatus />
    {error && <p role="alert" className="alert">{error}</p>}

    {canPlan && <section className="panel">
      <div className="panel-head">
        <div>
          <h2>Develop a skill <HelpTopic id="evidence-trust" /></h2>
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
        <p className="source-line"><ModeTag mode={plan.mode} /> {plan.message}{fallbackSentence(plan) && <> {fallbackSentence(plan)}</>}</p>
        {onSchedule && scheduledActions.size > 0 && <p className="status-line" role="status">
          <Icon name="check" size={16} />
          <span>{plural(scheduledActions.size, 'action')} added to Time Machine as not verified. They count toward coverage once you mark them verified there.</span>
        </p>}
        <div className="card-grid">
          {plan.actions.map((action) => {
            const applicable = action.status !== 'not_applicable';
            const scheduled = scheduledActions.has(action.id);
            const dismissed = dismissedActions.has(action.id);
            const saving = recording.has(action.id);
            return <article className="card" key={action.id}>
              <header className="card-head">
                <h3>{labels[action.category]}</h3>
                {dismissed ? <span className="tag tag-outline">Dismissed</span>
                  : <span className={applicable ? 'tag tag-accent' : 'tag'}>{sentence(action.status)}</span>}
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
              {dismissed && <p className="muted small">Dismissed and recorded in the audit history.</p>}
              {onSchedule && applicable && action.employeeId !== null && !dismissed && <footer className="card-foot">
                <label className="check"><input type="checkbox" disabled={scheduled || saving} checked={reviewedActions.has(action.id)}
                  onChange={(event) => toggleReviewed(action, event.target.checked)} /> I reviewed this action</label>
                <span className="row-actions">
                  {!scheduled && <button type="button" className="btn btn-quiet btn-sm" disabled={saving} onClick={() => dismiss(action)}>Dismiss</button>}
                  <button type="button" className="btn btn-secondary btn-sm" disabled={!reviewedActions.has(action.id) || scheduled || saving} onClick={() => schedule(action)}>
                    {scheduled ? <><Icon name="check" size={16} /> Scheduled</> : saving ? 'Recording…' : 'Schedule in Time Machine'}
                  </button>
                </span>
              </footer>}
            </article>;
          })}
        </div>
      </div>}
    </section>}

    {canStrategy && <section className="panel">
      <div className="panel-head">
        <div>
          <h2>Plan for future skills <HelpTopic id="future-requirement" /></h2>
          <p>
            Describe where the business is heading. Keystone proposes the skills you will need, and nothing is saved until you review it.
            {!saveDirectly && canPropose ? ' Reviewed requirements go to an admin for approval.' : ''}
          </p>
        </div>
      </div>
      <form className="strategy-form" onSubmit={(event) => {
        event.preventDefault();
        setProposal(null); setPreview(null); setReviewed(false); setDraft([]); setSaved(null);
        run('strategy', async () => { const response = await keystoneApi.strategy(direction); setProposal(response); setDraft(editableRequirements(response.requirements)); });
      }}>
        <label className="field">Business direction
          <textarea rows={2} disabled={busy} value={direction} maxLength={2000} onChange={(event) => changeDirection(event.target.value)}
            placeholder="For example: We are expanding into e-commerce" />
        </label>
        <button className="btn btn-primary" disabled={busy || !direction.trim()}>{pending === 'strategy' ? 'Proposing…' : 'Propose future skills'}</button>
      </form>

      {proposal && <p className="source-line"><ModeTag mode={proposal.mode} /> {proposal.message}{fallbackSentence(proposal) && <> {fallbackSentence(proposal)}</>}</p>}

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
                <input disabled={busy || saved !== null} type="number" min="1" max="5" value={requirement.targetProficiency} onChange={(event) => update(index, 'targetProficiency', event.target.value)} />
              </label>
              <label className="field">People needed
                <input disabled={busy || saved !== null} type="number" min="1" max="10000" value={requirement.requiredHolders} onChange={(event) => update(index, 'requiredHolders', event.target.value)} />
              </label>
              <label className="field">Criticality
                <input disabled={busy || saved !== null} type="number" min="1" max="5" value={requirement.criticality} onChange={(event) => update(index, 'criticality', event.target.value)} />
              </label>
              <label className="field">Starts in month
                <input disabled={busy || saved !== null} type="number" min="0" max="60" value={requirement.effectiveMonth} onChange={(event) => update(index, 'effectiveMonth', event.target.value)} />
              </label>
            </div>
            <details><summary>Assumptions</summary><ul>{requirement.assumptions.map((assumption, i) => <li key={i}>{assumption}</li>)}</ul></details>
          </article>)}
        </div>

        <div className="review-bar">
          <label className="check"><input disabled={busy || saved !== null} type="checkbox" checked={reviewed}
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
            {(saveDirectly || canPropose) && (
              <button type="button" className="btn btn-primary" disabled={busy || !reviewed || saved !== null}
                onClick={() => run('save', saveRequirements)}>
                {pending === 'save' ? 'Saving…'
                  : saved?.mode === 'direct' ? 'Requirements saved'
                    : saved?.mode === 'submitted' ? 'Submitted for approval'
                      : saveDirectly ? 'Save reviewed requirements' : 'Submit for approval'}
              </button>
            )}
          </div>
        </div>
        {saved && <p className="status-line" role="status">
          <Icon name="check" size={16} />
          <span>
            {saved.mode === 'direct'
              ? `Saved ${plural(saved.count, 'requirement')}. Time Machine applies each one from its start month.`
              : `Submitted ${plural(saved.count, 'requirement')} for admin approval. They reach Time Machine only after approval; track them in Submissions.`}
          </span>
        </p>}
      </>}

      {preview && <div className="preview" aria-live="polite">
        <h3>Gap preview</h3>
        <p className="muted">
          Uses your reviewed numbers in place of current targets and assumes no departures or new training.
          {saved?.mode === 'direct' ? ' These requirements are saved.' : saved ? ' These requirements are awaiting approval.' : ' Nothing has been saved yet.'}
        </p>
        <ul className="plain-list">{preview.requirements.map((requirement) => <li key={requirement.requirementId}>
          <strong>{requirement.skillName}:</strong>{' '}
          {requirement.active
            ? `${requirement.coverage.recordedQualifiedHolders} qualified on record, gap of ${requirement.coverage.gap}, dependency score ${requirement.coverage.keystoneScore}/100.`
            : `Not in effect yet. Starts in month ${requirement.effectiveMonth}.`}
        </li>)}</ul>
      </div>}
    </section>}
  </div>;
}
