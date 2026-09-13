import { useEffect, useState } from 'react';
import './App.css';
import './views.css';
import { keystoneApi } from './api/keystone';
import KeystoneStarter from './components/KeystoneStarter';
import ActivityLog from './components/ActivityLog';
import HelpPanel from './components/HelpPanel';
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

const VIEW_KEYS = new Set(NAV.map(([key]) => key));

const pageTitles = {
  overview: 'Dashboard overview', people: 'People your coverage depends on',
  network: 'Employee-skill network',
  timemachine: 'Workforce Time Machine', ai: 'AI development advisor',
  data: 'Workforce data & evidence', activity: 'Team activity log',
};

// One plain-language sentence per view, so a first-time user knows what the screen is for
// before reading any numbers.
const pageIntros = {
  overview: 'Where knowledge is concentrated in too few people. Start here, then open a section for detail.',
  people: 'The people the organisation depends on most: if they left, which skills would have nobody left who can do them.',
  network: 'Who holds which skill, drawn as a map. Red skills have nobody qualified; amber skills rest on one person.',
  timemachine: 'Ask "what if": model someone leaving, plan mentoring for a replacement, and see whether coverage survives.',
  ai: 'Get a reviewable development plan for a skill, or describe a business direction and see which skills it will need.',
  data: 'The evidence behind every number: proficiencies, requirements, roles, the learning catalogue, and where each value came from.',
  activity: 'What the team has changed in the codebase, generated from git history.',
};

// The URL hash is the source of truth for the active view, so each section has its own
// address, refresh keeps you where you were, and the browser back button works.
const viewFromHash = () => {
  const key = window.location.hash.replace(/^#\/?/, '');
  return VIEW_KEYS.has(key) ? key : 'overview';
};

function App() {
  const [view, setViewState] = useState(viewFromHash);
  const [switching, setSwitching] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [risks, setRisks] = useState(null);
  const [demoMode, setDemoMode] = useState(false);

  const setView = (key) => {
    if (key === view) return;
    window.location.assign(`#/${key}`);
  };

  useEffect(() => {
    const onHashChange = () => {
      const next = viewFromHash();
      setSwitching(true);
      setViewState(next);
    };
    window.addEventListener('hashchange', onHashChange);
    if (!window.location.hash) window.history.replaceState(null, '', '#/overview');
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  // A short transition on every view change: the previous content fades out, the new
  // content fades in. Components are never unmounted, so nothing the user entered is lost.
  useEffect(() => {
    if (!switching) return undefined;
    const timer = setTimeout(() => setSwitching(false), 280);
    return () => clearTimeout(timer);
  }, [switching, view]);

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') setHelpOpen(false);
      if (event.key === '?' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName)) setHelpOpen((open) => !open);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

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
        <nav aria-label="Sections">
          <p className="nav-group">Platform</p>
          {NAV.map(([key, icon, label]) => (
            <a key={key} href={`#/${key}`} className={`nav-item ${view === key ? 'active' : ''}`}
              aria-current={view === key ? 'page' : undefined} onClick={(event) => { event.preventDefault(); setView(key); }}>
              <span className="nav-icon">{icon}</span> {label}
            </a>
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
            <p className="page-intro">{pageIntros[view]}</p>
            <p>{new Date().toLocaleDateString(undefined, { month: 'long', year: 'numeric' })} · Organizational dependency, not a departure prediction</p>
          </div>
          <div className="topbar-actions">
            {demoMode && <span className="demo-pill">DEMO DATA</span>}
            <button type="button" className="help-button" onClick={() => setHelpOpen(true)}
              aria-haspopup="dialog" aria-expanded={helpOpen} title="Help for this screen (press ?)">
              <span aria-hidden="true">?</span> Help
            </button>
          </div>
        </header>

        <div className={`view-host ${switching ? 'view-switching' : 'view-ready'}`} aria-busy={switching}>
          {switching && <div className="view-loading" role="status" aria-live="polite">
            <span className="spinner" aria-hidden="true" /> Loading {pageTitles[view]}…
          </div>}

          {view === 'overview' && (
            <div className="kpi-grid">
              {kpis.map((kpi) => (
                <article key={kpi.label} className={`kpi-card ${kpi.tone}`}>
                  <p className="kpi-label">{kpi.label}</p>
                  <p className="kpi-value">{kpi.value}</p>
                  <p className="kpi-delta">{kpi.delta}</p>
                </article>
              ))}
            </div>
          )}

          {/* One instance for every view. Sections stay mounted while hidden, so a scenario
              built in the Time Machine is still there after visiting another screen. */}
          <section className="panel" hidden={view === 'activity'}>
            {view === 'overview' && <h2>Risk summary</h2>}
            <KeystoneStarter view={view} embedded />
          </section>

          <section className="panel" hidden={view !== 'activity'}>
            <h2>Activity Log</h2>
            <ActivityLog />
          </section>
        </div>
      </main>

      <HelpPanel view={view} open={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  );
}

export default App;
