import { useEffect, useState } from 'react';
import { keystoneApi } from '../api/keystone';
import Icon from './Icon';
import Provenance from './Provenance';

// WorkforceSnapshot renders the v1 snapshot fields Member 1 shipped, one tab per record type:
// skills (with demandTarget), roles (succession), learningResources (catalogue),
// futureRequirements (effective-dated), mentoring capacity on people, and evidence provenance on
// matrix edges. One search filters every tab.
//
// Honest-rendering rules (Member 1's, and they matter for the demo):
//   - mentoringHoursPerMonth ABSENT  => dash, never 0
//   - lastVerifiedAt null            => dash, never "never verified"
//   - demandTarget 0/null            => dash (zero demand is not a target)
//   - provenance 'fictional demo …'  => labeled, so we never overclaim.

const DASH = '—';
const dash = (value) => (value === null || value === undefined || value === '' ? DASH : value);
const capitalize = (text) => (typeof text === 'string' && text ? text.charAt(0).toUpperCase() + text.slice(1).replaceAll('_', ' ') : dash(text));

const TABS = [
  ['skills', 'Skills'],
  ['roles', 'Roles'],
  ['learning', 'Learning'],
  ['future', 'Future needs'],
  ['people', 'People'],
  ['evidence', 'Evidence'],
];

export default function WorkforceSnapshot({ workforce, fallbackRequirements = null }) {
  const [futureRequirements, setFutureRequirements] = useState(null);
  const [reqError, setReqError] = useState('');
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState('skills');

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

  const needle = query.trim().toLowerCase();
  const matches = (...values) => !needle || values.some((value) => String(value ?? '').toLowerCase().includes(needle));
  const shownSkills = skills.filter((skill) => matches(skill.name));
  const shownRoles = roles.filter((role) => matches(role.name, ...(role.incumbentIds ?? []).map(employeeName)));
  const shownResources = learningResources.filter((resource) => matches(resource.title, resource.category, ...(resource.skillIds ?? []).map(skillName)));
  const shownFuture = (futureRequirements ?? []).filter((req) => matches(req.skillName ?? skillName(req.skillId), req.status));
  const shownEmployees = employees.filter((employee) => matches(employee.name, employee.role, employee.department));
  const shownMatrix = matrix.filter((edge) => matches(employeeName(edge.employeeId), skillName(edge.skillId), edge.evidenceSource));
  const withCapacity = employees.filter((employee) => employee.mentoringHoursPerMonth !== undefined).length;

  const counts = {
    skills: shownSkills.length, roles: shownRoles.length, learning: shownResources.length,
    future: futureRequirements ? shownFuture.length : null, people: shownEmployees.length, evidence: shownMatrix.length,
  };
  const noMatch = (noun) => <p className="empty-line">No {noun} match “{query.trim()}”.</p>;

  const moveTab = (event) => {
    const index = TABS.findIndex(([id]) => id === tab);
    const next = event.key === 'ArrowRight' ? (index + 1) % TABS.length
      : event.key === 'ArrowLeft' ? (index - 1 + TABS.length) % TABS.length : null;
    if (next === null) return;
    event.preventDefault();
    setTab(TABS[next][0]);
    document.getElementById(`tab-${TABS[next][0]}`)?.focus();
  };

  return (
    <section className="panel panel-flush">
      <div className="data-toolbar">
        <form className="search" role="search" onSubmit={(event) => event.preventDefault()}>
          <Icon name="search" size={16} />
          <input type="search" aria-label="Search records" value={query} onChange={(event) => setQuery(event.target.value)}
            placeholder="Search people, roles, skills or evidence" />
        </form>
        {needle && <p className="muted" role="status">Tab counts show matches for “{query.trim()}”.</p>}
      </div>

      <div className="tabs" role="tablist" aria-label="Record types">
        {TABS.map(([id, label]) => (
          <button key={id} id={`tab-${id}`} type="button" role="tab" className="tab" aria-selected={tab === id}
            aria-controls={`tabpanel-${id}`} tabIndex={tab === id ? 0 : -1} onClick={() => setTab(id)} onKeyDown={moveTab}>
            {label}
            {counts[id] !== null && <span className="tab-count">{counts[id]}</span>}
          </button>
        ))}
      </div>

      <div className="tab-panel" role="tabpanel" id={`tabpanel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === 'skills' && <>
          <p className="tab-note">People needed is how many people should be qualified. The hiring target is tracked separately, so a skill can need coverage without any hiring.</p>
          {shownSkills.length === 0 ? noMatch('skills') : <div className="table-wrap flush">
            <table>
              <thead><tr><th scope="col">Skill</th><th scope="col" className="num">Criticality</th><th scope="col" className="num">Target level</th><th scope="col" className="num">People needed</th><th scope="col" className="num">Hiring target</th><th scope="col">Source</th></tr></thead>
              <tbody>
                {shownSkills.map((skill) => (
                  <tr key={skill.id}>
                    <th scope="row">{skill.name}</th>
                    <td className="num">{dash(skill.criticality)}</td>
                    <td className="num">{dash(skill.targetProficiency)}</td>
                    <td className="num">{dash(skill.requiredHolders)}</td>
                    <td className="num">{dash(skill.demandTarget)}</td>
                    <td><Provenance source={skill.metadataSource} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>}
        </>}

        {tab === 'roles' && <>
          <p className="tab-note">What a successor needs for each role. Readiness is calculated from evidence each time, not stored, and role criticality starts neutral until someone edits it.</p>
          {shownRoles.length === 0 ? noMatch('roles') : <div className="table-wrap flush">
            <table>
              <thead><tr><th scope="col">Role</th><th scope="col" className="num">Criticality</th><th scope="col">Current holders</th><th scope="col">Successor needs</th><th scope="col">Source</th></tr></thead>
              <tbody>
                {shownRoles.map((role) => (
                  <tr key={role.id}>
                    <th scope="row">{role.name}</th>
                    <td className="num">{dash(role.criticality)}</td>
                    <td>{role.incumbentIds?.length ? role.incumbentIds.map(employeeName).join(', ') : DASH}</td>
                    <td>{role.requirements?.length ? role.requirements.map((req) => `${skillName(req.skillId)} ${req.minimumProficiency}+`).join(', ') : DASH}</td>
                    <td><Provenance source={role.metadataSource} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>}
        </>}

        {tab === 'learning' && <>
          <p className="tab-note">Verified means the resource exists in the saved catalogue. An AI suggestion can never mark itself verified.</p>
          {shownResources.length === 0 ? noMatch('resources') : <div className="table-wrap flush">
            <table>
              <thead><tr><th scope="col">Resource</th><th scope="col">Type</th><th scope="col">Verified</th><th scope="col">Builds skills</th><th scope="col">Source</th></tr></thead>
              <tbody>
                {shownResources.map((resource) => (
                  <tr key={resource.id}>
                    <th scope="row">{resource.title}</th>
                    <td>{capitalize(resource.category)}</td>
                    <td>{resource.verified ? <span className="tag tag-ok"><Icon name="check" size={14} /> Verified</span> : DASH}</td>
                    <td>{resource.skillIds?.map(skillName).join(', ') || DASH}</td>
                    <td><Provenance source={resource.provenance} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>}
        </>}

        {tab === 'future' && <>
          <p className="tab-note">Proposed needs don't change coverage targets until a person reviews them.</p>
          {reqError && <p role="alert" className="alert">{reqError}</p>}
          {!futureRequirements && !reqError && <p className="empty-line" role="status">Loading future needs…</p>}
          {futureRequirements && futureRequirements.length === 0 && <p className="empty-line">No future needs recorded.</p>}
          {futureRequirements && futureRequirements.length > 0 && (shownFuture.length === 0 ? noMatch('future needs') : <div className="table-wrap flush">
            <table>
              <thead><tr><th scope="col">Skill</th><th scope="col" className="num">People needed</th><th scope="col" className="num">Target level</th><th scope="col" className="num">Starts in month</th><th scope="col">Status</th><th scope="col">Source</th></tr></thead>
              <tbody>
                {shownFuture.map((req) => (
                  <tr key={req.id}>
                    <th scope="row">{req.skillName ?? skillName(req.skillId)}</th>
                    <td className="num">{dash(req.requiredHolders)}</td>
                    <td className="num">{dash(req.targetProficiency)}</td>
                    <td className="num">{dash(req.effectiveMonth)}</td>
                    <td>{capitalize(req.status)}</td>
                    <td><Provenance source={req.provenance} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>)}
        </>}

        {tab === 'people' && <>
          <p className="tab-note">Mentoring time is recorded, never estimated. A dash means unknown, not zero. {withCapacity} of {employees.length} people have it on record.</p>
          {shownEmployees.length === 0 ? noMatch('people') : <div className="table-wrap flush">
            <table>
              <thead><tr><th scope="col">Person</th><th scope="col">Role</th><th scope="col">Department</th><th scope="col" className="num">Mentoring h/month</th></tr></thead>
              <tbody>
                {shownEmployees.map((employee) => (
                  <tr key={employee.id}>
                    <th scope="row">{employee.name}</th>
                    <td>{dash(employee.role)}</td>
                    <td>{dash(employee.department)}</td>
                    <td className="num">{employee.mentoringHoursPerMonth === undefined ? DASH : employee.mentoringHoursPerMonth}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>}
        </>}

        {tab === 'evidence' && <>
          <p className="tab-note">A dash under last verified means unknown, not never verified. If a person and skill have no row, there is no evidence on record either way.</p>
          {shownMatrix.length === 0 ? noMatch('evidence records') : <div className="table-wrap flush">
            <table>
              <thead><tr><th scope="col">Person</th><th scope="col">Skill</th><th scope="col" className="num">Level</th><th scope="col">Evidence source</th><th scope="col">Last verified</th></tr></thead>
              <tbody>
                {shownMatrix.map((edge) => (
                  <tr key={`${edge.employeeId}-${edge.skillId}`}>
                    <th scope="row">{employeeName(edge.employeeId)}</th>
                    <td>{skillName(edge.skillId)}</td>
                    <td className="num">{dash(edge.proficiency)}</td>
                    <td><Provenance source={edge.evidenceSource} /></td>
                    <td className="nowrap">{edge.lastVerifiedAt ?? DASH}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>}
        </>}
      </div>
    </section>
  );
}
