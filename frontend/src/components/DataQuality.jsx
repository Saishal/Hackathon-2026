import { useCallback, useEffect, useState } from 'react';
import { keystoneApi } from '../api/keystone';
import Dialog from './Dialog';
import Icon from './Icon';
import HelpTopic from './HelpTopic';
import FilterBar from './FilterBar';
import { PagedList } from './Pagination';
import { useUrlFilters } from '../filters/useUrlFilters';
import TrustLegend from './TrustLegend';
import { can, fieldMessages, formatDateTime, hrefForLink, plural } from './format';
import { EmptyState, ErrorState, FieldError, FormError, SeverityTag, Skeleton, StatusTag } from './ui';

const QUALITY_FILTERS = { status: 'active', severity: '', ruleCode: '', q: '' };
const QUALITY_LABELS = { status: 'Status', severity: 'Severity', ruleCode: 'Rule', q: 'Search' };
const STATUS_WORDS = { active: 'open and acknowledged', open: 'open', acknowledged: 'acknowledged', resolved: 'resolved recently', '': 'all' };

const HEALTH = { good: ['Good', 'tag-ok'], needs_attention: ['Needs attention', 'tag-warn'], at_risk: ['At risk', 'tag-danger'] };

// Acknowledging needs a note explaining why the issue is known but not fixed; the issue stays counted.
function AcknowledgeDialog({ issue, onClose, onDone }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onDone(await keystoneApi.acknowledgeIssue(issue.fingerprint, note));
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  }

  return (
    <Dialog title="Acknowledge issue" description={`${issue.title} · ${issue.entityLabel}`} onClose={onClose}
      footer={<>
        <button type="button" className="btn btn-quiet" onClick={onClose}>Cancel</button>
        <button type="submit" form="acknowledge-form" className="btn btn-primary" disabled={busy || !note.trim()}>{busy ? 'Saving…' : 'Acknowledge'}</button>
      </>}>
      <form id="acknowledge-form" onSubmit={submit}>
        <FormError error={error} />
        <p className="muted">Acknowledging keeps the issue visible and counted. It records that someone knows about it and why it is not fixed yet.</p>
        <label className="field">Note
          <textarea rows={3} value={note} maxLength={1000} onChange={(event) => setNote(event.target.value)} data-autofocus
            aria-invalid={Boolean(fieldMessages(error).note)} aria-describedby="acknowledge-note-error" />
          <FieldError id="acknowledge-note-error" message={fieldMessages(error).note} />
        </label>
      </form>
    </Dialog>
  );
}

// Data quality page: deterministic rule findings (missing sources, stale or unverified evidence, ...)
// with URL-backed filters, acknowledgement, reopening and a scoped CSV export for permitted roles.
export default function DataQuality({ session, canOpen, onChanged }) {
  const quality = useUrlFilters(QUALITY_FILTERS);
  const filters = { status: quality.filters.status, severity: quality.filters.severity, ruleCode: quality.filters.ruleCode };
  const search = quality.filters.q;
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [acknowledging, setAcknowledging] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [busy, setBusy] = useState('');
  const manage = can(session, 'dataQuality.manage');

  const load = useCallback(() => {
    setError(null);
    return keystoneApi.dataQuality(filters).then(setData).catch(setError);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- filters is rebuilt each render; its three fields are the real inputs
  }, [filters.status, filters.severity, filters.ruleCode]);

  useEffect(() => { load(); }, [load]);

  async function reopen(issue) {
    setBusy(issue.fingerprint);
    setActionError(null);
    try {
      await keystoneApi.reopenIssue(issue.fingerprint);
      await load();
      onChanged?.();
    } catch (err) {
      setActionError(err);
    } finally {
      setBusy('');
    }
  }

  async function exportCsv() {
    setBusy('export');
    setActionError(null);
    try {
      await keystoneApi.exportDataQuality(filters);
    } catch (err) {
      setActionError(err);
    } finally {
      setBusy('');
    }
  }

  if (error && !data) return <ErrorState error={error} onRetry={load} />;
  if (!data) return <div className="panel"><Skeleton lines={8} /></div>;

  const { summary } = data;
  const [healthLabel, healthTone] = HEALTH[summary.health];
  const needle = search.trim().toLowerCase();
  const visible = data.issues.filter((issue) => !needle || `${issue.title} ${issue.entityLabel} ${issue.explanation}`.toLowerCase().includes(needle));
  const setFilter = quality.setFilter;

  return <>
    <section className="panel quality-summary" aria-label="Data health summary">
      <div className="quality-score">
        <p className="stat-label">Data health <HelpTopic id="data-quality-health" /></p>
        <p className="stat-value">{summary.score}<span className="stat-unit">/100</span></p>
        <span className={`tag ${healthTone}`}>{healthLabel}</span>
      </div>
      <dl className="quality-counts">
        {['critical', 'warning', 'info'].map((severity) => (
          <div key={severity}><dt><SeverityTag severity={severity} /></dt><dd>{summary.counts[severity]}</dd></div>
        ))}
        <div><dt>Acknowledged</dt><dd>{summary.acknowledged}</dd></div>
        <div><dt>Records checked</dt><dd>{summary.evaluatedRecords}</dd></div>
      </dl>
      <p className="muted quality-method">
        Checked {formatDateTime(data.evaluatedAt)}. {data.visibility === 'team' ? 'Showing issues about your team only. ' : ''}
        The score weighs open issues against the records checked. The counts are always shown alongside it.
      </p>
    </section>

    <section className="panel panel-flush">
      <div className="panel-head">
        <div>
          <h2>{plural(visible.length, 'issue')}</h2>
          <p>Each issue says what is wrong, why it matters and what to do next.</p>
        </div>
        {can(session, 'export.dataQuality') && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={exportCsv} disabled={busy === 'export'}>
            <Icon name="download" size={16} /> {busy === 'export' ? 'Exporting…' : 'Export CSV'}
          </button>
        )}
      </div>
      {actionError && <div className="pad-x"><FormError error={actionError} /></div>}

      <div className="filter-bar">
        <label className="field">Status
          <select value={filters.status} onChange={setFilter('status')}>
            <option value="active">Open and acknowledged</option>
            <option value="open">Open</option>
            <option value="acknowledged">Acknowledged</option>
            <option value="resolved">Resolved in the last 30 days</option>
            <option value="">All</option>
          </select>
        </label>
        <label className="field">Severity
          <select value={filters.severity} onChange={setFilter('severity')}>
            <option value="">All severities</option>
            <option value="critical">Critical</option>
            <option value="warning">Warning</option>
            <option value="info">Info</option>
          </select>
        </label>
        <label className="field">Rule
          <select value={filters.ruleCode} onChange={setFilter('ruleCode')}>
            <option value="">All rules</option>
            {data.rules.map((rule) => <option key={rule} value={rule}>{rule}</option>)}
          </select>
        </label>
        <label className="field grow">Search
          <input type="search" value={search} onChange={quality.setFilter('q')} placeholder="Person, skill or issue" />
        </label>
      </div>
      <FilterBar view="quality" filters={quality.filters} active={quality.active} labels={QUALITY_LABELS}
        formatValue={(key, value) => (key === 'status' ? STATUS_WORDS[value] ?? value : value)}
        onRemove={(key) => quality.setFilter(key)(key === 'status' ? 'active' : '')} onReset={quality.reset} onApply={quality.replace}
        total={data.issues.length} shown={visible.length} noun="issues"
        emptyHint="The export uses these same filters, so it would be empty too." />

      {visible.length === 0 ? (
        <EmptyState icon="check" title="No issues match these filters">Try another status or severity.</EmptyState>
      ) : (
        <PagedList items={visible} resetKey={JSON.stringify(quality.filters)} noun="issues" anchorId="issue-list">{(pageItems) => (
        <ul className="issue-list" id="issue-list">
          {pageItems.map((issue) => {
            const href = hrefForLink(issue.link);
            return (
              <li key={issue.fingerprint} className="issue">
                <div className="issue-main">
                  <div className="issue-tags">
                    <SeverityTag severity={issue.severity} />
                    <StatusTag kind="issue" status={issue.status} />
                    <code className="rule-code">{issue.ruleCode}</code>
                  </div>
                  <h3>{issue.title}</h3>
                  <p className="issue-entity">{issue.entityLabel}</p>
                  <p>{issue.explanation}</p>
                  <p className="issue-action"><strong>Suggested action:</strong> {issue.suggestedAction}</p>
                  {issue.status === 'acknowledged' && (
                    <p className="muted">Acknowledged by {issue.acknowledgedBy?.name ?? 'a reviewer'} on {formatDateTime(issue.acknowledgedAt)}: “{issue.acknowledgementNote}”</p>
                  )}
                  {issue.status === 'resolved' && <p className="muted">Resolved on {formatDateTime(issue.resolvedAt)}, when the underlying data changed.</p>}
                </div>
                <div className="issue-actions">
                  {href && canOpen(issue.link.view) && <a className="btn btn-secondary btn-sm" href={href}>Open record <Icon name="arrow" size={14} /></a>}
                  {manage && issue.status === 'open' && (
                    <button type="button" className="btn btn-quiet btn-sm" onClick={() => setAcknowledging(issue)}>Acknowledge</button>
                  )}
                  {manage && issue.status === 'acknowledged' && (
                    <button type="button" className="btn btn-quiet btn-sm" onClick={() => reopen(issue)} disabled={busy === issue.fingerprint}>
                      {busy === issue.fingerprint ? 'Reopening…' : 'Reopen'}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
        )}</PagedList>
      )}
    </section>

    <TrustLegend />

    {acknowledging && (
      <AcknowledgeDialog issue={acknowledging} onClose={() => setAcknowledging(null)}
        onDone={async () => { setAcknowledging(null); await load(); onChanged?.(); }} />
    )}
  </>;
}
