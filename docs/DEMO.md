# Three-minute demo

Every step below was clicked through on 2026-09-12 against a freshly seeded database. The
numbers are what the CSV demo dataset produces; if they differ, the database is not fresh.

## Before you present

```sh
npm ci --prefix backend
npm ci --prefix frontend
npm run seed:reset --prefix backend   # stop the backend first; strategy saves persist
npm start --prefix backend
npm run dev --prefix frontend          # second terminal, then open http://localhost:5173
```

No AI key is needed. Without one, plans and proposals say **Demo fallback** or
**Deterministic demo proposal**; say so rather than calling them AI output.

## Run sheet

| Time | View | Do | Point out |
|---|---|---|---|
| 0:00 | Overview | Nothing, just show it | 3 single-holder skills, 1 uncovered. The summary lists AI Governance, Cybersecurity, Legacy Billing Recovery and Payments Compliance. Scores measure dependency, not who will leave. |
| 0:25 | People & Risk | Scroll the first card | Liam Chen, 98/100: the only qualified holder of Legacy Billing Recovery. Successor readiness is checked against every requirement of his role. |
| 0:50 | Skill Network | Click **Legacy Billing Recovery** on the right | One thick line to Liam (level 5, project delivery review). Mason Green and Fatima Zahra are at 2, from a self-assessment and a training record. A missing line means unknown, not absent. |
| 1:15 | AI Advisor | Skill to develop: Legacy Billing Recovery → **Generate development plan**. On the Mentoring card tick **I reviewed this action** → **Schedule in Time Machine** | Five action types, each with a milestone and a verification method. Mason is mentored by Liam; the certification is the catalogue's Billing Recovery Practitioner Assessment. Nothing is marked complete: it is scheduled unverified. |
| 1:45 | Time Machine | Departure: Liam Chen, month 9 → **Add departure** → **Compare scenarios** | The scheduled mentoring is listed as not verified. Billing goes 1 today → 0 without development → 0 with it. |
| 2:05 | Time Machine | Tick **Verified at completion** on Mason's item → **Compare scenarios** | Now 1 → 0 → 1, "development prevents the loss of coverage", and the bars show it. The baseline never changes. |
| 2:25 | AI Advisor | Business direction: `We are expanding into e-commerce` → **Propose future skills** → tick the review box → **Save reviewed requirements** | E-commerce Operations is a new skill with a stable ID; Data Analysis and Cybersecurity match the catalogue. Saved requirements apply in Time Machine at month 12. |
| 2:50 | Workforce Data | Search `billing` | Every number traces to a recorded source and date, and every record says it is a fictional demo dataset. |

## If something goes wrong

- **Backend not reachable:** the app shows a **DEMO DATA** banner and renders the bundled samples. Say it is the offline sample and continue; the Time Machine and AI calls will not work.
- **Numbers do not match:** a previous rehearsal saved strategy requirements or skill edits. Stop the backend, run `npm run seed:reset --prefix backend`, start again.
- **Backup recording:** record one full run of this sheet (on Windows, Win+Alt+R starts Xbox Game Bar recording) and keep it next to the slides.
