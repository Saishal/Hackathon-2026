# Enterprise dataset (generated, fictional)

Produced by `node scripts/generate-enterprise-dataset.js` from `backend/data/demo/` plus generated departments.
Every person, skill, course and account is fictional. Regenerating with the same script gives identical files.

Seed a fresh database with it: stop the backend, then `npm run seed:enterprise` (or set `KEYSTONE_SEED_DIR` to this folder).

| File | Rows |
|---|---|
| roles.csv | 62 |
| skills.csv | 68 |
| employees.csv | 280 |
| role_requirements.csv | 225 |
| employee_skills.csv | 1369 |
| learning_resources.csv | 44 |
| future_requirements.csv | 12 |
| users.csv | 11 |

The demo story is preserved: generated people never hold Legacy Billing Recovery, Payments Compliance, Cybersecurity or AI Governance,
so those skills keep the same qualified holders as the demo. Extra sign-in accounts use the same demo password as the four demo accounts:

- `director.engineering@keystone.demo` — manager (Lucas Mensah)
- `head.finance@keystone.demo` — manager (Omar Ekwueme)
- `head.sales@keystone.demo` — manager (Dmitri Kowalski)
- `people.partner@keystone.demo` — hr (Maya Sørensen)
- `data.engineer@keystone.demo` — employee (Mei Quinn)
- `account.executive@keystone.demo` — employee (Ravi Gallagher)
- `ops.admin@keystone.demo` — admin
