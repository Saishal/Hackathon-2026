import { useState } from 'react';
import { keystoneApi } from '../api/keystone';
import Icon from './Icon';

const HORIZONS = [[0, 'Today'], [12, '1 year'], [36, '3 years'], [60, '5 years']];
const emptyDeparture = { employeeId: '', month: 9 };
const emptyIntervention = { employeeId: '', skillId: '', mentorId: '', startMonth: 0, completionMonth: 6, targetProficiency: 3, assumeVerified: true };

const horizonText = (months) => (months === 0 ? 'today' : `in ${HORIZONS.find(([value]) => value === months)?.[1] ?? `${months} months`}`);

// Planned development can be owned by a parent (KeystoneStarter) so actions scheduled from the
// AI advisor survive switching views; standalone use keeps its own state.
export default function TimeMachine({ workforce, interventions: sharedInterventions, onInterventionsChange }) {
  const [horizonMonths, setHorizonMonths] = useState(12);
  const [departures, setDepartures] = useState([]);
  const [localInterventions, setLocalInterventions] = useState([]);
  const interventions = sharedInterventions ?? localInterventions;
  const setInterventions = onInterventionsChange ?? setLocalInterventions;
  const [departureDraft, setDepartureDraft] = useState(emptyDeparture);
  const [interventionDraft, setInterventionDraft] = useState(emptyIntervention);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const employeeName = (id) => workforce?.employees.find((employee) => employee.id === Number(id))?.name ?? `Employee ${id}`;
  const skillName = (id) => workforce?.skills.find((skill) => skill.id === Number(id))?.name ?? `Skill ${id}`;
  const stale = () => { setResult(null); setError(''); };

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
  function reset() { setDepartures([]); setInterventions([]); setDepartureDraft(emptyDeparture); setInterventionDraft(emptyIntervention); stale(); }

  async function run() {
    setBusy(true); setError('');
    // `source` only labels where a scheduled action came from; the simulation does not take it.
    const planned = interventions.map(({ source: _source, ...item }) => item);
    try { setResult(await keystoneApi.simulate({ horizonMonths, departures, interventions: planned })); }
    catch (err) { setError(err.message); setResult(null); }
    finally { setBusy(false); }
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
  const scenarios = result ? [['Today', result.baseline], ['No development', result.noIntervention], ['With development', result.projected]] : [];

  return <>
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2>Build a scenario</h2>
          <p>Today's records never change. Reviewed future needs apply automatically from their start month.</p>
        </div>
        <label className="field field-inline">Look ahead
          <select value={horizonMonths} onChange={(event) => { setHorizonMonths(Number(event.target.value)); stale(); }}>
            {HORIZONS.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
          </select>
        </label>
      </div>
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
            <label className="field w-month">Month
              <input type="number" min="0" max="60" value={departureDraft.month}
                onChange={(event) => setDepartureDraft({ ...departureDraft, month: event.target.value })} />
            </label>
            <button className="btn btn-secondary" disabled={busy || !departureDraft.employeeId}>Add departure</button>
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
            <label className="field">Start month
              <input type="number" min="0" max="60" value={interventionDraft.startMonth}
                onChange={(event) => setInterventionDraft({ ...interventionDraft, startMonth: event.target.value })} />
            </label>
            <label className="field">Completion month
              <input type="number" min="0" max="60" value={interventionDraft.completionMonth}
                onChange={(event) => setInterventionDraft({ ...interventionDraft, completionMonth: event.target.value })} />
            </label>
            <label className="field">Target level
              <input type="number" min="1" max="5" value={interventionDraft.targetProficiency}
                onChange={(event) => setInterventionDraft({ ...interventionDraft, targetProficiency: event.target.value })} />
            </label>
            <label className="check span-all"><input type="checkbox" checked={interventionDraft.assumeVerified}
              onChange={(event) => setInterventionDraft({ ...interventionDraft, assumeVerified: event.target.checked })} /> Verified at completion, so it counts toward coverage</label>
            <div className="span-all">
              <button className="btn btn-secondary" disabled={busy || !interventionDraft.skillId || !interventionDraft.employeeId}>Add to plan</button>
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
        <button type="button" className="btn btn-quiet" disabled={busy || (departures.length === 0 && interventions.length === 0)} onClick={reset}>Clear scenario</button>
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
            <h2>Coverage {horizonText(result.horizonMonths)}</h2>
            <p>Today compared with the end of the period, with and without the planned development.</p>
          </div>
        </div>

        <div className="compare">
          {scenarios.map(([label, scenario], index) => (
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
          <h3>New requirements in effect</h3>
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
