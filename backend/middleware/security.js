// Request-level hardening applied to every API call before routing: a traceable request id,
// restrictive response headers, and an Origin allowlist for writes.
const crypto = require('node:crypto');
const { HttpError } = require('../errors');

// Every response carries X-Request-Id, and error bodies repeat it, so a user can quote it in a report.
function requestId(req, res, next) {
  req.id = crypto.randomUUID();
  res.setHeader('X-Request-Id', req.id);
  next();
}

// The API only serves JSON and CSV, so it can refuse framing, sniffing and caching outright.
function securityHeaders(_req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
  res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
  res.setHeader('Cache-Control', 'no-store');
  next();
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// Cross-site request forgery defence alongside SameSite=Lax cookies: a browser always sends Origin on a
// cross-origin write, so a write from an origin outside the allowlist is refused before it runs.
// Requests without Origin (server-to-server, curl, tests) are not browser-initiated and pass through.
function originGuard(config) {
  return (req, _res, next) => {
    const { origin } = req.headers;
    if (SAFE_METHODS.has(req.method) || !origin || config.allowedOrigins.includes(origin)) return next();
    return next(new HttpError(403, 'origin_not_allowed', 'Requests from this origin are not allowed.'));
  };
}

module.exports = { requestId, securityHeaders, originGuard };
