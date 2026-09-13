import { useEffect, useState } from 'react';
import { keystoneApi } from '../api/keystone';
import { useT } from '../preferences/context';
import Icon from './Icon';
import { actionLabel, formatDateTime, relativeTime } from './format';
import { Skeleton } from './ui';

// Dashboard panel: only high-signal audit events (approvals, verified evidence, coverage changes).
// `embedded` drops the panel frame when a surrounding section already provides the heading.
export default function RecentActivity({ embedded = false }) {
  const t = useT();
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;
    keystoneApi.auditLog({ highSignal: 'true', pageSize: 6 })
      .then((result) => { if (active) setItems(result.items); })
      .catch((err) => { if (active) setError(err); });
    return () => { active = false; };
  }, []);

  const body = (
    <>
      {error && <p className="muted" role="alert">{t('activity.loadError')} {error.message}</p>}
      {!items && !error && <Skeleton lines={4} />}
      {items && items.length === 0 && <p className="muted">{t('activity.empty')}</p>}
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
      <a className="link-arrow" href="#/audit">{t('activity.open')} <Icon name="arrow" size={16} /></a>
    </>
  );

  if (embedded) return <div>{body}</div>;

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2>{t('activity.title')}</h2>
          <p>{t('activity.summary')}</p>
        </div>
      </div>
      {body}
    </section>
  );
}
