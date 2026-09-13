import { useEffect, useState } from 'react';
import './styles.css';
import { authApi, SIGNED_OUT_EVENT } from './api/keystone';
import { initials } from './components/format';
import Icon, { KeystoneMark } from './components/Icon';
import KeystoneStarter from './components/KeystoneStarter';
import Login from './components/Login';
import { ForbiddenState, LoadingScreen } from './components/ui';
import { SessionContext } from './session';
import { VIEWS, viewLabel } from './views';
import { HelpProvider } from './help/HelpContext';
import { useHelp } from './help/context';
import HelpDrawer from './components/HelpDrawer';
import GlobalSearch from './components/GlobalSearch';

// Header "?" button. A real button, so it is reachable by keyboard and named for screen readers.
// Local demo identity used only when the backend has no auth service (404 on /api/auth/me).
// organization.environment === 'demo' makes the header show the standard "Demo environment" tag.
const DEMO_SESSION = {
  user: { id: 0, name: 'Demo Viewer', role: 'administrator', employeeId: null },
  capabilities: [
    'risk.read.org', 'workforce.read.all', 'scenario.run',
    'ai.development', 'ai.strategy', 'dataQuality.read.org',
    'changes.review.people', 'changes.review.planning', 'changes.submit',
    'audit.read', 'employee.edit', 'users.manage', 'repository.log',
  ],
  organization: { id: 0, name: 'Keystone Demo', environment: 'demo' },
  demo: true,
};

function HelpButton() {
  const { open } = useHelp();
  return (
    <button type="button" className="btn btn-secondary btn-help" onClick={() => open()} aria-haspopup="dialog" title="Help for this page (or press ?)">
      <Icon name="question" size={16} /> Help
    </button>
  );
}

// "?" opens help from anywhere except inside a text field, where the character is being typed.
function HelpShortcut() {
  const { toggle } = useHelp();
  useEffect(() => {
    const onKey = (event) => {
      if (event.key !== '?' || event.ctrlKey || event.metaKey || event.altKey) return;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName) || event.target.isContentEditable) return;
      event.preventDefault();
      toggle();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggle]);
  return null;
}

// App shell: session bootstrap, role-aware navigation and hash routes (#/people, #/data?tab=evidence).
function parseHash() {
  const [path = '', search = ''] = window.location.hash.replace(/^#\/?/, '').split('?');
  return { id: path, params: Object.fromEntries(new URLSearchParams(search)) };
}

function App() {
  const [session, setSession] = useState(undefined);
  const [notice, setNotice] = useState('');
  const [bootError, setBootError] = useState(null);
  const [route, setRoute] = useState(parseHash);

  useEffect(() => {
    let active = true;
    authApi.me()
      .then((me) => { if (active) setSession(me); })
      .catch((error) => {
        if (!active) return;
        // The Keystone backend has no auth service (the unified frontend was
        // adopted from a project that did). When /api/auth/* is missing (404),
        // fall back to a clearly-labeled LOCAL demo session so the app stays
        // explorable — the header shows the standard "Demo environment" tag.
        if (error.status === 404) {
          setSession(DEMO_SESSION);
          setNotice('Demo session — the backend has no auth service, so you are signed in locally with read-only demo identity.');
          return;
        }
        if (error.status !== 401) setBootError(error);
        setSession(null);
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const onHashChange = () => {
      setRoute(parseHash());
      window.scrollTo(0, 0);
    };
    const onSignedOut = () => {
      setSession(null);
      setNotice('Your session ended. Sign in again to continue.');
    };
    window.addEventListener('hashchange', onHashChange);
    window.addEventListener(SIGNED_OUT_EVENT, onSignedOut);
    return () => {
      window.removeEventListener('hashchange', onHashChange);
      window.removeEventListener(SIGNED_OUT_EVENT, onSignedOut);
    };
  }, []);

  const allowed = session ? VIEWS.filter((view) => view.allowed(session)) : [];
  const current = VIEWS.find((view) => view.id === route.id);
  const home = allowed[0];

  useEffect(() => {
    // An empty or unknown address goes to the first page this role can use.
    if (session && home && !current) window.location.replace(`#/${home.id}`);
  }, [session, home, current]);

  useEffect(() => {
    document.title = current && session ? `${viewLabel(current, session)} · Keystone` : 'Keystone';
  }, [current, session]);

  async function signOut() {
    try {
      await authApi.logout();
      setNotice('You signed out.');
    } catch {
      setNotice('You are signed out on this device, but the server could not be reached, so the session ends when it expires.');
    }
    setSession(null);
  }

  const skipToContent = (event) => {
    // A plain #main link would be read as a route, so move focus instead.
    event.preventDefault();
    document.getElementById('main')?.focus();
  };

  if (session === undefined) return <LoadingScreen />;
  if (!session) {
    return <Login notice={notice} bootError={bootError} onSignedIn={(me) => { setNotice(''); setBootError(null); setSession(me); }} />;
  }

  const viewAllowed = Boolean(current) && current.allowed(session);
  const groups = [...new Set(allowed.map((view) => view.group))];

  return (
    <HelpProvider>
    <SessionContext.Provider value={session}>
      <div className="app">
        <a className="skip-link" href="#main" onClick={skipToContent}>Skip to content</a>
        <aside className="sidebar">
          <a className="brand" href={home ? `#/${home.id}` : '#/'}>
            <KeystoneMark />
            <span>
              <strong>Keystone</strong>
              <small>{session.organization.name}</small>
            </span>
          </a>
          <nav aria-label="Pages">
            {groups.map((group) => (
              <div className="nav-section" key={group}>
                <p className="nav-group" id={`nav-${group}`}>{group}</p>
                <ul aria-labelledby={`nav-${group}`}>
                  {allowed.filter((view) => view.group === group).map((view) => (
                    <li key={view.id}>
                      <a className="nav-link" href={`#/${view.id}`} aria-current={route.id === view.id ? 'page' : undefined}>
                        <Icon name={view.icon} /> {viewLabel(view, session)}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
          <div className="user-card">
            <span className="avatar" aria-hidden="true">{initials(session.user.displayName)}</span>
            <span className="user-meta">
              <strong>{session.user.displayName}</strong>
              <small>{session.user.roleLabel}</small>
            </span>
            <button type="button" className="btn-icon btn-signout" onClick={signOut} aria-label="Sign out" title="Sign out">
              <Icon name="logout" size={18} />
            </button>
          </div>
        </aside>

        <main id="main" className="main" tabIndex={-1}>
          <div className="main-topbar">
            <GlobalSearch />
          </div>
          {current && (
            <header className="page-head">
              <div>
                <h1>{viewLabel(current, session)}</h1>
                <p>{current.description}</p>
              </div>
              <div className="page-head-actions">
                {session.organization.environment === 'demo' && (
                  <span className="tag tag-warn"><Icon name="info" size={14} /> Demo environment · fictional data</span>
                )}
                <HelpButton />
              </div>
            </header>
          )}
          {current && (viewAllowed
            ? <KeystoneStarter view={current.id} params={route.params} />
            : <ForbiddenState roleLabel={session.user.roleLabel} homeHref={home ? `#/${home.id}` : null} />)}
        </main>
      </div>
      <HelpShortcut />
      <HelpDrawer view={current?.id} />
    </SessionContext.Provider>
    </HelpProvider>
  );
}

export default App;
