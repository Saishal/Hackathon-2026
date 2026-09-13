const { resolveSession } = require('../security/sessions');
const { can } = require('../security/permissions');
const { unauthenticated, forbidden } = require('../errors');

const SESSION_COOKIE = 'keystone_session';

function readCookie(req, name) {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key !== name) continue;
    try {
      return decodeURIComponent(rest.join('='));
    } catch {
      return null;
    }
  }
  return null;
}

// Attaches req.user and req.session when the cookie names a live session. It never rejects on its own,
// so public endpoints (health, login) keep working; requireAuth and requirePermission enforce access.
function sessionMiddleware(config) {
  return async (req, _res, next) => {
    try {
      const token = readCookie(req, SESSION_COOKIE);
      if (token) {
        const session = await resolveSession(token, config);
        if (session) {
          req.user = session.user;
          req.session = session;
        }
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}

const requireAuth = (req, _res, next) => (req.user ? next() : next(unauthenticated()));

// Passes when the user holds any of the listed permissions (or permission families).
const requirePermission = (...permissions) => (req, _res, next) => {
  if (!req.user) return next(unauthenticated());
  return permissions.some((permission) => can(req.user, permission)) ? next() : next(forbidden(permissions.join(' or ')));
};

const cookieOptions = (config, maxAgeMs) => ({
  httpOnly: true,
  sameSite: 'lax',
  secure: config.cookieSecure,
  path: '/',
  ...(maxAgeMs ? { maxAge: maxAgeMs } : {}),
});

module.exports = { SESSION_COOKIE, readCookie, sessionMiddleware, requireAuth, requirePermission, cookieOptions };
