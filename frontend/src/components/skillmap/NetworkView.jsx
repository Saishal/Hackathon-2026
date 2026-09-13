import { useState } from 'react';
import { useT } from '../../preferences/context';
import { coverageTone, qualifiedIn } from './model';

// People on the left in department groups, skills on the right, one curved line per recorded level at or above
// the chosen minimum. Line colour and weight follow the level. Hovering previews a node's lines; selecting
// keeps them lit. A missing line means no evidence on record: unknown, not proof the person lacks the skill.
// Skill colour and count are organization-wide coverage, so narrowing to one department never makes a
// covered skill look uncovered; the department filter only narrows the people and lines drawn.

const ROW_HEIGHT = { compact: 16, comfortable: 22, spacious: 30 };
const TOP = 34;
const GROUP_LABEL = 16;
const GROUP_GAP = 14;
const LEFT_X = 210;
const RIGHT_X = 610;
const WIDTH = 900;

const truncate = (text, max) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

export default function NetworkView({ map, selected, onToggle, density }) {
  const t = useT();
  const [hovered, setHovered] = useState(null);
  const row = ROW_HEIGHT[density] ?? ROW_HEIGHT.comfortable;
  const { people, shownSkills, edges } = map;

  const personY = new Map();
  const groups = [];
  let cursor = TOP;
  let department = null;
  for (const person of people) {
    if (person.department !== department) {
      if (department !== null) cursor += GROUP_GAP;
      groups.push({ department: person.department, y: cursor });
      cursor += GROUP_LABEL;
      department = person.department;
    }
    personY.set(person.id, cursor);
    cursor += row;
  }
  const peopleBottom = Math.max(TOP + GROUP_LABEL, cursor - row);
  const skillTop = TOP + GROUP_LABEL;
  const skillStep = shownSkills.length > 1 ? Math.max(row, (peopleBottom - skillTop) / (shownSkills.length - 1)) : 0;
  const skillY = new Map(shownSkills.map((skill, index) => [skill.id, skillTop + index * skillStep]));
  const height = Math.max(peopleBottom, skillTop + Math.max(0, shownSkills.length - 1) * skillStep) + TOP;

  const active = selected ?? hovered;
  const touches = (edge) => (active.type === 'employee' ? edge.employeeId === active.id : edge.skillId === active.id);
  const litEdges = active ? edges.filter(touches) : [];
  // Employee and skill IDs overlap numerically, so neighbours are tracked per node type.
  const litPeople = new Set(litEdges.map((edge) => edge.employeeId));
  const litSkills = new Set(litEdges.map((edge) => edge.skillId));
  const isActive = (type, id) => active?.type === type && active.id === id;
  const isNeighbour = (type, id) => (type === 'employee' ? active?.type === 'skill' && litPeople.has(id) : active?.type === 'employee' && litSkills.has(id));
  const stateClass = (type, id) => {
    if (!active) return '';
    if (selected?.type === type && selected.id === id) return 'selected';
    if (isActive(type, id) || isNeighbour(type, id)) return 'lit';
    return 'dim';
  };

  const nodeProps = (type, id, label) => ({
    role: 'button',
    tabIndex: 0,
    'aria-pressed': selected?.type === type && selected.id === id,
    'aria-label': label,
    onClick: () => onToggle(type, id),
    onKeyDown: (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        onToggle(type, id);
      }
    },
    onPointerEnter: () => setHovered({ type, id }),
    onPointerLeave: () => setHovered(null),
  });

  const middle = (LEFT_X + RIGHT_X) / 2;

  return (
    <div className="network-canvas">
      <svg className="network" viewBox={`0 0 ${WIDTH} ${height}`} width={WIDTH} height={height} role="group"
        aria-label={t('skillmap.network.aria', { people: people.length, skills: shownSkills.length, lines: edges.length })}>
        <text className="column-label" x={LEFT_X + 5} y={16} textAnchor="end">{t('skillmap.network.people')}</text>
        <text className="column-label" x={RIGHT_X - 7} y={16}>{t('skillmap.network.skills')}</text>

        <g>
          {edges.map((edge) => {
            const y1 = personY.get(edge.employeeId);
            const y2 = skillY.get(edge.skillId);
            const state = active ? (touches(edge) ? 'lit' : 'dim') : '';
            return (
              <path key={`${edge.employeeId}-${edge.skillId}`} className={`edge l${edge.proficiency} ${state}`}
                d={`M${LEFT_X},${y1} C${middle},${y1} ${middle},${y2} ${RIGHT_X},${y2}`}
                strokeWidth={0.8 + edge.proficiency * 0.45} />
            );
          })}
        </g>

        <g>
          {groups.map((group) => (
            <text key={group.department} className="group-label" x={LEFT_X - 12} y={group.y} textAnchor="end">{truncate(group.department, 28)}</text>
          ))}
        </g>

        <g>
          {people.map((person) => (
            <g key={person.id} transform={`translate(${LEFT_X},${personY.get(person.id)})`}
              className={`node person ${stateClass('employee', person.id)}`}
              {...nodeProps('employee', person.id, `${person.name}, ${person.role}`)}>
              <title>{`${person.name} · ${person.role}`}</title>
              <circle className="hit" r="11" />
              <circle className="dot" r="5" />
              <text x="-12" dy="0.35em" textAnchor="end">{truncate(person.name, 26)}</text>
            </g>
          ))}
        </g>

        <g>
          {shownSkills.map((skill) => {
            const qualified = map.busFactor(skill.id) ?? qualifiedIn(map, skill);
            return (
              <g key={skill.id} transform={`translate(${RIGHT_X},${skillY.get(skill.id)})`}
                className={`node skill ${coverageTone(qualified)} ${stateClass('skill', skill.id)}`}
                {...nodeProps('skill', skill.id, t('skillmap.network.skillAria', { name: skill.name, count: qualified }))}>
                <title>{`${skill.name} · ${t('skillmap.qualifiedCount', { count: qualified })}`}</title>
                <circle className="hit" r="12" />
                <circle className="dot" r={5 + (skill.criticality ?? 3) * 0.6} />
                <text x="15" dy="0.35em">
                  {truncate(skill.name, 30)}
                  <tspan className="count"> · {qualified}</tspan>
                </text>
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}
