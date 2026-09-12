const express = require('express');
const cors = require('cors');

const keystoneRoutes = require('./routes/keystone');
const {
  initializeDatabase,
  loadWorkforce,
  getHeatmapData,
  getAtRiskSkills,
  getGapAnalysis,
  getRecommendations,
  getFutureSkillTargets,
  replaceFutureSkillTargets,
} = require('./data');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

app.use('/api/keystone', keystoneRoutes(loadWorkforce));

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.get('/api/heatmap', async (_req, res) => {
  const payload = await getHeatmapData();
  res.json(payload);
});

app.get('/api/critical-skills', async (_req, res) => {
  const payload = await getAtRiskSkills();
  res.json(payload);
});

app.get('/api/gap-analysis', async (_req, res) => {
  const payload = await getGapAnalysis();
  res.json(payload);
});

app.get('/api/recommendations', async (_req, res) => {
  const payload = await getRecommendations();
  res.json(payload);
});

app.get('/api/future-skills', async (_req, res) => {
  const payload = await getFutureSkillTargets();
  res.json(payload);
});

app.put('/api/future-skills', async (req, res) => {
  const { targets } = req.body;

  if (!Array.isArray(targets)) {
    res.status(400).json({ error: 'targets must be an array' });
    return;
  }

  for (const target of targets) {
    if (!Number.isInteger(target.id) || !Number.isInteger(target.targetPeople) || target.targetPeople < 0) {
      res.status(400).json({ error: 'Each target needs integer id and non-negative integer targetPeople' });
      return;
    }
  }

  await replaceFutureSkillTargets(targets);

  const payload = await getGapAnalysis();
  res.json(payload);
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.status === 400 ? err.message : 'Unexpected server error' });
});

initializeDatabase()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Keystone backend listening on port ${PORT}`);
    });
  })
  .catch((error) => {
    console.error('Failed to initialize database', error);
    process.exit(1);
  });
