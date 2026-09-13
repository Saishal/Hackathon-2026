import { useState } from 'react';
import { keystoneApi } from '../api/keystone';
import Dialog from './Dialog';
import { can, fieldMessages, localToday } from './format';
import { FieldError, FormError } from './ui';

// Propose a skill-evidence change for review. Admins may also write directly to official data; that
// path is audited the same way. Nothing is reported as saved until the server confirms it.
export default function EvidenceChangeDialog({ session, employees, skills, initial = {}, lockEmployee = false, onClose, onDone }) {
  const [form, setForm] = useState({
    employeeId: initial.employeeId ?? (employees.length === 1 ? employees[0].id : ''),
    skillId: initial.skillId ?? '',
    proficiency: initial.proficiency ?? 3,
    evidenceSource: initial.evidenceSource ?? '',
    lastVerifiedAt: initial.lastVerifiedAt ?? '',
    justification: '',
  });
  const [pending, setPending] = useState('');
  const [error, setError] = useState(null);
  const errors = fieldMessages(error);
  const direct = can(session, 'evidence.write');
  const ready = form.employeeId !== '' && form.skillId !== '' && form.evidenceSource.trim() !== '';
  const set = (field) => (event) => setForm((current) => ({ ...current, [field]: event.target.value }));

  const evidence = () => ({
    employeeId: Number(form.employeeId),
    skillId: Number(form.skillId),
    proficiency: Number(form.proficiency),
    evidenceSource: form.evidenceSource,
    lastVerifiedAt: form.lastVerifiedAt || null,
  });

  async function send(mode) {
    setPending(mode);
    setError(null);
    try {
      const result = mode === 'direct'
        ? await keystoneApi.saveEmployeeSkill(evidence())
        : await keystoneApi.createChangeRequest({
          type: 'employee_skill',
          payload: { operation: 'upsert', ...evidence() },
          justification: form.justification.trim() || undefined,
          submit: mode === 'submit',
        });
      onDone(mode, result);
    } catch (err) {
      setError(err);
    } finally {
      setPending('');
    }
  }

  return (
    <Dialog
      title="Update skill evidence"
      description="Changes are reviewed before they affect scores. The current record stays official until then."
      onClose={onClose}
      footer={<>
        <button type="button" className="btn btn-quiet" onClick={onClose}>Cancel</button>
        {direct && <button type="button" className="btn btn-secondary" disabled={!ready || pending !== ''} onClick={() => send('direct')}>
          {pending === 'direct' ? 'Saving…' : 'Save to official data'}
        </button>}
        <button type="button" className="btn btn-secondary" disabled={!ready || pending !== ''} onClick={() => send('draft')}>
          {pending === 'draft' ? 'Saving…' : 'Save draft'}
        </button>
        <button type="button" className="btn btn-primary" disabled={!ready || pending !== ''} onClick={() => send('submit')}>
          {pending === 'submit' ? 'Submitting…' : 'Submit for review'}
        </button>
      </>}
    >
      <FormError error={error} />
      <div className="form-grid form-grid-2">
        <label className="field">Employee
          <select value={form.employeeId} onChange={set('employeeId')} disabled={lockEmployee} data-autofocus={!lockEmployee || undefined}
            aria-invalid={Boolean(errors.employeeId)} aria-describedby="evidence-employee-error">
            <option value="">Select a person</option>
            {employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}
          </select>
          <FieldError id="evidence-employee-error" message={errors.employeeId} />
        </label>
        <label className="field">Skill
          <select value={form.skillId} onChange={set('skillId')} data-autofocus={lockEmployee || undefined}
            aria-invalid={Boolean(errors.skillId)} aria-describedby="evidence-skill-error">
            <option value="">Select a skill</option>
            {skills.map((skill) => <option key={skill.id} value={skill.id}>{skill.name}</option>)}
          </select>
          <FieldError id="evidence-skill-error" message={errors.skillId} />
        </label>
        <label className="field">Level
          <select value={form.proficiency} onChange={set('proficiency')} aria-invalid={Boolean(errors.proficiency)} aria-describedby="evidence-level-error">
            {[1, 2, 3, 4, 5].map((level) => <option key={level} value={level}>Level {level}</option>)}
          </select>
          <FieldError id="evidence-level-error" message={errors.proficiency} />
        </label>
        <label className="field">Verified on
          <input type="date" value={form.lastVerifiedAt} max={localToday()} onChange={set('lastVerifiedAt')}
            aria-invalid={Boolean(errors.lastVerifiedAt)} aria-describedby="evidence-date-hint evidence-date-error" />
          <span id="evidence-date-hint" className="field-hint">Required for levels 4 and 5. Leave empty if nobody has verified it.</span>
          <FieldError id="evidence-date-error" message={errors.lastVerifiedAt} />
        </label>
        <label className="field span-all">Evidence source
          <input type="text" value={form.evidenceSource} maxLength={200} onChange={set('evidenceSource')} placeholder="For example: Project delivery review"
            aria-invalid={Boolean(errors.evidenceSource)} aria-describedby="evidence-source-error" />
          <FieldError id="evidence-source-error" message={errors.evidenceSource} />
        </label>
        <label className="field span-all">Why this change (optional)
          <textarea rows={2} value={form.justification} maxLength={1000} onChange={set('justification')} />
        </label>
      </div>
    </Dialog>
  );
}
