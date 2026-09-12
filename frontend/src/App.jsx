import { useEffect, useMemo, useState } from 'react';
import './App.css';
import KeystoneStarter from './components/KeystoneStarter';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';

const proficiencyLabel = {
  0: 'Not recorded',
  1: 'Beginner',
  2: 'Novice+',
  3: 'Intermediate',
  4: 'Advanced',
  5: 'Expert',
};

function App() {
  const [heatmap, setHeatmap] = useState(null);
  const [critical, setCritical] = useState([]);
  const [gaps, setGaps] = useState([]);
  const [recommendations, setRecommendations] = useState([]);
  const [targets, setTargets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingTargets, setSavingTargets] = useState(false);
  const [error, setError] = useState('');
  const [riskRevision, setRiskRevision] = useState(0);

  const matrixLookup = useMemo(() => {
    if (!heatmap?.matrix) {
      return new Map();
    }

    return new Map(heatmap.matrix.map((entry) => [`${entry.employeeId}:${entry.skillId}`, entry.proficiency]));
  }, [heatmap]);

  // Fewest intermediate-or-above holders first, so the most concentrated skills are visible
  // without scrolling the table sideways.
  const skillColumns = useMemo(() => {
    if (!heatmap?.skills) {
      return [];
    }

    const holders = new Map();
    for (const entry of heatmap.matrix) {
      if (entry.proficiency >= 3) {
        holders.set(entry.skillId, (holders.get(entry.skillId) || 0) + 1);
      }
    }

    return [...heatmap.skills].sort(
      (a, b) => (holders.get(a.id) || 0) - (holders.get(b.id) || 0) || a.name.localeCompare(b.name),
    );
  }, [heatmap]);

  const loadData = async () => {
    try {
      const [heatmapRes, criticalRes, gapsRes, recommendationsRes, targetsRes] = await Promise.all([
        fetch(`${API_BASE}/api/heatmap`),
        fetch(`${API_BASE}/api/critical-skills`),
        fetch(`${API_BASE}/api/gap-analysis`),
        fetch(`${API_BASE}/api/recommendations`),
        fetch(`${API_BASE}/api/future-skills`),
      ]);

      if ([heatmapRes, criticalRes, gapsRes, recommendationsRes, targetsRes].some((res) => !res.ok)) {
        throw new Error('One or more API requests failed');
      }

      const [heatmapData, criticalData, gapData, recommendationData, targetData] = await Promise.all([
        heatmapRes.json(),
        criticalRes.json(),
        gapsRes.json(),
        recommendationsRes.json(),
        targetsRes.json(),
      ]);

      setHeatmap(heatmapData);
      setCritical(criticalData);
      setGaps(gapData);
      setRecommendations(recommendationData);
      setTargets(targetData);
    } catch (fetchError) {
      setError(fetchError.message || 'Unable to load Keystone data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const updateTarget = (id, targetPeople) => {
    setTargets((current) =>
      current.map((item) =>
        item.id === id ? { ...item, targetPeople: Number.isNaN(targetPeople) ? 0 : targetPeople } : item,
      ),
    );
  };

  const saveTargets = async () => {
    setSavingTargets(true);
    setError('');

    try {
      const response = await fetch(`${API_BASE}/api/future-skills`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          targets: targets.map((target) => ({
            id: target.id,
            targetPeople: Number(target.targetPeople),
          })),
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to update targets');
      }

      const updatedGaps = await response.json();
      setGaps(updatedGaps);
      setRiskRevision((revision) => revision + 1);

      const recommendationRes = await fetch(`${API_BASE}/api/recommendations`);
      setRecommendations(await recommendationRes.json());
    } catch (saveError) {
      setError(saveError.message || 'Unable to save future skill targets');
    } finally {
      setSavingTargets(false);
    }
  };

  if (loading) {
    return (
      <main className="app-shell">
        <h1>Keystone</h1>
        <p>Loading talent readiness data...</p>
      </main>
    );
  }

  if (error) {
    return (
      <main className="app-shell">
        <h1>Keystone</h1>
        <p className="error">{error}</p>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <header>
        <h1>Keystone</h1>
        <p>Find your keystones before they walk out the door.</p>
      </header>
      <KeystoneStarter key={riskRevision} />

      <section className="panel">
        <h2>Skills Heat Map</h2>
        <p>Skills run from the fewest to the most people at intermediate level or above.</p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Employee</th>
                {skillColumns.map((skill) => (
                  <th key={skill.id}>{skill.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {heatmap.employees.map((employee) => (
                <tr key={employee.id}>
                  <th scope="row">
                    <div>{employee.name}</div>
                    <small>
                      {employee.role} · {employee.department}
                    </small>
                  </th>
                  {skillColumns.map((skill) => {
                    const proficiency = matrixLookup.get(`${employee.id}:${skill.id}`) || 0;
                    return (
                      <td key={skill.id} className={`p-${proficiency}`} title={proficiencyLabel[proficiency]}>
                        {proficiency || '—'}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="two-col">
        <section className="panel">
          <h2>Critical Skills at Risk</h2>
          <p>Skills held at or above their target proficiency by fewer than 2 people.</p>
          {critical.length === 0 ? (
            <p>No critical skill concentration risks detected.</p>
          ) : (
            <ul>
              {critical.map((skill) => (
                <li key={skill.id}>
                  <strong>{skill.name}</strong>: {skill.holderCount} holder(s)
                  {skill.holders ? ` (${skill.holders})` : ''}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel">
          <h2>Recommendations</h2>
          {recommendations.length === 0 ? (
            <p>Current capability meets configured future demand.</p>
          ) : (
            <ul>
              {recommendations.map((item) => (
                <li key={item.skill}>
                  <strong>{item.skill}</strong> — {item.action}
                  <div>{item.detail}</div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="panel">
        <h2>Gap Analysis</h2>
        <p>Update target headcount to configure future skill demand.</p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Skill</th>
                <th>Current (≥3)</th>
                <th>Future Target</th>
                <th>Gap</th>
              </tr>
            </thead>
            <tbody>
              {gaps.map((gap) => (
                <tr key={gap.id}>
                  <th scope="row">{gap.name}</th>
                  <td>{gap.currentPeople}</td>
                  <td>
                    <input
                      type="number"
                      min="0"
                      value={targets.find((item) => item.id === gap.id)?.targetPeople ?? gap.targetPeople}
                      onChange={(event) => updateTarget(gap.id, Number(event.target.value))}
                    />
                  </td>
                  <td className={gap.gap > 0 ? 'gap-positive' : ''}>{gap.gap}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button type="button" onClick={saveTargets} disabled={savingTargets}>
          {savingTargets ? 'Saving...' : 'Save Future Skill Targets'}
        </button>
      </section>
    </main>
  );
}

export default App;
