# Keystone administrator guide

## Access and governance

Home and assistant shortcuts use the existing capability checks. Admins retain user/settings, workforce, review and audit access. HR retains organization workforce and permitted governance tools. Managers retain team-scoped workforce tools. Employees retain their own profile, development suggestions and permitted evidence submissions. No new role grants were added. The backend enforces permissions independently of navigation.

Skill-map CSV requires `workforce.read.all` or `workforce.read.team`. Employee/self-only readers receive 403, anonymous requests receive 401. The server computes official scores, scopes workforce records, then applies filters. Export audit records identify actor, report type, row count, visibility and filter summary. They omit datasets and raw search text. Existing audit, review separation of duties, notifications and rate limiting remain intact.

## Sessions

Keep me signed in uses the existing random-token HTTP-only cookie and server-side hash storage. Persistent sessions retain the configured idle and absolute limits. Unselected sessions omit Max-Age/Expires and get the smaller of short-session and absolute lifetimes. Browser session restore may preserve a session cookie; instruct shared-device users to sign out. Successful logout revokes the server row and expires the cookie. Account disabling, password changes and existing revocation flows still invalidate sessions. A new sign-in replaces that browser’s prior active session.

Production forces Secure cookies, retains SameSite=Lax, checks configured origins and applies login rate limiting. Use HTTPS and intentional allowed origins. Offline sign-out displays a retry; it cannot revoke a server session until connectivity returns. There is no password or session token in browser storage.

## Local development and configuration

Use Node.js 24 LTS. From root:

```sh
npm ci --prefix backend
npm ci --prefix frontend
npm start --prefix backend
# second terminal
npm run dev --prefix frontend
```

Copy `backend/.env.example` locally; never commit the resulting `.env`. The default frontend is localhost:5173 and backend localhost:4000. No external key is required for the local assistant or demo AI provider. Production never seeds demo accounts. Configure demo passwords locally; no credential values are included here.

| Variable | Default / purpose |
|---|---|
| `PORT` | 4000; backend port. |
| `DB_PATH` | Backend SQLite file; use a separate local path for test/demo work. |
| `KEYSTONE_SEED_DIR` | Optional directory of seed CSVs. |
| `KEYSTONE_ENVIRONMENT` | `demo` or `production`. |
| `KEYSTONE_DEMO_PASSWORD` | `<local-demo-password>`; optional demo override, never a production credential. |
| `KEYSTONE_ALLOWED_ORIGINS` | Local Vite origins; comma-separated allowed frontend origins. |
| `KEYSTONE_COOKIE_SECURE` | false locally; always true in production. |
| `KEYSTONE_SESSION_IDLE_MINUTES` | 480; maximum 1440. Sliding idle expiry. |
| `KEYSTONE_SESSION_ABSOLUTE_HOURS` | 24; maximum 336. Absolute lifetime. |
| `KEYSTONE_SESSION_SHORT_HOURS` | 8; maximum 24, also capped by absolute hours. |
| `KEYSTONE_LOGIN_MAX_FAILURES` | 5. |
| `KEYSTONE_LOGIN_WINDOW_MINUTES` | 15. |
| `KEYSTONE_TODAY` | Optional YYYY-MM-DD for repeatable demo data-quality dates. |
| `VITE_API_BASE_URL` | Optional frontend API origin; defaults to localhost:4000. |
| `KEYSTONE_AI_PROVIDER` | `demo` for offline advisor; existing `openai`/`auto` options remain. |
| `OPENAI_API_KEY` | `<server-only-api-key>` only for an explicitly configured external advisor. Never a VITE variable. |
| `KEYSTONE_AI_MODEL` | `<approved-model-id>` for that provider. |
| `KEYSTONE_AI_TIMEOUT_MS` | 20000 in the example file. |
| `KEYSTONE_ALERT_WEBHOOK_URL` | Optional `<approved-webhook-url>`; existing unexpected-error monitoring. |

For provider-specific behavior see AI-INTEGRATION.md. The navigation assistant does not consume these provider settings.

## Validate and operate

```sh
npm test --prefix backend
npm test --prefix frontend
npm run lint --prefix frontend
npm run build --prefix frontend
git diff --check
```

See CHANGELOG.md for actual results and browser limitations. Existing databases are preserved; only run the documented seed reset when intentionally replacing demo data. Never commit databases, exports, session cookies, `.env`, credentials or UI test fixtures containing real users.
