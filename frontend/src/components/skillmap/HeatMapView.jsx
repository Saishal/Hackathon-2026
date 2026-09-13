import { heatRows } from '../../../../shared/skill-map.mjs';
import { useT } from '../../preferences/context';
export default function HeatMapView({ map, settings, onSelect }) {
  const t = useT();
  const rows = heatRows(map, settings);
  const departments = rows[0]?.cells.map((cell) => cell.department) ?? [];
  return <section className="panel">
    <h2>{t('heat.title')}</h2><p className="muted" id="heat-basis">{t('heat.basis')}</p>
    <ul className="legend" aria-label={t('heat.legend')}>
      {['critical', 'at-risk', 'watch', 'healthy', 'unknown'].map((state) => <li key={state}><span className={`heat-state heat-${state}`}>{t(`heat.${state}`)}</span> {t(`heat.description.${state}`)}</li>)}
    </ul>
    {!rows.length || !departments.length ? <p role="status">{t('skillmap.empty')}</p> : <div className="table-wrap coverage-grid" role="region" aria-label={t('heat.title')} tabIndex={0}>
      <table aria-describedby="heat-basis"><caption className="sr-only">{t('heat.caption')}</caption>
        <thead><tr><th scope="col">{t('skillmap.skill')}</th>{departments.map((name) => <th scope="col" key={name}>{name}</th>)}</tr></thead>
        <tbody>{rows.map(({ skill, cells }) => <tr key={skill.id}>
          <th scope="row">{skill.name}</th>
          {cells.map((cell) => <td key={cell.department}><button type="button" className={`heat-cell heat-${cell.state}`}
            aria-label={`${skill.name}, ${cell.department}: ${cell.qualified} / ${cell.required}, ${t(`heat.${cell.state}`)}. ${t('heat.reference')}`}
            title={`${t('heat.reference')} ${t('heat.unverified', { count: cell.unverified })}`}
            onClick={() => onSelect(skill.id, cell.department)}>
            <strong>{cell.qualified} / {cell.required ?? '—'}</strong><span>{t(`heat.${cell.state}`)}</span>
          </button></td>)}
        </tr>)}</tbody>
      </table>
    </div>}
  </section>;
}
