import { useEffect, useState } from 'react';
import { keystoneApi } from '../api/keystone';
import Dialog from './Dialog';
import { addDays, fieldMessages, localToday } from './format';
import { FieldError, FormError } from './ui';

// Records who owns a known risk and when it will be looked at again. It never changes the risk's score.
export default function RiskAcknowledgeDialog({ risk, existing, onClose, onSaved }) {
  const [owners, setOwners] = useState(null);
  const [form, setForm] = useState({
    ownerUserId: existing?.owner.id ?? '',
    note: existing?.note ?? '',
    dueDate: existing?.dueDate ?? addDays(localToday(), 45),
    nextReviewDate: existing?.nextReviewDate ?? addDays(localToday(), 14),
  });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState('');
  const errors = fieldMessages(error);

  useEffect(() => {
    let active = true;
    keystoneApi.assignableOwners()
      .then((result) => { if (active) setOwners(result.items); })
      .catch((failure) => { if (active) setError(failure); });
    return () => { active = false; };
  }, []);

  const update = (field) => (event) => setForm((current) => ({ ...current, [field]: event.target.value }));

  async function submit(event) {
    event.preventDefault();
    setBusy('save');
    setError(null);
    const fields = { ownerUserId: Number(form.ownerUserId), note: form.note, dueDate: form.dueDate, nextReviewDate: form.nextReviewDate };
    try {
      const saved = existing
        ? await keystoneApi.updateAcknowledgement(existing.id, fields)
        : await keystoneApi.acknowledgeRisk({ riskType: risk.type, entityId: risk.id, ...fields });
      onSaved(saved, existing ? 'Risk ownership updated.' : `${risk.name} now has an owner. Its score is unchanged.`);
    } catch (failure) {
      setError(failure);
      setBusy('');
    }
  }

  async function closeAcknowledgement() {
    setBusy('close');
    setError(null);
    try {
      const closed = await keystoneApi.closeAcknowledgement(existing.id);
      onSaved(closed, `The acknowledgement for ${risk.name} is closed, so the risk is back in the list without an owner.`);
    } catch (failure) {
      setError(failure);
      setBusy('');
    }
  }

  return (
    <Dialog
      title={existing ? 'Update risk ownership' : 'Assign a risk owner'}
      description={`${risk.name}. The dependency score stays exactly as calculated.`}
      onClose={onClose}
      footer={<>
        {existing && (
          <button type="button" className="btn btn-quiet" onClick={closeAcknowledgement} disabled={busy !== ''}>
            {busy === 'close' ? 'Closing…' : 'Close acknowledgement'}
          </button>
        )}
        <span className="spacer" />
        <button type="button" className="btn btn-quiet" onClick={onClose}>Cancel</button>
        <button type="submit" form="risk-owner-form" className="btn btn-primary" disabled={busy !== '' || !form.ownerUserId || !form.note.trim()}>
          {busy === 'save' ? 'Saving…' : existing ? 'Save changes' : 'Assign owner'}
        </button>
      </>}
    >
      <form id="risk-owner-form" className="form-stack" onSubmit={submit}>
        <FormError error={error} />
        <label className="field">Owner
          <select value={form.ownerUserId} onChange={update('ownerUserId')} required disabled={!owners} data-autofocus
            aria-invalid={Boolean(errors.ownerUserId)} aria-describedby="risk-owner-error">
            <option value="">{owners ? 'Choose an owner' : 'Loading owners…'}</option>
            {owners?.map((owner) => <option key={owner.id} value={owner.id}>{owner.displayName}</option>)}
          </select>
          <FieldError id="risk-owner-error" message={errors.ownerUserId} />
        </label>
        <label className="field">What is being done
          <textarea value={form.note} onChange={update('note')} required maxLength={1000} rows={3}
            placeholder="For example: mentoring a second person through the next quarter"
            aria-invalid={Boolean(errors.note)} aria-describedby="risk-note-error" />
          <FieldError id="risk-note-error" message={errors.note} />
        </label>
        <div className="form-grid form-grid-2">
          <label className="field">Due date
            <input type="date" value={form.dueDate} min={localToday()} onChange={update('dueDate')} required
              aria-invalid={Boolean(errors.dueDate)} aria-describedby="risk-due-error" />
            <FieldError id="risk-due-error" message={errors.dueDate} />
          </label>
          <label className="field">Next review
            <input type="date" value={form.nextReviewDate} min={localToday()} max={form.dueDate || undefined} onChange={update('nextReviewDate')} required
              aria-invalid={Boolean(errors.nextReviewDate)} aria-describedby="risk-review-error" />
            <FieldError id="risk-review-error" message={errors.nextReviewDate} />
          </label>
        </div>
      </form>
    </Dialog>
  );
}
