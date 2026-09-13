import { useCallback, useEffect, useState } from 'react';
import { keystoneApi } from '../api/keystone';
import { useSession } from '../session';
import Dialog from './Dialog';
import EvidenceChangeDialog from './EvidenceChangeDialog';
import { can, fieldMessages, formatDate } from './format';
import Icon from './Icon';
import HelpTopic from './HelpTopic';
import Provenance from './Provenance';
import TrustLegend from './TrustLegend';
import { FieldError, FormError } from './ui';

// WorkforceSnapshot renders the official records behind every score, one tab per record type, with
// data-quality notes on the records they concern. One search filters every tab.
//
// Honest-rendering rules (Member 1's, and they matter for the demo):
//   - mentoringHoursPerMonth ABSENT  => dash, never 0
//   - lastVerifiedAt null            => "Unverified", never a guessed date
//   - demandTarget 0/null            => dash (zero demand is not a target)
//   - provenance 'fictional demo …'  => labeled, so we never overclaim.

const DASH = '—';
const dash = (value) => (value === null || value === undefined || value === '' ? DASH : value);
const capitalize = (text) => (typeof text === 'string' && text ? text.charAt(0).toUpperCase() + text.slice(1).replaceAll('_', ' ') : dash(text));

const ALL_TABS = [
  ['skills', 'Skills'],
  ['roles', 'Roles'],
  ['learning', 'Learning'],
  ['future', 'Future needs'],
  ['people', 'People'],
  ['evidence', 'Evidence'],
];

const DONE_MESSAGES = {
  direct: 'Saved to official data and recorded in the audit history.',
  draft: 'Saved as a draft. Submit it from Submissions when you are ready.',
  submit: 'Submitted for review. The official record changes only if a reviewer approves it.',
};

// Data-quality notes for one record. Severity is shown in words and an icon; info notes stay neutral.
function QualityNotes({ issues }) {
  if (!issues?.length) return null;
  return (
    <span className="record-badges">
      {issues.map((issue) => (
        <span key={issue.fingerprint} className={`tag severity-${issue.severity}`} title={`${issue.explanation} ${issue.suggestedAction}`}>
          <Icon name={issue.severity === 'info' ? 'info' : 'alert'} size={12} /> {issue.title}
        </span>
      ))}
    </span>
  );
}

function RemoveEvidenceDialog({ edge, label, direct, onClose, onDone }) {
  const [justification, setJustification] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (direct) await keystoneApi.removeEmployeeSkill(edge.employeeId, edge.skillId);
      else {
        await keystoneApi.createChangeRequest({
          type: 'employee_skill',
          payload: { operation: 'remove', employeeId: edge.employeeId, skillId: edge.skillId },
          justification: justification.trim() || undefined,
          submit: true,
        });
      }
      onDone(direct);
    } catch (failure) {
      setError(failure);
      setBusy(false);
    }
  }

  return (
    <Dialog title="Remove evidence" description={label} onClose={onClose}
      footer={<>
        <button type="button" className="btn btn-quiet" onClick={onClose}>Cancel</button>
        <button type="submit" form="remove-evidence-form" className="btn btn-primary" disabled={busy}>
          {busy ? 'Saving…' : direct ? 'Remove from official data' : 'Submit removal for review'}
        </button>
      </>}>
      <form id="remove-evidence-form" className="form-stack" onSubmit={submit}>
        <FormError error={error} />
        <p className="muted">
          {direct
            ? 'The record is removed now, scores are recalculated, and the removal is recorded in the audit history with the previous values.'
            : 'A reviewer decides. Until then the record stays official and keeps counting toward scores.'}
        </p>
        {!direct && (
          <label className="field">Why remove it (optional)
            <textarea rows={2} value={justification} maxLength={1000} onChange={(event) => setJustification(event.target.value)} data-autofocus />
          </label>
        )}
      </form>
    </Dialog>
  );
}

function RejectRequirementDialog({ requirement, onClose, onDone }) {
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const errors = fieldMessages(error);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await keystoneApi.rejectFutureRequirement(requirement.id, comment);
      onDone();
    } catch (failure) {
      setError(failure);
      setBusy(false);
    }
  }

  return (
    <Dialog title="Reject proposed requirement" description={requirement.skillName} onClose={onClose}
      footer={<>
        <button type="button" className="btn btn-quiet" onClick={onClose}>Cancel</button>
        <button type="submit" form="reject-requirement-form" className="btn btn-primary" disabled={busy || !comment.trim()}>{busy ? 'Saving…' : 'Reject'}</button>
      </>}>
      <form id="reject-requirement-form" className="form-stack" onSubmit={submit}>
        <FormError error={error} />
        <p className="muted">The proposal is removed from the plan. The audit history keeps it with your reason.</p>
        <label className="field">Reason for rejecting
          <textarea rows={3} value={comment} maxLength={1000} required onChange={(event) => setComment(event.target.value)} data-autofocus
            aria-invalid={Boolean(errors.comment)} aria-describedby="reject-requirement-error" />
          <FieldError id="reject-requirement-error" message={errors.comment} />
        </label>
      </form>
    </Dialog>
  );
}

export default function WorkforceSnapshot({ workforce, quality, params = {}, onChanged }) {
  const session = useSession();
  const canReadFuture = can(session, 'futureRequirement.read');
  const canConfigureFuture = can(session, 'futureRequirement.configure');
  const canProposeEvidence = can(session, 'changes.submit');
  const writesEvidence = can(session, 'evidence.write');
  const tabs = ALL_TABS.filter(([id]) => id !== 'future' || canReadFuture);

  const [futureRequirements, setFutureRequirements] = useState(null);
  const [reqError, setReqError] = useState(null);
  const [query, setQuery] = useState(params.q ?? '');
  const [tab, setTab] = useState(tabs.some(([id]) => id === params.tab) ? params.tab : 'skills');
  const [dialog, setDialog] = useState(null);
  const [message, setMessage] = useState('');
  const [actionError, setActionError] = useState(null);
  const [busy, setBusy] = useState(null);

  const loadFuture = useCallback(async () => {
    if (!canReadFuture) return;
    try {
      setFutureRequirements(await keystoneApi.futureRequirements());
      setReqError(null);
    } catch (failure) {
      setReqError(failure);
    }
  }, [canReadFuture]);

  useEffect(() => { loadFuture(); }, [loadFuture]);

  if (!workforce) return null;
  const { employees = [], skills = [], matrix = [], roles = [], learningResources = [] } = workforce;
  const employeeName = (id) => employees.find((e) => e.id === id)?.name ?? `Employee ${id}`;
  const skillName = (id) => skills.find((s) => s.id === id)?.name ?? `Skill ${id}`;

  // Open and acknowledged issues, grouped by the record they concern.
  const issuesByRecord = new Map();
  for (const issue of quality?.issues ?? []) {
    const key = `${issue.entityType}:${issue.entityId}`;
    issuesByRecord.set(key, [...(issuesByRecord.get(key) ?? []), issue]);
  }
  const notesFor = (type, id) => issuesByRecord.get(`${type}:${id}`);

  const needle = query.trim().toLowerCase();
  const matches = (...values) => !needle || values.some((value) => String(value ?? '').toLowerCase().includes(needle));
  const shownSkills = skills.filter((skill) => matches(skill.name));
  const shownRoles = roles.filter((role) => matches(role.name, ...(role.incumbentIds ?? []).map(employeeName)));
  const shownResources = learningResources.filter((resource) => matches(resource.title, resource.category, resource.provider, ...(resource.skillIds ?? []).map(skillName)));
  const shownFuture = (futureRequirements ?? []).filter((req) => matches(req.skillName ?? skillName(req.skillId), req.status));
  const shownEmployees = employees.filter((employee) => matches(employee.name, employee.role, employee.department));
  const shownMatrix = matrix.filter((edge) => matches(employeeName(edge.employeeId), skillName(edge.skillId), edge.evidenceSource));
  const withCapacity = employees.filter((employee) => employee.mentoringHoursPerMonth !== undefined).length;

  const counts = {
    skills: shownSkills.length, roles: shownRoles.length, learning: shownResources.length,
    future: futureRequirements ? shownFuture.length : null, people: shownEmployees.length, evidence: shownMatrix.length,
  };
  const noMatch = (noun) => <p className="empty-line">No {noun} match “{query.trim()}”.</p>;

  const moveTab = (event) => {
    const index = tabs.findIndex(([id]) => id === tab);
    const next = event.key === 'ArrowRight' ? (index + 1) % tabs.length
      : event.key === 'ArrowLeft' ? (index - 1 + tabs.length) % tabs.length : null;
    if (next === null) return;
    event.preventDefault();
    setTab(tabs[next][0]);
    document.getElementById(`tab-${tabs[next][0]}`)?.focus();
  };

  async function finish(text) {
    setDialog(null);
    setMessage(text);
    await onChanged?.();
  }

  async function approveRequirement(requirement) {
    setBusy(requirement.id);
    setActionError(null);
    setMessage('');
    try {
      await keystoneApi.approveFutureRequirement(requirement.id);
      setMessage(`Approved the ${requirement.skillName} requirement. Time Machine applies it from month ${requirement.effectiveMonth}.`);
      await loadFuture();
      await onChanged?.();
    } catch (failure) {
      setActionError(failure);
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      {message && <p className="status-line" role="status"><Icon name="check" size={16} /><span>{message}</span></p>}
      <FormError error={actionError} />

      <section className="panel panel-flush">
        <div className="data-toolbar">
          <form className="search" role="search" onSubmit={(event) => event.preventDefault()}>
            <Icon name="search" size={16} />
            <input type="search" aria-label="Search records" value={query} onChange={(event) => setQuery(event.target.value)}
              placeholder="Search people, roles, skills or evidence" />
          </form>
          {needle && <p className="muted" role="status">Tab counts show matches for “{query.trim()}”.</p>}
          {workforce.visibility === 'team' && <p className="muted">Showing your team only.</p>}
        </div>

        <div className="tabs" role="tablist" aria-label="Record types">
          {tabs.map(([id, label]) => (
            <button key={id} id={`tab-${id}`} type="button" role="tab" className="tab" aria-selected={tab === id}
              aria-controls={`tabpanel-${id}`} tabIndex={tab === id ? 0 : -1} onClick={() => setTab(id)} onKeyDown={moveTab}>
              {label}
              {counts[id] !== null && <span className="tab-count">{counts[id]}</span>}
            </button>
          ))}
        </div>

        <div className="tab-panel" role="tabpanel" id={`tabpanel-${tab}`} aria-labelledby={`tab-${tab}`}>
          {tab === 'skills' && <>
            <p className="tab-note">People needed is how many people should be qualified. The hiring target is tracked separately, so a skill can need coverage without any hiring.</p>
            {shownSkills.length === 0 ? noMatch('skills') : <div className="table-wrap flush">
              <table>
                <thead><tr><th scope="col">Skill</th><th scope="col" className="num">Criticality</th><th scope="col" className="num">Target level</th><th scope="col" className="num">People needed <HelpTopic id="coverage-target" /></th><th scope="col" className="num">Hiring target</th><th scope="col">Source</th></tr></thead>
                <tbody>
                  {shownSkills.map((skill) => (
                    <tr key={skill.id}>
                      <th scope="row">{skill.name}<QualityNotes issues={notesFor('skill', skill.id)} /></th>
                      <td className="num">{dash(skill.criticality)}</td>
                      <td className="num">{dash(skill.targetProficiency)}</td>
                      <td className="num">{dash(skill.requiredHolders)}</td>
                      <td className="num">{dash(skill.demandTarget)}</td>
                      <td><Provenance source={skill.metadataSource} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>}
          </>}

          {tab === 'roles' && <>
            <p className="tab-note">What a successor needs for each role. Readiness is calculated from evidence each time, not stored, and role criticality starts neutral until someone edits it.</p>
            {shownRoles.length === 0 ? noMatch('roles') : <div className="table-wrap flush">
              <table>
                <thead><tr><th scope="col">Role</th><th scope="col" className="num">Criticality</th><th scope="col">Current holders</th><th scope="col">Successor needs</th><th scope="col">Source</th></tr></thead>
                <tbody>
                  {shownRoles.map((role) => (
                    <tr key={role.id}>
                      <th scope="row">{role.name}</th>
                      <td className="num">{dash(role.criticality)}</td>
                      <td>{role.incumbentIds?.length ? role.incumbentIds.map(employeeName).join(', ') : DASH}</td>
                      <td>{role.requirements?.length ? role.requirements.map((req) => `${skillName(req.skillId)} ${req.minimumProficiency}+`).join(', ') : DASH}</td>
                      <td><Provenance source={role.metadataSource} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>}
          </>}

          {tab === 'learning' && <>
            <p className="tab-note">Verified means the resource is confirmed in the saved catalogue, with a provider or link on record. An AI suggestion can never mark itself verified.</p>
            {shownResources.length === 0 ? noMatch('resources') : <div className="table-wrap flush">
              <table>
                <thead><tr><th scope="col">Resource</th><th scope="col">Type</th><th scope="col">Provider</th><th scope="col">Verified</th><th scope="col">Builds skills</th><th scope="col">Source</th></tr></thead>
                <tbody>
                  {shownResources.map((resource) => (
                    <tr key={resource.id}>
                      <th scope="row">{resource.title}<QualityNotes issues={notesFor('resource', resource.id)} /></th>
                      <td>{capitalize(resource.category)}</td>
                      <td>{resource.provider ?? <span className="muted">Not recorded</span>}</td>
                      <td>{resource.verified ? <span className="tag tag-ok"><Icon name="check" size={14} /> Verified</span> : <span className="tag tag-outline">Not verified</span>}</td>
                      <td>{resource.skillIds?.map(skillName).join(', ') || DASH}</td>
                      <td><Provenance source={resource.provenance} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>}
          </>}

          {tab === 'future' && <>
            <p className="tab-note">
              Proposed needs are forecasts and don't change coverage targets until an admin approves them.
              {canConfigureFuture ? ' Approve or reject proposals here; every decision is audited.' : ''}
            </p>
            {reqError && <div className="pad-x"><FormError error={reqError} /></div>}
            {!futureRequirements && !reqError && <p className="empty-line" role="status">Loading future needs…</p>}
            {futureRequirements && futureRequirements.length === 0 && <p className="empty-line">No future needs recorded.</p>}
            {futureRequirements && futureRequirements.length > 0 && (shownFuture.length === 0 ? noMatch('future needs') : <div className="table-wrap flush">
              <table>
                <thead><tr><th scope="col">Skill</th><th scope="col" className="num">People needed</th><th scope="col" className="num">Target level</th><th scope="col" className="num">Starts in month</th><th scope="col">Status</th><th scope="col">Source</th>{canConfigureFuture && <th scope="col"><span className="sr-only">Actions</span></th>}</tr></thead>
                <tbody>
                  {shownFuture.map((req) => (
                    <tr key={req.id}>
                      <th scope="row">{req.skillName ?? skillName(req.skillId)}<QualityNotes issues={notesFor('future_requirement', req.id)} /></th>
                      <td className="num">{dash(req.requiredHolders)}</td>
                      <td className="num">{dash(req.targetProficiency)}</td>
                      <td className="num">{dash(req.effectiveMonth)}</td>
                      <td>{req.status === 'reviewed'
                        ? <span className="tag tag-ok">Approved · in plan</span>
                        : <span className="tag tag-outline"><Icon name="forecast" size={12} /> Proposed · not applied</span>}</td>
                      <td><Provenance source={req.provenance} /></td>
                      {canConfigureFuture && <td>
                        {req.status === 'proposed' && <span className="row-actions">
                          <button type="button" className="btn btn-quiet btn-sm" disabled={busy === req.id} onClick={() => setDialog({ kind: 'reject-requirement', requirement: req })}>Reject</button>
                          <button type="button" className="btn btn-secondary btn-sm" disabled={busy === req.id} onClick={() => approveRequirement(req)}>{busy === req.id ? 'Approving…' : 'Approve'}</button>
                        </span>}
                      </td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>)}
          </>}

          {tab === 'people' && <>
            <p className="tab-note">Mentoring time is recorded, never estimated. A dash means unknown, not zero. {withCapacity} of {employees.length} people have it on record.</p>
            {shownEmployees.length === 0 ? noMatch('people') : <div className="table-wrap flush">
              <table>
                <thead><tr><th scope="col">Person</th><th scope="col">Role</th><th scope="col">Department</th><th scope="col">Manager</th><th scope="col" className="num">Mentoring h/month</th></tr></thead>
                <tbody>
                  {shownEmployees.map((employee) => (
                    <tr key={employee.id}>
                      <th scope="row">{employee.name}<QualityNotes issues={notesFor('employee', employee.id)} /></th>
                      <td>{dash(employee.role)}</td>
                      <td>{dash(employee.department)}</td>
                      <td>{employee.managerId === null || employee.managerId === undefined ? DASH
                        : employees.some((e) => e.id === employee.managerId) ? employeeName(employee.managerId) : <span className="muted">Outside your view</span>}</td>
                      <td className="num">{employee.mentoringHoursPerMonth === undefined ? DASH : employee.mentoringHoursPerMonth}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>}
          </>}

          {tab === 'evidence' && <>
            <p className="tab-note">Unverified means the record has no verification date. If a person and skill have no row, there is no evidence on record either way: unknown, not absent.</p>
            {canProposeEvidence && (
              <div className="table-actions">
                <p className="muted small">{writesEvidence ? 'As an admin you can correct records directly; changes are audited.' : 'Changes you propose are reviewed before they affect scores.'}</p>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setDialog({ kind: 'evidence', initial: {} })}>
                  <Icon name="plus" size={16} /> {writesEvidence ? 'Add evidence' : 'Propose evidence'}
                </button>
              </div>
            )}
            {shownMatrix.length === 0 ? noMatch('evidence records') : <div className="table-wrap flush">
              <table>
                <thead><tr><th scope="col">Person</th><th scope="col">Skill</th><th scope="col" className="num">Level</th><th scope="col">Evidence source</th><th scope="col">Verification</th>{canProposeEvidence && <th scope="col"><span className="sr-only">Actions</span></th>}</tr></thead>
                <tbody>
                  {shownMatrix.map((edge) => {
                    const label = `${employeeName(edge.employeeId)} · ${skillName(edge.skillId)}`;
                    return (
                      <tr key={`${edge.employeeId}-${edge.skillId}`}>
                        <th scope="row">{employeeName(edge.employeeId)}<QualityNotes issues={notesFor('employee_skill', `${edge.employeeId}:${edge.skillId}`)} /></th>
                        <td>{skillName(edge.skillId)}</td>
                        <td className="num">{dash(edge.proficiency)}</td>
                        <td><Provenance source={edge.evidenceSource} /></td>
                        <td className="nowrap">{edge.lastVerifiedAt ? formatDate(edge.lastVerifiedAt) : <span className="tag tag-outline">Unverified</span>}</td>
                        {canProposeEvidence && <td>
                          <span className="row-actions">
                            <button type="button" className="btn btn-quiet btn-sm" aria-label={`Update ${label}`}
                              onClick={() => setDialog({ kind: 'evidence', initial: { employeeId: edge.employeeId, skillId: edge.skillId, proficiency: edge.proficiency,
                                evidenceSource: edge.evidenceSource ?? '', lastVerifiedAt: edge.lastVerifiedAt ?? '' } })}>Update</button>
                            <button type="button" className="btn btn-quiet btn-sm" aria-label={`Remove ${label}`}
                              onClick={() => setDialog({ kind: 'remove', edge, label })}>Remove</button>
                          </span>
                        </td>}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>}
          </>}
        </div>
      </section>

      <TrustLegend />

      {dialog?.kind === 'evidence' && (
        <EvidenceChangeDialog session={session} employees={employees} skills={skills} initial={dialog.initial}
          lockEmployee={dialog.initial.employeeId !== undefined} onClose={() => setDialog(null)}
          onDone={(mode) => finish(DONE_MESSAGES[mode])} />
      )}
      {dialog?.kind === 'remove' && (
        <RemoveEvidenceDialog edge={dialog.edge} label={dialog.label} direct={writesEvidence} onClose={() => setDialog(null)}
          onDone={(direct) => finish(direct ? `Removed ${dialog.label} and recorded it in the audit history.` : `Submitted the removal of ${dialog.label} for review.`)} />
      )}
      {dialog?.kind === 'reject-requirement' && (
        <RejectRequirementDialog requirement={dialog.requirement} onClose={() => setDialog(null)}
          onDone={async () => { const { requirement } = dialog; setDialog(null); setMessage(`Rejected the proposed ${requirement.skillName} requirement.`); await loadFuture(); await onChanged?.(); }} />
      )}
    </>
  );
}
