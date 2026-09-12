import { useEffect, useState } from 'react';
import { keystoneApi } from '../api/keystone';
import AIWorkbench from './AIWorkbench';
import KeystonePeople from './KeystonePeople';
import TimeMachine from './TimeMachine';
import WorkforceSnapshot from './WorkforceSnapshot';
// Vendored from Member 1's docs/samples (frontend/src/data/). Used ONLY when
// the backend is unreachable — every screen carries a DEMO DATA label so
// sample numbers are never mistaken for live analysis.
import demoWorkforce from '../data/workforce.json';
import demoRisks from '../data/risks.json';
import demoFutureRequirements from '../data/future-requirements.json';

export default function KeystoneStarter() {
  const [workforce, setWorkforce] = useState(null);
  const [risks, setRisks] = useState(null);
  const [demoMode, setDemoMode] = useState(false);
  const [error, setError] = useState('');
  async function refresh() {
    const [data, analysis] = await Promise.all([keystoneApi.workforce(), keystoneApi.risks()]);
    setWorkforce(data); setRisks(analysis); setDemoMode(false);
  }
  useEffect(() => {
    let active = true;
    Promise.all([keystoneApi.workforce(), keystoneApi.risks()]).then(([data, analysis]) => {
      if (active) { setWorkforce(data); setRisks(analysis); }
    }).catch((err) => {
      if (!active) return;
      // Offline/demo fallback: labeled sample data, never presented as live.
      setWorkforce(demoWorkforce);
      setRisks(demoRisks);
      setDemoMode(true);
      setError(err.message);
    });
    return () => { active = false; };
  }, []);
  return <section className="panel">
    <h2>Keystone foundation</h2>
    <p>Demo data · Organizational dependency, not an employee departure prediction.</p>
    {demoMode && <p className="demo-banner" role="status">
      DEMO DATA — backend unreachable ({error}). Rendering Member 1's labeled sample payloads; live endpoints are disabled.
    </p>}
    {!demoMode && error && <p role="alert">{error}</p>}
    {risks && <>
      <p><strong>{risks.singleHolder}</strong> single-holder skills · <strong>{risks.uncovered}</strong> skills without recorded independent coverage</p>
      <ul>{risks.skills.slice(0, 3).map((skill) => <li key={skill.id}><strong>{skill.name}</strong> — Bus Factor {skill.busFactor}, Keystone Score {skill.keystoneScore}/100. {skill.explanation}</li>)}</ul>
    </>}
    {workforce && <WorkforceSnapshot workforce={workforce} fallbackRequirements={demoMode ? demoFutureRequirements : null} />}
    <KeystonePeople />
    <TimeMachine workforce={workforce} />
    <AIWorkbench workforce={workforce} onRequirementsSaved={refresh} />
  </section>;
}
