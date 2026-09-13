import { useEffect, useRef } from 'react';
import Dialog from './Dialog';
import Icon from './Icon';
import { GLOSSARY, TASKS, VIEW_HELP, guideHref, topicFor } from '../help/content';
import { useSession } from '../session';
import { isViewAllowed } from '../views';
import { useHelp } from '../help/context';

// Side drawer opened by the header "?" or any contextual HelpTopic button. Reuses Dialog, so focus
// moves inside, Tab stays inside, Escape closes and focus returns to the button that opened it.
// When opened on a specific topic, that entry is shown first and announced to screen readers.

function TermCard({ id, highlighted }) {
  const entry = GLOSSARY[id];
  if (!entry) return null;
  return (
    <article className={`help-card ${highlighted ? 'help-card-current' : ''}`} id={`help-${id}`} aria-current={highlighted ? 'true' : undefined}>
      <h4>{entry.term}</h4>
      <p className="help-short">{entry.short}</p>
      {highlighted && entry.long.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
      <p className="help-links">
        <a href={guideHref(id)}>Read in the guide</a>
        {entry.related.length > 0 && <> · Related: {entry.related.map((related, index) => (
          <span key={related}>{index > 0 && ', '}<a href={guideHref(related)}>{GLOSSARY[related]?.term ?? related}</a></span>
        ))}</>}
      </p>
    </article>
  );
}

function TaskCard({ id, highlighted }) {
  const session = useSession();
  const task = TASKS[id];
  if (!task) return null;
  return (
    <article className={`help-card ${highlighted ? 'help-card-current' : ''}`} id={`help-${id}`} aria-current={highlighted ? 'true' : undefined}>
      <h4>{task.title}</h4>
      <p className="help-short">{task.intro}</p>
      {highlighted && <ol className="help-steps">{task.steps.map((step, index) => <li key={index}>{step}</li>)}</ol>}
      <p className="help-links">
        <a href={guideHref(id)}>Read in the guide</a>
        {task.view && isViewAllowed(session, task.view) && <> · <a href={`#/${task.view}`}>Open the page</a></>}
      </p>
    </article>
  );
}

export default function HelpDrawer({ view }) {
  const { state, close } = useHelp();
  const live = useRef(null);
  const current = topicFor(state.topic);
  const viewHelp = VIEW_HELP[view] ?? VIEW_HELP.overview;

  useEffect(() => {
    if (!state.open) return;
    // Bring the requested topic into view once the drawer has rendered.
    const node = state.topic ? document.getElementById(`help-${state.topic}`) : null;
    node?.scrollIntoView({ block: 'start' });
  }, [state.open, state.topic]);

  if (!state.open) return null;

  const title = current ? (current.term ?? current.title) : 'Help';
  const description = current ? (current.short ?? current.intro) : viewHelp.purpose;
  const otherTopics = viewHelp.topics.filter((id) => id !== state.topic);
  const otherTasks = viewHelp.tasks.filter((id) => id !== state.topic);

  return (
    <Dialog variant="drawer" title={title} description={description} onClose={close}
      footer={<p className="help-foot">
        <a className="btn btn-secondary" href="#/help" onClick={close}><Icon name="question" size={14} /> Open the full guide</a>
        <span className="muted small">Press <kbd>?</kbd> anywhere for help · <kbd>Esc</kbd> closes</span>
      </p>}>
      {/* Every link in the drawer goes somewhere else in the app, so following one closes the drawer.
          Without this the guide page opened underneath the drawer and Escape no longer reached it. */}
      <div ref={live} className="help-drawer" onClick={(event) => { if (event.target.closest("a[href]")) close(); }}>
        {current && (current.kind === 'term'
          ? <TermCard id={current.id} highlighted />
          : <TaskCard id={current.id} highlighted />)}

        {!current && (
          <section aria-labelledby="help-this-page">
            <h3 id="help-this-page">This page</h3>
            <p>{viewHelp.purpose}</p>
          </section>
        )}

        {otherTopics.length > 0 && (
          <section aria-labelledby="help-terms">
            <h3 id="help-terms">{current ? 'Other terms on this page' : 'Terms on this page'}</h3>
            {otherTopics.map((id) => <TermCard key={id} id={id} />)}
          </section>
        )}

        {otherTasks.length > 0 && (
          <section aria-labelledby="help-tasks">
            <h3 id="help-tasks">How to</h3>
            {otherTasks.map((id) => <TaskCard key={id} id={id} />)}
          </section>
        )}
      </div>
    </Dialog>
  );
}
