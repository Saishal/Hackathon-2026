const express = require('express');

// Member 1 owns this router. Validation lives in the data layer so the same rules
// apply to every caller, not just HTTP.
module.exports = function workforceDataRoutes(data) {
  const router = express.Router();

  router.put('/employee-skills', async (req, res) => {
    res.json(await data.saveEmployeeSkill(req.body));
  });

  router.get('/future-requirements', async (_req, res) => {
    res.json(await data.getFutureRequirements());
  });

  router.post('/future-requirements', async (req, res) => {
    res.status(201).json(await data.addFutureRequirement(req.body));
  });

  return router;
};
