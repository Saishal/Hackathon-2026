const express = require('express');
const { validateBody } = require('../validation/ajv');
const schemas = require('../validation/schemas');
const users = require('../data/users');
const { verifyPassword, verifyAgainstDummy } = require('../security/passwords');
const { createSession, destroySession } = require('../security/sessions');
const { capabilities, ROLE_LABELS } = require('../security/permissions');
const { SESSION_COOKIE, cookieOptions, requireAuth } = require('../middleware/auth');
const { recordAudit, auditContext } = require('../data/audit');
const { getOrganization } = require('../data/organization');
const { HttpError } = require('../errors');

async function mePayload(user, session) {
  const organization = await getOrganization();
  return {
    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      roleLabel: ROLE_LABELS[user.role],
      employeeId: user.employeeId,
      employeeName: user.employeeName ?? null,
    },
    capabilities: capabilities(user),
    organization: { name: organization.name, environment: organization.environment },
    session: session ? { expiresAt: session.expiresAt } : null,
  };
}

module.exports = function authRoutes({ config, limiter }) {
  const router = express.Router();

  router.post('/login', validateBody(schemas.login), async (req, res) => {
    const email = users.normalizeEmail(req.body.email);
    const address = req.socket.remoteAddress ?? 'unknown';
    const ctx = auditContext(req);

    const gate = limiter.check(address, email);
    if (!gate.allowed) {
      res.setHeader('Retry-After', String(gate.retryAfterSeconds));
      await recordAudit({
        ...ctx, action: 'auth.login_blocked', entityType: 'user', entityLabel: email,
        summary: `Sign-in for ${email} blocked after repeated failures`, metadata: { retryAfterSeconds: gate.retryAfterSeconds },
      });
      throw new HttpError(429, 'too_many_attempts',
        `Too many failed sign-in attempts. Try again in ${Math.ceil(gate.retryAfterSeconds / 60)} minute(s).`);
    }

    const candidate = await users.findLoginCandidate(email);
    const passwordMatches = candidate
      ? await verifyPassword(req.body.password, candidate.passwordHash)
      : await verifyAgainstDummy(req.body.password);

    // One generic message for every failure, so the response never reveals which accounts exist.
    if (!passwordMatches || candidate.user.disabled) {
      limiter.recordFailure(address, email);
      await recordAudit({
        ...ctx, action: 'auth.login_failed', entityType: 'user', entityId: candidate?.user.id ?? null, entityLabel: email,
        summary: `Failed sign-in for ${email}`,
        metadata: { reason: !candidate ? 'unknown_account' : candidate.user.disabled ? 'account_disabled' : 'wrong_password' },
      });
      throw new HttpError(401, 'invalid_credentials', 'Email or password is incorrect.');
    }

    limiter.reset(email);
    const session = await createSession(candidate.user.id, config, { userAgent: req.get('User-Agent') });
    await users.recordLogin(candidate.user.id);
    await recordAudit({
      ...ctx, actor: candidate.user, action: 'auth.login', entityType: 'user', entityId: candidate.user.id,
      entityLabel: candidate.user.email, summary: `${candidate.user.displayName} signed in`,
    });
    res.cookie(SESSION_COOKIE, session.token, cookieOptions(config, config.sessionAbsoluteHours * 3600 * 1000));
    res.json(await mePayload(candidate.user, session));
  });

  router.post('/logout', async (req, res) => {
    if (req.session) {
      await destroySession(req.session.tokenHash);
      await recordAudit({
        ...auditContext(req), action: 'auth.logout', entityType: 'user', entityId: req.user.id,
        entityLabel: req.user.email, summary: `${req.user.displayName} signed out`,
      });
    }
    res.clearCookie(SESSION_COOKIE, cookieOptions(config));
    res.status(204).end();
  });

  // Public, so the sign-in screen can label a demo environment. It reveals no account or workforce data.
  router.get('/environment', async (_req, res) => {
    const organization = await getOrganization();
    res.json({ environment: organization.environment, organizationName: organization.name });
  });

  router.get('/me', requireAuth, async (req, res) => {
    res.json(await mePayload(req.user, req.session));
  });

  return router;
};
