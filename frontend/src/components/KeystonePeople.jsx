import { useEffect, useState } from 'react';
import { keystoneApi } from '../api/keystone';
import { plural } from './format';
import Icon from './Icon';
import { ScoreMeter, Skeleton } from './ui';

const readiness = {
  ready: ['Ready now', 'tag-ok'],
  developable: ['Needs development', 'tag-warn'],
  evidence_missing: ['Evidence missing', ''],
  unknown: ['Role requirements missing', ''],
};

const firstName = (name) => name.split(' ')[0];

export default function KeystonePeople() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [openId, setOpenId] = useState(null);

  useEffect(() => {
    let active = true;
    keystoneApi.employeeRisks()
      .then((result) => { if (active) setData(result); })
      .catch((err) => { if (active) setError(err.message); });
    return () => { active = false; };
  }, []);

  if (error) return <div className="panel"><p role="alert" className="alert">Couldn't load key people. {error}</p></div>;
  if (!data) return <div className="panel"><Skeleton lines={6} /></div>;

  const ranked = data.employees.filter((employee) => employee.keystoneScore > 0).slice(0, 6);
  const soleHolders = data.soleCoverageHolders;

  return (
    <section className="panel panel-flush">
      <div className="panel-head">
        <div>
          <h2>{plural(soleHolders, 'person', 'people')} {soleHolders === 1 ? 'is' : 'are'} the only qualified holder of a skill</h2>
          <p>Ranked by dependency score. Open a row to see which skills are affected and who could step in.</p>
        </div>
      </div>

      {ranked.length === 0 ? (
        <div className="empty"><p>No skill depends on a single person on current evidence.</p></div>
      ) : (
        <ul className="person-list">
          {ranked.map((employee) => {
            const open = openId === employee.id;
            const soleSkills = employee.newlyUncovered ?? [];
            return (
              <li key={employee.id} className={open ? 'person open' : 'person'}>
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
                  </span>
                  <ScoreMeter score={employee.keystoneScore} />
                  <Icon name="chevron" className="chevron" />
                </button>

                {open && (
                  <div className="person-detail" id={`person-${employee.id}`}>
                    <div>
                      <h3>If {firstName(employee.name)} were away</h3>
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
                                : `Closest backups: ${skill.skillBackups.map((candidate) => `${candidate.name} (level ${candidate.proficiency}, ${candidate.status === 'ready' ? 'at target' : 'below target'})`).join(', ')}`}
                            </p>
                          </li>
                        ))}
                      </ul>
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
                              {employee.successors.map((candidate) => {
                                const [label, tone] = readiness[candidate.status] ?? [candidate.status, ''];
                                return (
                                  <li key={candidate.employeeId}>
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
