import { useCallback, useEffect, useRef, useState } from 'react';
import { keystoneApi } from '../api/keystone';
import { useSession } from '../session';
import { can, formatDateTime, plural } from './format';
import Icon from './Icon';
import HelpTopic from './HelpTopic';
import { FormError, SeverityTag } from './ui';

const HORIZONS = [[0, 'Today'], [12, '1 year'], [36, '3 years'], [60, '5 years']];
const emptyDeparture = { employeeId: '', month: 9 };
const emptyIntervention = { employeeId: '', skillId: '', mentorId: '', startMonth: 0, completionMonth: 6, targetProficiency: 3, assumeVerified: true };

const horizonText = (months) => (months === 0 ? 'today' : `in ${HORIZONS.find(([value]) => value === months)?.[1] ?? `${months} months`}`);

// Scenario checks (a departure with no successor, a mentor below level, development that finishes too late).
// They are warnings about the plan, never changes to scores.
function ScenarioWarnings({ warnings, title }) {
  if (!warnings?.length) return null;
  return <>
    <h3>{title}</h3>
    <ul className="warning-list">
      {warnings.map((warning) => (
        <li key={`${warning.ruleCode}-${warning.entityId}`}>
          <SeverityTag severity={warning.severity} />
          <div>
            <strong>{warning.title}</strong>
            <p>{warning.explanation}</p>
            <p className="muted small">{warning.suggestedAction}</p>
          </div>
        </li>
      ))}
    </ul>
  </>;
}

// Planned development can be owned by a parent (KeystoneStarter) so actions scheduled from the
// AI advisor survive switching views; standalone use keeps its own state.
export default function TimeMachine({ workforce, interventions: sharedInterventions, onInterventionsChange, params }) {
  const session = useSession();
  const canSave = can(session, 'scenario.save');
  const [horizonMonths, setHorizonMonths] = useState(12);
  const [departures, setDepartures] = useState([]);
  const [localInterventions, setLocalInterventions] = useState([]);
  const interventions = sharedInterventions ?? localInterventions;
  const setInterventions = onInterventionsChange ?? setLocalInterventions;
  const [departureDraft, setDepartureDraft] = useState(emptyDeparture);
  const [interventionDraft, setInterventionDraft] = useState(emptyIntervention);
  const [includePending, setIncludePending] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const [scenarios, setScenarios] = useState(null);
  const [scenarioId, setScenarioId] = useState('');
  const [name, setName] = useState('');
  const [savedWarnings, setSavedWarnings] = useState([]);
  const [saving, setSaving] = useState('');
  const [saveError, setSaveError] = useState(null);
  const [notice, setNotice] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const appliedFromLink = useRef(false);

  const employeeName = (id) => workforce?.employees.find((employee) => employee.id === Number(id))?.name ?? `Employee ${id}`;
  const skillName = (id) => workforce?.skills.find((skill) => skill.id === Number(id))?.name ?? `Skill ${id}`;
  const stale = () => { setResult(null); setError(''); };
  // Months only make sense inside the horizon: "1 year" means months 0–12. Offering 60 invited
  // events that could never take effect. Baseline (0) means no time passes, so the forms switch off.
  const monthMax = horizonMonths;
  const clampMonth = (value) => Math.min(monthMax, Math.max(0, Number(value) || 0));
  const monthHint = monthMax === 0 ? 'choose a horizon first' : `0–${monthMax}`;
  const departureMonthValid = Number(departureDraft.month) >= 0 && Number(departureDraft.month) <= monthMax;
  const interventionMonthsValid = Number(interventionDraft.startMonth) >= 0
    && Number(interventionDraft.completionMonth) <= monthMax
    && Number(interventionDraft.completionMonth) >= Number(interventionDraft.startMonth);

  const loadScenarios = useCallback(async () => {
    try {
      setScenarios((await keystoneApi.scenarios()).items);
    } catch (failure) {
      setSaveError(failure);
      setScenarios([]);
    }
  }, []);

  useEffect(() => { loadScenarios(); }, [loadScenarios]);

  const applyScenario = useCallback((scenario) => {
    setScenarioId(scenario.id);
    setName(scenario.name);
    setHorizonMonths(scenario.horizonMonths);
    setDepartures(scenario.departures);
    setInterventions(scenario.interventions);
    setIncludePending(scenario.includePendingChanges);
    setSavedWarnings(scenario.warnings ?? []);
    setConfirmDelete(false);
    setResult(null);
    setError('');
  }, [setInterventions]);

  // A data-quality link (#/timemachine?scenario=3) opens that saved scenario once the list has loaded.
  useEffect(() => {
    if (appliedFromLink.current || !scenarios || !params?.scenario) return;
    appliedFromLink.current = true;
    const linked = scenarios.find((scenario) => scenario.id === Number(params.scenario));
    if (linked) applyScenario(linked);
    else setNotice('The linked scenario no longer exists. It may have been deleted.');
  }, [scenarios, params?.scenario, applyScenario]);

  function addDeparture() {
    setDepartures((current) => [...current, { employeeId: Number(departureDraft.employeeId), month: Number(departureDraft.month) }]);
    setDepartureDraft(emptyDeparture); stale();
  }
  function addIntervention() {
    const draft = interventionDraft;
    setInterventions((current) => [...current, { employeeId: Number(draft.employeeId), skillId: Number(draft.skillId),
      mentorId: draft.mentorId === '' ? null : Number(draft.mentorId), startMonth: Number(draft.startMonth),
      completionMonth: Number(draft.completionMonth), targetProficiency: Number(draft.targetProficiency), assumeVerified: draft.assumeVerified }]);
    setInterventionDraft(emptyIntervention); stale();
  }
  const removeAt = (setter, index) => { setter((current) => current.filter((_item, i) => i !== index)); stale(); };
  const setVerified = (index, assumeVerified) => {
    setInterventions((current) => current.map((item, i) => (i === index ? { ...item, assumeVerified } : item))); stale();
  };
  function reset() {
    setDepartures([]); setInterventions([]); setDepartureDraft(emptyDeparture); setInterventionDraft(emptyIntervention);
    setScenarioId(''); setName(''); setSavedWarnings([]); setIncludePending(false); setConfirmDelete(false); stale();
  }

  async function run() {
    setBusy(true); setError('');
    // `source` only labels where a scheduled action came from; the simulation does not take it.
    const planned = interventions.map(({ source: _source, ...item }) => item);
    try { setResult(await keystoneApi.simulate({ horizonMonths, departures, interventions: planned, includePendingChanges: includePending })); }
    catch (err) { setError(err.message); setResult(null); }
    finally { setBusy(false); }
  }

  function selectScenario(value) {
    setNotice(''); setSaveError(null);
    if (value === '') { setScenarioId(''); setName(''); setSavedWarnings([]); setConfirmDelete(false); return; }
    const scenario = scenarios.find((item) => item.id === Number(value));
    if (scenario) applyScenario(scenario);
  }

  async function save(asNew) {
    setSaving(asNew ? 'create' : 'update'); setSaveError(null); setNotice('');
    const body = {
      name: name.trim(),
      horizonMonths,
      departures,
      interventions: interventions.map(({ source, ...item }) => ({ ...item, ...(source ? { source: String(source).slice(0, 60) } : {}) })),
      includePendingChanges: includePending,
    };
    try {
      const saved = asNew || scenarioId === '' ? await keystoneApi.createScenario(body) : await keystoneApi.updateScenario(scenarioId, body);
      setScenarioId(saved.id);
      setName(saved.name);
      setSavedWarnings(saved.warnings ?? []);
      setNotice(`Saved “${saved.name}”. Saving a scenario changes no official data or score.`);
      await loadScenarios();
    } catch (failure) {
      setSaveError(failure);
    } finally {
      setSaving('');
    }
  }

  async function remove() {
    setSaving('delete'); setSaveError(null); setNotice('');
    try {
      await keystoneApi.deleteScenario(scenarioId);
      setNotice(`Deleted “${name}”. The audit history keeps a record of it.`);
      setScenarioId(''); setName(''); setSavedWarnings([]); setConfirmDelete(false);
      await loadScenarios();
    } catch (failure) {
      setSaveError(failure);
    } finally {
      setSaving('');
    }
  }

  const mentorFor = (skillId) => (workforce?.matrix ?? [])
    .filter((edge) => edge.skillId === Number(skillId) && edge.proficiency >= 4)
    .map((edge) => edge.employeeId);
  // Member 1's rule: mentoringHoursPerMonth ABSENT means unknown, never 0.
  const capacityLabel = (id) => {
    const hours = workforce?.employees.find((employee) => employee.id === Number(id))?.mentoringHoursPerMonth;
    return hours === undefined ? 'mentoring time unknown' : `${hours} h/month for mentoring`;
  };
  const changed = result ? [...new Set([
    ...result.baseline.skills.map((skill) => skill.id),
    ...result.noIntervention.skills.map((skill) => skill.id),
    ...result.projected.skills.map((skill) => skill.id),
  ])].map((id) => {
    const base = result.baseline.skills.find((entry) => entry.id === id);
    const none = result.noIntervention.skills.find((entry) => entry.id === id);
    const projected = result.projected.skills.find((entry) => entry.id === id);
    return { id, name: projected?.name ?? none?.name ?? base?.name,
      base: base?.busFactor ?? 0, none: none?.busFactor ?? 0, projected: projected?.busFactor ?? 0 };
  }).filter((row) => row.base !== row.none || row.base !== row.projected) : [];
  const maxHolders = Math.max(1, ...changed.flatMap((row) => [row.base, row.none, row.projected]));
  const columns = result ? [['Today', result.baseline], ['No development', result.noIntervention], ['With development', result.projected]] : [];
  const current = scenarios?.find((scenario) => scenario.id === scenarioId);
  const provisional = result?.provisionalApplied ?? [];

  return <>
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2>Build a scenario <HelpTopic id="time-machine-assumptions" /></h2>
          <p>Today's records never change. Approved future needs apply automatically from their start month.</p>
        </div>
        <label className="field field-inline">Look ahead
          <select value={horizonMonths} onChange={(event) => {
            const next = Number(event.target.value);
            setHorizonMonths(next);
            setDepartureDraft((draft) => ({ ...draft, month: Math.min(next, Number(draft.month)) }));
            setInterventionDraft((draft) => ({ ...draft,
              startMonth: Math.min(next, Number(draft.startMonth)),
              completionMonth: Math.min(next, Number(draft.completionMonth)) }));
            stale();
          }}>
            {HORIZONS.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
          </select>
        </label>
      </div>

      <form className="scenario-bar" aria-label="Saved scenarios" onSubmit={(event) => { event.preventDefault(); if (canSave && name.trim()) save(false); }}>
        <label className="field">Saved scenario
          <select value={scenarioId} onChange={(event) => selectScenario(event.target.value)} disabled={!scenarios || saving !== ''}>
            <option value="">{scenarios === null ? 'Loading…' : 'New, unsaved scenario'}</option>
            {scenarios?.map((scenario) => <option key={scenario.id} value={scenario.id}>{scenario.name}</option>)}
          </select>
        </label>
        {canSave && <>
          <label className="field grow">Scenario name
            <input type="text" value={name} maxLength={120} onChange={(event) => setName(event.target.value)} placeholder="For example: Billing continuity" />
          </label>
          <button className="btn btn-primary" disabled={saving !== '' || !name.trim()}>
            {saving === 'update' || saving === 'create' ? 'Saving…' : scenarioId === '' ? 'Save scenario' : 'Save changes'}
          </button>
          {scenarioId !== '' && <button type="button" className="btn btn-secondary" disabled={saving !== '' || !name.trim()} onClick={() => save(true)}>Save as new</button>}
          {scenarioId !== '' && (confirmDelete
            ? <>
              <button type="button" className="btn btn-quiet" onClick={() => setConfirmDelete(false)}>Keep it</button>
              <button type="button" className="btn btn-secondary text-danger" disabled={saving !== ''} onClick={remove}>{saving === 'delete' ? 'Deleting…' : 'Confirm delete'}</button>
            </>
            : <button type="button" className="btn btn-quiet" disabled={saving !== ''} onClick={() => setConfirmDelete(true)}>Delete</button>)}
        </>}
        {current && <p className="muted small scenario-meta">Last saved by {current.updatedBy.name}, {formatDateTime(current.updatedAt)}. Scenarios are modelled assumptions and never change official data.</p>}
      </form>
      {notice && <p className="status-line" role="status"><Icon name="check" size={16} /><span>{notice}</span></p>}
      <FormError error={saveError} />
      <ScenarioWarnings warnings={savedWarnings} title="Checks on this saved scenario" />
      {error && <p role="alert" className="alert">{error}</p>}

      <div className="tm-grid">
        <div className="tm-block">
          <h3>Departures</h3>
          <p className="muted">Take someone out of the team from a given month.</p>
          <form className="form-row" onSubmit={(event) => { event.preventDefault(); addDeparture(); }}>
            <label className="field grow">Person
              <select value={departureDraft.employeeId} onChange={(event) => setDepartureDraft({ ...departureDraft, employeeId: event.target.value })}>
                <option value="">Select a person</option>
                {workforce?.employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}
              </select>
            </label>
            <label className="field w-month">Month <span className="field-hint">{monthHint}</span>
              <input type="number" min="0" max={monthMax} value={departureDraft.month} disabled={monthMax === 0}
                onChange={(event) => setDepartureDraft({ ...departureDraft, month: event.target.value })}
                onBlur={(event) => setDepartureDraft({ ...departureDraft, month: clampMonth(event.target.value) })} />
            </label>
            <button className="btn btn-secondary" disabled={busy || !departureDraft.employeeId || !departureMonthValid}>Add departure</button>
          </form>
          {departures.length === 0 ? <p className="empty-line">No departures added.</p> : <ul className="item-list">
            {departures.map((departure, index) => <li key={`${departure.employeeId}-${departure.month}-${index}`}>
              <span><strong>{employeeName(departure.employeeId)}</strong> leaves at month {departure.month}</span>
              <button type="button" className="btn-icon" aria-label={`Remove ${employeeName(departure.employeeId)}'s departure`}
                onClick={() => removeAt(setDepartures, index)}><Icon name="close" size={16} /></button>
            </li>)}
          </ul>}
        </div>

        <div className="tm-block">
          <h3>Planned development</h3>
          <p className="muted">A mentor needs level 4 or higher and must stay until completion. Recorded mentoring time limits how many people one mentor can support.</p>
          <form className="form-grid" onSubmit={(event) => { event.preventDefault(); addIntervention(); }}>
            <label className="field">Skill
              <select value={interventionDraft.skillId} onChange={(event) => setInterventionDraft({ ...interventionDraft, skillId: event.target.value, mentorId: '' })}>
                <option value="">Select a skill</option>
                {workforce?.skills.map((skill) => <option key={skill.id} value={skill.id}>{skill.name}</option>)}
              </select>
            </label>
            <label className="field">Learner
              <select value={interventionDraft.employeeId} onChange={(event) => setInterventionDraft({ ...interventionDraft, employeeId: event.target.value })}>
                <option value="">Select a person</option>
                {workforce?.employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}
              </select>
            </label>
            <label className="field">Mentor
              <select value={interventionDraft.mentorId} disabled={!interventionDraft.skillId}
                onChange={(event) => setInterventionDraft({ ...interventionDraft, mentorId: event.target.value })}>
                <option value="">No mentor</option>
                {mentorFor(interventionDraft.skillId)
                  .filter((id) => String(id) !== String(interventionDraft.employeeId))
                  .map((id) => <option key={id} value={id}>{employeeName(id)} ({capacityLabel(id)})</option>)}
              </select>
            </label>
            <label className="field">Start month <span className="field-hint">{monthHint}</span>
              <input type="number" min="0" max={monthMax} value={interventionDraft.startMonth} disabled={monthMax === 0}
                onChange={(event) => setInterventionDraft({ ...interventionDraft, startMonth: event.target.value })}
                onBlur={(event) => setInterventionDraft({ ...interventionDraft, startMonth: clampMonth(event.target.value) })} />
            </label>
            <label className="field">Completion month <span className="field-hint">{monthHint}</span>
              <input type="number" min="0" max={monthMax} value={interventionDraft.completionMonth} disabled={monthMax === 0}
                onChange={(event) => setInterventionDraft({ ...interventionDraft, completionMonth: event.target.value })}
                onBlur={(event) => setInterventionDraft({ ...interventionDraft, completionMonth: clampMonth(event.target.value) })} />
            </label>
            {Number(interventionDraft.completionMonth) < Number(interventionDraft.startMonth) && (
              <p className="field-error" role="alert">Completion month must be the same as or after the start month.</p>
            )}
            <label className="field">Target level
              <input type="number" min="1" max="5" value={interventionDraft.targetProficiency}
                onChange={(event) => setInterventionDraft({ ...interventionDraft, targetProficiency: event.target.value })} />
            </label>
            <label className="check span-all"><input type="checkbox" checked={interventionDraft.assumeVerified}
              onChange={(event) => setInterventionDraft({ ...interventionDraft, assumeVerified: event.target.checked })} /> Verified at completion, so it counts toward coverage</label>
            <div className="span-all">
              <button className="btn btn-secondary" disabled={busy || !interventionDraft.skillId || !interventionDraft.employeeId || !interventionMonthsValid}>Add to plan</button>
            </div>
          </form>
          {interventions.length === 0 ? <p className="empty-line">No development planned. Actions scheduled from the AI advisor appear here.</p> : <ul className="item-list">
            {interventions.map((item, index) => <li key={`${item.employeeId}-${item.skillId}-${index}`}>
              <div>
                <div><strong>{employeeName(item.employeeId)}</strong> reaches {skillName(item.skillId)} level {item.targetProficiency} by month {item.completionMonth}</div>
                <div className="muted">{item.mentorId === null ? 'No mentor' : `Mentored by ${employeeName(item.mentorId)} from month ${item.startMonth}`}</div>
                {(item.source || !item.assumeVerified) && <div className="item-tags">
                  {item.source && <span className="tag tag-accent">From AI advisor · {item.source}</span>}
                  {!item.assumeVerified && <span className="tag tag-warn">Not verified, so it doesn't count yet</span>}
                </div>}
              </div>
              <div className="item-actions">
                <label className="check"><input type="checkbox" checked={item.assumeVerified}
                  onChange={(event) => setVerified(index, event.target.checked)} /> Verified at completion</label>
                <button type="button" className="btn-icon" aria-label={`Remove ${employeeName(item.employeeId)}'s ${skillName(item.skillId)} development`}
                  onClick={() => removeAt(setInterventions, index)}><Icon name="close" size={16} /></button>
              </div>
            </li>)}
          </ul>}
        </div>
      </div>

      <div className="action-bar">
        <button type="button" className="btn btn-primary" disabled={busy || !workforce} onClick={run}>{busy ? 'Comparing…' : 'Compare scenarios'}</button>
        <label className="check">
          <input type="checkbox" checked={includePending} onChange={(event) => { setIncludePending(event.target.checked); stale(); }} />
          Include evidence changes still awaiting review (modelled, not approved)
        </label>
        <button type="button" className="btn btn-quiet" disabled={busy || (departures.length === 0 && interventions.length === 0 && scenarioId === '')} onClick={reset}>Clear scenario</button>
      </div>
    </section>

    <section className="panel results" aria-live="polite">
      {!result ? (
        <div className="empty">
          <Icon name="timemachine" size={24} />
          <p><strong>No comparison yet</strong></p>
          <p className="muted">Add a departure or planned development, then compare scenarios to see coverage {horizonText(horizonMonths)}.</p>
        </div>
      ) : <>
        <div className="panel-head">
          <div>
            <h2>Coverage {horizonText(result.horizonMonths)} <HelpTopic id="time-machine-assumptions" /></h2>
            <p>Today compared with the end of the period, with and without the planned development.</p>
          </div>
          <span className="tag tag-accent"><Icon name="forecast" size={14} /> Modelled forecast</span>
        </div>

        {includePending && (
          <div className="forecast-note">
            <Icon name="forecast" size={16} />
            <div>
              {provisional.length === 0
                ? <p>No evidence changes are awaiting review, so this forecast uses approved data only.</p>
                : <>
                  <p><strong>{plural(provisional.length, 'pending change')}</strong> {provisional.length === 1 ? 'is' : 'are'} modelled in the future columns. Today's column uses approved data only.</p>
                  <ul>{provisional.map((item) => (
                    <li key={`${item.changeRequestId}-${item.employeeId}-${item.skillId}`}>
                      {item.label ?? `${employeeName(item.employeeId)} · ${skillName(item.skillId)}`}{item.proficiency === null || item.proficiency === undefined ? ' (removal)' : ` at level ${item.proficiency}`}
                    </li>
                  ))}</ul>
                </>}
            </div>
          </div>
        )}

        <ScenarioWarnings warnings={result.scenarioWarnings} title="Checks on this scenario" />

        <div className="compare">
          {columns.map(([label, scenario], index) => (
            <div className="compare-col" key={label}>
              <p className="stat-label">{label}</p>
              <div className="compare-stats">
                <span><strong className={index === 1 && scenario.uncovered > result.baseline.uncovered ? 'text-danger' : undefined}>{scenario.uncovered}</strong>no one qualified</span>
                <span><strong>{scenario.singleHolder}</strong>one qualified person</span>
              </div>
            </div>
          ))}
        </div>

        {changed.length > 0 ? <>
          <h3>Skills that change</h3>
          <ul className="legend" aria-label="Bar legend">
            <li><span className="swatch bar-today" /> Today</li>
            <li><span className="swatch bar-none" /> Without development</li>
            <li><span className="swatch bar-with" /> With development</li>
          </ul>
          <ul className="change-list">{changed.map((row) => <li key={row.id}>
            <div className="detail-line">
              <strong>{row.name}</strong>
              {row.none === 0 && row.projected > 0 && <span className="tag tag-ok"><Icon name="check" size={14} /> Development keeps it covered</span>}
            </div>
            <p className="muted">Qualified people: {row.base} today, {row.none} without development, {row.projected} with development</p>
            <div className="bars" aria-hidden="true">
              {[['today', row.base], ['none', row.none], ['with', row.projected]].map(([kind, value]) => (
                <div className="bar-row" key={kind}>
                  <span className={`bar bar-${kind}`} style={{ '--w': `${(value / maxHolders) * 100}%` }} />
                  <span className="num">{value}</span>
                </div>
              ))}
            </div>
          </li>)}</ul>
        </> : <p className="muted">No skill's coverage changes in this scenario.</p>}

        {result.requirementsApplied.length > 0 && <>
          <h3>New requirements in effect <HelpTopic id="future-requirement" /></h3>
          <ul className="plain-list">{result.requirementsApplied.map((requirement) => <li key={requirement.skillId ?? requirement.skillName}>
            <strong>{requirement.skillName}</strong>: {requirement.requiredHolders} people at level {requirement.targetProficiency}+ from month {requirement.effectiveMonth}
          </li>)}</ul>
        </>}

        {result.blocked.length > 0 && <>
          <h3>Development that can't go ahead</h3>
          <ul className="plain-list">{result.blocked.map((item, index) => <li key={`${item.employeeId}-${item.skillId}-${index}`}>
            <strong>{employeeName(item.employeeId)} · {skillName(item.skillId)}</strong>
            <div className="text-danger">{item.reason}</div>
          </li>)}</ul>
        </>}

        {result.capacityWarnings.length > 0 && <>
          <h3>Mentoring time not on record</h3>
          <ul className="plain-list">{result.capacityWarnings.map((item, index) => <li key={`${item.mentorId}-${item.skillId}-${index}`}>
            <strong>{employeeName(item.mentorId)}</strong>: {item.warning}
          </li>)}</ul>
        </>}

        <details><summary>How this was calculated</summary>
          <ul>{result.assumptions.map((assumption, index) => <li key={index}>{assumption}</li>)}</ul>
        </details>
      </>}
    </section>
  </>;
}
