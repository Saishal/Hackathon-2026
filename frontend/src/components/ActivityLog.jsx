import activityData from '../data/activity.json';

// ActivityLog — who changed what, and when. Generated from git history across
// all team branches by scripts/generate-activity.mjs (re-run by the sync
// automation after every fetch, so this panel is always current).

const MEMBER_COLORS = {
  'Member 1': '#2563eb',
  'Member 2': '#7c3aed',
  'Member 3': '#059669',
  'Member 4': '#d97706',
  'Team': '#64748b',
};

const fmtDateTime = (iso) => {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
};

const relTime = (iso) => {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
};

export default function ActivityLog() {
  const { generatedAt, entries } = activityData;
  return (
    <div>
      <h3>Team activity log</h3>
      <p className="hint">
        Every commit from all team branches, newest first. Regenerated from git history
        {generatedAt ? ` · last synced ${relTime(generatedAt)}` : ''}.
      </p>
      <div className="table-wrap compact">
        <table>
          <thead>
            <tr><th>When</th><th>Member</th><th>Branch</th><th>Change</th><th>Author</th></tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.hash}>
                <td className="nowrap" title={entry.isoDate}>
                  {fmtDateTime(entry.isoDate)}
                  <div className="hint">{relTime(entry.isoDate)}</div>
                </td>
                <td>
                  <span className="member-badge" style={{ background: MEMBER_COLORS[entry.member] ?? '#64748b' }}>
                    {entry.member}
                  </span>
                  <div className="hint">{entry.role}</div>
                </td>
                <td className="nowrap"><code>{entry.branch}</code></td>
                <td>{entry.subject}</td>
                <td className="hint nowrap">{entry.author}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
