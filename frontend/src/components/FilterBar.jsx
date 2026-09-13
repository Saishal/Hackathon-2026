import { useEffect, useState } from 'react';
import { keystoneApi } from '../api/keystone';
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
    <Dialog title="Save this view" description="Saved views are private to you and only remember these filters." onClose={onClose}
      footer={<>
        <button type="button" className="btn btn-quiet" onClick={onClose}>Cancel</button>
        <button type="submit" form="save-view-form" className="btn btn-primary" disabled={busy || !name.trim()}>{busy ? 'Saving…' : 'Save view'}</button>
      </>}>
      <form id="save-view-form" onSubmit={submit}>
        <FormError error={error && !error.details?.length ? error : null} />
        <label className="field">Name
          <input type="text" value={name} onChange={(event) => setName(event.target.value)} maxLength={60} required data-autofocus
            placeholder="For example: Unowned critical skills" aria-invalid={Boolean(errors.name)} aria-describedby="save-view-error" />
          <FieldError id="save-view-error" message={errors.name} />
        </label>
        <p className="muted small">Saving with a name you already used replaces that view.</p>
      </form>
    </Dialog>
  );
}

export default function FilterBar({ view, filters, active, labels = {}, formatValue, onRemove, onReset, onApply, total, shown, noun = 'records', emptyHint, children }) {
  const [saved, setSaved] = useState([]);
  const [dialog, setDialog] = useState(false);
  const [message, setMessage] = useState('');
  const canSave = Boolean(view && onApply);

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
    setMessage(`Removed the saved view "${item.name}".`);
  }

  return (
    <div className="kfilter-bar" role="region" aria-label="Filters">
      <div className="kfilter-controls">{children}</div>

      <div className="kfilter-status">
        {active.length > 0 ? (
          <ul className="kfilter-chips" aria-label="Active filters">
            {active.map((key) => (
              <li key={key}>
                <span className="chip">
                  <span className="chip-label">{labels[key] ?? key}:</span> {display(key, filters[key])}
                  <button type="button" className="chip-remove" onClick={() => onRemove(key)} aria-label={`Remove filter ${labels[key] ?? key}`}><Icon name="close" size={12} /></button>
                </span>
              </li>
            ))}
            <li><button type="button" className="btn-link" onClick={onReset}>Reset filters</button></li>
          </ul>
        ) : <span className="muted small">No filters applied.</span>}

        <span className="kfilter-count" aria-live="polite">
          {typeof shown === 'number' && typeof total === 'number' ? `Showing ${shown} of ${total} ${noun}` : ''}
        </span>

        {canSave && (
          <span className="kfilter-saved">
            {saved.length > 0 && (
              <label className="field field-inline"><span className="sr-only">Saved views</span>
                <select value="" onChange={(event) => { const item = saved.find((entry) => String(entry.id) === event.target.value); if (item) onApply(savedFilters(item)); }}>
                  <option value="">Saved views…</option>
                  {saved.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
              </label>
            )}
            <button type="button" className="btn btn-quiet btn-sm" onClick={() => setDialog(true)} disabled={active.length === 0} title={active.length === 0 ? 'Apply a filter first' : 'Save these filters as a named view'}>
              <Icon name="flag" size={14} /> Save view
            </button>
            {saved.length > 0 && (
              <details className="kfilter-manage">
                <summary className="btn-link">Manage</summary>
                <ul>{saved.map((item) => (
                  <li key={item.id}>{item.name} <button type="button" className="btn-link" onClick={() => removeSaved(item)} aria-label={`Delete saved view ${item.name}`}>delete</button></li>
                ))}</ul>
              </details>
            )}
          </span>
        )}
      </div>

      {message && <p className="status-line" role="status"><Icon name="check" size={16} /><span>{message}</span></p>}

      {excluded && (
        <p className="kfilter-empty" role="status">
          <Icon name="info" size={16} /> {total} {noun} exist, but the current filters exclude all of them. {emptyHint ?? 'An empty list means the filters excluded everything, not that nothing needs attention.'}{' '}
          <button type="button" className="btn-link" onClick={onReset}>Reset filters</button>
        </p>
      )}

      {dialog && <SaveViewDialog view={view} filters={Object.fromEntries(active.map((key) => [key, String(filters[key])]))}
        onClose={() => setDialog(false)} onSaved={(item) => { setDialog(false); setSaved((current) => [...current.filter((entry) => entry.id !== item.id), item].sort((a, b) => a.name.localeCompare(b.name))); setMessage(`Saved "${item.name}".`); }} />}
    </div>
  );
}
