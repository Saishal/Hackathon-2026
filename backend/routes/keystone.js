const express = require('express');
const { analyze } = require('../services/risk');
const { simulate } = require('../services/simulation');
const { recommend, proposeStrategy } = require('../services/recommendations');

module.exports = function keystoneRoutes(loadWorkforce) {
  const router = express.Router();
  router.get('/workforce', async (_req, res) => res.json(await loadWorkforce()));
  router.get('/risks', async (_req, res) => res.json(analyze(await loadWorkforce())));
  router.post('/simulate', async (req, res) => res.json(simulate(await loadWorkforce(), req.body)));
  router.post('/development-plan', async (req, res) => res.json(recommend(await loadWorkforce(), req.body?.skillId)));
  router.post('/strategy', (req, res) => res.json(proposeStrategy(req.body?.direction)));
  return router;
};
