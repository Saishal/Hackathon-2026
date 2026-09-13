import { useState } from 'react';
import { NOTIFICATION_CATEGORIES, useNotifications } from '../notifications/useNotifications';
import { useT } from '../preferences/context';
import Dialog from './Dialog';
import { formatDate, relativeTime } from './format';
import Icon from './Icon';
import { Skeleton } from './ui';

// Bell in the top bar and the notification drawer it opens. The badge counts unread items in categories the
// person has not muted. Opening an item marks it read; items can also be marked read or unread in place.

const SEVERITY_ICON = { critical: 'alert', warning: 'flag', info: 'info' };
const CATEGORY_ICON = { reviews: 'inbox', risks: 'alert', data: 'shield', updates: 'check' };

function titleFor(item, t) {
  if (item.kind === 'coverageEvent') return t(`notifications.kinds.${item.action}`, { defaultValue: item.detail });
  if (item.vars) return t(`notifications.kinds.${item.kind}`, { ...item.vars, date: formatDate(item.vars.date) });
  return item.title;
}

const whenFor = (value) => (value.length === 10 ? formatDate(value) : relativeTime(value));

export default function NotificationBell({ session }) {
  const t = useT();
  const hub = useNotifications(session);
  const [open, setOpen] = useState(false);
  const [onlyUnread, setOnlyUnread] = useState(false);
  const [category, setCategory] = useState('all');

  const counts = Object.fromEntries(NOTIFICATION_CATEGORIES.map((name) => [name, hub.items.filter((item) => item.category === name).length]));
  const shown = hub.items.filter((item) => (category === 'all' || item.category === category) && (!onlyUnread || !item.read));
  const unread = shown.filter((item) => !item.read);
  const earlier = shown.filter((item) => item.read);
  const buttonLabel = hub.unreadCount > 0 ? t('notifications.buttonUnread', { count: hub.unreadCount }) : t('notifications.button');

  function openHub() {
    setOpen(true);
    hub.refresh();
  }

  const renderItem = (item) => (
    <li key={item.id} className={`notif notif-${item.severity} ${item.read ? '' : 'is-unread'}`}>
      <span className="notif-icon" aria-hidden="true"><Icon name={SEVERITY_ICON[item.severity] ?? 'info'} size={16} /></span>
      <div className="notif-body">
        <p className="notif-title">
          {!item.read && <span className="sr-only">{t('notifications.unreadPrefix')} </span>}
          {titleFor(item, t)}
        </p>
        {item.detail && item.kind !== 'coverageEvent' && <p className="notif-detail">{item.detail}</p>}
        <div className="notif-meta">
          <span className="tag tag-outline"><Icon name={CATEGORY_ICON[item.category]} size={12} /> {t(`notifications.categories.${item.category}`)}</span>
          {item.at && <time dateTime={item.at}>{whenFor(item.at)}</time>}
          <span className="notif-actions">
            {item.read
              ? <button type="button" className="btn btn-quiet btn-sm" onClick={() => hub.markUnread(item.id)}>{t('notifications.markUnread')}</button>
              : <button type="button" className="btn btn-quiet btn-sm" onClick={() => hub.markRead(item.id)}>{t('notifications.markRead')}</button>}
            <a className="btn btn-secondary btn-sm" href={item.href} onClick={() => { hub.markRead(item.id); setOpen(false); }}>
              {t('notifications.open')} <Icon name="arrow" size={14} />
            </a>
          </span>
        </div>
      </div>
    </li>
  );

  return (
    <>
      <button type="button" className="topbar-button" aria-haspopup="dialog" aria-expanded={open} aria-label={buttonLabel} title={buttonLabel} onClick={openHub}>
        <Icon name="bell" size={18} />
        {hub.unreadCount > 0 && <span className="badge-dot" aria-hidden="true">{hub.unreadCount > 9 ? '9+' : hub.unreadCount}</span>}
      </button>

      {open && (
        <Dialog variant="drawer" title={t('notifications.title')} onClose={() => setOpen(false)}
          description={hub.loading ? t('notifications.loading') : t('notifications.summary', { count: hub.unreadCount })}
          footer={(
            <div className="notif-foot">
              <details className="notif-settings">
                <summary>{t('notifications.settings')}</summary>
                <ul>
                  {NOTIFICATION_CATEGORIES.map((name) => (
                    <li key={name}>
                      <label className="check">
                        <input type="checkbox" checked={!hub.muted.includes(name)} onChange={() => hub.toggleMuted(name)} />
                        {t(`notifications.categories.${name}`)}
                      </label>
                    </li>
                  ))}
                </ul>
              </details>
              <div className="notif-foot-row">
                <span className="muted small">
                  {hub.updatedAt ? t('notifications.updated', { when: relativeTime(hub.updatedAt) }) : ''}
                  {' · '}{t('notifications.privateNote')}
                </span>
                <button type="button" className="btn btn-quiet btn-sm" onClick={hub.refresh}><Icon name="refresh" size={14} /> {t('notifications.refresh')}</button>
              </div>
            </div>
          )}>
          <div className="notif-toolbar">
            <div className="notif-toolbar-row">
              <div className="segmented" role="radiogroup" aria-label={t('notifications.show')}>
                <button type="button" role="radio" aria-checked={!onlyUnread} onClick={() => setOnlyUnread(false)}>{t('notifications.all')}</button>
                <button type="button" role="radio" aria-checked={onlyUnread} onClick={() => setOnlyUnread(true)}>{t('notifications.unreadOnly')}</button>
              </div>
              <button type="button" className="btn btn-quiet btn-sm" disabled={unread.length === 0} onClick={() => hub.markRead(unread.map((item) => item.id))}>
                <Icon name="checkAll" size={16} /> {t('notifications.markAllRead')}
              </button>
            </div>
            <div className="notif-categories" role="group" aria-label={t('notifications.filterByCategory')}>
              <button type="button" className="filter-chip" aria-pressed={category === 'all'} onClick={() => setCategory('all')}>
                {t('notifications.categories.all')} <span className="chip-count">{hub.items.length}</span>
              </button>
              {NOTIFICATION_CATEGORIES.filter((name) => !hub.muted.includes(name)).map((name) => (
                <button key={name} type="button" className="filter-chip" aria-pressed={category === name} onClick={() => setCategory(name)}>
                  <Icon name={CATEGORY_ICON[name]} size={13} /> {t(`notifications.categories.${name}`)} <span className="chip-count">{counts[name]}</span>
                </button>
              ))}
            </div>
          </div>

          {hub.loading && <Skeleton lines={5} />}
          {!hub.loading && hub.failed && <p className="alert" role="alert">{t('notifications.failed')}</p>}
          {!hub.loading && shown.length === 0 && (
            <div className="empty">
              <Icon name="bell" size={24} />
              <p><strong>{t('notifications.emptyTitle')}</strong></p>
              <p className="muted">{onlyUnread || category !== 'all' ? t('notifications.emptyFiltered') : t('notifications.emptyBody')}</p>
            </div>
          )}
          {unread.length > 0 && <>
            <h3 className="notif-group-title">{t('notifications.new')}</h3>
            <ul className="notif-list">{unread.map(renderItem)}</ul>
          </>}
          {earlier.length > 0 && <>
            <h3 className="notif-group-title">{t('notifications.earlier')}</h3>
            <ul className="notif-list">{earlier.map(renderItem)}</ul>
          </>}
        </Dialog>
      )}
    </>
  );
}
