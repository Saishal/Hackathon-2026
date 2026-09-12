import { useEffect, useState } from 'react';
import './App.css';
import './views.css';
import { keystoneApi } from './api/keystone';
import KeystoneStarter from './components/KeystoneStarter';
import ActivityLog from './components/ActivityLog';
import demoRisks from './data/risks.json';

// Dashboard shell — sidebar navigation in the style of the Certific template
// (dark SaaS dashboard), trimmed to exactly the views Keystone needs:
// Overview, People & Risk, Skill Network, Time Machine, AI Advisor, Workforce Data, Activity.

const NAV = [
  ['overview', '📊', 'Overview'],
  ['people', '👥', 'People & Risk'],
  ['network', '🕸️', 'Skill Network'],
  ['timemachine', '⏳', 'Time Machine'],
  ['ai', '🤖', 'AI Advisor'],
  ['data', '🗂️', 'Workforce Data'],
  ['activity', '📜', 'Activity Log'],
];

const pageTitles = {
  overview: 'Dashboard overview', people: 'People your coverage depends on',
  network: 'Employee-skill network',
  timemachine: 'Workforce Time Machine', ai: 'AI development advisor',
  data: 'Workforce data & evidence', activity: 'Team activity log',
};

function App() {
  const [view, setView] = useState('overview');
  const [risks, setRisks] = useState(null);
  const [demoMode, setDemoMode] = useState(false);

  useEffect(() => {
    let active = true;
    keystoneApi.risks()
      .then((data) => { if (active) setRisks(data); })
      .catch(() => { if (active) { setRisks(demoRisks); setDemoMode(true); } });
    return () => { active = false; };
  }, []);

  const topRisk = risks?.skills?.[0];
  const kpis = risks ? [
    { label: 'Single-holder skills', value: risks.singleHolder, delta: 'only one person can do it', tone: 'critical' },
    { label: 'Uncovered skills', value: risks.uncovered, delta: 'no recorded independent coverage', tone: 'critical' },
    { label: 'Skills tracked', value: risks.skills.length, delta: 'in the workforce inventory', tone: 'neutral' },
    { label: 'Top dependency', value: topRisk ? `${topRisk.keystoneScore}/100` : '—', delta: topRisk?.name ?? '', tone: 'warn' },
  ] : [];

  return (
    <div className="dash">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">🗝️</span>
          <div>
            <strong>Keystone</strong>
            <small>Talent readiness</small>
          </div>
        </div>
        <nav>
          <p className="nav-group">Platform</p>
          {NAV.map(([key, icon, label]) => (
            <button key={key} className={`nav-item ${view === key ? 'active' : ''}`} onClick={() => setView(key)}>
              <span className="nav-icon">{icon}</span> {label}
            </button>
          ))}
        </nav>
        <div className="sidebar-card">
          <div className="member-badge" style={{ background: '#059669' }}>Member 3</div>
          <strong>Frontend &amp; integration</strong>
          <small>Auto-sync every 5 min · branch feature/keystone-ui</small>
        </div>
      </aside>

      <main className="content">
        <header className="topbar">
          <div>
            <h1>{pageTitles[view]}</h1>
            <p>{new Date().toLocaleDateString(undefined, { month: 'long', year: 'numeric' })} · Organizational dependency, not a departure prediction</p>
          </div>
          {demoMode && <span className="demo-pill">DEMO DATA</span>}
        </header>

        {view === 'overview' && (
          <>
            <div className="kpi-grid">
              {kpis.map((kpi) => (
                <article key={kpi.label} className={`kpi-card ${kpi.tone}`}>
                  <p className="kpi-label">{kpi.label}</p>
                  <p className="kpi-value">{kpi.value}</p>
                  <p className="kpi-delta">{kpi.delta}</p>
                </article>
              ))}
            </div>
            <section className="panel">
              <h2>Risk summary</h2>
              {risks && <KeystoneStarter view="overview" embedded />}
            </section>
          </>
        )}

        {view !== 'overview' && view !== 'activity' && <KeystoneStarter view={view} embedded />}
        {view === 'activity' && (
          <section className="panel">
            <h2>Activity Log</h2>
            <ActivityLog />
          </section>
        )}
      </main>
    </div>
  );
}

export default App;
