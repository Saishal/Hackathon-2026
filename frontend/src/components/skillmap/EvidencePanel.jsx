import { useT } from '../../preferences/context';
import { formatDate } from '../format';
import Icon from '../Icon';


const DASH = '—';

function EvidenceList({ rows }) {
  const t = useT();
  if (rows.length === 0) return <p className="muted">{t('skillmap.evidence.none')}</p>;

  return (
    <ul className="evidence-list">
      {rows.map((row) => (
        <li key={row.key}>
          <strong>{row.label}</strong>
          <span className="level">{t('skillmap.levelN', { level: row.proficiency })}</span>
          <small>{row.evidenceSource ?? DASH} · {row.lastVerifiedAt ? t('skillmap.verifiedOn', { date: formatDate(row.lastVerifiedAt) }) : t('skillmap.unverified')}</small>
        </li>
      ))}
    </ul>
  );
}

// The records behind the selected person or skill, with shortcuts to chart them or open the official records.
export default function EvidencePanel({ map, selected, onShowChart }) {
  const t = useT();
  const employee = selected?.type === 'employee' ? map.employeeById.get(selected.id) : null;
  const skill = selected?.type === 'skill' ? map.skillById.get(selected.id) : null;
  const evidenceFor = (predicate, labelOf) => map.edges.filter(predicate)
    .sort((a, b) => b.proficiency - a.proficiency)
    .map((edge) => ({ ...edge, key: `${edge.employeeId}-${edge.skillId}`, label: labelOf(edge) }));

  return (
    <aside className="network-detail" aria-live="polite">
      {!employee && !skill && <>
        <h3>{t('skillmap.evidence.title')}</h3>
        <p className="muted">{t('skillmap.evidence.hint')}</p>
      </>}

      {employee && <>
        <h3>{employee.name}</h3>
        <p className="muted">{employee.role} · {employee.department}</p>
        <p>{t('skillmap.evidence.mentoring', {
          value: employee.mentoringHoursPerMonth === undefined ? DASH : t('skillmap.evidence.hoursPerMonth', { count: employee.mentoringHoursPerMonth }),
        })}</p>
        <div className="detail-actions">
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => onShowChart('person')}>
            <Icon name="hbars" size={14} /> {t('skillmap.evidence.chartPerson')}
          </button>
          <a className="btn btn-quiet btn-sm" href={`#/data?tab=evidence&q=${encodeURIComponent(employee.name)}`}>{t('skillmap.evidence.openRecords')}</a>
        </div>
        <EvidenceList rows={evidenceFor((edge) => edge.employeeId === employee.id,
          (edge) => map.skillById.get(edge.skillId)?.name ?? `#${edge.skillId}`)} />
      </>}

      {skill && <>
        <h3>{skill.name}</h3><p className="muted small">{t('skillmap.evidence.filtered')}</p>
        <p className="muted">{t('skillmap.evidence.skillSummary', {
          qualified: map.edges.filter((edge) => edge.skillId === skill.id && edge.proficiency >= (skill.targetProficiency ?? 3)).length,
          needed: skill.requiredHolders ?? DASH,
          level: skill.targetProficiency ?? DASH,
          criticality: skill.criticality ?? DASH,
        })}</p>
        <div className="detail-actions">
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => onShowChart('skill')}>
            <Icon name="bars" size={14} /> {t('skillmap.evidence.chartSkill')}
          </button>
          <a className="btn btn-quiet btn-sm" href={`#/data?tab=evidence&q=${encodeURIComponent(skill.name)}`}>{t('skillmap.evidence.openRecords')}</a>
        </div>
        <EvidenceList rows={evidenceFor((edge) => edge.skillId === skill.id,
          (edge) => map.employeeById.get(edge.employeeId)?.name ?? `#${edge.employeeId}`)} />
      </>}
    </aside>
  );
}
