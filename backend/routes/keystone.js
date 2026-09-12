const express = require('express');
const { analyze, analyzeEmployees, analyzeSuccession } = require('../services/risk');
const { simulate } = require('../services/simulation');
const recommendationService = require('../services/recommendations');

module.exports = function keystoneRoutes(loadWorkforce, ai = recommendationService) {
  const router = express.Router();
  router.get('/workforce', async (_req, res) => res.json(await loadWorkforce()));
  router.get('/risks', async (_req, res) => res.json(analyze(await loadWorkforce())));
  router.get('/employee-risks', async (_req, res) => res.json(analyzeEmployees(await loadWorkforce())));
  router.get('/succession', async (_req, res) => res.json(analyzeSuccession(await loadWorkforce())));
  router.post('/simulate', async (req, res) => res.json(simulate(await loadWorkforce(), req.body)));
  router.get('/ai-status', (_req, res) => res.json(ai.status()));
  router.post('/development-plan', async (req, res) => res.json(await ai.recommend(await loadWorkforce(), req.body?.skillId)));
  router.post('/strategy', async (req, res) => res.json(await ai.proposeStrategy(req.body?.direction, await loadWorkforce())));
  router.post('/strategy/preview', async (req, res) => res.json(ai.previewStrategy(await loadWorkforce(), req.body)));
  return router;
};
