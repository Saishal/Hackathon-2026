// Authentication and authorization middleware. The browser holds only a random session token in an
// HTTP-only cookie; the server looks up its hash, so the page can never read or forge a session.
const { resolveSession } = require('../security/sessions');
const { can } = require('../security/permissions');
const { unauthenticated, forbidden } = require('../errors');

const SESSION_COOKIE = 'keystone_session';

// Minimal cookie parser (avoids a dependency). A malformed percent-encoding is treated as no cookie.
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
        if (!session) {
          _res.clearCookie(SESSION_COOKIE, cookieOptions(config));
          req.invalidSession = true;
        }
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

// Rejects anonymous requests with 401. When the browser sent a cookie that no longer resolves (expired,
// revoked or signed out elsewhere) the code is `session_ended`, so the sign-in screen can explain why.
const requireAuth = (req, _res, next) => {
  if (req.user) return next();
  const error = unauthenticated();
  if (req.invalidSession) error.code = 'session_ended';
  return next(error);
};

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
