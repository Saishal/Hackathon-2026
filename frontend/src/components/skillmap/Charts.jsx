import { useState } from 'react';
import { useT } from '../../preferences/context';
import ChartTooltip from './ChartTooltip';
import { LEVELS, coverageGroups, levelsByDepartment, peopleAtLevel, personProfile, skillDistribution } from './model';
import { useTooltip } from './tooltip';

// The skill map charts. Every chart has a table twin (showTable), a hover and focus tooltip, and a legend or
// direct labels, so no value depends on colour or on hovering. Level colours are one blue ramp, light to dark.

const COVERAGE_TONES = ['uncovered', 'single', 'covered'];
const percent = (part, whole) => (whole > 0 ? Math.round((part / whole) * 100) : 0);
const onActivate = (action) => (event) => {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    action();
  }
};

// Axis top and gridline step for small whole-number counts.
function scaleFor(max) {
  const step = max <= 6 ? 1 : max <= 12 ? 2 : max <= 30 ? 5 : 10;
  return { step, top: Math.max(step, Math.ceil(max / step) * step) };
}

const ticksFor = ({ step, top }) => Array.from({ length: Math.floor(top / step) + 1 }, (_, index) => index * step);

function roundedTop(x, y, width, height) {
  const r = Math.min(4, height, width / 2);
  return `M${x},${y + height} V${y + r} Q${x},${y} ${x + r},${y} H${x + width - r} Q${x + width},${y} ${x + width},${y + r} V${y + height} Z`;
}

export function DataTable({ caption, head, rows }) {
  return (
    <div className="table-wrap">
      <table>
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>{head.map((label, index) => <th key={label} scope="col" className={index > 0 ? 'num' : undefined}>{label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row[0]}>
              {row.map((cell, index) => (index === 0
                ? <th key={index} scope="row">{cell}</th>
                : <td key={index} className="num">{cell}</td>))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Scale({ scale }) {
  return (
    <li className="hbar" aria-hidden="true">
      <span />
      <div className="hbar-scale">
        {ticksFor(scale).map((value) => <span key={value} style={{ '--x': `${(value / scale.top) * 100}%` }}>{value}</span>)}
      </div>
      <span />
    </li>
  );
}

export function CoverageChart({ map, showTable }) {
  const t = useT();
  const { ref, tip, bind } = useTooltip();
  const [focus, setFocus] = useState(null);
  const groups = coverageGroups(map);
  const total = map.shownSkills.length;
  const label = (tone) => t(`skillmap.coverage.${tone}`);

  if (total === 0) return <p className="chart-empty">{t('skillmap.charts.empty')}</p>;
  if (showTable) {
    return (
      <DataTable caption={t('skillmap.charts.coverage.title')}
        head={[t('skillmap.table.coverage'), t('skillmap.table.skills'), t('skillmap.table.share')]}
        rows={COVERAGE_TONES.map((tone) => [label(tone), groups[tone].length, `${percent(groups[tone].length, total)}%`])} />
    );
  }

  const radius = 64;
  const circumference = 2 * Math.PI * radius;
  const lengths = COVERAGE_TONES.map((tone) => (groups[tone].length / total) * circumference);
  const segments = COVERAGE_TONES.map((tone, index) => ({
    tone,
    count: groups[tone].length,
    length: lengths[index],
    offset: lengths.slice(0, index).reduce((sum, length) => sum + length, 0),
  })).filter((segment) => segment.count > 0);
  // A 2px surface gap separates neighbouring segments; a single full ring needs none.
  const gap = segments.length > 1 ? 2 : 0;
  const pick = (tone) => setFocus((current) => (current === tone ? null : tone));

  return (
    <div className="chart" ref={ref}>
      <div className="donut-layout">
        <svg className="donut" viewBox="0 0 180 180" role="group"
          aria-label={t('skillmap.charts.coverage.aria', { total, uncovered: groups.uncovered.length, single: groups.single.length, covered: groups.covered.length })}>
          <g transform="rotate(-90 90 90)">
            <circle className="track" cx="90" cy="90" r={radius} strokeWidth="22" />
            {segments.map((segment) => {
              const visible = Math.max(0.5, segment.length - gap);
              return (
                <circle key={segment.tone} className={`segment seg-${segment.tone} ${focus && focus !== segment.tone ? 'is-dim' : ''}`}
                  cx="90" cy="90" r={radius} strokeWidth="22"
                  strokeDasharray={`${visible} ${circumference - visible}`} strokeDashoffset={-segment.offset}
                  tabIndex={0} role="button" aria-pressed={focus === segment.tone}
                  aria-label={`${label(segment.tone)}: ${segment.count} (${percent(segment.count, total)}%)`}
                  onClick={() => pick(segment.tone)} onKeyDown={onActivate(() => pick(segment.tone))}
                  {...bind({ value: `${segment.count} · ${percent(segment.count, total)}%`, label: label(segment.tone) })} />
              );
            })}
          </g>
          <text className="donut-total" x="90" y="92" textAnchor="middle">{total}</text>
          <text className="donut-caption" x="90" y="112" textAnchor="middle">{t('skillmap.charts.coverage.center')}</text>
        </svg>

        <div>
          <ul className="coverage-legend">
            {COVERAGE_TONES.map((tone) => (
              <li key={tone}>
                <button type="button" aria-pressed={focus === tone} onClick={() => pick(tone)}>
                  <span className={`key-rect fill-${tone}`} aria-hidden="true" />
                  <span>{label(tone)}<small>{t(`skillmap.coverage.${tone}Hint`)}</small></span>
                  <span className="legend-value">{groups[tone].length} · {percent(groups[tone].length, total)}%</span>
                </button>
              </li>
            ))}
          </ul>
          {focus && (groups[focus].length > 0
            ? <ul className="skill-chips" aria-label={label(focus)}>
              {groups[focus].map((skill) => <li key={skill.id}><a href={`#/network?skill=${skill.id}`}>{skill.name}</a></li>)}
            </ul>
            : <p className="chart-note">{t('skillmap.charts.coverage.noneInGroup')}</p>)}
          {!focus && <p className="chart-note">{t('skillmap.charts.coverage.pickHint')}</p>}
        </div>
      </div>
      <ChartTooltip tip={tip} />
    </div>
  );
}

export function QualifiedChart({ map, minProficiency, withTargets, showTable }) {
  const t = useT();
  const { ref, tip, bind } = useTooltip();
  const rows = peopleAtLevel(map, minProficiency);

  if (rows.length === 0) return <p className="chart-empty">{t('skillmap.charts.empty')}</p>;
  const hasTarget = (row) => withTargets && row.needed !== null;
  if (showTable) {
    return (
      <DataTable caption={t('skillmap.charts.qualified.title', { level: minProficiency })}
        head={[t('skillmap.table.skill'), t('skillmap.table.people', { level: minProficiency }), ...(withTargets ? [t('skillmap.table.needed')] : [])]}
        rows={rows.map((row) => [row.skill.name, row.count, ...(withTargets ? [row.needed ?? '—'] : [])])} />
    );
  }

  const scale = scaleFor(Math.max(1, ...rows.map((row) => Math.max(row.count, hasTarget(row) ? row.needed : 0))));
  const short = (row) => hasTarget(row) && row.count < row.needed;

  return (
    <div className="chart" ref={ref}>
      <ul className={`hbar-list ${withTargets ? 'has-tags' : ''}`}>
        <Scale scale={scale} />
        {rows.map((row) => (
          <li key={row.skill.id} className="hbar">
            <a className="hbar-label" href={`#/network?skill=${row.skill.id}`} title={row.skill.name}>{row.skill.name}</a>
            <div className="hbar-track" style={{ '--step': `${(scale.step / scale.top) * 100}%` }}>
              {row.count > 0 && (
                <span className={`hbar-fill ${withTargets && !short(row) ? 'is-muted' : ''}`} style={{ '--w': `${(row.count / scale.top) * 100}%` }}
                  tabIndex={0} role="img" aria-label={`${row.skill.name}: ${row.count}`}
                  {...bind({
                    value: t('skillmap.peopleCount', { count: row.count }),
                    label: row.skill.name,
                    note: hasTarget(row) ? t('skillmap.charts.qualified.neededNote', { count: row.needed }) : null,
                  })} />
              )}
              {hasTarget(row) && <span className="hbar-target" style={{ '--x': `${(Math.min(row.needed, scale.top) / scale.top) * 100}%` }} />}
            </div>
            <span className="hbar-value">
              {row.count}
              {hasTarget(row) && <span className="muted"> / {row.needed}</span>}
              {short(row) && <span className="tag tag-warn">{t('skillmap.charts.qualified.short', { count: row.needed - row.count })}</span>}
            </span>
          </li>
        ))}
      </ul>
      {withTargets && (
        <ul className="chart-legend">
          <li><span className="key-rect fill-series" aria-hidden="true" /> {t('skillmap.charts.qualified.legendShort')}</li>
          <li><span className="key-rect fill-muted" aria-hidden="true" /> {t('skillmap.charts.qualified.legendMet')}</li>
          <li><span className="key-line" aria-hidden="true" /> {t('skillmap.charts.qualified.legendNeeded')}</li>
        </ul>
      )}
      <ChartTooltip tip={tip} />
    </div>
  );
}

export function DepartmentLevelsChart({ map, minProficiency, showTable }) {
  const t = useT();
  const { ref, tip, bind } = useTooltip();
  const rows = levelsByDepartment(map, minProficiency);
  const levels = LEVELS.filter((level) => level >= minProficiency);

  if (rows.length === 0) return <p className="chart-empty">{t('skillmap.charts.empty')}</p>;
  if (showTable) {
    return (
      <DataTable caption={t('skillmap.charts.departments.title', { level: minProficiency })}
        head={[t('skillmap.table.department'), ...levels.map((level) => t('skillmap.levelN', { level })), t('skillmap.table.total')]}
        rows={rows.map((row) => [row.department, ...levels.map((level) => row.counts[level]), row.total])} />
    );
  }

  return (
    <div className="chart" ref={ref}>
      <ul className="hbar-list">
        {rows.map((row) => (
          <li key={row.department} className="hbar">
            <span className="hbar-label" title={row.department}>{row.department}</span>
            <div className="stack-bar">
              {levels.filter((level) => row.counts[level] > 0).map((level) => (
                <span key={level} className={`stack-seg fill-level-${level}`} style={{ flexGrow: row.counts[level] }}
                  tabIndex={0} role="img"
                  aria-label={t('skillmap.charts.departments.segmentAria', { department: row.department, level, count: row.counts[level] })}
                  {...bind({
                    value: `${row.counts[level]} · ${percent(row.counts[level], row.total)}%`,
                    label: `${row.department} · ${t('skillmap.levelN', { level })}`,
                    note: t(`skillmap.levels.${level}`),
                  })} />
              ))}
            </div>
            <span className="hbar-value">{t('skillmap.recordsCount', { count: row.total })}</span>
          </li>
        ))}
      </ul>
      <ul className="chart-legend">
        {levels.map((level) => (
          <li key={level}><span className={`key-rect fill-level-${level}`} aria-hidden="true" /> {level} · {t(`skillmap.levels.${level}`)}</li>
        ))}
      </ul>
      <ChartTooltip tip={tip} />
    </div>
  );
}

export function PersonChart({ map, personId, showTable }) {
  const t = useT();
  const { ref, tip, bind } = useTooltip();
  const profile = personId === null ? null : personProfile(map, personId);

  if (!profile) return <p className="chart-empty">{t('skillmap.charts.person.none')}</p>;
  const { person, role, rows } = profile;
  if (rows.length === 0) return <p className="chart-empty">{t('skillmap.charts.person.noEvidence', { name: person.name })}</p>;

  const below = (row) => row.required !== null && (row.level ?? 0) < row.required;
  const gaps = rows.filter(below).length;
  const summary = role ? t('skillmap.charts.person.roleSummary', { name: person.name, role: role.name, count: gaps }) : t('skillmap.charts.person.noRole', { name: person.name });

  if (showTable) {
    return (
      <>
        <p className="chart-summary">{summary}</p>
        <DataTable caption={t('skillmap.charts.person.title')}
          head={[t('skillmap.table.skill'), t('skillmap.table.level'), t('skillmap.table.roleNeeds')]}
          rows={rows.map((row) => [row.skill.name, row.level ?? '—', row.required ?? '—'])} />
      </>
    );
  }

  return (
    <div className="chart" ref={ref}>
      <p className="chart-summary">{summary}</p>
      <ul className="hbar-list has-tags">
        <Scale scale={{ step: 1, top: 5 }} />
        {rows.map((row) => (
          <li key={row.skill.id} className="hbar">
            <a className="hbar-label" href={`#/network?skill=${row.skill.id}`} title={row.skill.name}>{row.skill.name}</a>
            <div className="hbar-track" style={{ '--step': '20%' }}>
              {row.level !== null
                ? <span className="hbar-fill" style={{ '--w': `${row.level * 20}%` }} tabIndex={0} role="img"
                  aria-label={`${row.skill.name}: ${t('skillmap.levelN', { level: row.level })}`}
                  {...bind({
                    value: t('skillmap.levelN', { level: row.level }),
                    label: row.skill.name,
                    note: row.required !== null ? t('skillmap.charts.person.needsNote', { level: row.required }) : t(`skillmap.levels.${row.level}`),
                  })} />
                : <span className="hbar-unknown">{t('skillmap.charts.person.noRecord')}</span>}
              {row.required !== null && <span className="hbar-target" style={{ '--x': `${row.required * 20}%` }} />}
            </div>
            <span className="hbar-value">
              {row.level ?? '—'}
              {row.required !== null && <span className="muted"> / {row.required}</span>}
              {below(row) && <span className="tag tag-warn">{t('skillmap.charts.person.below')}</span>}
            </span>
          </li>
        ))}
      </ul>
      <ul className="chart-legend">
        <li><span className="key-rect fill-series" aria-hidden="true" /> {t('skillmap.charts.person.legendLevel')}</li>
        {role && <li><span className="key-line" aria-hidden="true" /> {t('skillmap.charts.person.legendNeeds')}</li>}
      </ul>
      <ChartTooltip tip={tip} />
    </div>
  );
}

export function SkillLevelsChart({ map, skillId, showTable }) {
  const t = useT();
  const { ref, tip, bind } = useTooltip();
  const [picked, setPicked] = useState(null);
  const distribution = skillId === null ? null : skillDistribution(map, skillId);

  if (!distribution) return <p className="chart-empty">{t('skillmap.charts.skill.none')}</p>;
  const { skill, byLevel, unrecorded, qualified } = distribution;
  const target = skill.targetProficiency ?? 3;

  if (showTable) {
    return (
      <DataTable caption={t('skillmap.charts.skill.title')}
        head={[t('skillmap.table.level'), t('skillmap.table.peopleCount')]}
        rows={[...LEVELS.map((level) => [`${level} · ${t(`skillmap.levels.${level}`)}`, byLevel[level].length]), [t('skillmap.charts.skill.noRecordRow'), unrecorded]]} />
    );
  }

  const counts = LEVELS.map((level) => byLevel[level].length);
  const scale = scaleFor(Math.max(1, ...counts));
  const width = 560;
  const height = 260;
  const left = 36;
  const right = 12;
  const topPad = 30;
  const bottom = 34;
  const plotWidth = width - left - right;
  const plotHeight = height - topPad - bottom;
  const slot = plotWidth / LEVELS.length;
  const barWidth = 24;
  const y = (value) => topPad + plotHeight - (value / scale.top) * plotHeight;
  const x = (index) => left + slot * index + (slot - barWidth) / 2;
  const targetX = left + slot * (target - 1);
  const pick = (level) => setPicked((current) => (current === level ? null : level));

  return (
    <div className="chart-split">
      <div className="chart" ref={ref}>
        <svg className="columns" viewBox={`0 0 ${width} ${height}`} role="group"
          aria-label={t('skillmap.charts.skill.aria', { skill: skill.name, count: qualified, level: target })}>
          {ticksFor(scale).map((value) => (
            <g key={value}>
              <line className={value === 0 ? 'axis' : 'grid'} x1={left} x2={width - right} y1={y(value)} y2={y(value)} />
              <text className="tick" x={left - 8} y={y(value)} dy="0.35em" textAnchor="end">{value}</text>
            </g>
          ))}
          {LEVELS.map((level, index) => {
            const count = counts[index];
            const barHeight = (count / scale.top) * plotHeight;
            return (
              <g key={level}>
                {count > 0 && (
                  <path className={`col col-${level} ${picked && picked !== level ? 'is-dim' : ''}`} d={roundedTop(x(index), y(count), barWidth, barHeight)}
                    tabIndex={0} role="button" aria-pressed={picked === level}
                    aria-label={`${t('skillmap.levelN', { level })}: ${t('skillmap.peopleCount', { count })}`}
                    onClick={() => pick(level)} onKeyDown={onActivate(() => pick(level))}
                    {...bind({ value: t('skillmap.peopleCount', { count }), label: `${t('skillmap.levelN', { level })} · ${t(`skillmap.levels.${level}`)}` })} />
                )}
                {count > 0 && <text className="value" x={x(index) + barWidth / 2} y={y(count) - 6} textAnchor="middle">{count}</text>}
                <text className="tick" x={x(index) + barWidth / 2} y={height - bottom + 18} textAnchor="middle">{level}</text>
              </g>
            );
          })}
          <line className="target" x1={targetX} x2={targetX} y1={topPad - 16} y2={topPad + plotHeight} />
          <text className="target-label" x={targetX + 6} y={topPad - 8}>{t('skillmap.charts.skill.targetLabel', { level: target })}</text>
        </svg>
        <ChartTooltip tip={tip} />
      </div>

      <div>
        <p><strong>{t('skillmap.charts.skill.qualified', { count: qualified, level: target })}</strong></p>
        <p className="muted small">{t('skillmap.charts.skill.unrecorded', { count: unrecorded })}</p>
        {picked
          ? <>
            <h3>{t('skillmap.charts.skill.peopleAt', { level: picked })}</h3>
            <ul className="skill-chips">
              {byLevel[picked].map((person) => <li key={person.id}><a href={`#/network?employee=${person.id}`}>{person.name}</a></li>)}
            </ul>
          </>
          : <p className="chart-note">{t('skillmap.charts.skill.pickHint')}</p>}
      </div>
    </div>
  );
}
