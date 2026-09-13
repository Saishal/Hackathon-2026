import { useEffect } from 'react';
import Icon from './Icon';
import { GLOSSARY, TASKS, VIEW_HELP, guideHref } from '../help/content';
import { VIEWS, viewLabel } from '../views';
import { useSession } from '../session';

// The "How Keystone works" page at #/help. Deep links (#/help?topic=keystone-score) scroll to and
// highlight one entry, so every contextual help button and every glossary cross-reference has a
// permanent address a colleague can be sent.
export default function HelpGuide({ params }) {
  const session = useSession();
  const topic = params?.topic ?? null;

  useEffect(() => {
    if (!topic) return;
    const node = document.getElementById(`guide-${topic}`);
    if (node) {
      node.scrollIntoView({ block: 'start' });
      node.focus({ preventScroll: true });
    }
  }, [topic]);

  const pages = VIEWS.filter((view) => view.id !== 'help' && view.allowed(session));

  return (
    <div className="help-guide">
      <nav className="panel help-guide-nav" aria-label="Guide contents">
        <h2>Contents</h2>
        <ol>
          <li><a href="#guide-what">What Keystone is for</a></li>
          <li><a href="#guide-terms">Terms</a>
            <ul>{Object.entries(GLOSSARY).map(([id, entry]) => <li key={id}><a href={guideHref(id)}>{entry.term}</a></li>)}</ul>
          </li>
          <li><a href="#guide-tasks">How to</a>
            <ul>{Object.entries(TASKS).map(([id, task]) => <li key={id}><a href={guideHref(id)}>{task.title}</a></li>)}</ul>
          </li>
          <li><a href="#guide-pages">Pages</a></li>
        </ol>
      </nav>

      <div className="help-guide-body">
        <section className="panel" id="guide-what" aria-labelledby="guide-what-h">
          <h2 id="guide-what-h">What Keystone is for</h2>
          <p>Keystone answers one question: <strong>if this person were away tomorrow, what would break?</strong> It finds skills that depend on too few people, ranks them, shows who could step in, and lets you test a plan before committing to it.</p>
          <p>Three rules hold everywhere. Every number comes from <em>recorded evidence</em>, never from a guess. A proposal changes nothing until a person approves it. And a scenario is a "what if" — it never touches official data.</p>
        </section>

        <section className="panel" id="guide-terms" aria-labelledby="guide-terms-h">
          <h2 id="guide-terms-h">Terms</h2>
          {Object.entries(GLOSSARY).map(([id, entry]) => (
            <article key={id} id={`guide-${id}`} tabIndex={-1} className={`help-entry ${topic === id ? 'help-entry-current' : ''}`}>
              <h3>{entry.term}</h3>
              <p className="help-short">{entry.short}</p>
              {entry.long.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
              {entry.related.length > 0 && (
                <p className="help-links">Related: {entry.related.map((related, index) => (
                  <span key={related}>{index > 0 && ', '}<a href={guideHref(related)}>{GLOSSARY[related]?.term ?? TASKS[related]?.title ?? related}</a></span>
                ))}</p>
              )}
            </article>
          ))}
        </section>

        <section className="panel" id="guide-tasks" aria-labelledby="guide-tasks-h">
          <h2 id="guide-tasks-h">How to</h2>
          {Object.entries(TASKS).map(([id, task]) => (
            <article key={id} id={`guide-${id}`} tabIndex={-1} className={`help-entry ${topic === id ? 'help-entry-current' : ''}`}>
              <h3>{task.title}</h3>
              <p className="help-short">{task.intro}</p>
              <ol className="help-steps">{task.steps.map((step, index) => <li key={index}>{step}</li>)}</ol>
              <p className="help-links">
                {task.view && <a className="btn btn-secondary btn-small" href={`#/${task.view}`}><Icon name="arrow" size={14} /> Open the page</a>}
                {task.related.length > 0 && <> Related: {task.related.map((related, index) => (
                  <span key={related}>{index > 0 && ', '}<a href={guideHref(related)}>{GLOSSARY[related]?.term ?? related}</a></span>
                ))}</>}
              </p>
            </article>
          ))}
        </section>

        <section className="panel" id="guide-pages" aria-labelledby="guide-pages-h">
          <h2 id="guide-pages-h">Pages you can open</h2>
          <dl className="help-pages">
            {pages.map((view) => (
              <div key={view.id}>
                <dt><a href={`#/${view.id}`}><Icon name={view.icon} size={14} /> {viewLabel(view, session)}</a></dt>
                <dd>{VIEW_HELP[view.id]?.purpose ?? view.description}</dd>
              </div>
            ))}
          </dl>
          <p className="muted small">Pages are shown according to your role. The server enforces the same permissions on every request.</p>
        </section>
      </div>
    </div>
  );
}
