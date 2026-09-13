import { useId } from 'react';
import Icon from './Icon';

// A section that opens from its header button. The body stays mounted while closed, so data it has
// loaded and the counts it reports survive opening and closing.
export default function Disclosure({ id, icon, title, summary, count, tone, open, onToggle, actions, children }) {
  const bodyId = useId();
  return (
    <section className={`disclosure ${open ? 'is-open' : ''}`} id={id}>
      <div className="disclosure-head">
        <button type="button" className="disclosure-toggle" aria-expanded={open} aria-controls={bodyId} onClick={onToggle}>
          <span className={`disclosure-icon ${tone ? `tone-${tone}` : ''}`} aria-hidden="true"><Icon name={icon} size={18} /></span>
          <span className="disclosure-title">
            <strong>{title}</strong>
            {summary && <small>{summary}</small>}
          </span>
          {count !== undefined && count !== null && <span className={`count-badge ${tone ? `tone-${tone}` : ''}`}>{count}</span>}
          <Icon name="chevron" size={18} className="disclosure-chevron" />
        </button>
        {open && actions && <div className="disclosure-actions">{actions}</div>}
      </div>
      <div id={bodyId} className="disclosure-body" hidden={!open}>{children}</div>
    </section>
  );
}
