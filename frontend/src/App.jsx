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
          {current && (
            <header className="page-head">
              <div>
                <h1>{viewLabel(current, session)}</h1>
                <p>{current.description}</p>
              </div>
              {session.organization.environment === 'demo' && (
                <span className="tag tag-warn"><Icon name="info" size={14} /> Demo environment · fictional data</span>
              )}
            </header>
          )}
          {current && (viewAllowed
            ? <KeystoneStarter view={current.id} params={route.params} />
            : <ForbiddenState roleLabel={session.user.roleLabel} homeHref={home ? `#/${home.id}` : null} />)}
        </main>
      </div>
    </SessionContext.Provider>
  );
}

export default App;
