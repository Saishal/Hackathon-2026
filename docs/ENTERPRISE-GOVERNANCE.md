# Enterprise trust and governance

Keystone handles named people's skill evidence, so this layer makes every number traceable, every
change attributable, and every sensitive edit reviewable. It is a demo-ready local deployment, not a
hosted service: sessions, audit and review all live in the same SQLite database as the workforce data.

| Concern | What Keystone does |
|---|---|
| Who is signed in | Server-side sessions in an HTTP-only cookie; scrypt password hashes; login throttling |
| What they may do | Four roles with capability-based permissions, enforced on the server for every request |
| What they may see | Scores are computed on the whole organization, then narrowed to the role's scope |
| What happened | Append-only audit history with before/after snapshots and the server-resolved actor |
| Can the data be trusted | Deterministic data-quality rules, strict request validation, trust labels in every view |
| Who approved it | Change requests: only an approved change reaches official data and scoring |

## Authentication

**Sessions, not JWTs.** Keystone runs as one Express process on SQLite, so a server-side session is
simpler and safer than a signed token: logout, disabling an account, a role change and a password reset
revoke access on the next request, and there is no signing secret to rotate or leak.

- The browser holds a random 256-bit token in the `keystone_session` cookie (`HttpOnly`, `SameSite=Lax`,
  `Secure` when `KEYSTONE_COOKIE_SECURE=true` or in production). The database stores only its SHA-256 hash.
- Sessions slide on activity (`KEYSTONE_SESSION_IDLE_MINUTES`, default 8 hours) up to an absolute lifetime
  (`KEYSTONE_SESSION_ABSOLUTE_HOURS`, default 24). Expired sessions are purged at startup.
- **Passwords** use Node's built-in scrypt (N=32768, r=8, p=1, 16-byte salt, 64-byte key): a memory-hard
  KDF recommended alongside Argon2id, with no native dependency to build. Parameters are stored with each
  hash so they can be raised later. Passwords must be 12–128 characters; comparison is constant-time.
- **Login protection:** five failures for one account within 15 minutes (configurable) return
  `429 too_many_attempts` with `Retry-After`, as do 50 failures from one client address. Unknown emails are
  verified against a throwaway hash so timing does not reveal which accounts exist, and every failure gets
  the same message.
- **Request forgery:** writes from a browser origin outside `KEYSTONE_ALLOWED_ORIGINS` are refused with
  `403 origin_not_allowed`, in addition to `SameSite=Lax`. CORS allows only the same list, with credentials.
- **Headers:** `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY`,
  a restrictive `Content-Security-Policy`, `Cache-Control: no-store`; JSON bodies are capped at 100 kB.

## Roles and permissions

Permissions live in `backend/security/permissions.js`. Routes ask for a permission; the frontend receives
the same list only to decide what to show.

| Capability | Admin | HR / People Leader | Manager | Employee |
|---|:-:|:-:|:-:|:-:|
| Workforce data and risk scores | Organization | Organization | Own team | Own profile only |
| Succession insights | Organization | Organization | Own team | — |
| Time Machine scenarios (run and save) | ✓ | ✓ | — | — |
| AI development plans and strategy | ✓ | ✓ | — | — |
| Propose evidence changes | Anyone | Anyone | Own team | Self |
| Review evidence changes | ✓ | ✓ | — | — |
| Propose future requirements and catalogue changes | ✓ | ✓ | — | — |
| Approve future requirements and catalogue changes | ✓ | — | — | — |
| Edit official data directly (audited) | ✓ | — | — | — |
| Audit history | ✓ | ✓ | — | — |
| Data quality (read) | Organization | Organization | Own team | Own records, on the profile |
| Acknowledge data-quality issues and risks | ✓ | ✓ | — | — |
| Export CSV | Risks and data quality | Risks and data quality | Risks (team scope) | — |
| Users, roles and organization settings | ✓ | — | — | — |

Separation of duties: nobody can review their own submission, an admin cannot remove the last active admin
or lock themselves out, and every 403 names the missing permission.

**Scoping.** A manager's team is everyone who reports to them, directly or indirectly, through
`employees.manager_id`. Risk and succession are always calculated on the whole organization so scores stay
truthful; the response is then narrowed. People outside the team become
"Colleague outside your team" with only aggregate facts, and skill-level holder lists report
`holdersOutsideScope` instead of names. Exports apply exactly the same scoping.

## Audit history

`audit_log` records `occurred_at`, the actor's user id, name and role (resolved from the session, never
from the request body), `action_type`, `entity_type`, `entity_id`, `entity_label`, a readable `summary`,
sanitized `before`/`after` snapshots, `metadata`, `source` (`ui`, `api`, `seed`, `system`), the request id
and a `high_signal` flag for the dashboard.

- **Append-only:** database triggers abort any `UPDATE` or `DELETE` on `audit_log`, and no API route edits
  or deletes entries.
- **No secrets:** snapshot keys matching password, token, secret, hash, salt, cookie, API key,
  authorization or session are dropped before writing, and long strings are truncated. Tests assert that
  no password, hash or session token ever appears in the table.
- **Atomic:** official changes write their audit entries inside the same transaction, so a change cannot
  exist without its record. A write queue keeps concurrent requests from sharing a SQLite transaction.
- **Indexed** by time, actor, action, entity and high-signal flag for the filters below.

Recorded events: sign-in, sign-out, failed and blocked sign-in; evidence created, updated, verified and
removed; employee profile edits; role requirement changes; future requirement proposal, approval, update,
rejection and removal; hiring target changes; catalogue changes; change request drafts, submissions, edits,
approvals, rejections and cancellations; scenario saves, updates and deletions; AI recommendation reviews,
dismissals and scheduling; risk acknowledgements; data-quality acknowledgements, reopenings and automatic
resolutions; account creation, updates, role changes, disabling and password resets; organization settings;
CSV exports; the initial dataset import. Coverage consequences of an approved change
(`risk.critical_skill_uncovered`, `risk.coverage_restored`, `risk.single_holder_resolved`) are recorded as
system events that name the change that triggered them.

## Data quality

**Validation at the door.** Every create and update payload is validated with Ajv (already a backend
dependency) in strict mode: unknown fields are rejected, types are never coerced (`"3"` is not `3`),
calendar dates are checked for real days, and references are resolved before any write. Errors are
`400 validation_failed` with `details: [{ field, code, message }]`. Business rules add codes such as
`verification_required` (levels 4–5 need a verification date), `date_in_future`, `source_required` (a
verified resource needs a provider or link), `reporting_cycle`, `duplicate_submission` and `no_change`.

**Rules on the data.** `backend/services/data-quality.js` evaluates the whole dataset deterministically.
Each issue has a severity, rule code, title, explanation, affected record, the people it concerns, a link to
the record and a suggested action.

| Rule | Severity | Catches |
|---|---|---|
| `EVIDENCE_INVALID_PROFICIENCY` | Critical | A level outside 1–5 |
| `EVIDENCE_DUPLICATE` | Critical | Two records for the same person and skill |
| `EVIDENCE_DUPLICATE_SUBMISSION` | Warning | Competing pending submissions for one record |
| `EVIDENCE_MISSING_SOURCE` | Warning | Evidence with no source |
| `EVIDENCE_UNVERIFIED` | Warning | Unverified evidence that counts toward a criticality 4–5 skill |
| `EVIDENCE_STALE` | Warning or info | Verified longer ago than the organization's re-verification period |
| `EVIDENCE_VERIFIED_IN_FUTURE` | Warning | A verification date after today |
| `ROLE_SKILL_NO_EVIDENCE` | Critical or warning | A role requirement nobody meets on record |
| `CRITICAL_SKILL_UNCOVERED` | Critical | A criticality 4–5 skill with no qualified holder |
| `CRITICAL_SKILL_SINGLE_HOLDER` | Critical or warning | A criticality 4–5 skill held by one person |
| `SCENARIO_DEPARTURE_NO_SUCCESSOR` | Critical or warning | A saved scenario's departure with no ready successor |
| `SCENARIO_MENTOR_BELOW_LEVEL` | Warning | A mentor recorded below the level mentoring needs |
| `SCENARIO_INTERVENTION_AFTER_RISK` | Warning | Development that completes after the coverage gap opens |
| `FUTURE_REQUIREMENT_PAST_EFFECTIVE` | Warning | A still-proposed requirement whose effective date has passed |
| `RESOURCE_VERIFIED_WITHOUT_SOURCE` | Warning | A verified catalogue entry with no provider or URL |
| `EMPLOYEE_MISSING_MANAGER`, `EMPLOYEE_MANAGER_INVALID`, `EMPLOYEE_REPORTING_CYCLE`, `EMPLOYEE_ROLE_UNDEFINED` | Warning or critical | Broken relationships the scoping and succession model rely on |
| `USER_EMPLOYEE_LINK_MISSING`, `MANAGER_WITHOUT_REPORTS` | Warning or info | Accounts that cannot see what their role implies |
| `SKILL_REQUIREMENT_UNSPECIFIED` | Info | A skill using default requirements |

Time Machine runs the scenario rules on the unsaved scenario too, and saved scenarios return them as
`warnings`.

**Lifecycle.** Detection is recomputed from the data on each read; `data_quality_issues` keeps the
lifecycle. New issues are `open`. HR and admins can `acknowledge` one with a note, which keeps it visible
and counted. When the underlying data no longer triggers the rule, the issue resolves automatically, and a
resolved issue that comes back reopens; both are audited as system events.

**Health score.** `100 × records checked ÷ (records checked + weighted open issues)`, with critical 10,
warning 3, info 1 and acknowledged issues at half weight. The severity counts are always shown next to it,
so the score cannot hide how many problems exist.

**Trust labels** separate five things everywhere in the interface: *unknown* (nothing recorded, shown as a
dash), *unverified* (recorded without a verification date), *unmet requirement* (recorded below what is
needed), *data-quality warning* (a rule found a problem) and *modelled forecast* (a scenario, plan or pending
change). Each pairs an icon and words with its colour, and informational labels stay neutral.

## Approval workflow

Change requests hold proposed values beside the official data in `change_requests`:
`draft → submitted → approved | rejected`, with `draft` or `submitted` able to become `cancelled`.

| Change | Who can propose | Who can approve |
|---|---|---|
| Skill evidence (add, update, remove) | Employee for self, manager for team, HR and admin for anyone | HR or admin |
| Future requirement (add, update, remove) | HR, admin | Admin |
| Learning resource (add, update, verification) | HR, admin | Admin |

- Each request stores the submitter, the baseline at submission, the justification, the reviewer, timestamps,
  the reviewer's comment (required to reject) and what was applied.
- **Only approval changes official data.** Approval re-validates the change, writes it, records the entity
  audit entry, the approval and any coverage events in one transaction. If the record changed after
  submission, the approval notes `baselineChanged`.
- Drafts are visible only to their author. Employees see the status and reviewer feedback for their own
  submissions and for changes about themselves.
- **Time Machine** can model pending evidence when asked (`includePendingChanges: true`). The server loads
  submitted requests itself; clients cannot inject provisional evidence. Pending changes apply to the horizon
  scenarios only, are listed in `provisionalApplied`, and are never part of the baseline.
- Admins keep audited direct edits (evidence, employee profiles, role requirements, future requirements,
  resources) for corrections; role requirement changes are admin-only rather than reviewed.

## Risk acknowledgements and exports

A risk acknowledgement names an owner (an active admin, HR or manager account), a note, a due date and a
next review date. The dashboard lists acknowledged risks separately from unowned ones, flags overdue and
due-for-review items, and never changes a score. CSV exports of the skill risk register and data-quality
issues are generated by the server under the same scoping as the screens, protect spreadsheet cells against
formula injection, and are audited.

## Migration strategy

Nothing requires deleting a database. At startup the existing additive workforce migrations run, then
`runGovernanceMigrations` applies each numbered governance migration once inside a transaction and records
it in `schema_migrations`; every statement is also `IF NOT EXISTS`, so reruns are safe. A database seeded
before reporting lines existed gets manager links and catalogue providers from the CSV once. Demo accounts
are created only when the `users` table is empty and `KEYSTONE_ENVIRONMENT=demo`, so restarts never
duplicate or overwrite accounts. `npm run seed:reset --prefix backend` remains available to rebuild the demo.

## Demo accounts (development only)

With `KEYSTONE_ENVIRONMENT=demo` (the default) an empty database gets four accounts from
`backend/data/demo/users.csv`. The password is `KEYSTONE_DEMO_PASSWORD`, or `Keystone-Demo-2026!` when that is
empty. These credentials are for local development only and are never shown in the app.

| Email | Role | Linked employee |
|---|---|---|
| `admin@keystone.demo` | Admin | — |
| `hr@keystone.demo` | HR / People Leader | Abigail Lewis |
| `manager@keystone.demo` | Manager | Rachel Moreno (Engineering, 12 reports) |
| `employee@keystone.demo` | Employee | Mason Green |

## Deferred and known limitations

- Single sign-on, multi-factor authentication, self-service password change and password-reset email.
- Login throttling is in memory; several server instances would need a shared store.
- Personal-data retention, per-employee export and erasure, and field-level encryption at rest.
- Audit-history export and a printable PDF report (CSV exports cover the risk register and data quality).
- Role requirement changes are admin-only direct edits rather than a reviewed change type.
- The frontend has no automated component tests; the backend suite covers authorization, audit, validation,
  data-quality rules and the approval workflow end to end.
