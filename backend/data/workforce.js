const { all } = require('./db');
const { getHeatmapData } = require('./queries');

// Member 1 owns this adapter; existing endpoints remain compatible.
// Returns the v1 workforce snapshot consumed by Member 2 (calculations),
// Member 3 (over HTTP) and Member 4 (AI grounding).
async function loadWorkforce() {
  const snapshot = await getHeatmapData();
  const targets = await all('SELECT skill_id, target_people FROM future_skill_targets');
  return {
    schemaVersion: 1,
    ...snapshot,
    skills: snapshot.skills.map((skill) => ({
      ...skill,
      criticality: skill.name === 'Legacy Billing Recovery' ? 5 : 3,
      targetProficiency: 3,
      requiredHolders: Math.max(
        1,
        targets.find((target) => target.skill_id === skill.id)?.target_people ?? 2,
      ),
      metadataSource: 'demo defaults; Member 1 to add editable persisted requirements',
    })),
    matrix: snapshot.matrix.map((edge) => ({
      ...edge,
      evidenceSource: 'fictional seed',
      lastVerifiedAt: null,
    })),
  };
}

module.exports = { loadWorkforce };
