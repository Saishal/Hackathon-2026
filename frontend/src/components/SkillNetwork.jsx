import { useMemo, useState } from 'react';

// Skill map: people on the left, skills on the right, one line per recorded level at or above the
// chosen minimum. A missing line means no evidence on record, which is unknown rather than proof
// that the person lacks the skill.
const ROW = 20;
const TOP = 24;
const LEFT_X = 190;
const RIGHT_X = 560;
const WIDTH = 820;
const DASH = '—';

const toneFor = (busFactor) => (busFactor === 0 ? 'uncovered' : busFactor === 1 ? 'single' : 'covered');

function EvidenceList({ rows }) {
  if (rows.length === 0) {
    return <p className="muted">No evidence on record. That means unknown, not absent.</p>;
  }

  return (
    <ul className="evidence-list">
      {rows.map((row) => (
        <li key={row.key}>
          <strong>{row.label}</strong>
          <span className="level">Level {row.proficiency}</span>
          <small>{row.evidenceSource ?? DASH} · verified {row.lastVerifiedAt ?? DASH}</small>
        </li>
      ))}
    </ul>
  );
}

export default function SkillNetwork({ workforce, risks }) {
  const [department, setDepartment] = useState('all');
  const [minProficiency, setMinProficiency] = useState(3);
  const [concentratedOnly, setConcentratedOnly] = useState(false);
  const [selected, setSelected] = useState(null);
  const busFactor = useMemo(() => new Map((risks?.skills ?? []).map((skill) => [skill.id, skill.busFactor])), [risks]);

  if (!workforce) return null;

  const { employees = [], skills = [], matrix = [] } = workforce;
  const employeeById = new Map(employees.map((employee) => [employee.id, employee]));
  const skillById = new Map(skills.map((skill) => [skill.id, skill]));
  const departments = [...new Set(employees.map((employee) => employee.department))].sort();

  const people = employees
    .filter((employee) => department === 'all' || employee.department === department)
    .sort((a, b) => a.department.localeCompare(b.department) || a.name.localeCompare(b.name));
  const shownSkills = skills
    .filter((skill) => !concentratedOnly || (busFactor.get(skill.id) ?? 0) <= 1)
    .sort((a, b) => (busFactor.get(a.id) ?? 0) - (busFactor.get(b.id) ?? 0) || a.name.localeCompare(b.name));

  // Both columns span the same height so lines stay readable whichever side is longer.
  const span = (Math.max(people.length, shownSkills.length, 1) - 1) * ROW;
  const height = span + TOP * 2;
  const step = (count) => (count > 1 ? span / (count - 1) : 0);
  const personY = new Map(people.map((employee, index) => [employee.id, TOP + index * step(people.length)]));
  const skillY = new Map(shownSkills.map((skill, index) => [skill.id, TOP + index * step(shownSkills.length)]));

  const edges = matrix.filter((edge) => edge.proficiency >= minProficiency
    && personY.has(edge.employeeId) && skillY.has(edge.skillId));
  const touches = (edge) => (selected.type === 'employee' ? edge.employeeId === selected.id : edge.skillId === selected.id);
  const litEdges = selected ? edges.filter(touches) : [];
  // Employee and skill IDs overlap numerically, so neighbours are kept per node type.
  const litPeople = new Set(litEdges.map((edge) => edge.employeeId));
  const litSkills = new Set(litEdges.map((edge) => edge.skillId));

  const isSelected = (type, id) => selected?.type === type && selected.id === id;
  const isDimmed = (type, id) => Boolean(selected) && !isSelected(type, id)
    && !(type === 'employee' ? selected.type === 'skill' && litPeople.has(id) : selected.type === 'employee' && litSkills.has(id));
  const toggle = (type, id) => setSelected((current) => (current?.type === type && current.id === id ? null : { type, id }));
  const nodeProps = (type, id, label) => ({
    role: 'button',
    tabIndex: 0,
    'aria-pressed': isSelected(type, id),
    'aria-label': label,
    onClick: () => toggle(type, id),
    onKeyDown: (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        toggle(type, id);
      }
    },
  });

  const selectedEmployee = selected?.type === 'employee' ? employeeById.get(selected.id) : null;
  const selectedSkill = selected?.type === 'skill' ? skillById.get(selected.id) : null;
  const evidenceFor = (predicate, labelOf) => matrix.filter(predicate)
    .sort((a, b) => b.proficiency - a.proficiency)
    .map((edge) => ({ ...edge, key: `${edge.employeeId}-${edge.skillId}`, label: labelOf(edge) }));

  return (
    <section className="panel">
      <div className="toolbar">
        <form className="form-row" onSubmit={(event) => event.preventDefault()}>
          <label className="field">Department
            <select value={department} onChange={(event) => { setDepartment(event.target.value); setSelected(null); }}>
              <option value="all">All departments</option>
              {departments.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          </label>
          <label className="field">Minimum level
            <select value={minProficiency} onChange={(event) => setMinProficiency(Number(event.target.value))}>
              {[1, 2, 3, 4, 5].map((level) => <option key={level} value={level}>Level {level}+</option>)}
            </select>
          </label>
          <label className="check"><input type="checkbox" checked={concentratedOnly}
            onChange={(event) => { setConcentratedOnly(event.target.checked); setSelected(null); }} /> Only at-risk skills</label>
        </form>
      </div>

      <ul className="legend" aria-label="Legend">
        <li><span className="swatch uncovered" /> No one qualified</li>
        <li><span className="swatch single" /> One qualified person</li>
        <li><span className="swatch covered" /> Two or more</li>
        <li><span className="swatch person" /> Person</li>
        <li><span className="swatch-line" /> Thicker line, higher level</li>
      </ul>

      <div className="network-layout">
        <div className="network-canvas">
          <svg className="network" viewBox={`0 0 ${WIDTH} ${height}`} width={WIDTH} height={height}
            role="group" aria-label={`${people.length} people, ${shownSkills.length} skills, ${edges.length} lines of evidence`}>
            <g>
              {edges.map((edge) => (
                <line key={`${edge.employeeId}-${edge.skillId}`}
                  x1={LEFT_X} y1={personY.get(edge.employeeId)} x2={RIGHT_X} y2={skillY.get(edge.skillId)}
                  className={`edge p${edge.proficiency} ${selected ? (touches(edge) ? 'lit' : 'dim') : ''}`}
                  strokeWidth={edge.proficiency * 0.7} />
              ))}
            </g>
            <g>
              {people.map((employee) => (
                <g key={employee.id} transform={`translate(${LEFT_X},${personY.get(employee.id)})`}
                  className={`node person ${isSelected('employee', employee.id) ? 'selected' : ''} ${isDimmed('employee', employee.id) ? 'dim' : ''}`}
                  {...nodeProps('employee', employee.id, `${employee.name}, ${employee.role}`)}>
                  <circle r="5" />
                  <text x="-12" dy="0.35em" textAnchor="end">{employee.name}</text>
                </g>
              ))}
            </g>
            <g>
              {shownSkills.map((skill) => (
                <g key={skill.id} transform={`translate(${RIGHT_X},${skillY.get(skill.id)})`}
                  className={`node skill ${toneFor(busFactor.get(skill.id))} ${isSelected('skill', skill.id) ? 'selected' : ''} ${isDimmed('skill', skill.id) ? 'dim' : ''}`}
                  {...nodeProps('skill', skill.id, `${skill.name}, ${busFactor.get(skill.id) ?? 0} qualified people`)}>
                  <circle r="7" />
                  <text x="14" dy="0.35em">{skill.name} · {busFactor.get(skill.id) ?? DASH}</text>
                </g>
              ))}
            </g>
          </svg>
        </div>

        <aside className="network-detail" aria-live="polite">
          {!selected && <>
            <h3>Evidence</h3>
            <p className="muted">Select a person or a skill to see the records behind each line. Skills are listed from fewest qualified people.</p>
          </>}
          {selectedEmployee && <>
            <h3>{selectedEmployee.name}</h3>
            <p className="muted">{selectedEmployee.role} · {selectedEmployee.department}</p>
            <p>Mentoring time: {selectedEmployee.mentoringHoursPerMonth === undefined ? DASH : `${selectedEmployee.mentoringHoursPerMonth} h per month`}</p>
            <EvidenceList rows={evidenceFor((edge) => edge.employeeId === selectedEmployee.id,
              (edge) => skillById.get(edge.skillId)?.name ?? `Skill ${edge.skillId}`)} />
          </>}
          {selectedSkill && <>
            <h3>{selectedSkill.name}</h3>
            <p className="muted">
              {busFactor.get(selectedSkill.id) ?? DASH} of {selectedSkill.requiredHolders} qualified at
              level {selectedSkill.targetProficiency}+ · Criticality {selectedSkill.criticality}/5
            </p>
            <EvidenceList rows={evidenceFor((edge) => edge.skillId === selectedSkill.id,
              (edge) => employeeById.get(edge.employeeId)?.name ?? `Employee ${edge.employeeId}`)} />
          </>}
        </aside>
      </div>
    </section>
  );
}
