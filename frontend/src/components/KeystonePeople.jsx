import { useEffect, useState } from 'react';
import { keystoneApi } from '../api/keystone';

const statusLabel = { ready: 'ready now', developable: 'needs development', evidence_missing: 'evidence missing', unknown: 'requirements missing' };

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
  if (error) return <p role="alert">{error}</p>;
  if (!data) return <p role="status">Scoring organizational dependency…</p>;
  const ranked = data.employees.filter((employee) => employee.keystoneScore > 0).slice(0, 6);
  return <>
    <h3>People your coverage depends on</h3>
    <p>
      <strong>{data.soleCoverageHolders}</strong> {data.soleCoverageHolders === 1 ? 'person is' : 'people are'} the only recorded holder of at least one skill.
      Scores measure organizational dependency, not any prediction that someone will leave.
    </p>
    {ranked.length === 0 ? <p>No skill currently depends on a single person on recorded evidence.</p> : <div className="two-col">
      {ranked.map((employee) => <article className="panel" key={employee.id}>
        <h4>{employee.name} · {employee.keystoneScore}/100</h4>
        <div className="score-track" aria-hidden="true"><div className="score-fill" style={{ width: `${employee.keystoneScore}%` }} /></div>
        <p>{employee.role}{employee.department ? ` · ${employee.department}` : ''}</p>
        <p>{employee.explanation}</p>
        <button type="button" onClick={() => setOpenId(openId === employee.id ? null : employee.id)}>
          {openId === employee.id ? 'Hide affected skills' : `Show ${employee.recordedSkills} affected skill(s)`}
        </button>
        {openId === employee.id && <ul>
          {employee.successionRole && <li>
            <strong>Successor readiness for {employee.successionRole.name}</strong>
            {employee.successors.length === 0
              ? <div>No role candidate evidence is available.</div>
              : <ul>{employee.successors.map((candidate) => <li key={candidate.employeeId}>
                {candidate.name} — {statusLabel[candidate.status]}, {candidate.metCount}/{candidate.requirementCount} requirements met
                {candidate.unknownCount > 0 ? ` · ${candidate.unknownCount} without recorded evidence` : ''}
              </li>)}</ul>}
          </li>}
          {employee.affectedSkills.map((skill) => <li key={skill.id}>
            <strong>{skill.name}</strong> — recorded holders {skill.busFactorBefore} → {skill.busFactorAfter}, gap {skill.gapBefore} → {skill.gapAfter}
            {skill.becomesUncovered ? <span className="gap-positive"> · no recorded holder left</span> : ''}
            <div>
              {skill.skillBackups.length === 0
                ? 'No backup evidence on file. That is missing evidence, not proof that nobody else is capable.'
                : `Skill backups: ${skill.skillBackups.map((candidate) => `${candidate.name} (${candidate.proficiency}/5, ${candidate.status === 'ready' ? 'at target' : 'below target'})`).join(' · ')}`}
            </div>
          </li>)}
        </ul>}
      </article>)}
    </div>}
  </>;
}
