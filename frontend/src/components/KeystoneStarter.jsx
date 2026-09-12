import { useEffect, useState } from 'react';
import { keystoneApi } from '../api/keystone';

export default function KeystoneStarter() {
  const [workforce, setWorkforce] = useState(null);
  const [risks, setRisks] = useState(null);
  const [employeeId, setEmployeeId] = useState('');
  const [horizonMonths, setHorizonMonths] = useState(12);
  const [result, setResult] = useState(null);
  const [direction, setDirection] = useState('');
  const [strategy, setStrategy] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    Promise.all([keystoneApi.workforce(), keystoneApi.risks()]).then(([data, analysis]) => {
      if (active) { setWorkforce(data); setRisks(analysis); }
    }).catch((err) => { if (active) setError(err.message); });
    return () => { active = false; };
  }, []);
  async function run(action) {
    setBusy(true); setError('');
    try { await action(); } catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  return <section className="panel">
    <h2>Keystone foundation</h2>
    <p>Demo data · Organizational dependency, not an employee departure prediction.</p>
    {error && <p role="alert">{error}</p>}
    {risks && <>
      <p><strong>{risks.singleHolder}</strong> single-holder skills · <strong>{risks.uncovered}</strong> skills without recorded independent coverage</p>
      <ul>{risks.skills.slice(0, 3).map((skill) => <li key={skill.id}><strong>{skill.name}</strong> — Bus Factor {skill.busFactor}, Keystone Score {skill.keystoneScore}/100. {skill.explanation}</li>)}</ul>
    </>}
    <h3>Time Machine — starter</h3>
    <label>Simulated departure at month 1 <select value={employeeId} onChange={(event) => setEmployeeId(event.target.value)}>
      <option value="">No departure</option>
      {workforce?.employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}
    </select></label>{' '}
    <label>Horizon <select value={horizonMonths} onChange={(event) => setHorizonMonths(Number(event.target.value))}>
      <option value={0}>Baseline</option><option value={12}>1 year</option><option value={36}>3 years</option><option value={60}>5 years</option>
    </select></label>{' '}
    <button disabled={busy || !workforce} onClick={() => run(async () => setResult(await keystoneApi.simulate({ horizonMonths,
      departures: employeeId ? [{ employeeId: Number(employeeId), month: 1 }] : [], interventions: [] })))}>Compare scenario</button>
    {result && <p>Projected uncovered skills: {result.baseline.uncovered} → {result.projected.uncovered}. Assumes only the selected departure; verified baseline stays unchanged.</p>}
    <h3>Strategic direction — integration boundary</h3>
    <form onSubmit={(event) => { event.preventDefault(); run(async () => setStrategy(await keystoneApi.strategy(direction))); }}>
      <label>Business direction <input value={direction} maxLength={2000} onChange={(event) => setDirection(event.target.value)} placeholder="We are expanding into e-commerce" /></label>{' '}
      <button disabled={busy || !direction.trim()}>Request proposed skills</button>
    </form>
    {strategy && <p>{strategy.message}</p>}
  </section>;
}
