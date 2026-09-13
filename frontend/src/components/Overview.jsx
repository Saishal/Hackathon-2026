import { useCallback, useEffect, useState } from 'react';
import { keystoneApi } from '../api/keystone';
import { useUrlFilters } from '../filters/useUrlFilters';
import { GLOSSARY } from '../help/content';
import { useT } from '../preferences/context';
import { usePersistentState } from '../preferences/usePersistentState';
import { useSession } from '../session';
import { isViewAllowed } from '../views';
import Disclosure from './Disclosure';
import FilterBar from './FilterBar';
import { can, formatDate, relativeTime } from './format';
import HelpTopic from './HelpTopic';
import Icon from './Icon';
import RecentActivity from './RecentActivity';
import RiskAcknowledgeDialog from './RiskAcknowledgeDialog';
import Suggestions from './Suggestions';
import { Coverage, FormError, ScoreMeter, Skeleton } from './ui';

const RISK_FILTERS = { coverage: '', criticality: '', owner: '' };
const HEALTH_TONE = { good: 'ok', needs_attention: 'warn', at_risk: 'danger' };
const RISK_TERMS = ['coverage-target', 'bus-factor', 'keystone-score', 'risk-acknowledgement'];
const LAUNCHERS = [
  ['network', 'network'], ['people', 'people'], ['timemachine', 'timemachine'], ['ai', 'ai'],
  ['reviews', 'inbox'], ['quality', 'shield'], ['data', 'data'], ['audit', 'audit'],
];

function RiskTable({ rows, owners, canAcknowledge, onAcknowledge }) {
  const t = useT();
  return (
    <div className="table-wrap flush">
      <table>
        <thead>
          <tr>
            <th scope="col">{t('overview.table.skill')}</th>
            <th scope="col">{t('overview.table.qualified')}</th>
            <th scope="col" className="num">{t('overview.table.criticality')}</th>
            <th scope="col">{t('overview.table.score')}</th>
            <th scope="col">{t('overview.table.owner')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((skill) => {
            const owned = owners.get(skill.id);
            return (
              <tr key={skill.id}>
                <th scope="row">
                  {skill.name}
                  <small className="cell-sub">{t('overview.table.levelNeeded', { level: skill.targetProficiency })}</small>
                </th>
                <td><Coverage holders={skill.busFactor} needed={skill.requiredHolders} /></td>
                <td className="num">{skill.criticality}/5</td>
                <td><ScoreMeter score={skill.keystoneScore} /></td>
                <td>
                  <div className="owner-cell">
                    {owned ? (
                      <span>
                        {owned.owner.name}
                        <small className="cell-sub">
                          {t('overview.table.due', { date: formatDate(owned.dueDate) })}
                          {owned.overdue && <> · <span className="tag tag-danger">{t('overview.table.overdue')}</span></>}
                          {!owned.overdue && owned.reviewDue && ` · ${t('overview.table.reviewDue')}`}
                        </small>
                      </span>
                    ) : <span className="muted">{t('overview.table.noOwner')}</span>}
                    {canAcknowledge && (
                      <button type="button" className="btn btn-quiet btn-sm" onClick={() => onAcknowledge(skill, owned)}
                        aria-label={t(owned ? 'overview.table.updateAria' : 'overview.table.assignAria', { skill: skill.name })}>
                        {owned ? t('overview.table.update') : t('overview.table.assign')}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const greetingKey = () => {
  const hour = new Date().getHours();
  return hour < 12 ? 'overview.greeting.morning' : hour < 18 ? 'overview.greeting.afternoon' : 'overview.greeting.evening';
};

// Overview: one status line, four headline tiles that open what they count, shortcuts to every page this role
// can use, and the detail (risk register, owners, suggestions, key people, activity) in sections that open on
// demand. Which sections are open is remembered per person in this browser.
export default function Overview({ risks, quality, organization, onChanged }) {
  const t = useT();
  const session = useSession();
  const [people, setPeople] = useState(null);
  const [acknowledgements, setAcknowledgements] = useState(null);
  const [ackError, setAckError] = useState(null);
  const [showAll, setShowAll] = useState(false);
  const [dialog, setDialog] = useState(null);
  const [message, setMessage] = useState('');
  const [exportError, setExportError] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [pendingReviews, setPendingReviews] = useState(null);
  const [suggestionCount, setSuggestionCount] = useState(null);
  const risk = useUrlFilters(RISK_FILTERS);
  const [storedOpen, setStoredOpen] = usePersistentState(`keystone.overview.${session.user.id}`, []);
  // Arriving with risk filters in the address (a saved view or a shared link) opens the table they filter.
  const [linkedOpen, setLinkedOpen] = useState(() => risk.active.length > 0);
  const canAcknowledge = can(session, 'risk.acknowledge');
  const canReview = can(session, 'changes.review.people', 'changes.review.planning');
  const readsQuality = Boolean(quality && !quality.error);
  const openIds = Array.isArray(storedOpen) ? storedOpen : [];

  const loadAcknowledgements = useCallback(async () => {
    try {
      setAcknowledgements((await keystoneApi.acknowledgements('active')).items);
      setAckError(null);
    } catch (failure) {
      setAckError(failure);
    }
  }, []);

  useEffect(() => {
    let active = true;
    keystoneApi.employeeRisks()
      .then((result) => { if (active) setPeople(result); })
      .catch(() => { if (active) setPeople(false); });
    loadAcknowledgements();
    return () => { active = false; };
  }, [loadAcknowledgements]);

  useEffect(() => {
    if (!canReview) return undefined;
    let active = true;
    keystoneApi.changeRequests({ status: 'submitted' })
      .then((result) => { if (active) setPendingReviews(result.awaitingMyReview); })
      .catch(() => { if (active) setPendingReviews(null); });
    return () => { active = false; };
  }, [canReview]);

  async function exportRisks() {
    setExporting(true);
    setExportError(null);
    try {
      await keystoneApi.exportRisks(showAll ? 'all' : 'at-risk');
    } catch (failure) {
      setExportError(failure);
    } finally {
      setExporting(false);
    }
  }

  const isOpen = (id) => openIds.includes(id) || (id === 'risks' && linkedOpen);
  const toggle = (id) => {
    if (!isOpen(id)) {
      setStoredOpen([...openIds, id]);
      return;
    }
    if (id === 'risks') setLinkedOpen(false);
    setStoredOpen(openIds.filter((entry) => entry !== id));
  };
  const reveal = (id) => {
    if (!openIds.includes(id)) setStoredOpen([...openIds, id]);
    requestAnimationFrame(() => document.getElementById(`overview-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };
  const showCoverage = (coverage) => {
    setShowAll(false);
    risk.replace({ coverage });
    reveal('risks');
  };

  const { skills } = risks;
  const atRisk = skills.filter((skill) => skill.busFactor <= 1);
  const rows = showAll || atRisk.length === 0 ? skills : atRisk;
  const top = skills[0];
  const owners = new Map((acknowledgements ?? []).filter((item) => item.riskType === 'skill').map((item) => [item.entityId, item]));
  // The same filtered list feeds the two tables and the counts, so they never disagree.
  const filtered = rows.filter((skill) => {
    const { coverage, criticality, owner } = risk.filters;
    if (coverage === 'uncovered' && skill.busFactor !== 0) return false;
    if (coverage === 'single' && skill.busFactor !== 1) return false;
    if (coverage === 'covered' && skill.busFactor <= 1) return false;
    if (criticality && skill.criticality < Number(criticality)) return false;
    if (owner === 'unowned' && owners.has(skill.id)) return false;
    if (owner === 'owned' && !owners.has(skill.id)) return false;
    return true;
  });
  const unowned = filtered.filter((skill) => !owners.has(skill.id));
  const owned = filtered.filter((skill) => owners.has(skill.id));
  const keyPeople = people ? people.employees.filter((employee) => employee.keystoneScore > 0) : [];
  const openDialog = (skill, existing) => setDialog({ risk: { type: 'skill', id: skill.id, name: skill.name }, existing });
  const firstName = session.user.displayName.split(/\s+/)[0];
  const coverageWords = { uncovered: t('overview.filters.uncovered'), single: t('overview.filters.single'), covered: t('overview.filters.covered') };

  const statusLine = risks.uncovered + risks.singleHolder === 0
    ? t('overview.status.clear')
    : [
      risks.uncovered > 0 && t('overview.status.uncovered', { count: risks.uncovered }),
      risks.singleHolder > 0 && t('overview.status.single', { count: risks.singleHolder }),
    ].filter(Boolean).join(' · ');

  const tiles = [
    {
      id: 'uncovered', icon: 'unmet', label: t('overview.kpi.uncovered'), value: risks.uncovered,
      note: t('overview.kpi.uncoveredNote', { count: risks.uncovered }), tone: risks.uncovered > 0 ? 'danger' : 'ok',
      action: t('overview.kpi.showSkills'), onClick: () => showCoverage('uncovered'),
    },
    {
      id: 'single', icon: 'user', label: t('overview.kpi.single'), value: risks.singleHolder,
      note: t('overview.kpi.singleNote', { count: risks.singleHolder }), tone: risks.singleHolder > 0 ? 'warn' : 'ok',
      action: t('overview.kpi.showSkills'), onClick: () => showCoverage('single'),
    },
    {
      id: 'people', icon: 'people', label: t('overview.kpi.keyPeople'), value: people ? keyPeople.length : '—',
      note: keyPeople[0] ? t('overview.kpi.topPerson', { name: keyPeople[0].name, score: keyPeople[0].keystoneScore }) : t('overview.kpi.noKeyPeople'),
      action: t('overview.kpi.openPeople'),
      ...(isViewAllowed(session, 'people') ? { href: '#/people' } : { onClick: () => reveal('people') }),
    },
    readsQuality && isViewAllowed(session, 'quality')
      ? {
        id: 'health', icon: 'shield', label: t('overview.kpi.health'), value: quality.summary.score, unit: '/100',
        note: `${t(`overview.health.${quality.summary.health}`)} · ${t('overview.kpi.openIssues', { count: quality.summary.open })}`,
        tone: HEALTH_TONE[quality.summary.health], action: t('overview.kpi.openQuality'), href: '#/quality',
      }
      : {
        id: 'highest', icon: 'target', label: t('overview.kpi.highest'), value: top ? top.keystoneScore : '—', unit: top ? '/100' : null,
        note: top?.name ?? t('overview.kpi.noSkills'), action: t('overview.kpi.showSkills'),
        onClick: () => { setShowAll(true); risk.reset(); reveal('risks'); },
      },
  ];

  const launchers = LAUNCHERS.filter(([id]) => isViewAllowed(session, id)).map(([id, icon]) => {
    const badge = id === 'reviews' && pendingReviews > 0 ? { value: pendingReviews, tone: 'warn' }
      : id === 'quality' && readsQuality && quality.summary.open > 0
        ? { value: quality.summary.open, tone: quality.summary.health === 'at_risk' ? 'danger' : 'warn' } : null;
    return { id, icon, key: id === 'reviews' && !canReview ? 'submissions' : id, badge };
  });

  return (
    <>
      <div className="overview-hero">
        <div>
          <h2>{t(greetingKey(), { name: firstName })}</h2>
          <p>{statusLine}</p>
          <p className="muted small">
            {t('overview.updated', { when: organization?.dataUpdatedAt ? relativeTime(organization.dataUpdatedAt) : t('overview.updatedUnknown') })}
            {risks.visibility === 'team' ? ` · ${t('overview.teamOnly')}` : ''}
          </p>
        </div>
        {can(session, 'export.risks') && (
          <div className="overview-hero-actions">
            <button type="button" className="btn btn-secondary btn-sm" onClick={exportRisks} disabled={exporting}>
              <Icon name="download" size={16} /> {exporting ? t('overview.exporting') : t('overview.export')}
            </button>
          </div>
        )}
      </div>
      <FormError error={exportError} />
      {message && <p className="status-line" role="status"><Icon name="check" size={16} /><span>{message}</span></p>}

      <section className="kpi-grid" aria-label={t('overview.kpi.aria')}>
        {tiles.map((tile) => {
          const className = `kpi ${tile.tone ? `tone-${tile.tone}` : ''}`;
          const content = (
            <>
              <span className="kpi-top">{tile.label}<Icon name={tile.icon} size={18} /></span>
              <span className="kpi-value">{tile.value}{tile.unit && <span className="kpi-unit">{tile.unit}</span>}</span>
              <span className="kpi-note" title={tile.note}>{tile.note}</span>
              <span className="kpi-go">{tile.action} <Icon name="arrow" size={14} /></span>
            </>
          );
          return tile.href
            ? <a key={tile.id} className={className} href={tile.href}>{content}</a>
            : <button key={tile.id} type="button" className={className} onClick={tile.onClick}>{content}</button>;
        })}
      </section>

      {launchers.length > 0 && (
        <nav aria-labelledby="overview-launch-title">
          <h2 className="section-title" id="overview-launch-title">{t('overview.launch.title')}</h2>
          <ul className="launcher">
            {launchers.map((item) => (
              <li key={item.id}>
                <a className="launch-tile" href={`#/${item.id}`}>
                  <span className="launch-icon" aria-hidden="true"><Icon name={item.icon} size={18} /></span>
                  <span className="launch-label">
                    {t(`overview.launch.${item.key}.label`)}
                    <small>{t(`overview.launch.${item.key}.hint`)}</small>
                  </span>
                  {item.badge && <>
                    <span className={`count-badge tone-${item.badge.tone}`} aria-hidden="true">{item.badge.value}</span>
                    <span className="sr-only">{t(`overview.launch.badge.${item.id}`, { count: item.badge.value })}</span>
                  </>}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      )}

      <h2 className="section-title">{t('overview.sections.title')}</h2>
      <div className="disclosure-stack">
        <Disclosure id="overview-risks" icon="alert" tone={unowned.length > 0 ? 'danger' : undefined}
          title={showAll ? t('overview.sections.risks.titleAll') : t('overview.sections.risks.title')}
          summary={t('overview.sections.risks.summary')}
          count={acknowledgements === null ? null : unowned.length}
          open={isOpen('risks')} onToggle={() => toggle('risks')}
          actions={atRisk.length > 0 && atRisk.length < skills.length && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowAll((value) => !value)}>
              {showAll ? t('overview.sections.risks.atRiskOnly') : t('overview.sections.risks.showAll', { count: skills.length })}
            </button>
          )}>
          <FilterBar view="overview" filters={risk.filters} active={risk.active}
            labels={{ coverage: t('overview.filters.coverage'), criticality: t('overview.filters.criticality'), owner: t('overview.filters.owner') }}
            formatValue={(key, value) => (key === 'coverage' ? coverageWords[value]
              : key === 'criticality' ? t('overview.filters.criticalityValue', { level: value })
                : value === 'unowned' ? t('overview.filters.unowned') : t('overview.filters.owned'))}
            onRemove={(key) => risk.setFilter(key)('')} onReset={risk.reset} onApply={risk.replace}
            total={rows.length} shown={filtered.length} noun={t('overview.filters.noun')}
            emptyHint={t('overview.filters.emptyHint')}>
            <label className="field field-inline">{t('overview.filters.coverage')}
              <select value={risk.filters.coverage} onChange={risk.setFilter('coverage')}>
                <option value="">{t('overview.filters.any')}</option>
                <option value="uncovered">{coverageWords.uncovered}</option>
                <option value="single">{coverageWords.single}</option>
                <option value="covered">{coverageWords.covered}</option>
              </select>
            </label>
            <label className="field field-inline">{t('overview.filters.criticality')}
              <select value={risk.filters.criticality} onChange={risk.setFilter('criticality')}>
                <option value="">{t('overview.filters.any')}</option>
                <option value="5">{t('overview.filters.critical5')}</option>
                <option value="4">{t('overview.filters.criticalityValue', { level: 4 })}</option>
                <option value="3">{t('overview.filters.criticalityValue', { level: 3 })}</option>
              </select>
            </label>
            <label className="field field-inline">{t('overview.filters.owner')}
              <select value={risk.filters.owner} onChange={risk.setFilter('owner')}>
                <option value="">{t('overview.filters.any')}</option>
                <option value="unowned">{t('overview.filters.unowned')}</option>
                <option value="owned">{t('overview.filters.owned')}</option>
              </select>
            </label>
          </FilterBar>
          {ackError && <div className="pad-x"><FormError error={ackError} /></div>}
          {acknowledgements === null && !ackError && <div className="pad"><Skeleton lines={4} /></div>}
          {acknowledgements !== null && unowned.length === 0 && filtered.length > 0 && <p className="empty-line pad">{t('overview.sections.risks.allOwned')}</p>}
          {acknowledgements !== null && unowned.length > 0 && (
            <RiskTable rows={unowned} owners={owners} canAcknowledge={canAcknowledge} onAcknowledge={openDialog} />
          )}
          <p className="pad muted small">
            {t('overview.sections.risks.terms')}{' '}
            {RISK_TERMS.map((id) => <span key={id} className="nowrap">{GLOSSARY[id]?.term ?? id}<HelpTopic id={id} />{' '}</span>)}
          </p>
        </Disclosure>

        {owned.length > 0 && (
          <Disclosure id="overview-owned" icon="flag" tone="accent" title={t('overview.sections.owned.title')}
            summary={t('overview.sections.owned.summary')} count={owned.length}
            open={isOpen('owned')} onToggle={() => toggle('owned')}>
            <RiskTable rows={owned} owners={owners} canAcknowledge={canAcknowledge} onAcknowledge={openDialog} />
          </Disclosure>
        )}

        <Disclosure id="overview-suggestions" icon="target" tone={suggestionCount ? 'warn' : undefined}
          title={t('overview.sections.suggestions.title')} summary={t('overview.sections.suggestions.summary')}
          count={suggestionCount} open={isOpen('suggestions')} onToggle={() => toggle('suggestions')}>
          <Suggestions embedded refreshKey={organization?.dataUpdatedAt ?? risks?.skills?.length} onCount={setSuggestionCount} />
        </Disclosure>

        <Disclosure id="overview-people" icon="people" title={t('overview.sections.people.title')}
          summary={risks.visibility === 'team' ? t('overview.sections.people.summaryTeam') : t('overview.sections.people.summary')}
          count={people ? keyPeople.length : null} open={isOpen('people')} onToggle={() => toggle('people')}>
          <div className="pad">
            {people === null && <Skeleton lines={4} />}
            {people === false && <p className="muted">{t('overview.sections.people.loadError')}</p>}
            {people && keyPeople.length === 0 && <p className="muted">{t('overview.sections.people.none')}</p>}
            {people && keyPeople.length > 0 && (
              <ul className="people-mini">
                {keyPeople.slice(0, 5).map((employee) => (
                  <li key={employee.id}>
                    <div>
                      <strong>{employee.name}</strong>
                      <small>{employee.newlyUncovered?.length
                        ? t('overview.sections.people.onlyPerson', { skills: employee.newlyUncovered.join(', ') })
                        : t('overview.sections.people.qualifiedIn', { count: employee.recordedSkills })}</small>
                    </div>
                    <ScoreMeter score={employee.keystoneScore} />
                  </li>
                ))}
              </ul>
            )}
            {isViewAllowed(session, 'people') && <a className="link-arrow" href="#/people">{t('overview.sections.people.seeAll')} <Icon name="arrow" size={16} /></a>}
          </div>
        </Disclosure>

        {can(session, 'audit.read') && (
          <Disclosure id="overview-activity" icon="activity" title={t('overview.sections.activity.title')}
            summary={t('overview.sections.activity.summary')} open={isOpen('activity')} onToggle={() => toggle('activity')}>
            <div className="pad"><RecentActivity embedded /></div>
          </Disclosure>
        )}
      </div>

      {dialog && (
        <RiskAcknowledgeDialog
          risk={dialog.risk}
          existing={dialog.existing}
          onClose={() => setDialog(null)}
          onSaved={async (_saved, text) => {
            setDialog(null);
            setMessage(text);
            await loadAcknowledgements();
            onChanged?.();
          }}
        />
      )}
    </>
  );
}
