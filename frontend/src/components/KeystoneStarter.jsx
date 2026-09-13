import { useEffect, useState } from 'react';
import { keystoneApi } from '../api/keystone';
import ActivityLog from './ActivityLog';
import AIWorkbench from './AIWorkbench';
import Icon from './Icon';
import KeystonePeople from './KeystonePeople';
import Overview from './Overview';
import SkillNetwork from './SkillNetwork';
import TimeMachine from './TimeMachine';
import WorkforceSnapshot from './WorkforceSnapshot';
import { Skeleton } from './ui';
// Vendored from Member 1's docs/samples (frontend/src/data/). Used ONLY when the backend is
// unreachable, and the offline banner says so, so sample numbers are never mistaken for live analysis.
import demoWorkforce from '../data/workforce.json';
import demoRisks from '../data/risks.json';
import demoFutureRequirements from '../data/future-requirements.json';

// view: 'overview' | 'people' | 'network' | 'timemachine' | 'ai' | 'data' | 'activity'
// The shell (App.jsx) owns navigation; this component owns the data and renders the active view.
// It stays mounted across views, so development scheduled from the AI advisor is still there in
// Time Machine.
export default function KeystoneStarter({ view = 'overview' }) {
  const [workforce, setWorkforce] = useState(null);
  const [risks, setRisks] = useState(null);
  const [demoMode, setDemoMode] = useState(false);
  const [error, setError] = useState('');
  const [interventions, setInterventions] = useState([]);

  // Reloads after the AI advisor saves reviewed requirements, so Time Machine and the data view
  // see the new stable skill IDs without a page refresh.
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
      // Offline fallback: labeled sample data, never presented as live.
      setWorkforce(demoWorkforce);
      setRisks(demoRisks);
      setDemoMode(true);
      setError(err.message);
    });
    return () => { active = false; };
  }, []);

  const loading = !workforce || !risks;
  const schedule = (item) => setInterventions((current) => [...current, item]);

  let content;
  if (view === 'activity') content = <ActivityLog />;
  else if (loading) content = <div className="panel"><Skeleton lines={6} /></div>;
  else if (view === 'overview') content = <Overview risks={risks} />;
  else if (view === 'people') content = <KeystonePeople />;
  else if (view === 'network') content = <SkillNetwork workforce={workforce} risks={risks} />;
  else if (view === 'timemachine') content = <TimeMachine workforce={workforce} interventions={interventions} onInterventionsChange={setInterventions} />;
  else if (view === 'ai') content = <AIWorkbench workforce={workforce} onRequirementsSaved={demoMode ? undefined : refresh} onSchedule={schedule} />;
  else if (view === 'data') content = <WorkforceSnapshot workforce={workforce} fallbackRequirements={demoMode ? demoFutureRequirements : null} />;

  return (
    <>
      {demoMode && (
        <div className="banner" role="status">
          <Icon name="alert" />
          <p>
            <strong>Offline sample.</strong> The backend isn't reachable ({error}), so Keystone is showing its bundled
            sample data. Simulations, AI drafts and saving are unavailable.
          </p>
        </div>
      )}
      <div className="view" key={view}>{content}</div>
    </>
  );
}
