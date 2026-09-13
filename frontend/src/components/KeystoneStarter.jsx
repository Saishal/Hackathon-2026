import { useCallback, useEffect, useState } from 'react';
import { keystoneApi } from '../api/keystone';
import { useSession } from '../session';
import { isViewAllowed } from '../views';
import ActivityLog from './ActivityLog';
import AIWorkbench from './AIWorkbench';
import AuditLog from './AuditLog';
import DataQuality from './DataQuality';
import { can } from './format';
import KeystonePeople from './KeystonePeople';
import MyProfile from './MyProfile';
import Overview from './Overview';
import ReviewQueue from './ReviewQueue';
import SkillNetwork from './SkillNetwork';
import TimeMachine from './TimeMachine';
import { ErrorState, Skeleton } from './ui';
import UsersAdmin from './UsersAdmin';
import WorkforceSnapshot from './WorkforceSnapshot';

const NEEDS_WORKFORCE = new Set(['overview', 'people', 'network', 'timemachine', 'ai', 'data']);

// Loads the data each role may read and renders the active view. It stays mounted across views, so
// development scheduled from the AI advisor is still there in Time Machine. There is no offline sample
// mode: every number comes from the server under the signed-in user's permissions.
export default function KeystoneStarter({ view, params }) {
  const session = useSession();
  const canReadWorkforce = can(session, 'workforce.read.all', 'workforce.read.team', 'workforce.read.self');
  const canReadRisk = can(session, 'risk.read.org', 'risk.read.team');
  const canReadQuality = can(session, 'dataQuality.read.org', 'dataQuality.read.team');

  const [workforce, setWorkforce] = useState(null);
  const [risks, setRisks] = useState(null);
  const [organization, setOrganization] = useState(null);
  const [quality, setQuality] = useState(null);
  const [error, setError] = useState(null);
  const [interventions, setInterventions] = useState([]);

  const loadWorkforce = useCallback(async () => {
    setError(null);
    try {
      const [data, analysis, org] = await Promise.all([
        canReadWorkforce ? keystoneApi.workforce() : null,
        canReadRisk ? keystoneApi.risks() : null,
        keystoneApi.organization(),
      ]);
      setWorkforce(data);
      setRisks(analysis);
      setOrganization(org);
    } catch (failure) {
      setError(failure);
    }
  }, [canReadWorkforce, canReadRisk]);

  const loadQuality = useCallback(async () => {
    if (!canReadQuality) return;
    try {
      setQuality(await keystoneApi.dataQuality());
    } catch (failure) {
      setQuality({ error: failure });
    }
  }, [canReadQuality]);

  useEffect(() => {
    loadWorkforce();
    loadQuality();
  }, [loadWorkforce, loadQuality]);

  // After an approval or other official change, scores, records and data quality all refresh together.
  const refreshAll = useCallback(() => Promise.all([loadWorkforce(), loadQuality()]), [loadWorkforce, loadQuality]);
  const canOpen = (id) => isViewAllowed(session, id);
  const schedule = (item) => setInterventions((current) => [...current, item]);

  let content;
  if (view === 'activity') content = <ActivityLog />;
  else if (view === 'quality') content = <DataQuality session={session} canOpen={canOpen} onChanged={refreshAll} />;
  else if (view === 'reviews') content = <ReviewQueue workforce={workforce} onChanged={refreshAll} />;
  else if (view === 'audit') content = <AuditLog workforce={workforce} />;
  else if (view === 'profile') content = <MyProfile onChanged={refreshAll} />;
  else if (view === 'users') content = <UsersAdmin workforce={workforce} onOrganizationChanged={loadWorkforce} />;
  else if (error) content = <ErrorState error={error} onRetry={loadWorkforce} />;
  else if (NEEDS_WORKFORCE.has(view) && !workforce) content = <div className="panel"><Skeleton lines={6} /></div>;
  else if (view === 'overview') content = <Overview risks={risks} quality={quality} organization={organization} onChanged={refreshAll} />;
  else if (view === 'people') content = <KeystonePeople quality={quality} params={params} />;
  else if (view === 'network') content = <SkillNetwork workforce={workforce} risks={risks} params={params} />;
  else if (view === 'timemachine') {
    content = <TimeMachine workforce={workforce} interventions={interventions} onInterventionsChange={setInterventions} params={params} />;
  } else if (view === 'ai') content = <AIWorkbench workforce={workforce} onRequirementsSaved={refreshAll} onSchedule={schedule} />;
  else if (view === 'data') content = <WorkforceSnapshot workforce={workforce} quality={quality} params={params} onChanged={refreshAll} />;

  // Following a link to another record on the same page (#/data?tab=people&q=…) remounts the view so it
  // opens on that record.
  const linkKey = ['data', 'people', 'network'].includes(view) ? `${view}?${new URLSearchParams(params)}` : view;
  return <div className="view" key={linkKey}>{content}</div>;
}
