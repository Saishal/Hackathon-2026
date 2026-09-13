import { useCallback, useEffect, useState } from 'react';
import { keystoneApi } from '../api/keystone';
import { useSession } from '../session';
import { can, formatDate, plural, relativeTime } from './format';
import Icon from './Icon';
import RecentActivity from './RecentActivity';
import RiskAcknowledgeDialog from './RiskAcknowledgeDialog';
import { Coverage, FormError, ScoreMeter, Skeleton } from './ui';

const HEALTH_LABELS = { good: 'Good', needs_attention: 'Needs attention', at_risk: 'At risk' };

function RiskTable({ rows, owners, canAcknowledge, onAcknowledge }) {
  return (
    <div className="table-wrap flush">
      <table>
        <thead>
          <tr>
            <th scope="col">Skill</th>
            <th scope="col">Qualified people</th>
            <th scope="col" className="num">Criticality</th>
            <th scope="col">Dependency score</th>
            <th scope="col">Owner</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((skill) => {
            const owned = owners.get(skill.id);
            return (
              <tr key={skill.id}>
                <th scope="row">
                  {skill.name}
                  <small className="cell-sub">Level {skill.targetProficiency}+ needed</small>
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
                          Due {formatDate(owned.dueDate)}
                          {owned.overdue && <> · <span className="tag tag-danger">Overdue</span></>}
                          {!owned.overdue && owned.reviewDue && ' · review due'}
                        </small>
                      </span>
                    ) : <span className="muted">No owner</span>}
                    {canAcknowledge && (
                      <button type="button" className="btn btn-quiet btn-sm" onClick={() => onAcknowledge(skill, owned)}
                        aria-label={`${owned ? 'Update the owner of' : 'Assign an owner to'} ${skill.name}`}>
                        {owned ? 'Update' : 'Assign owner'}
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

// Overview: headline counts, the skills that rest on one person or nobody, who owns each known risk, the
// people with the highest dependency scores, and recent high-signal activity.
export default function Overview({ risks, quality, organization, onChanged }) {
  const session = useSession();
  const [people, setPeople] = useState(null);
  const [acknowledgements, setAcknowledgements] = useState(null);
  const [ackError, setAckError] = useState(null);
  const [showAll, setShowAll] = useState(false);
  const [dialog, setDialog] = useState(null);
  const [message, setMessage] = useState('');
  const [exportError, setExportError] = useState(null);
  const [exporting, setExporting] = useState(false);
  const canAcknowledge = can(session, 'risk.acknowledge');

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

  const { skills } = risks;
  const atRisk = skills.filter((skill) => skill.busFactor <= 1);
  const rows = showAll || atRisk.length === 0 ? skills : atRisk;
  const top = skills[0];
  const owners = new Map((acknowledgements ?? []).filter((item) => item.riskType === 'skill').map((item) => [item.entityId, item]));
  const unowned = rows.filter((skill) => !owners.has(skill.id));
  const owned = rows.filter((skill) => owners.has(skill.id));
  const topPeople = people ? people.employees.filter((employee) => employee.keystoneScore > 0).slice(0, 4) : [];
  const openDialog = (skill, existing) => setDialog({ risk: { type: 'skill', id: skill.id, name: skill.name }, existing });

  return (
    <>
      <div className="overview-meta">
        <span className="muted">
          Official data last changed {organization?.dataUpdatedAt ? relativeTime(organization.dataUpdatedAt) : 'at an unrecorded time'}
          {risks.visibility === 'team' ? ' · showing your team' : ''}
        </span>
        {quality && !quality.error && (
          <a className={`health-pill health-${quality.summary.health}`} href="#/quality">
            <Icon name="shield" size={14} /> Data health {quality.summary.score}/100 · {HEALTH_LABELS[quality.summary.health]}
            <span className="muted">&nbsp;· {plural(quality.summary.open, 'open issue')}</span>
          </a>
        )}
        {can(session, 'export.risks') && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={exportRisks} disabled={exporting}>
            <Icon name="download" size={16} /> {exporting ? 'Exporting…' : 'Export CSV'}
          </button>
        )}
      </div>
      <FormError error={exportError} />
      {message && <p className="status-line" role="status"><Icon name="check" size={16} /><span>{message}</span></p>}

      <section className="stat-strip" aria-label="Summary">
        <div className="stat">
          <p className="stat-label">No one qualified</p>
          <p className={`stat-value ${risks.uncovered > 0 ? 'text-danger' : ''}`}>{risks.uncovered}</p>
          <p className="stat-note">{risks.uncovered === 1 ? 'skill' : 'skills'} with nobody at the target level</p>
        </div>
        <div className="stat">
          <p className="stat-label">Covered by one person</p>
          <p className={`stat-value ${risks.singleHolder > 0 ? 'text-warn' : ''}`}>{risks.singleHolder}</p>
          <p className="stat-note">{risks.singleHolder === 1 ? 'skill' : 'skills'} with a single qualified person</p>
        </div>
        <div className="stat">
          <p className="stat-label">Skills tracked</p>
          <p className="stat-value">{skills.length}</p>
          <p className="stat-note">in the workforce inventory</p>
        </div>
        <div className="stat">
          <p className="stat-label">Highest dependency</p>
          <p className="stat-value">{top ? <>{top.keystoneScore}<span className="stat-unit">/100</span></> : '—'}</p>
          <p className="stat-note">{top?.name ?? 'No skills recorded'}</p>
        </div>
      </section>

      <div className="overview-grid">
        <div className="stack">
          <section className="panel panel-flush">
            <div className="panel-head">
              <div>
                <h2>{showAll ? 'Skills without an owner' : 'Skills at risk without an owner'}</h2>
                <p>Highest dependency score first. A score is the same whether or not its risk has an owner.</p>
              </div>
              {atRisk.length > 0 && atRisk.length < skills.length && (
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowAll((value) => !value)}>
                  {showAll ? 'Show at-risk only' : `Show all ${skills.length}`}
                </button>
              )}
            </div>
            {ackError && <div className="pad-x"><FormError error={ackError} /></div>}
            {acknowledgements === null && !ackError && <div className="pad"><Skeleton lines={4} /></div>}
            {acknowledgements !== null && unowned.length === 0 && <p className="empty-line pad">Every skill in this list has an owner.</p>}
            {acknowledgements !== null && unowned.length > 0 && (
              <RiskTable rows={unowned} owners={owners} canAcknowledge={canAcknowledge} onAcknowledge={openDialog} />
            )}
          </section>

          {owned.length > 0 && (
            <section className="panel panel-flush">
              <div className="panel-head">
                <div>
                  <h2>Acknowledged risks</h2>
                  <p>Known risks with an owner and a review date. They still count in every score above.</p>
                </div>
              </div>
              <RiskTable rows={owned} owners={owners} canAcknowledge={canAcknowledge} onAcknowledge={openDialog} />
            </section>
          )}
        </div>

        <div className="stack">
          <section className="panel">
            <div className="panel-head">
              <div>
                <h2>Most depended on</h2>
                <p>The people with the highest dependency scores{risks.visibility === 'team' ? ' in your team' : ''}.</p>
              </div>
            </div>
            {people === null && <Skeleton lines={4} />}
            {people === false && <p className="muted">Key people couldn't load. Refresh the page to try again.</p>}
            {people && topPeople.length === 0 && <p className="muted">No skill depends on a single person on current evidence.</p>}
            {people && topPeople.length > 0 && (
              <ul className="people-mini">
                {topPeople.map((employee) => (
                  <li key={employee.id}>
                    <div>
                      <strong>{employee.name}</strong>
                      <small>{employee.newlyUncovered?.length
                        ? `Only qualified person for ${employee.newlyUncovered.join(', ')}`
                        : `Qualified in ${plural(employee.recordedSkills, 'skill')}`}</small>
                    </div>
                    <ScoreMeter score={employee.keystoneScore} />
                  </li>
                ))}
              </ul>
            )}
            <a className="link-arrow" href="#/people">See all key people <Icon name="arrow" size={16} /></a>
          </section>
          {can(session, 'audit.read') && <RecentActivity />}
        </div>
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
