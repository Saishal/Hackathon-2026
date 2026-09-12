import { useEffect, useState } from 'react';
import { keystoneApi } from '../api/keystone';
import Provenance from './Provenance';

// WorkforceSnapshot — renders the v1 snapshot fields Member 1 shipped:
// roles (succession), learningResources (catalogue), futureRequirements
// (effective-dated), demandTarget on skills, mentoring capacity on people,
// and evidence provenance on matrix edges.
//
// Honest-rendering rules (Member 1's, and they matter for the demo):
//   - mentoringHoursPerMonth ABSENT  => dash, never 0
//   - lastVerifiedAt null            => dash, never "never verified"
//   - demandTarget 0/null            => dash (zero demand is not a target)
//   - provenance 'fictional demo …'  => labeled, so we never overclaim.

const DASH = '—';
const dash = (value) => (value === null || value === undefined || value === '' ? DASH : value);

export default function WorkforceSnapshot({ workforce, fallbackRequirements = null }) {
  const [futureRequirements, setFutureRequirements] = useState(null);
  const [reqError, setReqError] = useState('');

  useEffect(() => {
    let active = true;
    keystoneApi.futureRequirements()
      .then((rows) => { if (active) setFutureRequirements(rows); })
      .catch((err) => {
        if (!active) return;
        // Offline: fall back to the vendored labeled sample, never a blank section.
        if (fallbackRequirements) setFutureRequirements(fallbackRequirements);
        else setReqError(err.message);
      });
    return () => { active = false; };
  }, [fallbackRequirements]);

  if (!workforce) return null;
  const { employees = [], skills = [], matrix = [], roles = [], learningResources = [] } = workforce;
  const employeeName = (id) => employees.find((e) => e.id === id)?.name ?? `Employee ${id}`;
  const skillName = (id) => skills.find((s) => s.id === id)?.name ?? `Skill ${id}`;

  return (
    <div className="snapshot">
      <h3>Workforce snapshot</h3>
      <p className="hint">
        Coverage requirement (<code>requiredHolders</code>) and legacy hiring demand (<code>demandTarget</code>) are
        reported separately — a skill can need coverage with zero hiring demand.
      </p>

      <div className="table-wrap compact">
        <table>
          <thead>
            <tr>
              <th>Skill</th><th>Criticality</th><th>Target prof.</th><th>Required holders</th>
              <th>Demand target</th><th>Source</th>
            </tr>
          </thead>
          <tbody>
            {skills.map((skill) => (
              <tr key={skill.id}>
                <th scope="row">{skill.name}</th>
                <td>{dash(skill.criticality)}</td>
                <td>{dash(skill.targetProficiency)}</td>
                <td>{dash(skill.requiredHolders)}</td>
                <td>{dash(skill.demandTarget)}</td>
                <td><Provenance source={skill.metadataSource} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3>Roles &amp; succession</h3>
      <p className="hint">Role criticality starts neutral and is meant to be edited — successor qualification is Member 2's calculation, not a stored value.</p>
      {roles.length === 0 ? <p>No roles recorded.</p> : (
        <div className="two-col">
          {roles.map((role) => (
            <article className="panel" key={role.id}>
              <h4>{role.name} · criticality {dash(role.criticality)}</h4>
              <p>
                Incumbent(s): {role.incumbentIds?.length ? role.incumbentIds.map(employeeName).join(', ') : DASH}
              </p>
              <p>Successor requirements:</p>
              <ul>
                {role.requirements?.map((req) => (
                  <li key={req.skillId}>{skillName(req.skillId)} at proficiency {req.minimumProficiency}+</li>
                ))}
                {(!role.requirements || role.requirements.length === 0) && <li>{DASH}</li>}
              </ul>
              <Provenance source={role.metadataSource} />
            </article>
          ))}
        </div>
      )}

      <h3>Learning resource catalogue</h3>
      <p className="hint"><code>verified</code> means the entry exists in the persisted catalogue — no AI output can set that flag for itself.</p>
      {learningResources.length === 0 ? <p>No catalogue entries recorded.</p> : (
        <div className="table-wrap compact">
          <table>
            <thead><tr><th>Resource</th><th>Category</th><th>Verified</th><th>Serves skills</th><th>Provenance</th></tr></thead>
            <tbody>
              {learningResources.map((resource) => (
                <tr key={resource.id}>
                  <th scope="row">{resource.title}</th>
                  <td>{dash(resource.category)}</td>
                  <td>{resource.verified ? '✅' : '—'}</td>
                  <td>{resource.skillIds?.map(skillName).join(', ') || DASH}</td>
                  <td><Provenance source={resource.provenance} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h3>Future requirements</h3>
      <p className="hint">Proposed requirements do not tighten coverage expectations until a person reviews them.</p>
      {reqError && <p role="alert">{reqError}</p>}
      {!futureRequirements && !reqError && <p role="status">Loading future requirements…</p>}
      {futureRequirements && futureRequirements.length === 0 && <p>None recorded.</p>}
      {futureRequirements && futureRequirements.length > 0 && (
        <div className="table-wrap compact">
          <table>
            <thead><tr><th>Skill</th><th>Required holders</th><th>Target prof.</th><th>Effective month</th><th>Status</th><th>Provenance</th></tr></thead>
            <tbody>
              {futureRequirements.map((req) => (
                <tr key={req.id}>
                  <th scope="row">{req.skillName ?? skillName(req.skillId)}</th>
                  <td>{dash(req.requiredHolders)}</td>
                  <td>{dash(req.targetProficiency)}</td>
                  <td>{dash(req.effectiveMonth)}</td>
                  <td>{dash(req.status)}</td>
                  <td><Provenance source={req.provenance} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h3>People &amp; mentoring capacity</h3>
      <p className="hint">Capacity is recorded data, not recomputed. Absent means unknown — shown as a dash, never zero. Only {employees.filter((e) => e.mentoringHoursPerMonth !== undefined).length} of {employees.length} have it recorded.</p>
      <div className="table-wrap compact">
        <table>
          <thead><tr><th>Person</th><th>Role</th><th>Department</th><th>Mentoring hrs/month</th></tr></thead>
          <tbody>
            {employees.map((employee) => (
              <tr key={employee.id}>
                <th scope="row">{employee.name}</th>
                <td>{dash(employee.role)}</td>
                <td>{dash(employee.department)}</td>
                <td>{employee.mentoringHoursPerMonth === undefined ? DASH : employee.mentoringHoursPerMonth}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3>Evidence &amp; verification</h3>
      <p className="hint">A null verification date means unknown — rendered as a dash, not "never verified". Absent edge = unknown proficiency.</p>
      <div className="table-wrap compact">
        <table>
          <thead><tr><th>Person</th><th>Skill</th><th>Proficiency</th><th>Evidence source</th><th>Last verified</th></tr></thead>
          <tbody>
            {matrix.map((edge) => (
              <tr key={`${edge.employeeId}-${edge.skillId}`}>
                <th scope="row">{employeeName(edge.employeeId)}</th>
                <td>{skillName(edge.skillId)}</td>
                <td>{dash(edge.proficiency)}</td>
                <td><Provenance source={edge.evidenceSource} /></td>
                <td>{edge.lastVerifiedAt ?? DASH}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
