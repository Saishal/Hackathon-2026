import activityData from '../data/activity.json';
import { plural } from './format';

// ActivityLog: who changed what, and when. Generated from git history across all team branches
// by scripts/generate-activity.mjs (re-run by the sync automation after every fetch).

const MEMBER_COLORS = {
  'Member 1': '#2851d8',
  'Member 2': '#7a4bd1',
  'Member 3': '#1a7f4b',
  'Member 4': '#c27a00',
  Team: '#8a919c',
};

const fmtDateTime = (iso) => new Date(iso).toLocaleString(undefined, {
  month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
});

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
  // activity.json is not in date order, so sort here to keep the table newest first.
  const sorted = [...entries].sort((a, b) => new Date(b.isoDate) - new Date(a.isoDate));

  return (
    <section className="panel panel-flush">
      <div className="panel-head">
        <div>
          <h2>{plural(sorted.length, 'commit')}</h2>
          <p>Generated from git history across all team branches{generatedAt ? `, last synced ${relTime(generatedAt)}` : ''}.</p>
        </div>
      </div>
      <div className="table-wrap flush">
        <table>
          <thead>
            <tr><th scope="col">When</th><th scope="col">Who</th><th scope="col">Branch</th><th scope="col">Change</th></tr>
          </thead>
          <tbody>
            {sorted.map((entry) => (
              <tr key={entry.hash}>
                <td className="nowrap" title={entry.isoDate}>
                  {fmtDateTime(entry.isoDate)}
                  <small className="cell-sub">{relTime(entry.isoDate)}</small>
                </td>
                <td className="nowrap">
                  <span className="member">
                    <span className="member-dot" style={{ background: MEMBER_COLORS[entry.member] ?? MEMBER_COLORS.Team }} />
                    {entry.member}
                  </span>
                  <small className="cell-sub">{entry.author}</small>
                </td>
                <td className="nowrap"><code>{entry.branch}</code></td>
                <td>{entry.subject}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
