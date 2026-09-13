import { useState } from 'react';
import { useT } from '../preferences/context';
import { usePersistentState } from '../preferences/usePersistentState';
import { useSession } from '../session';
import Icon from './Icon';
import ChartsView from './skillmap/ChartsView';
import EvidencePanel from './skillmap/EvidencePanel';
import MatrixView from './skillmap/MatrixView';
import NetworkView from './skillmap/NetworkView';
import { CHART_TYPES, DENSITIES, LEVELS, MAP_MODES, buildSkillMap } from './skillmap/model';

// Skill map: one filter row scopes three ways of looking at the same evidence - a network, a people × skills
// matrix and a set of charts. Each person's choice of view, chart and filters is remembered in this browser.
const DEFAULTS = {
  mode: 'network',
  chart: 'coverage',
  department: 'all',
  minProficiency: 3,
  concentratedOnly: false,
  density: 'comfortable',
  showTable: false,
};

const oneOf = (value, options, fallback) => (options.includes(value) ? value : fallback);

function sanitize(stored, departments) {
  return {
    mode: oneOf(stored.mode, MAP_MODES.map(([id]) => id), DEFAULTS.mode),
    chart: oneOf(stored.chart, CHART_TYPES.map(([id]) => id), DEFAULTS.chart),
    department: oneOf(stored.department, ['all', ...departments], 'all'),
    minProficiency: oneOf(Number(stored.minProficiency), LEVELS, DEFAULTS.minProficiency),
    concentratedOnly: stored.concentratedOnly === true,
    density: oneOf(stored.density, DENSITIES, DEFAULTS.density),
    showTable: stored.showTable === true,
  };
}

// Links from other pages preselect a node: #/network?skill=12 or #/network?employee=4.
const initialSelection = (params = {}) => {
  if (Number(params.skill) > 0) return { type: 'skill', id: Number(params.skill) };
  if (Number(params.employee) > 0) return { type: 'employee', id: Number(params.employee) };
  return null;
};

export default function SkillNetwork({ workforce, risks, params }) {
  const t = useT();
  const session = useSession();
  const [stored, setStored] = usePersistentState(`keystone.skillmap.${session?.user?.id ?? 'guest'}`, DEFAULTS);
  const [selected, setSelected] = useState(() => initialSelection(params));

  if (!workforce) return null;

  const departments = [...new Set((workforce.employees ?? []).map((employee) => employee.department))].sort((a, b) => a.localeCompare(b));
  const settings = sanitize(stored, departments);
  const update = (patch) => setStored((current) => ({ ...current, ...patch }));
  const map = buildSkillMap(workforce, risks, settings);
  const isDefault = Object.keys(DEFAULTS).every((key) => settings[key] === DEFAULTS[key]);
  // Coverage targets are organization-wide, so they are drawn only when the whole organization is in view.
  const withTargets = settings.department === 'all' && workforce.visibility !== 'team';

  const toggle = (type, id) => setSelected((current) => (current?.type === type && current.id === id ? null : { type, id }));
  const focusPersonId = selected?.type === 'employee' && map.personIds.has(selected.id) ? selected.id : (map.people[0]?.id ?? null);
  const focusSkillId = selected?.type === 'skill' && map.shownSkills.some((skill) => skill.id === selected.id) ? selected.id : (map.shownSkills[0]?.id ?? null);
  const charting = settings.mode === 'charts';

  return (
    <>
      <div className="skillmap-toolbar" role="region" aria-label={t('skillmap.toolbar')}>
        <div className="segmented-field">
          <span id="skillmap-mode-label">{t('skillmap.view')}</span>
          <div className="segmented segmented-inline" role="radiogroup" aria-labelledby="skillmap-mode-label">
            {MAP_MODES.map(([mode, icon]) => (
              <button key={mode} type="button" role="radio" aria-checked={settings.mode === mode} onClick={() => update({ mode })}>
                <Icon name={icon} size={15} /> {t(`skillmap.modes.${mode}`)}
              </button>
            ))}
          </div>
        </div>

        <label className="field">{t('skillmap.department')}
          <select value={settings.department} onChange={(event) => { update({ department: event.target.value }); setSelected(null); }}>
            <option value="all">{t('skillmap.allDepartments')}</option>
            {departments.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
        </label>

        <label className="field">{t('skillmap.minLevel')}
          <select value={settings.minProficiency} onChange={(event) => update({ minProficiency: Number(event.target.value) })}>
            {LEVELS.map((level) => <option key={level} value={level}>{t('skillmap.levelPlus', { level })}</option>)}
          </select>
        </label>

        {settings.mode === 'network' && (
          <label className="field">{t('skillmap.density')}
            <select value={settings.density} onChange={(event) => update({ density: event.target.value })}>
              {DENSITIES.map((density) => <option key={density} value={density}>{t(`skillmap.densities.${density}`)}</option>)}
            </select>
          </label>
        )}

        {charting && settings.chart === 'person' && map.people.length > 0 && (
          <label className="field">{t('skillmap.person')}
            <select value={focusPersonId ?? ''} onChange={(event) => setSelected({ type: 'employee', id: Number(event.target.value) })}>
              {map.people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
            </select>
          </label>
        )}

        {charting && settings.chart === 'skill' && map.shownSkills.length > 0 && (
          <label className="field">{t('skillmap.skill')}
            <select value={focusSkillId ?? ''} onChange={(event) => setSelected({ type: 'skill', id: Number(event.target.value) })}>
              {map.shownSkills.map((skill) => <option key={skill.id} value={skill.id}>{skill.name}</option>)}
            </select>
          </label>
        )}

        <label className="check">
          <input type="checkbox" checked={settings.concentratedOnly} onChange={(event) => { update({ concentratedOnly: event.target.checked }); setSelected(null); }} />
          {t('skillmap.atRiskOnly')}
        </label>

        <div className="toolbar-end">
          <button type="button" className="btn btn-quiet btn-sm" disabled={isDefault} aria-describedby="skillmap-reset-note"
            onClick={() => { setStored(DEFAULTS); setSelected(null); }}>
            <Icon name="refresh" size={14} /> {t('skillmap.reset')}
          </button>
          <span id="skillmap-reset-note" className="sr-only">{t('skillmap.resetTitle')}</span>
        </div>
      </div>

      {charting ? (
        <ChartsView map={map} settings={settings} withTargets={withTargets} focusPersonId={focusPersonId} focusSkillId={focusSkillId}
          onChart={(chart) => update({ chart })} onToggleTable={() => update({ showTable: !settings.showTable })} />
      ) : (
        <section className="panel">
          <ul className="legend" aria-label={t('skillmap.legend.title')}>
            <li><span className="swatch uncovered" /> {t('skillmap.coverage.uncovered')}</li>
            <li><span className="swatch single" /> {t('skillmap.coverage.single')}</li>
            <li><span className="swatch covered" /> {t('skillmap.coverage.covered')}</li>
            {settings.mode === 'network' && <li><span className="swatch person" /> {t('skillmap.legend.person')}</li>}
            <li className="legend-divider" aria-hidden="true" />
            {LEVELS.map((level) => <li key={level}><span className={`swatch lvl lvl-${level}`} /> {level}</li>)}
            <li>{settings.mode === 'network' ? t('skillmap.legend.lines') : t('skillmap.legend.cells')}</li>
          </ul>
          <div className="network-layout">
            {settings.mode === 'network'
              ? <NetworkView map={map} selected={selected} onToggle={toggle} density={settings.density} />
              : <MatrixView map={map} selected={selected} onToggle={toggle} minProficiency={settings.minProficiency} />}
            <EvidencePanel map={map} selected={selected} onShowChart={(chart) => update({ mode: 'charts', chart })} />
          </div>
        </section>
      )}
    </>
  );
}
