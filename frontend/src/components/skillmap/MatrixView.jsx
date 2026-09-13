import { useT } from '../../preferences/context';
import { formatDate } from '../format';
import ChartTooltip from './ChartTooltip';
import { coverageTone, qualifiedIn } from './model';
import { useTooltip } from './tooltip';

// People × skills heat map. Each cell is the recorded level in the level ramp; an empty cell has no record
// (unknown, not zero). Levels below the chosen minimum stay visible but faded. The person and skill headers
// are buttons, so the whole view works from the keyboard without a tab stop on every cell.
export default function MatrixView({ map, selected, onToggle, minProficiency }) {
  const t = useT();
  const { ref, tip, bind } = useTooltip();
  const { people, shownSkills } = map;
  const isSelected = (type, id) => selected?.type === type && selected.id === id;

  const rows = [];
  let department = null;
  for (const person of people) {
    if (person.department !== department) {
      rows.push({ type: 'group', department: person.department });
      department = person.department;
    }
    rows.push({ type: 'person', person });
  }

  const cellTip = (person, skill, edge) => ({
    value: edge ? t('skillmap.levelN', { level: edge.proficiency }) : '—',
    label: `${person.name} · ${skill.name}`,
    note: !edge ? t('skillmap.unknownNotAbsent')
      : edge.lastVerifiedAt ? t('skillmap.verifiedOn', { date: formatDate(edge.lastVerifiedAt) }) : t('skillmap.unverified'),
  });

  return (
    <div className="chart" ref={ref}>
      <div className="heatmap-wrap">
        <table className="heatmap">
          <caption className="sr-only">{t('skillmap.matrix.caption')}</caption>
          <thead>
            <tr>
              <th scope="col" className="corner">{t('skillmap.matrix.corner')}</th>
              {shownSkills.map((skill) => {
                const qualified = map.busFactor(skill.id) ?? qualifiedIn(map, skill);
                const label = `${skill.name} · ${t('skillmap.qualifiedCount', { count: qualified })}`;
                return (
                  <th key={skill.id} scope="col" className={`skill-head ${isSelected('skill', skill.id) ? 'is-selected' : ''}`}>
                    <button type="button" aria-pressed={isSelected('skill', skill.id)} onClick={() => onToggle('skill', skill.id)} title={label} aria-label={label}>
                      <span className={`swatch ${coverageTone(qualified)}`} aria-hidden="true" />
                      <span className="vertical">{skill.name}</span>
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (row.type === 'group'
              ? (
                <tr key={`group-${row.department}`} className="group-row">
                  <th scope="rowgroup" colSpan={shownSkills.length + 1}>{row.department}</th>
                </tr>
              )
              : (
                <tr key={row.person.id}>
                  <th scope="row" className={`person-head ${isSelected('employee', row.person.id) ? 'is-selected' : ''}`}>
                    <button type="button" aria-pressed={isSelected('employee', row.person.id)} onClick={() => onToggle('employee', row.person.id)} title={`${row.person.name} · ${row.person.role}`}>
                      {row.person.name}
                    </button>
                  </th>
                  {shownSkills.map((skill) => {
                    const edge = map.edge(row.person.id, skill.id);
                    const level = edge?.proficiency ?? null;
                    const lit = isSelected('employee', row.person.id) || isSelected('skill', skill.id);
                    return (
                      <td key={skill.id}
                        className={`heat ${level ? `l${level}` : ''} ${level !== null && level < minProficiency ? 'is-below' : ''} ${lit ? 'is-lit' : ''}`}
                        onClick={() => onToggle('employee', row.person.id)}
                        {...bind(cellTip(row.person, skill, edge))}>
                        {level ?? <span className="sr-only">{t('skillmap.matrix.noRecord')}</span>}
                      </td>
                    );
                  })}
                </tr>
              )))}
          </tbody>
        </table>
      </div>
      <ChartTooltip tip={tip} />
    </div>
  );
}
