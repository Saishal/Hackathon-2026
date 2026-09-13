import { useEffect, useState } from 'react';
import { keystoneApi } from '../api/keystone';
import { plural } from './format';
import Icon from './Icon';
import { Coverage, ScoreMeter, Skeleton } from './ui';

// Overview: the headline counts, the skills that rest on one person or nobody, and the people with
// the highest dependency scores. Every at-risk skill the counts include is listed, not a fixed top
// three, so skills tied on score are never hidden.
export default function Overview({ risks }) {
  const [people, setPeople] = useState(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    let active = true;
    keystoneApi.employeeRisks()
      .then((result) => { if (active) setPeople(result); })
      .catch(() => { if (active) setPeople(false); });
    return () => { active = false; };
  }, []);

  const { skills } = risks;
  const atRisk = skills.filter((skill) => skill.busFactor <= 1);
  const rows = showAll || atRisk.length === 0 ? skills : atRisk;
  const top = skills[0];
  const topPeople = people ? people.employees.filter((employee) => employee.keystoneScore > 0).slice(0, 4) : [];

  return (
    <>
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
        <section className="panel panel-flush">
          <div className="panel-head">
            <div>
              <h2>{showAll ? 'All skills' : 'Skills at risk'}</h2>
              <p>{showAll ? 'Highest dependency score first.' : 'Skills with one qualified person or none, highest dependency score first.'}</p>
            </div>
            {atRisk.length > 0 && atRisk.length < skills.length && (
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowAll((value) => !value)}>
                {showAll ? 'Show at-risk only' : `Show all ${skills.length}`}
              </button>
            )}
          </div>
          <div className="table-wrap flush">
            <table>
              <thead>
                <tr>
                  <th scope="col">Skill</th>
                  <th scope="col">Qualified people</th>
                  <th scope="col" className="num">Criticality</th>
                  <th scope="col">Dependency score</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((skill) => (
                  <tr key={skill.id}>
                    <th scope="row">
                      {skill.name}
                      <small className="cell-sub">Level {skill.targetProficiency}+ needed</small>
                    </th>
                    <td><Coverage holders={skill.busFactor} needed={skill.requiredHolders} /></td>
                    <td className="num">{skill.criticality}/5</td>
                    <td><ScoreMeter score={skill.keystoneScore} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>Most depended on</h2>
              <p>The people with the highest dependency scores.</p>
            </div>
          </div>
          {people === null && <Skeleton lines={4} />}
          {people === false && <p className="muted">Key people can't be loaded while the backend is offline.</p>}
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
      </div>
    </>
  );
}
