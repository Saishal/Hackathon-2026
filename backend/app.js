const express = require('express');
const cors = require('cors');
const data = require('./data');
const { loadConfig } = require('./config');
const keystoneRoutes = require('./routes/keystone');
const workforceDataRoutes = require('./routes/workforce-data');
const authRoutes = require('./routes/auth');
const governanceRoutes = require('./routes/governance');
const { createSecurePolicy } = require('./policy/secure');
const { sessionMiddleware, requireAuth, requirePermission } = require('./middleware/auth');
const { requestId, securityHeaders, originGuard } = require('./middleware/security');
const { createLoginLimiter } = require('./security/rate-limit');
const { recordAudit, auditContext } = require('./data/audit');
const { withTransaction } = require('./data/transactions');
const { notFound } = require('./errors');
const recommendationService = require('./services/recommendations');

function errorHandler(err, req, res, _next) {
  if (err.type === 'entity.parse.failed') {
    res.status(400).json({ error: 'The request body is not valid JSON.', code: 'invalid_json', requestId: req.id });
    return;
  }
  if (err.type === 'entity.too.large') {
    res.status(413).json({ error: 'The request body is too large.', code: 'payload_too_large', requestId: req.id });
    return;
  }
  if (typeof err.code === 'string' && err.code.startsWith('SQLITE_CONSTRAINT')) {
    res.status(409).json({ error: 'The change conflicts with existing records.', code: 'constraint_violation', requestId: req.id });
    return;
  }

  const status = err.status || err.statusCode || 500;
  if (status >= 500) {
    console.error(err);
    res.status(500).json({ error: 'Unexpected server error', code: 'server_error', requestId: req.id });
    return;
  }

  const body = { error: err.message, code: typeof err.code === 'string' ? err.code : 'invalid_request', requestId: req.id };
  if (err.details) body.details = err.details;
  if (err.requiredPermission) body.requiredPermission = err.requiredPermission;
  res.status(status).json(body);
}

// Builds the HTTP application without starting it, so tests can run it against a temporary database.
function createApp({ config = loadConfig(), ai = recommendationService, limiter } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(requestId);
  app.use(securityHeaders);
  app.use(cors({
    origin: (origin, callback) => callback(null, !origin || config.allowedOrigins.includes(origin)),
    credentials: true,
    exposedHeaders: ['Content-Disposition', 'X-Request-Id', 'Retry-After'],
  }));
  app.use(express.json({ limit: '100kb' }));
  app.use(sessionMiddleware(config));
  app.use(originGuard(config));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use('/api/auth', authRoutes({
    config,
    limiter: limiter ?? createLoginLimiter({ maxFailures: config.loginMaxFailures, windowMinutes: config.loginWindowMinutes }),
  }));

  // Everything below requires a signed-in user; each route then checks its own permission.
  app.use('/api', requireAuth);

  const policy = createSecurePolicy();
  app.use('/api/keystone', keystoneRoutes(data.loadWorkforce, ai, policy));
  app.use('/api/keystone', workforceDataRoutes(data, policy));
  app.use('/api/keystone', governanceRoutes());

  // Legacy v1 endpoints stay compatible for signed-in readers of the whole organization.
  const readAll = requirePermission('workforce.read.all');
  app.get('/api/heatmap', readAll, async (_req, res) => res.json(await data.getHeatmapData()));
  app.get('/api/critical-skills', readAll, async (_req, res) => res.json(await data.getAtRiskSkills()));
  app.get('/api/gap-analysis', readAll, async (_req, res) => res.json(await data.getGapAnalysis()));
  app.get('/api/recommendations', readAll, async (_req, res) => res.json(await data.getRecommendations()));
  app.get('/api/future-skills', readAll, async (_req, res) => res.json(await data.getFutureSkillTargets()));

  app.put('/api/future-skills', requirePermission('futureRequirement.configure'), async (req, res) => {
    const { targets } = req.body ?? {};

    if (!Array.isArray(targets)) {
      res.status(400).json({ error: 'targets must be an array', code: 'invalid_request' });
      return;
    }

    for (const target of targets) {
      if (!Number.isInteger(target?.id) || !Number.isInteger(target?.targetPeople) || target.targetPeople < 0) {
        res.status(400).json({ error: 'Each target needs integer id and non-negative integer targetPeople', code: 'invalid_request' });
        return;
      }
    }

    const before = await data.getFutureSkillTargets();
    await withTransaction(async () => {
      await data.replaceFutureSkillTargets(targets);
      await recordAudit({
        ...auditContext(req), action: 'future_skill_target.updated', entityType: 'future_skill_target', entityLabel: 'Hiring targets',
        summary: `${req.user.displayName} updated ${targets.length} hiring target(s)`,
        before: before.filter((entry) => targets.some((target) => target.id === entry.id)), after: targets,
      });
    });

    res.json(await data.getGapAnalysis());
  });

  app.use('/api', (_req, _res, next) => next(notFound('The API endpoint')));
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
