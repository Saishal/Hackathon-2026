import { useEffect, useRef, useState } from 'react';
import { keystoneApi } from '../api/keystone';
import { useSession } from '../session';
import { can, formatDate, plural } from './format';
import Icon from './Icon';
import HelpTopic from './HelpTopic';
import { ErrorState, ScoreMeter, Skeleton } from './ui';

const readiness = {
  ready: ['Ready now', 'tag-ok'],
  developable: ['Needs development', 'tag-warn'],
  evidence_missing: ['Evidence missing', ''],
  unknown: ['Role requirements missing', ''],
};

const firstName = (name) => name.split(' ')[0];

export default function KeystonePeople({ quality, params = {} }) {
  const session = useSession();
  const canSeeOwners = can(session, 'risk.read.org', 'risk.read.team');
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [owners, setOwners] = useState([]);
  const [openId, setOpenId] = useState(Number(params.employee) > 0 ? Number(params.employee) : null);
  const [attempt, setAttempt] = useState(0);
  const scrolled = useRef(false);

  useEffect(() => {
    let active = true;
    keystoneApi.employeeRisks()
      .then((result) => { if (active) { setData(result); setError(null); } })
      .catch((err) => { if (active) setError(err); });
    // Ownership is extra context; the list still works if it can't load.
    if (canSeeOwners) {
      keystoneApi.acknowledgements('active')
        .then((result) => { if (active) setOwners(result.items.filter((item) => item.riskType === 'employee')); })
        .catch(() => {});
    }
    return () => { active = false; };
  }, [attempt, canSeeOwners]);

  // A link such as #/people?employee=12 opens that person and scrolls to them once.
  useEffect(() => {
    if (!data || scrolled.current || openId === null) return;
    document.getElementById(`person-row-${openId}`)?.scrollIntoView({ block: 'center' });
    scrolled.current = true;
  }, [data, openId]);

  if (error) return <ErrorState error={error} title="Couldn't load key people" onRetry={() => setAttempt((value) => value + 1)} />;
  if (!data) return <div className="panel"><Skeleton lines={6} /></div>;

  const top = data.employees.filter((employee) => employee.keystoneScore > 0).slice(0, 6);
  const linked = openId !== null && !top.some((employee) => employee.id === openId) ? data.employees.find((employee) => employee.id === openId) : null;
  const ranked = linked ? [...top, linked] : top;
  const soleHolders = data.soleCoverageHolders;
  const notesFor = (id) => (quality?.issues ?? []).filter((issue) => issue.employeeIds?.includes(id));
  const ownerFor = (id) => owners.find((item) => item.entityId === id);

  return (
    <section className="panel panel-flush">
      <div className="panel-head">
        <div>
          <h2>{plural(soleHolders, 'person', 'people')} {soleHolders === 1 ? 'is' : 'are'} the only qualified holder of a skill</h2>
          <p>
            Ranked by dependency score <HelpTopic id="keystone-score" />. Open a row to see which skills are affected and who could step in.
            {data.visibility === 'team' ? ' Scores use the whole organization; people outside your team are not named.' : ''}
          </p>
        </div>
      </div>

      {ranked.length === 0 ? (
        <div className="empty"><p>No skill depends on a single person on current evidence.</p></div>
      ) : (
        <ul className="person-list">
          {ranked.map((employee) => {
            const open = openId === employee.id;
            const soleSkills = employee.newlyUncovered ?? [];
            const notes = notesFor(employee.id);
            const owner = ownerFor(employee.id);
            return (
              <li key={employee.id} id={`person-row-${employee.id}`} className={open ? 'person open' : 'person'}>
                <button type="button" className="person-row" aria-expanded={open} aria-controls={`person-${employee.id}`}
                  onClick={() => setOpenId(open ? null : employee.id)}>
                  <span className="person-name">
                    <strong>{employee.name}</strong>
                    <small>{employee.role}{employee.department ? ` · ${employee.department}` : ''}</small>
                  </span>
                  <span className="person-summary">
                    {soleSkills.length > 0
                      ? `Only qualified person for ${soleSkills.join(', ')}`
                      : `Qualified in ${plural(employee.recordedSkills, 'skill')}. Each still has another qualified person.`}
                    {(owner || notes.length > 0) && (
                      <span className="record-badges">
                        {owner && <span className="tag tag-accent">Owner: {owner.owner.name}</span>}
                        {notes.length > 0 && <span className="tag severity-warning"><Icon name="alert" size={12} /> {plural(notes.length, 'data note')}</span>}
                      </span>
                    )}
                  </span>
                  <ScoreMeter score={employee.keystoneScore} />
                  <Icon name="chevron" className="chevron" />
                </button>

                {open && (
                  <div className="person-detail" id={`person-${employee.id}`}>
                    <div>
                      <h3>If {firstName(employee.name)} were away <HelpTopic id="succession-readiness" /></h3>
                      <ul className="detail-list">
                        {employee.affectedSkills.map((skill) => (
                          <li key={skill.id}>
                            <div className="detail-line">
                              <strong>{skill.name}</strong>
                              <span className={skill.becomesUncovered ? 'tag tag-danger' : 'tag'}>
                                {skill.busFactorBefore} → {skill.busFactorAfter} qualified
                              </span>
                            </div>
                            <p className="muted">
                              {skill.skillBackups.length === 0
                                ? 'Nobody else has evidence on record for this skill. That means unknown, not incapable.'
                                : `Closest backups: ${skill.skillBackups.map((candidate) => (candidate.redacted
                                  ? `${candidate.name} (${candidate.status === 'ready' ? 'at target' : 'below target'})`
                                  : `${candidate.name} (level ${candidate.proficiency}, ${candidate.status === 'ready' ? 'at target' : 'below target'})`)).join(', ')}`}
                            </p>
                          </li>
                        ))}
                      </ul>

                      {owner && (
                        <p className="muted small">
                          <Icon name="flag" size={14} /> Owned by {owner.owner.name}, due {formatDate(owner.dueDate)}, next review {formatDate(owner.nextReviewDate)}. The score is unchanged.
                        </p>
                      )}
                      {notes.length > 0 && <>
                        <h3>Data notes</h3>
                        <ul className="plain-list">
                          {notes.map((issue) => <li key={issue.fingerprint}><strong>{issue.title}:</strong> {issue.explanation}</li>)}
                        </ul>
                        {can(session, 'dataQuality.read.org', 'dataQuality.read.team') && (
                          <a className="link-arrow" href="#/quality">Open data quality <Icon name="arrow" size={16} /></a>
                        )}
                      </>}
                    </div>

                    <div>
                      <h3>Who could step into the role</h3>
                      {!employee.successionRole ? (
                        <p className="muted">No succession requirements are recorded for this role.</p>
                      ) : (
                        <>
                          <p className="muted">Checked against all {employee.successionRole.requirementCount} requirements for {employee.successionRole.name}.</p>
                          {employee.successors.length === 0 ? (
                            <p className="muted">No candidate has evidence on record for this role.</p>
                          ) : (
                            <ul className="detail-list">
                              {employee.successors.map((candidate, index) => {
                                const [label, tone] = readiness[candidate.status] ?? [candidate.status, ''];
                                return (
                                  <li key={candidate.employeeId ?? `outside-${index}`}>
                                    <div className="detail-line">
                                      <strong>{candidate.name}</strong>
                                      <span className={`tag ${tone}`}>{label}</span>
                                    </div>
                                    <p className="muted">
                                      {candidate.metCount} of {candidate.requirementCount} requirements met
                                      {candidate.unknownCount > 0 ? ` · ${candidate.unknownCount} without evidence` : ''}
                                    </p>
                                  </li>
                                );
                              })}
                            </ul>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
