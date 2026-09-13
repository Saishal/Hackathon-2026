import { useT } from '../preferences/context';
import Icon, { KeystoneMark } from './Icon';
import { CHANGE_STATUS, ISSUE_STATUS, SEVERITY_LABELS, TRUST_LABELS } from './format';

// Small shared components: score meter, coverage pips, loading skeleton, status tags and page states.
// Every tag pairs its colour with text (and severity with an icon), so nothing relies on colour alone.

const scoreTone = (score) => (score >= 70 ? 'danger' : score >= 40 ? 'warn' : 'neutral');

export function ScoreMeter({ score }) {
  const t = useT();
  const width = Math.max(0, Math.min(100, score));
  return (
    <span className="score" title={t('ui.scoreTitle', { score })}>
      <span className={`meter meter-${scoreTone(score)}`} aria-hidden="true"><span style={{ width: `${width}%` }} /></span>
      <span className="num">{score}</span>
      <span className="sr-only"> {t('ui.of100')}</span>
    </span>
  );
}

// Filled pips are qualified people on record, empty pips the rest of what the skill needs.
export function Coverage({ holders, needed }) {
  const t = useT();
  const slots = Math.max(needed ?? 0, holders);
  return (
    <span className="coverage">
      {slots > 0 && slots <= 8 && (
        <span className="pips" aria-hidden="true">
          {Array.from({ length: slots }, (_, index) => <span key={index} className={index < holders ? 'pip on' : 'pip'} />)}
        </span>
      )}
      <span className={holders === 0 ? 'text-danger' : undefined}>{t('ui.coverage', { holders, needed: needed ?? '—' })}</span>
    </span>
  );
}

export function Skeleton({ lines = 3 }) {
  const t = useT();
  return (
    <div className="skeleton" role="status" aria-label={t('ui.loading')}>
      {Array.from({ length: lines }, (_, index) => <span key={index} style={{ width: `${92 - (index % 3) * 14}%` }} />)}
    </div>
  );
}

const SEVERITY_ICON = { critical: 'alert', warning: 'alert', info: 'info' };

export function SeverityTag({ severity }) {
  return <span className={`tag severity-${severity}`}><Icon name={SEVERITY_ICON[severity]} size={13} /> {SEVERITY_LABELS[severity]}</span>;
}

const STATUS_SETS = { change: CHANGE_STATUS, issue: ISSUE_STATUS, trust: TRUST_LABELS };

export function StatusTag({ kind, status }) {
  const [label, tone] = STATUS_SETS[kind]?.[status] ?? [status, 'tag-outline'];
  return <span className={`tag ${tone}`}>{label}</span>;
}

export function EmptyState({ icon = 'info', title, children, action }) {
  return (
    <div className="empty">
      <Icon name={icon} size={24} />
      <p><strong>{title}</strong></p>
      {children && <p className="muted">{children}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ error, onRetry, title }) {
  const t = useT();
  const forbidden = error?.status === 403;
  const heading = title ?? (forbidden ? t('ui.forbiddenTitle') : error?.status === 0 ? t('ui.unreachableTitle') : t('ui.loadFailedTitle'));
  return (
    <div className="panel">
      <div className="empty" role="alert">
        <Icon name={forbidden ? 'lock' : 'alert'} size={24} />
        <p><strong>{heading}</strong></p>
        <p className="muted">{forbidden ? t('ui.forbiddenBody') : error?.message}</p>
        {onRetry && !forbidden && <button type="button" className="btn btn-secondary btn-sm" onClick={onRetry}>{t('ui.retry')}</button>}
      </div>
    </div>
  );
}

// Shows the server's message; lists each field problem when there is more than one.
export function FormError({ error }) {
  if (!error) return null;
  const details = error.details ?? [];
  return (
    <div className="alert" role="alert">
      <p>{error.message}</p>
      {details.length > 1 && <ul>{details.map((detail) => <li key={`${detail.field}:${detail.code}`}>{detail.message}</li>)}</ul>}
    </div>
  );
}

export function FieldError({ id, message }) {
  return message ? <span id={id} className="field-error">{message}</span> : null;
}

// Shown when an address names a page the signed-in role cannot use.
export function ForbiddenState({ roleLabel, homeHref }) {
  const t = useT();
  return (
    <div className="panel">
      <div className="empty" role="alert">
        <Icon name="lock" size={24} />
        <p><strong>{t('ui.pageForbiddenTitle')}</strong></p>
        <p className="muted">{t('ui.pageForbiddenBody', { role: roleLabel })}</p>
        {homeHref && <a className="link-arrow" href={homeHref}>{t('ui.goHome')} <Icon name="arrow" size={16} /></a>}
      </div>
    </div>
  );
}

export function LoadingScreen({ message }) {
  const t = useT();
  return (
    <div className="login-page" role="status" aria-live="polite">
      <div className="loading-screen">
        <KeystoneMark size={40} />
        <p className="muted">{message ?? t('ui.checkingSession')}</p>
      </div>
    </div>
  );
}
