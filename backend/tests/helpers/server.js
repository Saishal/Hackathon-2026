const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// Test support: each test file gets its own throwaway database, a pinned "today", and a running server.
// Call useTempDatabase before requiring anything from the data layer, because the connection opens on require.
const DEMO_PASSWORD = 'Keystone-Demo-2026!';
const ACCOUNTS = {
  admin: 'admin@keystone.demo',
  hr: 'hr@keystone.demo',
  manager: 'manager@keystone.demo',
  employee: 'employee@keystone.demo',
};

function useTempDatabase(name) {
  const file = path.join(os.tmpdir(), `keystone-${name}-${process.pid}.db`);
  for (const suffix of ['', '-journal', '-wal', '-shm']) fs.rmSync(`${file}${suffix}`, { force: true });
  process.env.DB_PATH = file;
  process.env.KEYSTONE_TODAY = '2026-09-12';
  process.env.KEYSTONE_ENVIRONMENT = 'demo';
  delete process.env.KEYSTONE_DEMO_PASSWORD;
  return file;
}

async function startServer({ limiter } = {}) {
  const data = require('../../data');
  const { createApp } = require('../../app');
  const { loadConfig } = require('../../config');
  const { createRecommendationService } = require('../../services/recommendations');
  const { createProvider } = require('../../services/ai/provider');

  const config = loadConfig();
  await data.initializeDatabase({ config });
  const ai = createRecommendationService({ provider: createProvider({ env: { KEYSTONE_AI_PROVIDER: 'demo' } }) });
  const app = createApp({ config, ai, limiter });
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  const base = `http://127.0.0.1:${server.address().port}`;

  return {
    base,
    data,
    config,
    close: async () => {
      await new Promise((resolve) => server.close(resolve));
      data.db.close();
    },
  };
}

// A cookie-keeping HTTP client, one per signed-in person.
function client(base) {
  let cookie = null;

  async function request(method, route, body, headers = {}) {
    const response = await fetch(`${base}${route}`, {
      method,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const setCookie = response.headers.get('set-cookie');
    if (setCookie) {
      const [pair] = setCookie.split(';');
      cookie = pair.endsWith('=') ? null : pair;
    }
    const text = await response.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    return { status: response.status, body: json, text, headers: response.headers };
  }

  return {
    get: (route, headers) => request('GET', route, undefined, headers),
    post: (route, body = {}, headers) => request('POST', route, body, headers),
    put: (route, body = {}, headers) => request('PUT', route, body, headers),
    patch: (route, body = {}, headers) => request('PATCH', route, body, headers),
    delete: (route, headers) => request('DELETE', route, undefined, headers),
    login: (email, password = DEMO_PASSWORD) => request('POST', '/api/auth/login', { email, password }),
    get cookie() { return cookie; },
    set cookie(value) { cookie = value; },
  };
}

async function signedIn(base, role) {
  const person = client(base);
  const response = await person.login(ACCOUNTS[role]);
  if (response.status !== 200) throw new Error(`Could not sign in as ${role}: ${response.status} ${response.text}`);
  person.user = response.body.user;
  return person;
}

module.exports = { DEMO_PASSWORD, ACCOUNTS, useTempDatabase, startServer, client, signedIn };
