import { useCallback, useEffect, useState } from 'react';
import { keystoneApi } from '../api/keystone';
import { useSession } from '../session';
import Dialog from './Dialog';
import Diff from './Diff';
import Icon from './Icon';
import HelpTopic from './HelpTopic';
import FilterBar from './FilterBar';
import { useUrlFilters } from '../filters/useUrlFilters';

const REVIEW_FILTERS = { type: '', status: '' };
const REVIEW_LABELS = { type: 'Change type', status: 'Status' };
const TYPE_WORDS = { employee_skill: 'skill evidence', future_requirement: 'future requirement', resource: 'learning resource' };
import { CHANGE_TYPE_LABELS, ROLE_NAMES, can, fieldMessages, formatDateTime, plural, relativeTime } from './format';
import { EmptyState, ErrorState, FieldError, FormError, Skeleton, StatusTag } from './ui';

const OPERATION_LABELS = { upsert: 'Add or update', create: 'Add', update: 'Change', remove: 'Remove' };

// What the record would look like if approved, in the same shape as the stored baseline.
function proposedValues(request) {
  if (request.operation === 'remove') return null;
  if (request.type === 'employee_skill') {
    const { proficiency, evidenceSource, lastVerifiedAt } = request.payload;
    return { proficiency, evidenceSource, lastVerifiedAt };
  }
  if (request.type === 'future_requirement' && request.operation === 'update') return { ...request.baseline, ...request.payload.fields };
  return request.payload.fields;
}

function DecisionDialog({ request, kind, onClose, onDone }) {
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const errors = fieldMessages(error);
  const approving = kind === 'approve';

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = approving
        ? await keystoneApi.approveChangeRequest(request.id, comment.trim())
        : await keystoneApi.rejectChangeRequest(request.id, comment);
      onDone(result);
    } catch (failure) {
      setError(failure);
      setBusy(false);
    }
  }

  return (
    <Dialog
      title={approving ? 'Approve change' : 'Reject change'}
      description={`${CHANGE_TYPE_LABELS[request.type]} · ${request.targetLabel}`}
      onClose={onClose}
      footer={<>
        <button type="button" className="btn btn-quiet" onClick={onClose}>Cancel</button>
        <button type="submit" form="decision-form" className="btn btn-primary" disabled={busy || (!approving && !comment.trim())}>
          {busy ? 'Saving…' : approving ? 'Approve and apply' : 'Reject'}
        </button>
      </>}
    >
      <form id="decision-form" className="form-stack" onSubmit={submit}>
        <FormError error={error} />
        <p className="muted">
          {approving
            ? 'Approving writes this change to official data, updates every score that depends on it, and records both in the audit history.'
            : 'Rejecting leaves the official data exactly as it is. The person who proposed the change will see your reason.'}
        </p>
        <label className="field">{approving ? 'Comment (optional)' : 'Reason for rejecting'}
          <textarea rows={3} value={comment} maxLength={1000} onChange={(event) => setComment(event.target.value)} data-autofocus
            required={!approving} aria-invalid={Boolean(errors.comment)} aria-describedby="decision-comment-error" />
          <FieldError id="decision-comment-error" message={errors.comment} />
        </label>
      </form>
    </Dialog>
  );
}

const REVIEWERS = { employee_skill: 'HR or an admin', future_requirement: 'an admin', resource: 'an admin' };

function whyNotReviewable(request, session) {
  if (request.status !== 'submitted' || request.canReview) return null;
  const own = request.requestedBy.id === session.user.id;
  const permission = request.type === 'employee_skill' ? 'changes.review.people' : 'changes.review.planning';
  if (own && can(session, permission)) return `You submitted this change, so you cannot approve it yourself. Another reviewer (${REVIEWERS[request.type]}, not you) will find it under "Awaiting your review".`;
  if (own) return `Waiting for ${REVIEWERS[request.type]} to review it.`;
  return `Only ${REVIEWERS[request.type]} can approve this kind of change.`;
}

function RequestCard({ request, resolve, busy, onDecide, onAction, session }) {
  const pending = request.status === 'submitted';
  const blocked = whyNotReviewable(request, session);
  return (
    <article className="request-card">
      <header className="request-head">
        <div>
          <p className="muted small">{CHANGE_TYPE_LABELS[request.type]} · {OPERATION_LABELS[request.operation]}</p>
          <h3>{request.targetLabel}</h3>
        </div>
        <StatusTag kind="change" status={request.status} />
      </header>
      <p className="muted">
        Proposed by {request.requestedBy.name} ({ROLE_NAMES[request.requestedBy.role]})
        {request.submittedAt ? `, submitted ${relativeTime(request.submittedAt)}` : `, drafted ${relativeTime(request.createdAt)}`}
      </p>
      {request.justification && <blockquote className="quote">{request.justification}</blockquote>}
      {request.operation === 'remove' && <p className="alert alert-soft">This change removes the record from official data.</p>}
      <Diff before={request.baseline} after={proposedValues(request)} resolve={resolve} emptyText="There are no stored values to compare." />
      {pending && (
        <p className="muted small"><Icon name="info" size={14} /> Not applied yet. Scores keep using the current values until a reviewer approves it.</p>
      )}
      {blocked && <p className="alert alert-soft"><Icon name="lock" size={14} /> {blocked}</p>}
      {request.reviewedBy && (
        <div className="review-outcome">
          <p><strong>{request.status === 'approved' ? 'Approved' : 'Rejected'} by {request.reviewedBy.name}</strong> · {formatDateTime(request.reviewedAt)}</p>
          {request.reviewerComment && <blockquote className="quote">{request.reviewerComment}</blockquote>}
        </div>
      )}
      {(request.canReview || request.canSubmit || request.canCancel) && (
        <footer className="card-foot">
          {request.canCancel && (
            <button type="button" className="btn btn-quiet btn-sm" disabled={busy} onClick={() => onAction(request, 'cancel')}>Cancel change</button>
          )}
          <span className="spacer" />
          {request.canSubmit && (
            <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => onAction(request, 'submit')}>Submit for review</button>
          )}
          {request.canReview && <>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => onDecide(request, 'reject')}>Reject</button>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => onDecide(request, 'approve')}>Approve</button>
          </>}
        </footer>
      )}
    </article>
  );
}

// Review queue for proposed changes. Only approval moves a change into official data; each decision is
// attributed to the reviewer and audited. Nobody can review their own submission.
export default function ReviewQueue({ workforce, onChanged }) {
  const session = useSession();
  const reviewer = can(session, 'changes.review.people', 'changes.review.planning');
  const [tab, setTab] = useState(reviewer ? 'pending' : 'mine');
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);
  const [decision, setDecision] = useState(null);
  const [message, setMessage] = useState('');
  const [actionError, setActionError] = useState(null);
  const [busy, setBusy] = useState(null);
  const review = useUrlFilters(REVIEW_FILTERS);

  const load = useCallback(async () => {
    try {
      setItems((await keystoneApi.changeRequests()).items);
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
      setMessage(action === 'cancel' ? `The change for ${request.targetLabel} is cancelled.` : `The change for ${request.targetLabel} is submitted for review.`);
      await load();
    } catch (failure) {
      setActionError(failure);
    } finally {
      setBusy(null);
    }
  }

  if (error && !items) return <ErrorState error={error} onRetry={load} />;
  if (!items) return <div className="panel"><Skeleton lines={6} /></div>;

  const resolve = {
    employee: (id) => workforce?.employees.find((employee) => employee.id === id)?.name,
    skill: (id) => workforce?.skills.find((skill) => skill.id === id)?.name,
  };
  const pending = items.filter((item) => item.canReview);
  const mine = items.filter((item) => item.requestedBy.id === session.user.id);
  const tabs = [
    ...(reviewer ? [['pending', 'Awaiting your review', pending], ['all', 'All visible changes', items]] : []),
    ['mine', 'Your submissions', mine],
  ];
  const [, , inTab] = tabs.find(([id]) => id === tab) ?? tabs[0];
  const shown = inTab.filter((request) => (!review.filters.type || request.type === review.filters.type) && (!review.filters.status || request.status === review.filters.status));

  return (
    <>
      {message && <p className="status-line" role="status"><Icon name="check" size={16} /><span>{message}</span></p>}
      <FormError error={actionError} />

      <section className="panel panel-flush">
        <p className="tabs-intro muted small">Proposed changes affect official data only after approval <HelpTopic id="pending-vs-approved" /></p>
        <div className="tabs" role="tablist" aria-label="Change requests">
          {tabs.map(([id, label, list]) => (
            <button key={id} type="button" role="tab" className="tab" aria-selected={tab === id} onClick={() => setTab(id)}>
              {label}<span className="tab-count">{list.length}</span>
            </button>
          ))}
        </div>
        <FilterBar view="reviews" filters={review.filters} active={review.active} labels={REVIEW_LABELS}
          formatValue={(key, value) => (key === 'type' ? TYPE_WORDS[value] ?? value : value)}
          onRemove={(key) => review.setFilter(key)('')} onReset={review.reset} onApply={review.replace}
          total={inTab.length} shown={shown.length} noun="changes"
          emptyHint="Nothing in this tab matches. Try another tab or widen the filters.">
          <label className="field field-inline">Change type
            <select value={review.filters.type} onChange={review.setFilter('type')}>
              <option value="">Any</option><option value="employee_skill">Skill evidence</option><option value="future_requirement">Future requirement</option><option value="resource">Learning resource</option>
            </select>
          </label>
          <label className="field field-inline">Status
            <select value={review.filters.status} onChange={review.setFilter('status')}>
              <option value="">Any</option><option value="draft">Draft</option><option value="submitted">Submitted</option><option value="approved">Approved</option><option value="rejected">Rejected</option><option value="cancelled">Cancelled</option>
            </select>
          </label>
        </FilterBar>
        <div className="request-list" role="tabpanel">
          {shown.length === 0 ? (
            <EmptyState icon="inbox" title={tab === 'pending' ? 'Nothing is waiting for your review' : 'No changes to show'}>
              {tab === 'mine' ? 'Changes you propose from a profile or the data pages appear here with their status.' : 'New submissions appear here as soon as they are made.'}
            </EmptyState>
          ) : (
            <>
              <p className="muted small pad-x">{plural(shown.length, 'change')}, newest first.</p>
              {shown.map((request) => (
                <RequestCard key={request.id} request={request} resolve={resolve} busy={busy === request.id} session={session}
                  onDecide={(target, kind) => setDecision({ request: target, kind })} onAction={act} />
              ))}
            </>
          )}
        </div>
      </section>

      {decision && (
        <DecisionDialog
          request={decision.request}
          kind={decision.kind}
          onClose={() => setDecision(null)}
          onDone={async () => {
            const { request, kind } = decision;
            setDecision(null);
            setMessage(kind === 'approve'
              ? `Approved. ${request.targetLabel} is updated in the official data and scores are recalculated.`
              : `Rejected. The official data for ${request.targetLabel} is unchanged.`);
            await load();
            onChanged?.();
          }}
        />
      )}
    </>
  );
}
