import { useState } from 'react';
import { keystoneApi } from '../api/keystone';

const labels = { training: 'Training', mentoring: 'Mentoring', certification: 'Certification', job_rotation: 'Job rotation', project_experience: 'Project experience' };
const editableRequirements = (requirements) => requirements.map(({ requirementId: _id, coverage: _coverage, ...requirement }) => requirement);

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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function run(action) {
    setBusy(true); setError('');
    try { await action(); } catch (err) { setError(err.message); } finally { setBusy(false); }
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
    <h3>Development advisor</h3>
    <p>Generate reviewable actions for a skill. Without provider configuration, this uses labeled demo rules.</p>
    {error && <p role="alert" className="error">{error}</p>}
    <form onSubmit={(event) => { event.preventDefault(); clearPlan(); run(async () => setPlan(await keystoneApi.developmentPlan(Number(skillId)))); }}>
      <label>Skill to develop <select disabled={busy} value={skillId} onChange={(event) => { setSkillId(event.target.value); clearPlan(); }}>
        <option value="">Select a skill</option>
        {workforce?.skills.map((skill) => <option key={skill.id} value={skill.id}>{skill.name}</option>)}
      </select></label>{' '}<button disabled={busy || !skillId}>Generate development plan</button>
    </form>
    {plan && <div aria-live="polite">
      <p><strong>{plan.mode === 'live-ai' ? 'AI draft' : 'Demo fallback'}</strong> · {plan.message}</p>
      {onSchedule && scheduledActions.size > 0 && <p role="status">
        Scheduled {scheduledActions.size} action(s) in Time Machine as unverified: they change projected coverage only after you mark the outcome verified there.
      </p>}
      <div className="two-col">{plan.actions.map((action) => <article className="panel" key={action.id}>
        <h4>{labels[action.category]} · {action.status.replaceAll('_', ' ')}</h4>
        <p>{action.rationale}</p><p>{action.action}</p>
        {action.status !== 'not_applicable' && <p>Participant: {employeeName(action.employeeId)}{action.mentorId !== null ? ` · Mentor: ${employeeName(action.mentorId)}` : ''}</p>}
        <p>Target proficiency: {action.targetProficiency}/5 · {action.estimatedDurationMonths === null ? 'No duration estimated' : `${action.estimatedDurationMonths} months, estimated`}</p>
        {action.resource && <p>Catalog resource: {action.resource.title}</p>}
        <p><strong>Milestone:</strong> {action.milestone}</p>
        <p><strong>Verification:</strong> {action.verificationMethod}</p>
        <details><summary>Assumptions</summary><ul>{action.assumptions.map((assumption, i) => <li key={i}>{assumption}</li>)}</ul></details>
        {onSchedule && action.status !== 'not_applicable' && action.employeeId !== null && <div className="schedule-row">
          <label><input type="checkbox" disabled={scheduledActions.has(action.id)} checked={reviewedActions.has(action.id)}
            onChange={(event) => toggleReviewed(action.id, event.target.checked)} /> I reviewed this action</label>
          <button type="button" disabled={!reviewedActions.has(action.id) || scheduledActions.has(action.id)} onClick={() => schedule(action)}>
            {scheduledActions.has(action.id) ? 'Scheduled in Time Machine' : 'Schedule in Time Machine'}
          </button>
        </div>}
      </article>)}</div>
    </div>}
    <h3>Future strategy</h3>
    <p>Describe your initiative, then review the proposed capabilities and planning assumptions.</p>
    <form onSubmit={(event) => { event.preventDefault(); setProposal(null); setPreview(null); setReviewed(false); setDraft([]); setSavedRequirements([]);
      run(async () => { const response = await keystoneApi.strategy(direction); setProposal(response); setDraft(editableRequirements(response.requirements)); }); }}>
      <label>Business direction <input disabled={busy} value={direction} maxLength={2000} onChange={(event) => { setDirection(event.target.value); setProposal(null); setDraft([]); setPreview(null); setReviewed(false); }} placeholder="We are expanding into e-commerce" /></label>{' '}
      <button disabled={busy || !direction.trim()}>Propose future skills</button>
    </form>
    {busy && <p role="status">Preparing recommendations…</p>}
    {proposal && <p><strong>{proposal.mode === 'live-ai' ? 'AI draft' : 'Deterministic demo proposal'}</strong> · {proposal.message}</p>}
    {draft.length > 0 && <div>
      {draft.map((requirement, index) => <article className="panel" key={`${requirement.skillId}-${requirement.skillName}`}>
        <h4>{requirement.skillName} · {requirement.skillId === null ? 'New proposed skill' : 'Existing catalog skill'}</h4>
        <p>{requirement.rationale}</p>
        <p>Suggested path: {requirement.sourcing}. {requirement.sourcingRationale}</p>
        <label>Target proficiency <input disabled={busy} type="number" min="1" max="5" value={requirement.targetProficiency} onChange={(event) => update(index, 'targetProficiency', event.target.value)} /></label>{' '}
        <label>Required holders <input disabled={busy} type="number" min="1" max="10000" value={requirement.requiredHolders} onChange={(event) => update(index, 'requiredHolders', event.target.value)} /></label>{' '}
        <label>Criticality <input disabled={busy} type="number" min="1" max="5" value={requirement.criticality} onChange={(event) => update(index, 'criticality', event.target.value)} /></label>{' '}
        <label>Effective month <input disabled={busy} type="number" min="0" max="60" value={requirement.effectiveMonth} onChange={(event) => update(index, 'effectiveMonth', event.target.value)} /></label>
        <details><summary>Assumptions</summary><ul>{requirement.assumptions.map((assumption, i) => <li key={i}>{assumption}</li>)}</ul></details>
      </article>)}
      <label><input disabled={busy} type="checkbox" checked={reviewed} onChange={(event) => { setReviewed(event.target.checked); setPreview(null); }} /> I reviewed these requirements and their assumptions for this preview.</label>{' '}
      <label>Preview horizon <select disabled={busy} value={horizon} onChange={(event) => { setHorizon(Number(event.target.value)); setPreview(null); }}>
        <option value={0}>Now</option><option value={12}>1 year</option><option value={36}>3 years</option><option value={60}>5 years</option>
      </select></label>{' '}
      <button disabled={busy || !reviewed} onClick={() => run(async () => setPreview(await keystoneApi.previewStrategy({ reviewed, horizonMonths: horizon, requirements: draft })))}>Preview reviewed gaps</button>{' '}
      <button disabled={busy || !reviewed || savedRequirements.length > 0}
        onClick={() => run(saveRequirements)}>{savedRequirements.length > 0 ? 'Requirements saved' : 'Save reviewed requirements'}</button>
      {savedRequirements.length > 0 && <p role="status">Saved {savedRequirements.length} reviewed requirement(s). New skills now have stable IDs and will enter Time Machine scenarios at their effective month.</p>}
    </div>}
    {preview && <div aria-live="polite"><h4>Reviewed scenario preview</h4>
      <p>{savedRequirements.length > 0 ? 'This preview uses the reviewed requirements that were saved.' : 'No requirements or employee evidence have been saved.'}</p>
      <p>For matching skills, this preview uses your reviewed quantities in place of the current targets. It assumes no departures or training gains.</p>
      <ul>{preview.requirements.map((requirement) => <li key={requirement.requirementId}><strong>{requirement.skillName}:</strong>{' '}
        {requirement.active ? `${requirement.coverage.recordedQualifiedHolders} recorded qualified holders; gap ${requirement.coverage.gap}; score ${requirement.coverage.keystoneScore}/100.` : `Not yet effective at this horizon (month ${requirement.effectiveMonth}).`}
      </li>)}</ul>
    </div>}
  </div>;
}
