// Runtime settings read from environment variables, with safe local defaults.
// Demo accounts are only seeded in the demo environment; production never gets a default password.
const DEFAULT_ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:5173'];
// Development-only fallback, documented in README "Demo accounts". Override with KEYSTONE_DEMO_PASSWORD.
const DEMO_PASSWORD_DEFAULT = 'Keystone-Demo-2026!';

const bounded = (raw, fallback, max) => {
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? Math.min(value, max) : fallback;
};

function loadConfig(env = process.env) {
  const environment = env.KEYSTONE_ENVIRONMENT === 'production' ? 'production' : 'demo';
  const origins = env.KEYSTONE_ALLOWED_ORIGINS ? env.KEYSTONE_ALLOWED_ORIGINS.split(',') : DEFAULT_ORIGINS;

  return {
    environment,
    allowedOrigins: origins.map((origin) => origin.trim()).filter(Boolean),
    cookieSecure: env.KEYSTONE_COOKIE_SECURE === 'true' || environment === 'production',
    sessionIdleMinutes: bounded(env.KEYSTONE_SESSION_IDLE_MINUTES, 480, 24 * 60),
    sessionShortHours: bounded(env.KEYSTONE_SESSION_SHORT_HOURS, 8, 24),
    sessionAbsoluteHours: bounded(env.KEYSTONE_SESSION_ABSOLUTE_HOURS, 24, 24 * 14),
    loginMaxFailures: bounded(env.KEYSTONE_LOGIN_MAX_FAILURES, 5, 100),
    loginWindowMinutes: bounded(env.KEYSTONE_LOGIN_WINDOW_MINUTES, 15, 24 * 60),
    demoPassword: env.KEYSTONE_DEMO_PASSWORD || (environment === 'demo' ? DEMO_PASSWORD_DEFAULT : null),
    // Pins "today" for data-quality rules (stale evidence, past effective dates) and tests.
    today: /^\d{4}-\d{2}-\d{2}$/.test(env.KEYSTONE_TODAY || '') ? env.KEYSTONE_TODAY : null,
  };
}

module.exports = { loadConfig, DEMO_PASSWORD_DEFAULT };
