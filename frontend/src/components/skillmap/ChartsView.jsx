import { useT } from '../../preferences/context';
import Icon from '../Icon';
import { CoverageChart, DepartmentLevelsChart, PersonChart, QualifiedChart, SkillLevelsChart } from './Charts';
import { CHART_TYPES } from './model';

// Chart mode of the skill map: pick a chart, read it, or switch it to its table.
export default function ChartsView({ map, settings, withTargets, focusPersonId, focusSkillId, onChart, onToggleTable }) {
  const t = useT();
  const { chart, department, minProficiency, showTable } = settings;
  const vars = { level: minProficiency, scope: department === 'all' ? t('skillmap.charts.wholeOrg') : department };

  return (
    <>
      <div className="chart-picker" role="radiogroup" aria-label={t('skillmap.charts.pick')}>
        {CHART_TYPES.map(([id, icon]) => (
          <button key={id} type="button" role="radio" className="chart-option" aria-checked={chart === id} onClick={() => onChart(id)}>
            <Icon name={icon} size={16} /> {t(`skillmap.charts.${id}.name`)}
          </button>
        ))}
      </div>

      <section className="chart-card" aria-labelledby="skillmap-chart-title">
        <div className="chart-head">
          <div>
            <h2 id="skillmap-chart-title">{t(`skillmap.charts.${chart}.title`, vars)}</h2>
            <p>{t(`skillmap.charts.${chart}.subtitle`, vars)}</p>
          </div>
          <button type="button" className="btn btn-secondary btn-sm" aria-pressed={showTable} onClick={onToggleTable}>
            <Icon name={showTable ? 'bars' : 'data'} size={15} /> {showTable ? t('skillmap.charts.showChart') : t('skillmap.charts.showTable')}
          </button>
        </div>

        {chart === 'coverage' && <CoverageChart map={map} showTable={showTable} />}
        {chart === 'qualified' && <QualifiedChart map={map} minProficiency={minProficiency} withTargets={withTargets} showTable={showTable} />}
        {chart === 'departments' && <DepartmentLevelsChart map={map} minProficiency={minProficiency} showTable={showTable} />}
        {chart === 'person' && <PersonChart map={map} personId={focusPersonId} showTable={showTable} />}
        {chart === 'skill' && <SkillLevelsChart key={focusSkillId} map={map} skillId={focusSkillId} showTable={showTable} />}
      </section>
    </>
  );
}
