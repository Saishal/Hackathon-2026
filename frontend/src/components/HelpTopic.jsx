import Icon from './Icon';
import { GLOSSARY, TASKS } from '../help/content';
import { useHelp } from '../help/context';

// A small "?" button placed beside a metric, form or workflow step. It is a real button, so it works
// with the keyboard and screen readers; nothing essential is hover-only. Clicking opens the help
// drawer on that topic. `label` overrides the accessible name when the surrounding text is not enough.
export default function HelpTopic({ id, label, className = '' }) {
  const { open } = useHelp();
  const entry = GLOSSARY[id] ?? TASKS[id];
  const name = label ?? (entry ? `Help: ${entry.term ?? entry.title}` : 'Help');

  return (
    <button type="button" className={`help-topic ${className}`.trim()} onClick={() => open(id)}
      aria-label={name} title={name}>
      <Icon name="question" size={14} />
    </button>
  );
}

// Inline text link variant for sentences such as "Read about the Keystone Score".
export function HelpLink({ id, children }) {
  const { open } = useHelp();
  return (
    <button type="button" className="help-link" onClick={() => open(id)}>
      {children}
    </button>
  );
}
