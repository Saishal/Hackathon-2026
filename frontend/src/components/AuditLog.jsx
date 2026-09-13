import { useEffect, useState } from 'react';
import { keystoneApi } from '../api/keystone';
import Dialog from './Dialog';
import Diff from './Diff';
import {
  ROLE_NAMES, SOURCE_NAMES, actionLabel, entityLabel, fieldMessages, formatDateTime, humanizeKey, plural, relativeTime,
} from './format';
import { EmptyState, ErrorState, FieldError, Skeleton } from './ui';

const EMPTY_FILTERS = { q: '', actorUserId: '', actionType: '', entityType: '', from: '', to: '', highSignal: false };

function contextValue(value) {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

// Activity & audit history: search and filter the append-only log, then open an entry to see exactly
// who changed what, with a field-by-field before and after.
export default function AuditLog({ workforce, params }) {
  // A link such as #/audit?entityType=user&q=someone@example.com opens the log already filtered.
  const initial = { ...EMPTY_FILTERS, entityType: params?.entityType ?? '', q: params?.q ?? '', actionType: params?.actionType ?? '' };
  const [draft, setDraft] = useState(initial);
  const [filters, setFilters] = useState(initial);
  const [page, setPage] = useState(1);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    keystoneApi.auditLog({ ...filters, highSignal: filters.highSignal ? 'true' : undefined, page, pageSize: 25 })
      .then((data) => { if (active) { setResult(data); setError(null); } })
      .catch((failure) => { if (active) setError(failure); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [filters, page, attempt]);

  const errors = fieldMessages(error);
  const facets = result?.facets ?? { actors: [], actionTypes: [], entityTypes: [] };
  const set = (field) => (event) => setDraft((current) => ({ ...current, [field]: event.target.value }));
  const resolve = {
    employee: (id) => workforce?.employees.find((employee) => employee.id === id)?.name,
    skill: (id) => workforce?.skills.find((skill) => skill.id === id)?.name,
  };

  function apply(event) {
    event.preventDefault();
    setFilters(draft);
    setPage(1);
  }

  function clear() {
    setDraft(EMPTY_FILTERS);
    setFilters(EMPTY_FILTERS);
    setPage(1);
  }

  if (error && !result && !error.details?.length) return <ErrorState error={error} onRetry={() => setAttempt((value) => value + 1)} />;

  return (
    <>
      <form className="panel filter-panel" onSubmit={apply} aria-label="Filter audit history">
        <div className="filter-bar">
          <label className="field grow">Search
            <input type="search" value={draft.q} onChange={set('q')} maxLength={200} placeholder="Name, record or description" />
          </label>
          <label className="field">Person
            <select value={draft.actorUserId} onChange={set('actorUserId')}>
              <option value="">Anyone</option>
              {facets.actors.map((actor) => <option key={actor.userId} value={actor.userId}>{actor.name}</option>)}
            </select>
          </label>
          <label className="field">Action
            <select value={draft.actionType} onChange={set('actionType')}>
              <option value="">All actions</option>
              {facets.actionTypes.map((type) => <option key={type} value={type}>{actionLabel(type)}</option>)}
            </select>
          </label>
          <label className="field">Record type
            <select value={draft.entityType} onChange={set('entityType')}>
              <option value="">All records</option>
              {facets.entityTypes.map((type) => <option key={type} value={type}>{entityLabel(type)}</option>)}
            </select>
          </label>
          <label className="field">From
            <input type="date" value={draft.from} max={draft.to || undefined} onChange={set('from')}
              aria-invalid={Boolean(errors.from)} aria-describedby="audit-from-error" />
            <FieldError id="audit-from-error" message={errors.from} />
          </label>
          <label className="field">To
            <input type="date" value={draft.to} min={draft.from || undefined} onChange={set('to')}
              aria-invalid={Boolean(errors.to)} aria-describedby="audit-to-error" />
            <FieldError id="audit-to-error" message={errors.to} />
          </label>
        </div>
        <div className="filter-actions">
          <label className="check">
            <input type="checkbox" checked={draft.highSignal} onChange={(event) => setDraft((current) => ({ ...current, highSignal: event.target.checked }))} />
            Significant events only
          </label>
          <span className="spacer" />
          <button type="button" className="btn btn-quiet btn-sm" onClick={clear}>Clear</button>
          <button className="btn btn-primary btn-sm">Apply filters</button>
        </div>
      </form>

      <section className="panel panel-flush" aria-busy={loading}>
        <div className="panel-head">
          <div>
            <h2>{result ? plural(result.total, 'event') : 'Events'}</h2>
            <p>Newest first. Entries are append-only: nobody can edit or delete them, including admins.</p>
          </div>
        </div>
        {!result && <div className="pad"><Skeleton lines={8} /></div>}
        {result && result.items.length === 0 && (
          <EmptyState icon="audit" title="No events match these filters">Try a wider date range, or clear the filters.</EmptyState>
        )}
        {result && result.items.length > 0 && (
          <div className="table-wrap flush">
            <table className="audit-table">
              <thead>
                <tr>
                  <th scope="col">When</th>
                  <th scope="col">Who</th>
                  <th scope="col">What happened</th>
                  <th scope="col">Record</th>
                  <th scope="col"><span className="sr-only">Details</span></th>
                </tr>
              </thead>
              <tbody>
                {result.items.map((entry) => (
                  <tr key={entry.id}>
                    <td className="nowrap">
                      <time dateTime={entry.occurredAt}>{formatDateTime(entry.occurredAt)}</time>
                      <small className="cell-sub">{relativeTime(entry.occurredAt)}</small>
                    </td>
                    <td>
                      {entry.actor.name}
                      <small className="cell-sub">{entry.actor.role ? ROLE_NAMES[entry.actor.role] : SOURCE_NAMES[entry.source]}</small>
                    </td>
                    <td>
                      <strong className="audit-action">{actionLabel(entry.actionType)}</strong>
                      <span className="audit-summary">{entry.summary}</span>
                    </td>
                    <td>
                      {entry.entityLabel ?? '—'}
                      <small className="cell-sub">{entityLabel(entry.entityType)}</small>
                    </td>
                    <td>
                      <button type="button" className="btn btn-quiet btn-sm" onClick={() => setSelected(entry)}
                        aria-label={`Details of ${actionLabel(entry.actionType)} on ${formatDateTime(entry.occurredAt)}`}>
                        Details
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {result && result.totalPages > 1 && (
          <nav className="pagination" aria-label="Audit history pages">
            <button type="button" className="btn btn-secondary btn-sm" disabled={page <= 1 || loading} onClick={() => setPage((value) => value - 1)}>Previous</button>
            <span className="muted">Page {result.page} of {result.totalPages}</span>
            <button type="button" className="btn btn-secondary btn-sm" disabled={page >= result.totalPages || loading} onClick={() => setPage((value) => value + 1)}>Next</button>
          </nav>
        )}
      </section>

      {selected && (
        <Dialog variant="drawer" title={actionLabel(selected.actionType)} description={selected.summary} onClose={() => setSelected(null)}>
          <dl className="detail-grid">
            <div><dt>When</dt><dd>{formatDateTime(selected.occurredAt)}</dd></div>
            <div><dt>By</dt><dd>{selected.actor.name}{selected.actor.role ? ` · ${ROLE_NAMES[selected.actor.role]}` : ''}</dd></div>
            <div><dt>Source</dt><dd>{SOURCE_NAMES[selected.source]}</dd></div>
            <div><dt>Record</dt><dd>{selected.entityLabel ?? '—'} · {entityLabel(selected.entityType)}</dd></div>
            <div><dt>Event code</dt><dd><code>{selected.actionType}</code></dd></div>
            {selected.requestId && <div><dt>Request reference</dt><dd><code>{selected.requestId}</code></dd></div>}
          </dl>
          <h3>Changes</h3>
          <Diff before={selected.before} after={selected.after} resolve={resolve}
            emptyText="This event records an action, not a change to field values." />
          {selected.metadata && Object.keys(selected.metadata).length > 0 && (
            <>
              <h3>Context</h3>
              <dl className="detail-grid">
                {Object.entries(selected.metadata).map(([key, value]) => (
                  <div key={key}><dt>{humanizeKey(key)}</dt><dd>{contextValue(value)}</dd></div>
                ))}
              </dl>
            </>
          )}
        </Dialog>
      )}
    </>
  );
}
