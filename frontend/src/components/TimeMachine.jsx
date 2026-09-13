import { useState } from 'react';
import { keystoneApi } from '../api/keystone';

const HORIZONS = [[0, 'Baseline'], [12, '1 year'], [36, '3 years'], [60, '5 years']];
const emptyDeparture = { employeeId: '', month: 9 };
const emptyIntervention = { employeeId: '', skillId: '', mentorId: '', startMonth: 0, completionMonth: 6, targetProficiency: 3, assumeVerified: true };

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
  // Months only make sense inside the chosen horizon: a 1-year horizon means months 0–12.
  // Offering 60 when the horizon is 12 invited events that could never take effect.
  const monthMax = horizonMonths;
  const clampMonth = (value) => Math.min(monthMax, Math.max(0, Number(value) || 0));
  const monthHint = monthMax === 0 ? 'choose a horizon first' : `0–${monthMax}`;
  const departureMonthValid = Number(departureDraft.month) >= 0 && Number(departureDraft.month) <= monthMax;
  const interventionMonthsValid = Number(interventionDraft.startMonth) >= 0
    && Number(interventionDraft.completionMonth) <= monthMax
    && Number(interventionDraft.completionMonth) >= Number(interventionDraft.startMonth);

  function addDeparture() {
    setDepartures((current) => [...current, { employeeId: Number(departureDraft.employeeId), month: clampMonth(departureDraft.month) }]);
    setDepartureDraft(emptyDeparture); stale();
  }
  function addIntervention() {
    const draft = interventionDraft;
    setInterventions((current) => [...current, { employeeId: Number(draft.employeeId), skillId: Number(draft.skillId),
      mentorId: draft.mentorId === '' ? null : Number(draft.mentorId), startMonth: clampMonth(draft.startMonth),
      completionMonth: clampMonth(draft.completionMonth), targetProficiency: Number(draft.targetProficiency), assumeVerified: draft.assumeVerified }]);
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
  // Member 1's rule: mentoringHoursPerMonth ABSENT means unknown — a dash, never 0.
  const capacityLabel = (id) => {
    const hours = workforce?.employees.find((employee) => employee.id === Number(id))?.mentoringHoursPerMonth;
    return hours === undefined ? 'capacity —' : `capacity ${hours}h/mo`;
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

  return <>
    <h3>Time Machine</h3>
    <p>Model departures and development against a horizon. Reviewed future requirements are loaded from the saved plan and apply only when their effective month is reached. The baseline is never changed.</p>
    {error && <p role="alert">{error}</p>}
    {monthMax === 0 && <p className="hint" role="status">"Baseline" shows today with no time passing. Choose 1, 3 or 5 years to model departures and development.</p>}

    <form onSubmit={(event) => { event.preventDefault(); addDeparture(); }}>
      <label>Horizon
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
      <label>Departure
        <select value={departureDraft.employeeId} onChange={(event) => setDepartureDraft({ ...departureDraft, employeeId: event.target.value })}>
          <option value="">Select a person</option>
          {workforce?.employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}
        </select>
      </label>
      <label>Month <span className="hint">({monthHint})</span> <input type="number" min="0" max={monthMax} value={departureDraft.month}
        disabled={monthMax === 0}
        onChange={(event) => setDepartureDraft({ ...departureDraft, month: event.target.value })}
        onBlur={(event) => setDepartureDraft({ ...departureDraft, month: clampMonth(event.target.value) })} /></label>
      <button disabled={busy || !departureDraft.employeeId || !departureMonthValid}>Add departure</button>
    </form>
    {departures.length > 0 && <ul>
      {departures.map((departure, index) => <li key={`${departure.employeeId}-${departure.month}-${index}`}>
        <strong>{employeeName(departure.employeeId)}</strong> leaves at month {departure.month}{' '}
        <button type="button" onClick={() => removeAt(setDepartures, index)}>Remove</button>
      </li>)}
    </ul>}

    <h3>Planned development</h3>
    <p>A mentor must hold the skill at proficiency 4 or above and stay available until completion. Recorded mentoring capacity limits concurrent engagements.</p>
    <form onSubmit={(event) => { event.preventDefault(); addIntervention(); }}>
      <label>Skill
        <select value={interventionDraft.skillId} onChange={(event) => setInterventionDraft({ ...interventionDraft, skillId: event.target.value, mentorId: '' })}>
          <option value="">Select a skill</option>
          {workforce?.skills.map((skill) => <option key={skill.id} value={skill.id}>{skill.name}</option>)}
        </select>
      </label>
      <label>Learner
        <select value={interventionDraft.employeeId} onChange={(event) => setInterventionDraft({ ...interventionDraft, employeeId: event.target.value })}>
          <option value="">Select a person</option>
          {workforce?.employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}
        </select>
      </label>
      <label>Mentor (optional)
        <select value={interventionDraft.mentorId} disabled={!interventionDraft.skillId}
          onChange={(event) => setInterventionDraft({ ...interventionDraft, mentorId: event.target.value })}>
          <option value="">No mentor</option>
          {mentorFor(interventionDraft.skillId)
            .filter((id) => String(id) !== String(interventionDraft.employeeId))
            .map((id) => <option key={id} value={id}>{employeeName(id)} ({capacityLabel(id)})</option>)}
        </select>
      </label>
      <label>Start month <span className="hint">({monthHint})</span> <input type="number" min="0" max={monthMax} value={interventionDraft.startMonth}
        disabled={monthMax === 0}
        onChange={(event) => setInterventionDraft({ ...interventionDraft, startMonth: event.target.value })}
        onBlur={(event) => setInterventionDraft({ ...interventionDraft, startMonth: clampMonth(event.target.value) })} /></label>
      <label>Completion month <span className="hint">({monthHint})</span> <input type="number" min="0" max={monthMax} value={interventionDraft.completionMonth}
        disabled={monthMax === 0}
        onChange={(event) => setInterventionDraft({ ...interventionDraft, completionMonth: event.target.value })}
        onBlur={(event) => setInterventionDraft({ ...interventionDraft, completionMonth: clampMonth(event.target.value) })} /></label>
      {Number(interventionDraft.completionMonth) < Number(interventionDraft.startMonth) && <p className="hint-warning" role="alert">Completion month must be the same as or after the start month.</p>}
      <label>Target proficiency <input type="number" min="1" max="5" value={interventionDraft.targetProficiency}
        onChange={(event) => setInterventionDraft({ ...interventionDraft, targetProficiency: event.target.value })} /></label>
      <label><input type="checkbox" checked={interventionDraft.assumeVerified}
        onChange={(event) => setInterventionDraft({ ...interventionDraft, assumeVerified: event.target.checked })} /> Assume proficiency is independently verified at completion</label>
      <button disabled={busy || !interventionDraft.skillId || !interventionDraft.employeeId || !interventionMonthsValid}>Add development</button>
    </form>
    {interventions.length > 0 && <ul>
      {interventions.map((item, index) => <li key={`${item.employeeId}-${item.skillId}-${index}`}>
        <strong>{employeeName(item.employeeId)}</strong> reaches {skillName(item.skillId)} level {item.targetProficiency} by month {item.completionMonth}
        {item.mentorId === null ? ' with no mentor' : `, mentored by ${employeeName(item.mentorId)} from month ${item.startMonth}`}
        {item.source ? ` · scheduled from the AI advisor (${item.source})` : ''}
        {item.assumeVerified ? '' : ' (not assumed verified, so it does not change coverage)'}
        <label className="inline-check"><input type="checkbox" checked={item.assumeVerified}
          onChange={(event) => setVerified(index, event.target.checked)} /> Verified at completion</label>{' '}
        <button type="button" onClick={() => removeAt(setInterventions, index)}>Remove</button>
      </li>)}
    </ul>}

    <form onSubmit={(event) => { event.preventDefault(); run(); }}>
      <button disabled={busy || !workforce}>{busy ? 'Comparing…' : 'Compare scenarios'}</button>
      <button type="button" disabled={busy || (departures.length === 0 && interventions.length === 0)} onClick={reset}>Reset scenario</button>
    </form>

    {result && <div aria-live="polite">
      <h3>Comparison at {HORIZONS.find(([value]) => value === result.horizonMonths)?.[1]}</h3>
      <div className="table-wrap compact">
        <table>
          <thead><tr><th scope="col">Scenario</th><th scope="col">Skills with no recorded holder</th><th scope="col">Single-holder skills</th></tr></thead>
          <tbody>
            <tr><th scope="row">Today (baseline)</th><td>{result.baseline.uncovered}</td><td>{result.baseline.singleHolder}</td></tr>
            <tr><th scope="row">At horizon, no development</th><td className={result.noIntervention.uncovered > result.baseline.uncovered ? 'gap-positive' : ''}>{result.noIntervention.uncovered}</td><td>{result.noIntervention.singleHolder}</td></tr>
            <tr><th scope="row">At horizon, with development</th><td>{result.projected.uncovered}</td><td>{result.projected.singleHolder}</td></tr>
          </tbody>
        </table>
      </div>

      {changed.length > 0 && <>
        <h3>Skills that move</h3>
        <ul className="legend" aria-label="Bar legend">
          <li><span className="swatch today" /> Today</li>
          <li><span className="swatch none" /> Without development</li>
          <li><span className="swatch with" /> With development</li>
        </ul>
        <ul>{changed.map((row) => <li key={row.id}>
          <strong>{row.name}</strong> — recorded holders {row.base} today → {row.none} without development → {row.projected} with it
          {row.none === 0 && row.projected > 0 ? <span> · development prevents the loss of coverage</span> : ''}
          <div className="bars" aria-hidden="true">
            {[['today', row.base], ['none', row.none], ['with', row.projected]].map(([kind, value]) => (
              <span key={kind} className={`bar ${kind}`} style={{ width: `${(value / maxHolders) * 100}%` }}>{value}</span>
            ))}
          </div>
        </li>)}</ul>
      </>}
      {changed.length === 0 && <p>No skill changes recorded coverage under this scenario.</p>}

      {result.requirementsApplied.length > 0 && <>
        <h3>Future requirements now in effect</h3>
        <ul>{result.requirementsApplied.map((requirement) => <li key={requirement.skillId ?? requirement.skillName}>
          <strong>{requirement.skillName}</strong> — {requirement.requiredHolders} holders at proficiency {requirement.targetProficiency}+ from month {requirement.effectiveMonth}
        </li>)}</ul>
      </>}

      {result.blocked.length > 0 && <>
        <h3>Blocked development</h3>
        <ul>{result.blocked.map((item, index) => <li key={`${item.employeeId}-${item.skillId}-${index}`}>
          <strong>{employeeName(item.employeeId)} · {skillName(item.skillId)}</strong>
          <div className="gap-positive">{item.reason}</div>
        </li>)}</ul>
      </>}

      {result.capacityWarnings.length > 0 && <>
        <h3>Unverified capacity</h3>
        <ul>{result.capacityWarnings.map((item, index) => <li key={`${item.mentorId}-${item.skillId}-${index}`}>
          <strong>{employeeName(item.mentorId)}</strong> — {item.warning}
        </li>)}</ul>
      </>}

      <details><summary>Assumptions</summary>
        <ul>{result.assumptions.map((assumption, index) => <li key={index}>{assumption}</li>)}</ul>
      </details>
    </div>}
  </>;
}
