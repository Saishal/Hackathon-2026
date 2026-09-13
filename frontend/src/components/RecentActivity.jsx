import { useEffect, useState } from 'react';
import { keystoneApi } from '../api/keystone';
import Icon from './Icon';
import { actionLabel, formatDateTime, relativeTime } from './format';
import { Skeleton } from './ui';

// Dashboard panel: only high-signal audit events (approvals, verified evidence, coverage changes).
export default function RecentActivity() {
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;
    keystoneApi.auditLog({ highSignal: 'true', pageSize: 6 })
      .then((result) => { if (active) setItems(result.items); })
      .catch((err) => { if (active) setError(err); });
    return () => { active = false; };
  }, []);

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2>Recent activity</h2>
          <p>Approvals, verified evidence and coverage changes.</p>
        </div>
      </div>
      {error && <p className="muted" role="alert">Activity couldn't load. {error.message}</p>}
      {!items && !error && <Skeleton lines={4} />}
      {items && items.length === 0 && <p className="muted">No significant changes are recorded yet.</p>}
      {items && items.length > 0 && (
        <ol className="activity-list">
          {items.map((entry) => (
            <li key={entry.id}>
              <span className="activity-label">{actionLabel(entry.actionType)}</span>
              <p>{entry.summary}</p>
              <time className="muted" dateTime={entry.occurredAt} title={formatDateTime(entry.occurredAt)}>{relativeTime(entry.occurredAt)}</time>
            </li>
          ))}
        </ol>
      )}
      <a className="link-arrow" href="#/audit">Open audit history <Icon name="arrow" size={16} /></a>
    </section>
  );
}
