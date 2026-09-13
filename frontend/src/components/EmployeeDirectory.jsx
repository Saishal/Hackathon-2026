import { useCallback, useEffect, useMemo, useState } from 'react';
import { keystoneApi } from '../api/keystone';
import Dialog from './Dialog';
import Diff from './Diff';
import Icon from './Icon';
import HelpTopic, { HelpLink } from './HelpTopic';
import { fieldMessages, formatDate, relativeTime } from './format';
import { EmptyState, ErrorState, FieldError, FormError, Skeleton } from './ui';
import { useUrlFilters } from '../filters/useUrlFilters';

// Administrative directory: add, edit, archive and restore employee records. Every write goes through
// the server's validation and audit; this screen's job is to make the consequences visible first.

const EMPTY_FILTERS = { q: '', department: '', role: '', status: 'active', sort: 'name' };
const EMPTY_FORM = { name: '', role: '', department: '', managerId: '', reportsExternally: false, mentoringHoursPerMonth: '', startDate: '' };

const toForm = (employee) => (employee ? {
  name: employee.name,
  role: employee.role,
  department: employee.department,
  managerId: employee.managerId ?? '',
  reportsExternally: employee.reportsExternally,
  mentoringHoursPerMonth: employee.mentoringHoursPerMonth ?? '',
  startDate: employee.startDate ?? '',
} : EMPTY_FORM);

// Form values as the API expects them: empty selects become null, numbers become numbers.
const toPayload = (form) => ({
  name: form.name.trim(),
  role: form.role.trim(),
  department: form.department.trim(),
  managerId: form.managerId === '' ? null : Number(form.managerId),
  reportsExternally: Boolean(form.reportsExternally),
  mentoringHoursPerMonth: form.mentoringHoursPerMonth === '' ? null : Number(form.mentoringHoursPerMonth),
  startDate: form.startDate === '' ? null : form.startDate,
});

const profileHref = (employee) => `#/data?tab=people&q=${encodeURIComponent(employee.name)}`;
const historyHref = (employee) => `#/audit?entityType=employee&q=${encodeURIComponent(employee.name)}`;

// Which edited fields change what the rest of Keystone computes. Shown before saving so an admin
// knows a "small" edit is about to move scores, succession or who can see whom.
function editWarnings(before, after) {
  const out = [];
  if (before.role !== after.role) out.push('Changing the role changes which skill requirements apply to this person, so succession readiness for their old and new role will change.');
  if (before.managerId !== after.managerId) out.push('Changing the manager moves this person into a different team. Their old manager stops seeing them; their new manager starts to.');
  if (before.mentoringHoursPerMonth !== after.mentoringHoursPerMonth) out.push('Changing mentoring hours changes how many Time Machine engagements this person can mentor at once.');
  if (before.name !== after.name) out.push('Renaming keeps the same record and history; audit entries will show the old name where it was used.');
  return out;
}

function EmployeeDialog({ employee, active, roles, onClose, onDone }) {
  const creating = !employee;
  const [form, setForm] = useState(() => toForm(employee));
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const errors = fieldMessages(error);
  const set = (field) => (event) => {
    setConfirmed(false);
    setForm((current) => ({ ...current, [field]: event.target.type === 'checkbox' ? event.target.checked : event.target.value }));
  };

  const payload = toPayload(form);
  const before = employee ? toPayload(toForm(employee)) : null;
  const changes = before ? Object.fromEntries(Object.entries(payload).filter(([key, value]) => value !== before[key])) : payload;
  const changedKeys = Object.keys(changes);
  const warnings = before ? editWarnings(before, payload) : [];
  const needsConfirmation = warnings.length > 0;
  const managers = active.filter((candidate) => !employee || candidate.id !== employee.id);
  const resolve = { managerId: (id) => (id === null ? 'None recorded' : active.find((candidate) => candidate.id === id)?.name ?? `Employee ${id}`) };

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (creating) {
        const created = await keystoneApi.createEmployee(payload);
        onDone(created, { text: `${created.name} was added.`, href: profileHref(created), label: 'Open their profile' });
      } else {
        const updated = await keystoneApi.updateEmployee(employee.id, changes);
        onDone(updated, { text: `${updated.name}'s record is updated.`, href: historyHref(updated), label: 'See the change in history' });
      }
    } catch (failure) {
      setError(failure);
      setBusy(false);
    }
  }

  return (
    <Dialog
      title={creating ? 'Add an employee' : `Edit ${employee.name}`}
      description={creating ? 'The record starts with no skill evidence; add evidence from their profile afterwards.' : 'Changes take effect immediately and are recorded in the audit history.'}
      onClose={onClose}
      footer={<>
        <button type="button" className="btn btn-quiet" onClick={onClose}>Cancel</button>
        <button type="submit" form="employee-form" className="btn btn-primary"
          disabled={busy || (!creating && changedKeys.length === 0) || (needsConfirmation && !confirmed)}>
          {busy ? 'Saving…' : creating ? 'Add employee' : needsConfirmation ? 'Confirm and save' : 'Save changes'}
        </button>
      </>}
    >
      <form id="employee-form" className="form-sections" onSubmit={submit}>
        <FormError error={error && !error.details?.length ? error : null} />

        <fieldset className="form-section">
          <legend>Identity</legend>
          <div className="form-grid form-grid-2">
            <label className="field span-all">Full name
              <input type="text" value={form.name} onChange={set('name')} maxLength={120} required data-autofocus
                aria-invalid={Boolean(errors.name)} aria-describedby="emp-name-error" />
              <FieldError id="emp-name-error" message={errors.name} />
            </label>
            <label className="field">Job role
              <select value={form.role} onChange={set('role')} required aria-invalid={Boolean(errors.role)} aria-describedby="emp-role-hint emp-role-error">
                <option value="">Choose a role</option>
                {roles.map((role) => <option key={role} value={role}>{role}</option>)}
              </select>
              <span id="emp-role-hint" className="field-hint">Roles carry the skill requirements used for succession.</span>
              <FieldError id="emp-role-error" message={errors.role} />
            </label>
            <label className="field">Department
              <input type="text" value={form.department} onChange={set('department')} maxLength={120} required list="emp-departments"
                aria-invalid={Boolean(errors.department)} aria-describedby="emp-department-error" />
              <datalist id="emp-departments">{[...new Set(active.map((candidate) => candidate.department))].sort().map((name) => <option key={name} value={name} />)}</datalist>
              <FieldError id="emp-department-error" message={errors.department} />
            </label>
            <label className="field">Start date <span className="field-hint">optional</span>
              <input type="date" value={form.startDate} onChange={set('startDate')} aria-invalid={Boolean(errors.startDate)} aria-describedby="emp-start-error" />
              <FieldError id="emp-start-error" message={errors.startDate} />
            </label>
          </div>
        </fieldset>

        <fieldset className="form-section">
          <legend>Reporting line</legend>
          <div className="form-grid form-grid-2">
            <label className="field span-all">Manager
              <select value={form.managerId} onChange={set('managerId')} aria-invalid={Boolean(errors.managerId)} aria-describedby="emp-manager-hint emp-manager-error">
                <option value="">No manager recorded</option>
                {managers.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name} · {candidate.role}</option>)}
              </select>
              <span id="emp-manager-hint" className="field-hint">Decides which manager's team this person belongs to. Only active employees are offered; the server refuses loops.</span>
              <FieldError id="emp-manager-error" message={errors.managerId} />
            </label>
            <label className="check span-all">
              <input type="checkbox" checked={form.reportsExternally} onChange={set('reportsExternally')} />
              Reports to someone outside this dataset (so a missing manager is not a data-quality issue)
            </label>
          </div>
        </fieldset>

        <fieldset className="form-section">
          <legend>Capacity</legend>
          <div className="form-grid form-grid-2">
            <label className="field">Mentoring hours per month <span className="field-hint">blank = not recorded</span>
              <input type="number" min="0" max="744" value={form.mentoringHoursPerMonth} onChange={set('mentoringHoursPerMonth')}
                aria-invalid={Boolean(errors.mentoringHoursPerMonth)} aria-describedby="emp-hours-hint emp-hours-error" />
              <span id="emp-hours-hint" className="field-hint">Leave blank if unknown. Blank is shown as a dash, never as zero.</span>
              <FieldError id="emp-hours-error" message={errors.mentoringHoursPerMonth} />
            </label>
          </div>
        </fieldset>

        {!creating && changedKeys.length > 0 && (
          <section className="form-section preview-section" aria-labelledby="emp-preview-head">
            <h3 id="emp-preview-head">Before and after</h3>
            <Diff before={Object.fromEntries(changedKeys.map((key) => [key, before[key]]))} after={changes} resolve={resolve} showUnchanged={false} />
          </section>
        )}

        {needsConfirmation && (
          <div className="confirm-block" role="group" aria-labelledby="emp-confirm-head">
            <p id="emp-confirm-head" className="confirm-head"><Icon name="alert" size={16} /> This change affects what Keystone calculates:</p>
            <ul>{warnings.map((line) => <li key={line}>{line}</li>)}</ul>
            <label className="check">
              <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
              I understand and want to apply this change
            </label>
          </div>
        )}
      </form>
    </Dialog>
  );
}

function ArchiveDialog({ employee, active, onClose, onDone }) {
  const [impact, setImpact] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [reassignTo, setReassignTo] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const errors = fieldMessages(error);

  useEffect(() => {
    let live = true;
    keystoneApi.employeeImpact(employee.id)
      .then((result) => { if (live) setImpact(result); })
      .catch((failure) => { if (live) setLoadError(failure); });
    return () => { live = false; };
  }, [employee.id]);

  const reports = impact?.directReports ?? [];
  const needsManager = reports.length > 0;
  const candidates = active.filter((candidate) => candidate.id !== employee.id);
  const uncovered = impact?.coverage?.newlyUncovered ?? [];
  const affected = impact?.coverage?.affectedSkills ?? [];

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await keystoneApi.archiveEmployee(employee.id, { reassignReportsTo: reassignTo === '' ? null : Number(reassignTo) });
      const parts = [`${result.employee.name} is archived.`];
      if (result.reassignedReports > 0) parts.push(`${result.reassignedReports} ${result.reassignedReports === 1 ? 'person now reports' : 'people now report'} to ${candidates.find((candidate) => candidate.id === Number(reassignTo))?.name ?? 'their new manager'}.`);
      if (result.accountDisabled) parts.push('Their sign-in is disabled.');
      onDone(result, { text: parts.join(' '), href: historyHref(result.employee), label: 'See it in history' });
    } catch (failure) {
      setError(failure);
      setBusy(false);
    }
  }

  return (
    <Dialog
      title={`Archive ${employee.name}`}
      description={<>Their record and evidence are kept for history, but they leave every score, team and scope. This can be undone. <HelpLink id="archive-employee">How archiving works</HelpLink></>}
      onClose={onClose}
      footer={<>
        <button type="button" className="btn btn-quiet" onClick={onClose}>Cancel</button>
        <button type="submit" form="archive-form" className="btn btn-danger" disabled={busy || !impact || !confirmed || (needsManager && reassignTo === '')}>
          {busy ? 'Archiving…' : 'Archive employee'}
        </button>
      </>}
    >
      <form id="archive-form" onSubmit={submit} className="form-sections">
        <FormError error={error && !error.details?.length ? error : null} />
        {loadError && <ErrorState error={loadError} title="Could not work out the impact" />}
        {!impact && !loadError && <Skeleton lines={4} />}
        {impact && (
          <>
            <section className="impact-section" aria-labelledby="impact-coverage">
              <h3 id="impact-coverage"><Icon name="shield" size={16} /> Coverage</h3>
              {uncovered.length > 0 ? (
                <p className="impact-danger"><strong>{uncovered.length === 1 ? 'One skill loses its only qualified holder:' : `${uncovered.length} skills lose their only qualified holder:`}</strong> {uncovered.join(', ')}. Consider planning a replacement in the Time Machine first.</p>
              ) : affected.length > 0 ? (
                <p>{affected.length} {affected.length === 1 ? 'skill loses' : 'skills lose'} a qualified holder, but each still has someone else on record.</p>
              ) : (
                <p className="muted">No recorded coverage depends on this person.</p>
              )}
              {affected.length > 0 && (
                <ul className="impact-list">
                  {affected.map((skill) => (
                    <li key={skill.id}>
                      {skill.name}: {skill.busFactorBefore} → {skill.busFactorAfter} qualified
                      {skill.becomesUncovered && <span className="tag tag-danger">uncovered</span>}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="impact-section" aria-labelledby="impact-team">
              <h3 id="impact-team"><Icon name="people" size={16} /> Team</h3>
              {reports.length === 0 ? <p className="muted">Nobody reports to {employee.name}.</p> : (
                <>
                  <p>{reports.length} {reports.length === 1 ? 'person reports' : 'people report'} to {employee.name}: {reports.map((report) => report.name).join(', ')}.</p>
                  <label className="field">Who do they report to now?
                    <select value={reassignTo} onChange={(event) => setReassignTo(event.target.value)} required
                      aria-invalid={Boolean(errors.reassignReportsTo)} aria-describedby="archive-manager-error">
                      <option value="">Choose a new manager</option>
                      {candidates.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name} · {candidate.role}</option>)}
                    </select>
                    <FieldError id="archive-manager-error" message={errors.reassignReportsTo} />
                  </label>
                </>
              )}
            </section>

            <section className="impact-section" aria-labelledby="impact-account">
              <h3 id="impact-account"><Icon name="lock" size={16} /> Sign-in</h3>
              {impact.account ? (
                impact.account.disabled
                  ? <p className="muted">Their account ({impact.account.email}) is already disabled.</p>
                  : <p>Their account <strong>{impact.account.email}</strong> will be disabled and signed out everywhere. Restoring the employee later does not re-enable it; do that from Users &amp; settings.</p>
              ) : <p className="muted">No sign-in account is linked to this record.</p>}
            </section>

            <label className="check confirm-line">
              <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
              I have read the impact and want to archive {employee.name}
            </label>
          </>
        )}
      </form>
    </Dialog>
  );
}

function RestoreDialog({ employee, onClose, onDone }) {
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    try {
      const result = await keystoneApi.restoreEmployee(employee.id);
      onDone(result, {
        text: `${result.employee.name} is active again.${result.accountStillDisabled ? ' Their sign-in stays disabled until you re-enable it.' : ''}`,
        href: result.accountStillDisabled ? '#/users' : profileHref(result.employee),
        label: result.accountStillDisabled ? 'Open Users & settings' : 'Open their profile',
      });
    } catch (failure) {
      setError(failure);
      setBusy(false);
    }
  }

  return (
    <Dialog title={`Restore ${employee.name}`} description="They rejoin every score, team and scope with the evidence they had before." onClose={onClose}
      footer={<>
        <button type="button" className="btn btn-quiet" onClick={onClose}>Cancel</button>
        <button type="submit" form="restore-form" className="btn btn-primary" disabled={busy}>{busy ? 'Restoring…' : 'Restore employee'}</button>
      </>}>
      <form id="restore-form" onSubmit={submit}>
        <FormError error={error} />
        <p>Archived {employee.archivedAt ? relativeTime(employee.archivedAt) : ''}. A linked sign-in account is not re-enabled automatically.</p>
      </form>
    </Dialog>
  );
}

export default function EmployeeDirectory({ workforce, onChanged }) {
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);
  const { filters, setFilter, reset, active: activeFilters } = useUrlFilters(EMPTY_FILTERS);
  const [dialog, setDialog] = useState(null);
  const [message, setMessage] = useState(null);

  const load = useCallback(async () => {
    try {
      setItems((await keystoneApi.employees()).items);
      setError(null);
    } catch (failure) {
      setError(failure);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const activeFilterCount = activeFilters.length;
  const active = useMemo(() => (items ?? []).filter((item) => item.employmentStatus === 'active'), [items]);
  const roles = useMemo(() => (workforce?.roles ?? []).map((role) => role.name).sort(), [workforce]);
  const departments = useMemo(() => [...new Set((items ?? []).map((item) => item.department))].sort(), [items]);

  const visible = useMemo(() => {
    if (!items) return [];
    const needle = filters.q.trim().toLowerCase();
    const rows = items.filter((item) => {
      if (filters.status !== 'all' && item.employmentStatus !== filters.status) return false;
      if (filters.department && item.department !== filters.department) return false;
      if (filters.role && item.role !== filters.role) return false;
      if (!needle) return true;
      return [item.name, item.role, item.department, item.managerName, item.account?.email].some((value) => value && value.toLowerCase().includes(needle));
    });
    const by = {
      name: (a, b) => a.name.localeCompare(b.name),
      role: (a, b) => a.role.localeCompare(b.role) || a.name.localeCompare(b.name),
      department: (a, b) => a.department.localeCompare(b.department) || a.name.localeCompare(b.name),
      reports: (a, b) => b.directReports - a.directReports || a.name.localeCompare(b.name),
      start: (a, b) => (b.startDate ?? '').localeCompare(a.startDate ?? '') || a.name.localeCompare(b.name),
    };
    return rows.sort(by[filters.sort] ?? by.name);
  }, [items, filters]);

  const done = async (_result, notice) => {
    setDialog(null);
    setMessage(notice);
    await Promise.all([load(), onChanged?.()]);
  };

  const counts = items ? { active: active.length, archived: items.length - active.length } : null;

  return (
    <>
      {message && (
        <p className="status-line" role="status">
          <Icon name="check" size={16} /><span>{message.text} {message.href && <a href={message.href}>{message.label}</a>}</span>
        </p>
      )}

      {error && !items ? <ErrorState error={error} onRetry={load} /> : (
        <section className="panel panel-flush">
          <div className="panel-head">
            <div>
              <h2>Employees <HelpTopic id="employment-status" /></h2>
              <p>{counts ? `${counts.active} active · ${counts.archived} archived. ` : ''}Add people, keep reporting lines right, and archive anyone who leaves without losing their history.</p>
            </div>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setDialog({ kind: 'create' })} disabled={!items}>
              <Icon name="plus" size={16} /> Add employee
            </button>
          </div>

          {items && items.length > 0 && (
            <form className="toolbar" role="search" aria-label="Find employees" onSubmit={(event) => event.preventDefault()}>
              <label className="field field-inline toolbar-search">
                <span className="sr-only">Search employees</span>
                <Icon name="search" size={16} />
                <input type="search" value={filters.q} onChange={setFilter('q')} placeholder="Name, role, department, manager or email" />
              </label>
              <label className="field field-inline">Department
                <select value={filters.department} onChange={setFilter('department')}>
                  <option value="">Any</option>
                  {departments.map((name) => <option key={name} value={name}>{name}</option>)}
                </select>
              </label>
              <label className="field field-inline">Role
                <select value={filters.role} onChange={setFilter('role')}>
                  <option value="">Any</option>
                  {roles.map((name) => <option key={name} value={name}>{name}</option>)}
                </select>
              </label>
              <label className="field field-inline">Status
                <select value={filters.status} onChange={setFilter('status')}>
                  <option value="active">Active</option>
                  <option value="archived">Archived</option>
                  <option value="all">All</option>
                </select>
              </label>
              <label className="field field-inline">Sort by
                <select value={filters.sort} onChange={setFilter('sort')}>
                  <option value="name">Name</option>
                  <option value="role">Role</option>
                  <option value="department">Department</option>
                  <option value="reports">Most direct reports</option>
                  <option value="start">Newest start date</option>
                </select>
              </label>
              <span className="toolbar-summary" aria-live="polite">
                Showing {visible.length} of {items.length}
                {activeFilterCount > 0 && <> · <button type="button" className="btn-link" onClick={reset}>Reset filters</button></>}
              </span>
            </form>
          )}

          {!items && <div className="pad"><Skeleton lines={6} /></div>}
          {items && items.length === 0 && <EmptyState icon="people" title="No employees yet">Add the first person with the button above.</EmptyState>}
          {items && items.length > 0 && visible.length === 0 && (
            <EmptyState icon="search" title="No employees match these filters">
              {items.length} {items.length === 1 ? 'record exists' : 'records exist'}. An empty list here means the filters excluded everyone, not that nobody is at risk.{' '}
              <button type="button" className="btn-link" onClick={reset}>Reset filters</button>
            </EmptyState>
          )}
          {items && visible.length > 0 && (
            <div className="table-wrap flush">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Person</th><th scope="col">Role</th><th scope="col">Department</th><th scope="col">Manager</th>
                    <th scope="col" className="num">Reports</th><th scope="col" className="num">Skills</th><th scope="col">Sign-in</th><th scope="col">Status</th>
                    <th scope="col"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((employee) => (
                    <tr key={employee.id} className={employee.employmentStatus === 'archived' ? 'row-muted' : ''}>
                      <th scope="row">
                        <a href={profileHref(employee)}>{employee.name}</a>
                        <small className="cell-sub">{employee.startDate ? `Started ${formatDate(employee.startDate)}` : 'Start date not recorded'}</small>
                      </th>
                      <td>{employee.role}</td>
                      <td>{employee.department}</td>
                      <td>{employee.managerName ?? (employee.reportsExternally ? <span className="muted">Outside dataset</span> : <span className="muted">—</span>)}</td>
                      <td className="num">{employee.directReports || <span className="muted">—</span>}</td>
                      <td className="num">{employee.recordedSkills || <span className="muted">—</span>}</td>
                      <td>{employee.account
                        ? <span className={`tag ${employee.account.disabled ? 'tag-outline' : 'tag-ok'}`}>{employee.account.disabled ? 'Disabled' : 'Active'}</span>
                        : <span className="muted">None</span>}</td>
                      <td>
                        {employee.employmentStatus === 'archived'
                          ? <span className="tag tag-outline" title={employee.archivedAt ? `Archived ${formatDate(employee.archivedAt)}` : undefined}>Archived</span>
                          : <span className="tag tag-ok">Active</span>}
                      </td>
                      <td>
                        <div className="row-actions">
                          <button type="button" className="btn btn-quiet btn-sm" onClick={() => setDialog({ kind: 'edit', employee })} aria-label={`Edit ${employee.name}`}>Edit</button>
                          {employee.employmentStatus === 'active'
                            ? <button type="button" className="btn btn-quiet btn-sm" onClick={() => setDialog({ kind: 'archive', employee })} aria-label={`Archive ${employee.name}`}>Archive</button>
                            : <button type="button" className="btn btn-quiet btn-sm" onClick={() => setDialog({ kind: 'restore', employee })} aria-label={`Restore ${employee.name}`}>Restore</button>}
                          <a className="btn btn-quiet btn-sm" href={historyHref(employee)} aria-label={`History for ${employee.name}`}>History</a>
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

      {dialog?.kind === 'create' && <EmployeeDialog employee={null} active={active} roles={roles} onClose={() => setDialog(null)} onDone={done} />}
      {dialog?.kind === 'edit' && <EmployeeDialog employee={dialog.employee} active={active} roles={roles} onClose={() => setDialog(null)} onDone={done} />}
      {dialog?.kind === 'archive' && <ArchiveDialog employee={dialog.employee} active={active} onClose={() => setDialog(null)} onDone={done} />}
      {dialog?.kind === 'restore' && <RestoreDialog employee={dialog.employee} onClose={() => setDialog(null)} onDone={done} />}
    </>
  );
}
