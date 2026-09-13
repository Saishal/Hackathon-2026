import { useEffect, useState } from 'react';
import './styles.css';
import Icon, { KeystoneMark } from './components/Icon';
import KeystoneStarter from './components/KeystoneStarter';

// Dashboard shell: sidebar navigation and page header. Views live at hash routes (#/people,
// #/network, …) so a refresh keeps the current view and a view can be linked directly.
// KeystoneStarter owns the data and renders the active view.
const VIEWS = [
  { id: 'overview', icon: 'overview', label: 'Overview',
    description: 'Skills that depend on too few people. Scores measure dependency, not who is likely to leave.' },
  { id: 'people', icon: 'people', label: 'Key people',
    description: 'People whose absence would leave a skill without enough qualified colleagues.' },
  { id: 'network', icon: 'network', label: 'Skill map',
    description: 'Who holds each skill, at what level, and the evidence behind it.' },
  { id: 'timemachine', icon: 'timemachine', label: 'Time Machine',
    description: 'See how coverage changes if people leave or build new skills.' },
  { id: 'ai', icon: 'ai', label: 'AI advisor',
    description: 'Draft development plans and future skill needs. Nothing is saved until a person reviews it.' },
  { id: 'data', icon: 'data', label: 'Data & evidence',
    description: 'The records behind every score, with their source and last verification date.' },
  { id: 'activity', icon: 'activity', label: 'Team activity',
    description: 'Commits from every team branch, newest first.' },
];

const viewFromHash = () => {
  const id = window.location.hash.replace(/^#\/?/, '');
  return VIEWS.some((item) => item.id === id) ? id : 'overview';
};

function App() {
  const [view, setView] = useState(viewFromHash);
  const current = VIEWS.find((item) => item.id === view);

  useEffect(() => {
    const onHashChange = () => {
      setView(viewFromHash());
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  useEffect(() => {
    document.title = view === 'overview' ? 'Keystone' : `${current.label} · Keystone`;
  }, [view, current]);

  const skipToContent = (event) => {
    // A plain #main link would be read as a route, so move focus instead.
    event.preventDefault();
    document.getElementById('main')?.focus();
  };

  return (
    <div className="app">
      <a className="skip-link" href="#main" onClick={skipToContent}>Skip to content</a>
      <aside className="sidebar">
        <a className="brand" href="#/overview">
          <KeystoneMark />
          <span>
            <strong>Keystone</strong>
            <small>Skill coverage</small>
          </span>
        </a>
        <nav aria-label="Views">
          <ul>
            {VIEWS.map((item) => (
              <li key={item.id}>
                <a className="nav-link" href={`#/${item.id}`} aria-current={view === item.id ? 'page' : undefined}>
                  <Icon name={item.icon} /> {item.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <p className="sidebar-note">Scores show how much work depends on a person. They never predict whether someone will leave.</p>
      </aside>

      <main id="main" className="main" tabIndex={-1}>
        <header className="page-head">
          <div>
            <h1>{current.label}</h1>
            <p>{current.description}</p>
          </div>
          <span className="tag tag-warn"><Icon name="info" size={14} /> Fictional demo data</span>
        </header>
        <KeystoneStarter view={view} />
      </main>
    </div>
  );
}

export default App;
