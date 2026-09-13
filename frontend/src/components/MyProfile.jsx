import { useCallback, useEffect, useState } from 'react';
import { keystoneApi } from '../api/keystone';
import { useSession } from '../session';
import EvidenceChangeDialog from './EvidenceChangeDialog';
import { CHANGE_TYPE_LABELS, PROFICIENCY_LABELS, formatDate, formatDateTime, relativeTime } from './format';
import Icon from './Icon';
import { EmptyState, ErrorState, FormError, SeverityTag, Skeleton, StatusTag } from './ui';

const REQUIREMENT_STATUS = {
  met: ['Meets requirement', 'tag-ok'],
  unmet: ['Below requirement', 'tag-danger'],
  unknown: ['Unknown', 'tag-outline'],
};

const DONE_MESSAGES = {
  submit: 'Submitted for review. Your official record changes only if a reviewer approves it.',
  draft: 'Saved as a draft. Submit it from the list below when you are ready.',
  direct: 'Saved to official data and recorded in the audit history.',
};

// The signed-in person's own view: recorded evidence and how far to trust it, what their role asks of
// them, verified development suggestions, and the status of every change they proposed.
export default function MyProfile({ onChanged, section }) {
  const session = useSession();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [message, setMessage] = useState('');
  const [actionError, setActionError] = useState(null);
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    try {
      setData(await keystoneApi.profile());
      setError(null);
    } catch (failure) {
      setError(failure);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function act(request, action) {
    setBusy(request.id);
    setActionError(null);
    setMessage('');
    try {
      if (action === 'cancel') await keystoneApi.cancelChangeRequest(request.id);
      else await keystoneApi.submitChangeRequest(request.id);
      setMessage(action === 'cancel' ? 'Change cancelled.' : 'Draft submitted for review.');
      await load();
    } catch (failure) {
      setActionError(failure);
    } finally {
      setBusy(null);
    }
  }

  useEffect(() => {
    if (data && section === 'development') {
      const heading = document.getElementById('profile-development');
      heading?.scrollIntoView({ block: 'start' });
      heading?.focus({ preventScroll: true });
    }
  }, [data, section]);

  if (error && !data) return <ErrorState error={error} onRetry={load} />;
  if (!data) return <div className="panel"><Skeleton lines={8} /></div>;

  const { profile, changeRequests } = data;
  if (!profile) {
    return (
      <div className="panel">
        <EmptyState icon="user" title="Your account isn't linked to an employee record">
          An admin can link it in Users & settings. Until then there is no profile to show.
        </EmptyState>
      </div>
    );
  }

  const me = profile.employee;

  return (
    <>
      <section className="panel profile-head">
        <div>
          <h2>{me.name}</h2>
          <p className="muted">{me.role} · {me.department}</p>
          <dl className="detail-grid compact">
            <div><dt>Manager</dt><dd>{me.managerName ?? '—'}</dd></div>
            <div><dt>Mentoring time</dt><dd>{me.mentoringHoursPerMonth === null ? '—' : `${me.mentoringHoursPerMonth} h per month`}</dd></div>
            <div><dt>Signed in as</dt><dd>{session.user.email}</dd></div>
          </dl>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setDialog({})}>
          <Icon name="plus" size={16} /> Propose evidence
        </button>
      </section>

      {message && <p className="status-line" role="status"><Icon name="check" size={16} /><span>{message}</span></p>}
      <FormError error={actionError} />

      {profile.dataQualityIssues.length > 0 && (
        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>Notes about your records</h2>
              <p>Data-quality checks that concern your own records.</p>
            </div>
          </div>
          <ul className="notice-list">
            {profile.dataQualityIssues.map((issue) => (
              <li key={issue.fingerprint}>
                <SeverityTag severity={issue.severity} />
                <div>
                  <strong>{issue.title}</strong>
                  <p>{issue.explanation}</p>
                  <p className="muted small">{issue.suggestedAction}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="panel panel-flush">
        <div className="panel-head">
          <div>
            <h2>What your role asks for</h2>
            <p>{me.role} requirements compared with your recorded evidence. Unknown means nothing is recorded, not that you lack the skill.</p>
          </div>
        </div>
        {profile.roleRequirements.length === 0 ? (
          <p className="empty-line pad">No requirements are recorded for this role.</p>
        ) : (
          <div className="table-wrap flush">
            <table>
              <thead><tr><th scope="col">Skill</th><th scope="col" className="num">Needed</th><th scope="col" className="num">Recorded</th><th scope="col">Status</th></tr></thead>
              <tbody>
                {profile.roleRequirements.map((requirement) => {
                  const [label, tone] = REQUIREMENT_STATUS[requirement.status];
                  return (
                    <tr key={requirement.skillId}>
                      <th scope="row">{requirement.skillName}</th>
                      <td className="num">{requirement.minimumProficiency}+</td>
                      <td className="num">{requirement.recordedProficiency ?? '—'}</td>
                      <td><span className={`tag ${tone}`}>{label}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="panel panel-flush">
        <div className="panel-head">
          <div>
            <h2>Your recorded skills</h2>
            <p>The official evidence behind your part in every score. Changes you propose are reviewed first.</p>
          </div>
        </div>
        {profile.evidence.length === 0 ? (
          <EmptyState icon="data" title="No skills are recorded for you yet">Propose evidence for a skill you use in your work.</EmptyState>
        ) : (
          <div className="table-wrap flush">
            <table>
              <thead>
                <tr><th scope="col">Skill</th><th scope="col">Level</th><th scope="col">Evidence source</th><th scope="col">Verification</th><th scope="col"><span className="sr-only">Actions</span></th></tr>
              </thead>
              <tbody>
                {profile.evidence.map((edge) => (
                  <tr key={edge.skillId}>
                    <th scope="row">{edge.skillName}</th>
                    <td>{edge.proficiency}<small className="cell-sub">{PROFICIENCY_LABELS[edge.proficiency]}</small></td>
                    <td>{edge.evidenceSource ?? '—'}</td>
                    <td>
                      <StatusTag kind="trust" status={edge.trust} />
                      {edge.lastVerifiedAt && <small className="cell-sub">{formatDate(edge.lastVerifiedAt)}</small>}
                      {edge.pendingChangeRequestId && <small className="cell-sub"><span className="tag tag-warn">Change pending review</span></small>}
                    </td>
                    <td>
                      <button type="button" className="btn btn-quiet btn-sm" aria-label={`Propose an update to ${edge.skillName}`}
                        onClick={() => setDialog({ skillId: edge.skillId, proficiency: edge.proficiency, evidenceSource: edge.evidenceSource ?? '',
                          lastVerifiedAt: edge.lastVerifiedAt ?? '' })}>
                        Propose update
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="panel">
        <div className="panel-head">
          <div>
            <h2 id="profile-development" tabIndex={-1}>Development suggestions</h2>
            <p>Drawn only from the verified learning catalogue, for requirements you don't meet on record.</p>
          </div>
        </div>
        {profile.developmentSuggestions.length === 0 ? (
          <p className="muted">You meet every recorded requirement for your role.</p>
        ) : (
          <ul className="suggestion-list">
            {profile.developmentSuggestions.map((suggestion) => (
              <li key={suggestion.skillId}>
                <strong>{suggestion.skillName}</strong>
                <p className="muted">{suggestion.reason}</p>
                {suggestion.resources.length === 0 ? (
                  <p className="small muted">No verified resource covers this skill yet. Ask your manager about mentoring or project work.</p>
                ) : (
                  <ul className="resource-list">
                    {suggestion.resources.map((resource) => (
                      <li key={resource.id}>{resource.title}<span className="muted small"> · {resource.provider ?? 'Provider not recorded'}</span></li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>Your submissions</h2>
            <p>Every change you proposed, with its review outcome and the reviewer's feedback.</p>
          </div>
        </div>
        {changeRequests.length === 0 ? (
          <p className="muted">You haven't proposed any changes yet.</p>
        ) : (
          <ul className="submission-list">
            {changeRequests.map((request) => (
              <li key={request.id}>
                <div className="submission-head">
                  <div>
                    <strong>{request.targetLabel}</strong>
                    <span className="muted small"> · {CHANGE_TYPE_LABELS[request.type]}</span>
                  </div>
                  <StatusTag kind="change" status={request.status} />
                </div>
                <p className="muted small">
                  {request.submittedAt ? `Submitted ${relativeTime(request.submittedAt)}` : `Drafted ${relativeTime(request.createdAt)}`}
                  {request.requestedBy.id !== session.user.id ? ` by ${request.requestedBy.name}` : ''}
                </p>
                {request.reviewedBy && (
                  <div className="review-outcome">
                    <p className="small"><strong>{request.status === 'approved' ? 'Approved' : 'Rejected'} by {request.reviewedBy.name}</strong> · {formatDateTime(request.reviewedAt)}</p>
                    {request.reviewerComment && <blockquote className="quote">{request.reviewerComment}</blockquote>}
                  </div>
                )}
                {(request.canSubmit || request.canCancel) && (
                  <div className="form-row">
                    {request.canSubmit && <button type="button" className="btn btn-secondary btn-sm" disabled={busy === request.id} onClick={() => act(request, 'submit')}>Submit for review</button>}
                    {request.canCancel && <button type="button" className="btn btn-quiet btn-sm" disabled={busy === request.id} onClick={() => act(request, 'cancel')}>Cancel</button>}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {dialog && (
        <EvidenceChangeDialog
          session={session}
          employees={[{ id: me.id, name: me.name }]}
          skills={data.skills}
          initial={{ employeeId: me.id, ...dialog }}
          lockEmployee
          onClose={() => setDialog(null)}
          onDone={async (mode) => {
            setDialog(null);
            setMessage(DONE_MESSAGES[mode]);
            await load();
            onChanged?.();
          }}
        />
      )}
    </>
  );
}
