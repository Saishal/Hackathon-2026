import { useCallback, useEffect, useState } from 'react';
import { keystoneApi } from '../api/keystone';
import { useSession } from '../session';
import Dialog from './Dialog';
import Icon from './Icon';
import { fieldMessages, formatDate, relativeTime } from './format';
import { EmptyState, ErrorState, FieldError, FormError, Skeleton } from './ui';

function OrganizationSettings({ onSaved }) {
  const [saved, setSaved] = useState(null);
  const [form, setForm] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const errors = fieldMessages(error);

  const load = useCallback(async () => {
    try {
      const organization = await keystoneApi.organization();
      setSaved(organization);
      setForm({ name: organization.name, planStartDate: organization.planStartDate, evidenceStaleMonths: String(organization.evidenceStaleMonths) });
      setLoadError(null);
    } catch (failure) {
      setLoadError(failure);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loadError) return <ErrorState error={loadError} onRetry={load} title="Organization settings couldn't load" />;
  if (!form) return <div className="panel"><Skeleton lines={3} /></div>;

  const changes = Object.fromEntries(Object.entries({
    name: form.name,
    planStartDate: form.planStartDate,
    evidenceStaleMonths: Number(form.evidenceStaleMonths),
  }).filter(([key, value]) => value !== saved[key]));

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setMessage('');
    try {
      const updated = await keystoneApi.updateOrganization(changes);
      setSaved(updated);
      setMessage('Organization settings saved.');
      onSaved?.();
    } catch (failure) {
      setError(failure);
    } finally {
      setBusy(false);
    }
  }

  const set = (field) => (event) => setForm((current) => ({ ...current, [field]: event.target.value }));

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2>Organization</h2>
          <p>{saved.environment === 'demo' ? 'Demo tenant with fictional data.' : 'Production tenant.'} Last changed {saved.updatedAt ? relativeTime(saved.updatedAt) : 'never'}.</p>
        </div>
      </div>
      <form className="form-grid form-grid-3" onSubmit={submit}>
        <label className="field">Organization name
          <input type="text" value={form.name} maxLength={120} onChange={set('name')} aria-invalid={Boolean(errors.name)} aria-describedby="org-name-error" />
          <FieldError id="org-name-error" message={errors.name} />
        </label>
        <label className="field">Plan start date
          <input type="date" value={form.planStartDate} onChange={set('planStartDate')} aria-invalid={Boolean(errors.planStartDate)} aria-describedby="org-start-hint org-start-error" />
          <span id="org-start-hint" className="field-hint">Month 0 of every future requirement.</span>
          <FieldError id="org-start-error" message={errors.planStartDate} />
        </label>
        <label className="field">Re-verify evidence after (months)
          <input type="number" min="1" max="60" value={form.evidenceStaleMonths} onChange={set('evidenceStaleMonths')}
            aria-invalid={Boolean(errors.evidenceStaleMonths)} aria-describedby="org-stale-error" />
          <FieldError id="org-stale-error" message={errors.evidenceStaleMonths} />
        </label>
        <div className="span-all form-row">
          <button className="btn btn-primary" disabled={busy || Object.keys(changes).length === 0}>{busy ? 'Saving…' : 'Save settings'}</button>
          {message && <span className="status-inline" role="status"><Icon name="check" size={16} /> {message}</span>}
        </div>
        {error && !error.details?.length && <div className="span-all"><FormError error={error} /></div>}
      </form>
    </section>
  );
}

function UserDialog({ user, roles, employees, onClose, onDone }) {
  const creating = !user;
  const [form, setForm] = useState({
    email: user?.email ?? '',
    displayName: user?.displayName ?? '',
    role: user?.role ?? 'employee',
    employeeId: user?.employeeId ?? '',
    password: '',
    disabled: user?.disabled ?? false,
  });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const errors = fieldMessages(error);
  const set = (field) => (event) => setForm((current) => ({
    ...current, [field]: event.target.type === 'checkbox' ? event.target.checked : event.target.value,
  }));

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const employeeId = form.employeeId === '' ? null : Number(form.employeeId);
    try {
      if (creating) {
        onDone(await keystoneApi.createUser({ email: form.email, displayName: form.displayName, role: form.role, employeeId, password: form.password }),
          `${form.displayName} can now sign in as ${roles.find((role) => role.value === form.role)?.label}.`);
      } else {
        const changes = Object.fromEntries(Object.entries({ displayName: form.displayName, role: form.role, employeeId, disabled: form.disabled })
          .filter(([key, value]) => value !== user[key]));
        onDone(await keystoneApi.updateUser(user.id, changes), `${form.displayName}'s account is updated.`);
      }
    } catch (failure) {
      setError(failure);
      setBusy(false);
    }
  }

  return (
    <Dialog
      title={creating ? 'Create account' : `Edit ${user.displayName}`}
      description={creating ? 'The person signs in with this email and the temporary password you set.' : user.email}
      onClose={onClose}
      footer={<>
        <button type="button" className="btn btn-quiet" onClick={onClose}>Cancel</button>
        <button type="submit" form="user-form" className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : creating ? 'Create account' : 'Save changes'}</button>
      </>}
    >
      <form id="user-form" className="form-grid form-grid-2" onSubmit={submit}>
        <div className="span-all"><FormError error={error && !error.details?.length ? error : null} /></div>
        {creating && (
          <label className="field span-all">Email
            <input type="email" value={form.email} onChange={set('email')} maxLength={254} required data-autofocus
              aria-invalid={Boolean(errors.email)} aria-describedby="user-email-error" />
            <FieldError id="user-email-error" message={errors.email} />
          </label>
        )}
        <label className="field">Display name
          <input type="text" value={form.displayName} onChange={set('displayName')} maxLength={120} required data-autofocus={!creating || undefined}
            aria-invalid={Boolean(errors.displayName)} aria-describedby="user-name-error" />
          <FieldError id="user-name-error" message={errors.displayName} />
        </label>
        <label className="field">Role
          <select value={form.role} onChange={set('role')} aria-invalid={Boolean(errors.role)} aria-describedby="user-role-error">
            {roles.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}
          </select>
          <FieldError id="user-role-error" message={errors.role} />
        </label>
        <label className="field span-all">Linked employee
          <select value={form.employeeId} onChange={set('employeeId')} aria-invalid={Boolean(errors.employeeId)} aria-describedby="user-employee-hint user-employee-error">
            <option value="">Not linked</option>
            {employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name} · {employee.role}</option>)}
          </select>
          <span id="user-employee-hint" className="field-hint">Managers and employees must be linked; it decides their team and profile.</span>
          <FieldError id="user-employee-error" message={errors.employeeId} />
        </label>
        {creating ? (
          <label className="field span-all">Temporary password
            <input type="password" value={form.password} onChange={set('password')} minLength={12} maxLength={128} required autoComplete="new-password"
              aria-invalid={Boolean(errors.password)} aria-describedby="user-password-hint user-password-error" />
            <span id="user-password-hint" className="field-hint">At least 12 characters. Share it privately.</span>
            <FieldError id="user-password-error" message={errors.password} />
          </label>
        ) : (
          <label className="check span-all">
            <input type="checkbox" checked={form.disabled} onChange={set('disabled')} />
            Disable this account (signs the person out everywhere)
          </label>
        )}
      </form>
    </Dialog>
  );
}

function PasswordDialog({ user, onClose, onDone }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const errors = fieldMessages(error);
  const mismatch = confirm !== '' && confirm !== password;

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await keystoneApi.resetPassword(user.id, password);
      onDone(null, `${user.displayName}'s password is reset, and they are signed out of every session.`);
    } catch (failure) {
      setError(failure);
      setBusy(false);
    }
  }

  return (
    <Dialog
      title={`Reset password for ${user.displayName}`}
      description="The person is signed out everywhere and must use the new password."
      onClose={onClose}
      footer={<>
        <button type="button" className="btn btn-quiet" onClick={onClose}>Cancel</button>
        <button type="submit" form="password-form" className="btn btn-primary" disabled={busy || password.length < 12 || mismatch}>{busy ? 'Resetting…' : 'Reset password'}</button>
      </>}
    >
      <form id="password-form" className="form-stack" onSubmit={submit}>
        <FormError error={error && !error.details?.length ? error : null} />
        <label className="field">New password
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={12} maxLength={128}
            autoComplete="new-password" required data-autofocus aria-invalid={Boolean(errors.password)} aria-describedby="reset-password-error" />
          <FieldError id="reset-password-error" message={errors.password} />
        </label>
        <label className="field">Confirm password
          <input type="password" value={confirm} onChange={(event) => setConfirm(event.target.value)} autoComplete="new-password" required
            aria-invalid={mismatch} aria-describedby="reset-confirm-error" />
          <FieldError id="reset-confirm-error" message={mismatch ? 'The passwords do not match.' : null} />
        </label>
      </form>
    </Dialog>
  );
}

// Account and organization administration. Role changes and disabling take effect immediately because
// the server ends the person's sessions; every change here is audited.
export default function UsersAdmin({ workforce, onOrganizationChanged }) {
  const session = useSession();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    try {
      setData(await keystoneApi.users());
      setError(null);
    } catch (failure) {
      setError(failure);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const employees = [...(workforce?.employees ?? [])].sort((a, b) => a.name.localeCompare(b.name));
  const done = async (_result, text) => {
    setDialog(null);
    setMessage(text);
    await load();
  };

  return (
    <>
      <OrganizationSettings onSaved={onOrganizationChanged} />

      {message && <p className="status-line" role="status"><Icon name="check" size={16} /><span>{message}</span></p>}

      {error && !data ? <ErrorState error={error} onRetry={load} /> : (
        <section className="panel panel-flush">
          <div className="panel-head">
            <div>
              <h2>Accounts</h2>
              <p>Who can sign in, with which role, and which employee record they are linked to.</p>
            </div>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setDialog({ kind: 'user', user: null })} disabled={!data}>
              <Icon name="plus" size={16} /> Create account
            </button>
          </div>
          {!data && <div className="pad"><Skeleton lines={5} /></div>}
          {data && data.items.length === 0 && <EmptyState icon="user" title="No accounts yet" />}
          {data && data.items.length > 0 && (
            <div className="table-wrap flush">
              <table>
                <thead>
                  <tr><th scope="col">Person</th><th scope="col">Role</th><th scope="col">Linked employee</th><th scope="col">Status</th><th scope="col">Last sign-in</th><th scope="col"><span className="sr-only">Actions</span></th></tr>
                </thead>
                <tbody>
                  {data.items.map((user) => (
                    <tr key={user.id}>
                      <th scope="row">{user.displayName}<small className="cell-sub">{user.email}</small></th>
                      <td>{data.roles.find((role) => role.value === user.role)?.label ?? user.role}</td>
                      <td>{user.employeeName ?? <span className="muted">Not linked</span>}</td>
                      <td><span className={`tag ${user.disabled ? 'tag-outline' : 'tag-ok'}`}>{user.disabled ? 'Disabled' : 'Active'}</span></td>
                      <td>{user.lastLoginAt ? <>{relativeTime(user.lastLoginAt)}<small className="cell-sub">{formatDate(user.lastLoginAt)}</small></> : <span className="muted">Never</span>}</td>
                      <td>
                        <div className="row-actions">
                          <button type="button" className="btn btn-quiet btn-sm" onClick={() => setDialog({ kind: 'user', user })} aria-label={`Edit ${user.displayName}`}>Edit</button>
                          <button type="button" className="btn btn-quiet btn-sm" onClick={() => setDialog({ kind: 'password', user })} aria-label={`Reset password for ${user.displayName}`}>Reset password</button>
                          {user.id === session.user.id && <span className="muted small">You</span>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {dialog?.kind === 'user' && data && (
        <UserDialog user={dialog.user} roles={data.roles} employees={employees} onClose={() => setDialog(null)} onDone={done} />
      )}
      {dialog?.kind === 'password' && <PasswordDialog user={dialog.user} onClose={() => setDialog(null)} onDone={done} />}
    </>
  );
}
