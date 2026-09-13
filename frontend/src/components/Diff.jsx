import { FIELD_LABELS, formatDate, humanizeKey } from './format';

// Before/after comparison for audit entries and change requests. Changed rows are marked in text as
// well as colour, and nested values stay readable instead of printing raw JSON.
function flatten(value, prefix = '') {
  if (value === null || value === undefined) return {};
  if (typeof value !== 'object' || Array.isArray(value)) return { [prefix || 'value']: value };
  return Object.entries(value).reduce((fields, [key, item]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return item && typeof item === 'object' && !Array.isArray(item) ? { ...fields, ...flatten(item, path) } : { ...fields, [path]: item };
  }, {});
}

function display(value, field, resolve) {
  if (value === undefined) return '—';
  if (value === null) return 'Empty';
  const name = field.split('.').pop();
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (name === 'skillIds' && Array.isArray(value)) return value.map((id) => resolve.skill?.(id) ?? `Skill ${id}`).join(', ') || 'None';
  if ((name === 'employeeId' || name === 'managerId' || name === 'mentorId') && typeof value === 'number') return resolve.employee?.(value) ?? `Employee ${value}`;
  if (name === 'skillId' && typeof value === 'number') return resolve.skill?.(value) ?? `Skill ${value}`;
  if (Array.isArray(value)) {
    if (value.length === 0) return 'None';
    return value.every((item) => typeof item !== 'object') ? value.join(', ') : `${value.length} item(s)`;
  }
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return formatDate(value);
  return String(value);
}

export default function Diff({ before, after, resolve = {}, emptyText = 'No field values were recorded for this event.', showUnchanged = true }) {
  const previous = flatten(before);
  const next = flatten(after);
  const fields = [...new Set([...Object.keys(previous), ...Object.keys(next)])];
  const rows = fields.map((field) => ({ field, changed: JSON.stringify(previous[field]) !== JSON.stringify(next[field]) }))
    .filter((row) => showUnchanged || row.changed);

  if (rows.length === 0) return <p className="muted">{emptyText}</p>;

  return (
    <div className="table-wrap">
      <table className="diff">
        <thead>
          <tr><th scope="col">Field</th><th scope="col">Before</th><th scope="col">After</th><th scope="col"><span className="sr-only">Change</span></th></tr>
        </thead>
        <tbody>
          {rows.map(({ field, changed }) => (
            <tr key={field} className={changed ? 'diff-changed' : undefined}>
              <th scope="row">{FIELD_LABELS[field.split('.').pop()] ?? humanizeKey(field)}</th>
              <td>{display(previous[field], field, resolve)}</td>
              <td>{display(next[field], field, resolve)}</td>
              <td className="nowrap">{changed ? <span className="tag tag-accent">Changed</span> : <span className="muted">Same</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
