import { useEffect, useState } from 'react';
import { keystoneApi } from '../api/keystone';
import Icon from './Icon';
import HelpTopic from './HelpTopic';
import { relativeTime } from './format';
import { ErrorState, Skeleton } from './ui';

// Guided next steps. Every card says what it is based on and offers only safe actions - open a
// record, start a draft, open a queue. Nothing here changes data. Dismissals are per user; a
// dismissed suggestion comes back on its own if the underlying fact changes.

const SEVERITY_ICON = { critical: 'alert', warning: 'flag', info: 'info' };
const BASIS_TONE = { official: 'tag-outline', 'approved-plan': 'tag-ok', pending: 'tag-warn', unverified: 'tag-warn', scenario: 'tag-accent' };

export default function Suggestions({ refreshKey }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [showDismissed, setShowDismissed] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [busyKey, setBusyKey] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const reload = () => setAttempt((value) => value + 1);

  // Fetch whenever official data changes (refreshKey) or after a dismiss/restore (attempt).
  useEffect(() => {
    let live = true;
    keystoneApi.suggestions()
      .then((result) => { if (live) { setData(result); setError(null); } })
      .catch((failure) => { if (live) setError(failure); });
    return () => { live = false; };
  }, [refreshKey, attempt]);

  async function dismiss(key) {
    setBusyKey(key);
    try { await keystoneApi.dismissSuggestion(key); reload(); } finally { setBusyKey(null); }
  }
  async function restore(key) {
    setBusyKey(key);
    try { await keystoneApi.restoreSuggestion(key); reload(); } finally { setBusyKey(null); }
  }

  if (error && !data) return <ErrorState error={error} onRetry={reload} title="Could not load suggestions" />;

  const items = data?.items ?? [];
  const dismissed = data?.dismissed ?? [];
  const visible = expanded ? items : items.slice(0, 5);
  const critical = items.filter((item) => item.severity === 'critical').length;

  return (
    <section className="panel suggestions" aria-labelledby="suggestions-head">
      <div className="panel-head">
        <div>
          <h2 id="suggestions-head">Suggested next steps <HelpTopic id="suggestions" /></h2>
          <p>
            {!data ? 'Working out what would help most…'
              : items.length === 0 ? 'Nothing needs your attention right now.'
                : `${items.length} ${items.length === 1 ? 'suggestion' : 'suggestions'}${critical ? `, ${critical} critical` : ''}. Each is based on data you can already see; none changes anything by itself.`}
          </p>
        </div>
        {dismissed.length > 0 && (
          <button type="button" className="btn btn-quiet btn-sm" onClick={() => setShowDismissed((value) => !value)} aria-expanded={showDismissed}>
            {showDismissed ? 'Hide dismissed' : `Show dismissed (${dismissed.length})`}
          </button>
        )}
      </div>

      {!data && <div className="pad"><Skeleton lines={3} /></div>}

      {data && visible.length > 0 && (
        <ul className="suggestion-list">
          {visible.map((item) => (
            <li key={item.key} className={`suggestion suggestion-${item.severity}`}>
              <span className="suggestion-icon" aria-hidden="true"><Icon name={SEVERITY_ICON[item.severity] ?? 'info'} size={16} /></span>
              <div className="suggestion-body">
                <p className="suggestion-title">{item.title}</p>
                {item.detail && <p className="suggestion-detail">{item.detail}</p>}
                <div className="suggestion-foot">
                  <span className={`tag ${BASIS_TONE[item.basis] ?? 'tag-outline'}`} title="What this suggestion is based on">{item.basisLabel}</span>
                  {item.actions.map((action) => <a key={action.href + action.label} className="btn btn-secondary btn-sm" href={action.href}>{action.label}</a>)}
                  <button type="button" className="btn btn-quiet btn-sm suggestion-dismiss" disabled={busyKey === item.key} onClick={() => dismiss(item.key)}
                    aria-label={`Dismiss: ${item.title}`}>Dismiss</button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {data && items.length > 5 && (
        <div className="suggestion-more">
          <button type="button" className="btn-link" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded}>
            {expanded ? 'Show fewer' : `Show all ${items.length}`}
          </button>
        </div>
      )}

      {showDismissed && dismissed.length > 0 && (
        <div className="suggestion-dismissed" aria-label="Dismissed suggestions">
          <p className="muted small">Dismissed by you. A dismissed suggestion returns on its own if the underlying fact changes.</p>
          <ul className="suggestion-list">
            {dismissed.map((item) => (
              <li key={item.key} className="suggestion suggestion-muted">
                <span className="suggestion-icon" aria-hidden="true"><Icon name="close" size={14} /></span>
                <div className="suggestion-body">
                  <p className="suggestion-title">{item.title}</p>
                  <div className="suggestion-foot">
                    <span className="muted small">Dismissed {relativeTime(item.dismissedAt)}</span>
                    <button type="button" className="btn btn-quiet btn-sm" disabled={busyKey === item.key} onClick={() => restore(item.key)}>Bring back</button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
