import { useEffect, useState } from 'react';
import { keystoneApi } from '../api/keystone';
import AIWorkbench from './AIWorkbench';
import KeystonePeople from './KeystonePeople';
import TimeMachine from './TimeMachine';

export default function KeystoneStarter() {
  const [workforce, setWorkforce] = useState(null);
  const [risks, setRisks] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    Promise.all([keystoneApi.workforce(), keystoneApi.risks()]).then(([data, analysis]) => {
      if (active) { setWorkforce(data); setRisks(analysis); }
    }).catch((err) => { if (active) setError(err.message); });
    return () => { active = false; };
  }, []);
  return <section className="panel">
    <h2>Keystone foundation</h2>
    <p>Demo data · Organizational dependency, not an employee departure prediction.</p>
    {error && <p role="alert">{error}</p>}
    {risks && <>
      <p><strong>{risks.singleHolder}</strong> single-holder skills · <strong>{risks.uncovered}</strong> skills without recorded independent coverage</p>
      <ul>{risks.skills.slice(0, 3).map((skill) => <li key={skill.id}><strong>{skill.name}</strong> — Bus Factor {skill.busFactor}, Keystone Score {skill.keystoneScore}/100. {skill.explanation}</li>)}</ul>
    </>}
    <KeystonePeople />
    <TimeMachine workforce={workforce} />
    <AIWorkbench workforce={workforce} />
  </section>;
}
