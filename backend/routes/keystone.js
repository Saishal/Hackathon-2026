const express = require('express');
const { analyze, analyzeEmployees, analyzeSuccession } = require('../services/risk');
const { simulate } = require('../services/simulation');
const recommendationService = require('../services/recommendations');
const openPolicy = require('../policy/open');

// The policy supplies permission guards and response scoping. The default is open, matching v1 behaviour
// for router tests; the server passes policy/secure.js, so scores are calculated on the whole organization
// and then narrowed to what the signed-in role may see.
module.exports = function keystoneRoutes(loadWorkforce, ai = recommendationService, policy = openPolicy) {
  const router = express.Router();
  const { guard } = policy;

  router.get('/workforce', guard('workforce.read'), async (req, res) => {
    const workforce = await loadWorkforce();
    res.json(policy.shape(req, 'workforce', workforce, workforce));
  });

  router.get('/risks', guard('risk.read'), async (req, res) => {
    const workforce = await loadWorkforce();
    res.json(policy.shape(req, 'risks', analyze(workforce), workforce));
  });

  router.get('/employee-risks', guard('risk.read'), async (req, res) => {
    const workforce = await loadWorkforce();
    res.json(policy.shape(req, 'employeeRisks', analyzeEmployees(workforce), workforce));
  });

  router.get('/succession', guard('succession.read'), async (req, res) => {
    const workforce = await loadWorkforce();
    res.json(policy.shape(req, 'succession', analyzeSuccession(workforce), workforce));
  });

  router.post('/simulate', guard('scenario.run'), async (req, res) => {
    const workforce = await loadWorkforce();
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      res.json(simulate(workforce, req.body));
      return;
    }
    // Provisional evidence only ever comes from the server's pending review queue, never from the client.
    const { includePendingChanges, provisionalEvidence: _clientSupplied, ...scenario } = req.body;
    const provisional = includePendingChanges === true ? await policy.provisionalEvidence(req) : [];
    const result = simulate(workforce, provisional.length > 0 ? { ...scenario, provisionalEvidence: provisional } : scenario);
    res.json(policy.decorateSimulation(req, result, scenario, workforce));
  });

  router.get('/ai-status', (_req, res) => res.json(ai.status()));
  router.post('/development-plan', guard('ai.development'), async (req, res) => res.json(await ai.recommend(await loadWorkforce(), req.body?.skillId)));
  router.post('/strategy', guard('ai.strategy'), async (req, res) => res.json(await ai.proposeStrategy(req.body?.direction, await loadWorkforce())));
  router.post('/strategy/preview', guard('ai.strategy'), async (req, res) => res.json(ai.previewStrategy(await loadWorkforce(), req.body)));
  return router;
};
