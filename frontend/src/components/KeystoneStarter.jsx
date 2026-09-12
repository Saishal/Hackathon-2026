import { useEffect, useState } from 'react';
import { keystoneApi } from '../api/keystone';
import AIWorkbench from './AIWorkbench';
import KeystonePeople from './KeystonePeople';
import TimeMachine from './TimeMachine';

export default function KeystoneStarter() {
  const [workforce, setWorkforce] = useState(null);
  const [risks, setRisks] = useState(null);
  const [error, setError] = useState('');
  async function refresh() {
    const [data, analysis] = await Promise.all([keystoneApi.workforce(), keystoneApi.risks()]);
    setWorkforce(data); setRisks(analysis);
  }
  useEffect(() => {
    let active = true;
    Promise.all([keystoneApi.workforce(), keystoneApi.risks()]).then(([data, analysis]) => {
      if (active) { setWorkforce(data); setRisks(analysis); }
    }).catch((err) => { if (active) setError(err.message); });
    return () => { active = false; };
  }, []);
  // List every single-holder or uncovered skill the headline counts; a fixed top three hid
  // skills tied on score.
  const concentrated = risks?.skills.filter((skill) => skill.busFactor <= 1) ?? [];
  return <section className="panel">
    <h2>Keystone foundation</h2>
    <p>Demo data · Organizational dependency, not an employee departure prediction.</p>
    {error && <p role="alert">{error}</p>}
    {risks && <>
      <p><strong>{risks.singleHolder}</strong> single-holder skills · <strong>{risks.uncovered}</strong> skills without recorded independent coverage</p>
      <ul>{(concentrated.length ? concentrated : risks.skills.slice(0, 3)).map((skill) => <li key={skill.id}><strong>{skill.name}</strong> — Bus Factor {skill.busFactor}, Keystone Score {skill.keystoneScore}/100. {skill.explanation}</li>)}</ul>
    </>}
    <KeystonePeople />
    <TimeMachine workforce={workforce} />
    <AIWorkbench workforce={workforce} onRequirementsSaved={refresh} />
  </section>;
}
