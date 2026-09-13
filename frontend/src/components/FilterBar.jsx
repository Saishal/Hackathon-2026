import { useEffect, useState } from 'react';
import { keystoneApi } from '../api/keystone';
import { useT } from '../preferences/context';
import Dialog from './Dialog';
import Icon from './Icon';
import { FieldError, FormError } from './ui';
import { fieldMessages } from './format';

// Shared filter chrome for every decision table: active filters as removable chips, a reset control,
// a result count, and saved views. It renders nothing about the data itself - each page passes its
// own controls as children - so charts, tables, totals and exports on that page keep reading the
// same filter object.
//
// labels: { key: 'Label' } for chips; formatValue(key, value) turns raw values into words.

function SaveViewDialog({ view, filters, onClose, onSaved }) {
  const t = useT();
  const [name, setName] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const errors = fieldMessages(error);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    try {
      onSaved(await keystoneApi.saveView({ view, name: name.trim(), filters }));
    } catch (failure) {
      setError(failure);
      setBusy(false);
    }
  }

  return (
    <Dialog title={t('filters.saveTitle')} description={t('filters.saveDescription')} onClose={onClose}
      footer={<>
        <button type="button" className="btn btn-quiet" onClick={onClose}>{t('common.cancel')}</button>
        <button type="submit" form="save-view-form" className="btn btn-primary" disabled={busy || !name.trim()}>{busy ? t('common.saving') : t('filters.saveSubmit')}</button>
      </>}>
      <form id="save-view-form" onSubmit={submit}>
        <FormError error={error && !error.details?.length ? error : null} />
        <label className="field">{t('filters.name')}
          <input type="text" value={name} onChange={(event) => setName(event.target.value)} maxLength={60} required data-autofocus
            placeholder={t('filters.namePlaceholder')} aria-invalid={Boolean(errors.name)} aria-describedby="save-view-error" />
          <FieldError id="save-view-error" message={errors.name} />
        </label>
        <p className="muted small">{t('filters.replaceNote')}</p>
      </form>
    </Dialog>
  );
}

export default function FilterBar({ view, filters, active, labels = {}, formatValue, onRemove, onReset, onApply, total, shown, noun, emptyHint, children }) {
  const t = useT();
  const [saved, setSaved] = useState([]);
  const [dialog, setDialog] = useState(false);
  const [message, setMessage] = useState('');
  const canSave = Boolean(view && onApply);
  const nounText = noun ?? t('filters.records');

  useEffect(() => {
    if (!canSave) return undefined;
    let live = true;
    keystoneApi.savedViews(view).then((result) => { if (live) setSaved(result.items); }).catch(() => {});
    return () => { live = false; };
  }, [view, canSave]);

  const display = (key, value) => (formatValue ? formatValue(key, value) : value);
  const savedFilters = (item) => Object.fromEntries(Object.entries(item.filters));
  const excluded = typeof total === 'number' && typeof shown === 'number' && total > 0 && shown === 0;

  async function removeSaved(item) {
    await keystoneApi.deleteSavedView(item.id);
    setSaved((current) => current.filter((entry) => entry.id !== item.id));
    setMessage(t('filters.removedView', { name: item.name }));
  }

  return (
    <div className="kfilter-bar" role="region" aria-label={t('filters.region')}>
      <div className="kfilter-controls">{children}</div>

      <div className="kfilter-status">
        {active.length > 0 ? (
          <ul className="kfilter-chips" aria-label={t('filters.active')}>
            {active.map((key) => (
              <li key={key}>
                <span className="chip">
                  <span className="chip-label">{labels[key] ?? key}:</span> {display(key, filters[key])}
                  <button type="button" className="chip-remove" onClick={() => onRemove(key)} aria-label={t('filters.remove', { name: labels[key] ?? key })}><Icon name="close" size={12} /></button>
                </span>
              </li>
            ))}
            <li><button type="button" className="btn-link" onClick={onReset}>{t('filters.reset')}</button></li>
          </ul>
        ) : <span className="muted small">{t('filters.none')}</span>}

        <span className="kfilter-count" aria-live="polite">
          {typeof shown === 'number' && typeof total === 'number' ? t('filters.showing', { shown, total, noun: nounText }) : ''}
        </span>

        {canSave && (
          <span className="kfilter-saved">
            {saved.length > 0 && (
              <label className="field field-inline"><span className="sr-only">{t('filters.savedViews')}</span>
                <select value="" onChange={(event) => { const item = saved.find((entry) => String(entry.id) === event.target.value); if (item) onApply(savedFilters(item)); }}>
                  <option value="">{t('filters.savedViewsPlaceholder')}</option>
                  {saved.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
              </label>
            )}
            <button type="button" className="btn btn-quiet btn-sm" onClick={() => setDialog(true)} disabled={active.length === 0}
              title={active.length === 0 ? t('filters.saveDisabledTitle') : t('filters.saveTitleHint')}>
              <Icon name="flag" size={14} /> {t('filters.saveView')}
            </button>
            {saved.length > 0 && (
              <details className="kfilter-manage">
                <summary className="btn-link">{t('filters.manage')}</summary>
                <ul>{saved.map((item) => (
                  <li key={item.id}>{item.name} <button type="button" className="btn-link" onClick={() => removeSaved(item)} aria-label={t('filters.deleteAria', { name: item.name })}>{t('filters.delete')}</button></li>
                ))}</ul>
              </details>
            )}
          </span>
        )}
      </div>

      {message && <p className="status-line" role="status"><Icon name="check" size={16} /><span>{message}</span></p>}

      {excluded && (
        <p className="kfilter-empty" role="status">
          <Icon name="info" size={16} /> {t('filters.excluded', { total, noun: nounText })} {emptyHint ?? t('filters.excludedHint')}{' '}
          <button type="button" className="btn-link" onClick={onReset}>{t('filters.reset')}</button>
        </p>
      )}

      {dialog && <SaveViewDialog view={view} filters={Object.fromEntries(active.map((key) => [key, String(filters[key])]))}
        onClose={() => setDialog(false)} onSaved={(item) => { setDialog(false); setSaved((current) => [...current.filter((entry) => entry.id !== item.id), item].sort((a, b) => a.name.localeCompare(b.name))); setMessage(t('filters.savedMessage', { name: item.name })); }} />}
    </div>
  );
}
