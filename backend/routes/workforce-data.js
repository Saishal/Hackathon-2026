const express = require('express');
const openPolicy = require('../policy/open');

// Member 1 owns this router. Validation lives in the data layer so the same rules
// apply to every caller, not just HTTP. When the server mounts it, the policy adds
// permission checks, request schema validation and audited writes.
module.exports = function workforceDataRoutes(data, policy = openPolicy) {
  const router = express.Router();
  const { guard } = policy;
  const validate = policy.validate ?? (() => (_req, _res, next) => next());

  router.put('/employee-skills', guard('evidence.write'), validate('employeeSkill'), async (req, res) => {
    res.json(policy.saveEmployeeSkill ? await policy.saveEmployeeSkill(req, req.body) : await data.saveEmployeeSkill(req.body));
  });

  router.get('/future-requirements', guard('futureRequirement.read'), async (_req, res) => {
    res.json(await data.getFutureRequirements());
  });

  router.post('/future-requirements', guard('futureRequirement.configure'), validate('futureRequirementCreate'), async (req, res) => {
    res.status(201).json(policy.addFutureRequirement ? await policy.addFutureRequirement(req, req.body) : await data.addFutureRequirement(req.body));
  });

  return router;
};
