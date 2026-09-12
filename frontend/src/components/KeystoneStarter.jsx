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

// view: 'overview' | 'people' | 'timemachine' | 'ai' | 'data'
// The dashboard shell (App.jsx) owns navigation; this component owns the data
// and renders the section for the active view.
export default function KeystoneStarter({ view = 'overview', embedded = false }) {
  const [workforce, setWorkforce] = useState(null);
  const [risks, setRisks] = useState(null);
  const [demoMode, setDemoMode] = useState(false);
  const [error, setError] = useState('');
  // Reloads after the AI workbench saves reviewed requirements, so Time Machine and the
  // snapshot see the new stable skill IDs without a page refresh.
  async function refresh() {
    const [data, analysis] = await Promise.all([keystoneApi.workforce(), keystoneApi.risks()]);
    setWorkforce(data); setRisks(analysis);
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

  // List every single-holder or uncovered skill the headline counts; a fixed top three hid
  // skills tied on score.
  const concentrated = risks?.skills.filter((skill) => skill.busFactor <= 1) ?? [];
  const summary = risks && <>
    <p><strong>{risks.singleHolder}</strong> single-holder skills · <strong>{risks.uncovered}</strong> skills without recorded independent coverage</p>
    <ul>{(concentrated.length ? concentrated : risks.skills.slice(0, 3)).map((skill) => <li key={skill.id}><strong>{skill.name}</strong> — Bus Factor {skill.busFactor}, Keystone Score {skill.keystoneScore}/100. {skill.explanation}</li>)}</ul>
  </>;
  const onRequirementsSaved = demoMode ? undefined : refresh;

  if (embedded) {
    return (
      <div>
        {demoMode && <p className="demo-banner" role="status">
          DEMO DATA — backend unreachable ({error}). Rendering Member 1's labeled sample payloads; live endpoints are disabled.
        </p>}
        {!demoMode && error && <p role="alert">{error}</p>}
        {view === 'overview' && summary}
        {view === 'people' && <KeystonePeople />}
        {view === 'timemachine' && <TimeMachine workforce={workforce} />}
        {view === 'ai' && <AIWorkbench workforce={workforce} onRequirementsSaved={onRequirementsSaved} />}
        {view === 'data' && workforce && <WorkforceSnapshot workforce={workforce} fallbackRequirements={demoMode ? demoFutureRequirements : null} />}
      </div>
    );
  }

  // Standalone fallback (kept for direct component use)
  return <section className="panel">
    <h2>Keystone foundation</h2>
    <p>Demo data · Organizational dependency, not an employee departure prediction.</p>
    {demoMode && <p className="demo-banner" role="status">DEMO DATA — backend unreachable.</p>}
    {summary}
    <WorkforceSnapshot workforce={workforce} fallbackRequirements={demoMode ? demoFutureRequirements : null} />
    <KeystonePeople />
    <TimeMachine workforce={workforce} />
    <AIWorkbench workforce={workforce} onRequirementsSaved={onRequirementsSaved} />
  </section>;
}
