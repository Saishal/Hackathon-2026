# Demo dataset

The workforce Keystone seeds on first start: 80 people in 11 departments, holding 425 skill
records spread across levels 1 to 5. **Every person, skill, course, date and
requirement here is fictional.** The files are plain CSV so they can be reviewed and edited
in a spreadsheet; the backend validates all of them before writing anything, and a bad row
fails the seed with its file and line, for example `employees.csv:4: unknown role "Backend Enginer"`.

Rows reference each other **by name**. SQLite allocates the integer IDs on import, so no ID
ever appears in a CSV. A blank cell means *unknown*, never zero.

| File | Columns | Notes |
|---|---|---|
| `employees.csv` | `name, role, department, mentoring_hours_per_month` | `role` must exist in `roles.csv`. Blank hours = capacity never recorded. |
| `skills.csv` | `name, criticality, target_proficiency, required_holders, demand_target, source` | Criticality and proficiency 1–5. `required_holders` is Keystone coverage; `demand_target` is the legacy hiring target and may be blank. |
| `roles.csv` | `role, criticality, source` | Critical roles used for succession. |
| `role_requirements.csv` | `role, skill, minimum_proficiency` | What a successor must already hold. |
| `employee_skills.csv` | `employee, skill, proficiency, evidence_source, last_verified_at` | Evidence is required. Date is `YYYY-MM-DD` or blank. |
| `learning_resources.csv` | `slug, title, kind, skills, verified, url, provenance` | `skills` is `;`-separated. `kind` is training, mentoring, certification, job_rotation, project_experience or documentation. AI recommendations only use rows with `verified` = `true`. |
| `future_requirements.csv` | `skill, required_holders, target_proficiency, criticality, effective_month, status, provenance` | `status` is `proposed` or `reviewed`; only reviewed rows reach Time Machine automatically. |

## Reloading

The CSVs are imported only into an empty database, so edits made in the app survive a
restart. After changing a CSV, stop the backend and run:

```sh
npm run seed:reset --prefix backend
```

To seed a different organization, point `KEYSTONE_SEED_DIR` at a folder containing the same
seven files (and `DB_PATH` at a new database file).

## Demo stories the data is built around

- **Legacy Billing Recovery** — Liam Chen is the only holder at level 5; Mason Green and
  Fatima Zahra are at 2. Liam has 4 recorded mentoring hours a month, so mentoring Mason by
  month 6 keeps coverage when Liam leaves in month 9.
- **Payments Compliance** and **Cybersecurity** each rest on one person at the target level
  (Nadia Rahman, Isabella Ross).
- **AI Governance** has no holder at the target level, and the AI Specialist role has no
  ready successor.
