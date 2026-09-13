# Devpost submission — copy-and-paste kit

Everything a Devpost project page asks for, in the order Devpost asks for it. Paste each block into the matching field. Do not paste passwords or API keys anywhere on Devpost.

## Project name

Keystone

## Tagline (Devpost limit is short — this is 55 characters)

Find your keystones before they walk out the door.

## Links

- **Code:** https://github.com/Saishal/Hackathon-2026
- **Try it:** the README's "Setup" section runs it locally in two commands per package (`npm ci` then `npm start` for the backend, `npm ci` then `npm run dev` for the frontend). Demo accounts are in the README; the password is set in `backend/.env` (never on Devpost).
- **Video:** record 2–3 minutes following `docs/PRESENTATION.md` §4 (the live demo script), upload to YouTube as *Unlisted*, paste the link in Devpost's "Video demo link" field.

## Built with (tags)

javascript, node.js, express, sqlite, react, vite, openai, ajv, css, html

## About the project

### Inspiration

Every organisation has a few people whose knowledge quietly holds a critical process together — nobody planned it, it accumulated. HR systems record job titles, not who can recover the billing system at 2 a.m. Leaders usually find out in an exit interview. A keystone is the stone at the top of an arch that holds every other stone in place; remove it and the arch falls. We wanted a tool that finds those people from evidence the company already has, puts a number on the dependency, and lets a leader test the fix before committing to it.

### What it does

Keystone answers the five questions in the brief, each with its own screen:

1. **What skills exist today?** A live skills inventory: every employee–skill relationship with its level, evidence source and verification date, shown as a network, a matrix, a department heat map and charts, with CSV export.
2. **Which critical skills are concentrated in a few people?** The **Bus Factor**: how many people are recorded at the target level. One person means one departure removes all coverage.
3. **Where are the gaps and succession risks?** The **Keystone Score** (0–100) per skill and per person, succession readiness per role, and a **Time Machine** that projects departures and planned development over 1, 3 and 5 years without touching official data.
4. **How can employees close the gaps?** The **AI advisor** drafts a plan in exactly the five categories the brief names — training, mentoring, certification, job rotation and project experience — naming a learner, a mentor and a verified resource, grounded in recorded evidence and marked "requires review". Accepted actions drop into the Time Machine as planned, unverified development.
5. **What skills will future strategy need?** Type where the business is heading (for example "launch a regulated payments product in the EU") and Keystone proposes the required skills, marks which don't exist in the company yet (hire, build or partner), previews the gap, and routes them through approval before they enter the plan.

Around that: four roles with server-side scoping (managers see only their team, employees only themselves), a review queue where every change is proposed by one person and approved by another, an append-only audit history, data-quality rules with a data-health score, live updates across open tabs, contextual help on every page, English and Spanish, dark mode.

### How we built it

Node.js 22 + Express with SQLite and Ajv validation on the server; React 19 + Vite on the client; scores are computed only on the server, from evidence, on every request, and never stored. The AI advisor uses the OpenAI Responses API with a strict JSON schema; every answer is validated against the recorded workforce (a mentor must exist and be qualified, a resource must be in the verified catalogue) and anything that fails is replaced by labelled rule-based output, so the product works offline and never presents rules as AI. Sessions are HttpOnly cookies with scrypt-hashed passwords; every one of the 70 endpoints sits behind a session and a permission check. The data layer loads reviewable CSV files; a generated 280-person, 68-skill, 1,369-record dataset exercised pagination, filters, search and rendering.

### Challenges we ran into

- Keeping the scores honest: missing evidence must read as *unknown*, never as zero, and the score must measure dependency, not predict who will quit — so tenure, age and sentiment were deliberately kept out.
- Making AI trustworthy for HR: structured output alone was not enough; grounding checks against recorded evidence and a visible "demo mode / live AI" status were.
- Governance edge cases: archiving a manager and promoting one of their reports, restoring someone whose manager was archived, linking accounts to archived people — each found by testing with real volume and fixed at the root with a test.
- Team integration: four members on four branches; we converged on one integration branch, reconciled twice, and verified from a fresh clone.

### Accomplishments that we're proud of

- All five brief questions covered, each demonstrable in under a minute.
- 186 backend tests and 9 frontend tests passing from a fresh clone; lint and build clean.
- A review workflow the server enforces: you cannot approve your own submission.
- Open tabs show a colleague's approval within 20 seconds without a reload.
- A product that says plainly what it does not know: "Unknown" coverage, "requires review" plans, "Demo mode" when no provider is configured.

### What we learned

Evidence beats inference. The most useful number in the product is the simplest one — how many people can actually do this — and the discipline that made it useful was refusing to guess when the evidence was missing. We also learned that trust features (roles, review, audit, data quality) are not overhead for an HR tool; they are what makes the numbers usable.

### What's next for Keystone

HRIS and LMS connectors and CSV import (the reader exists), SSO, a production provider key for live AI (the path is built and has its own verification harness), and caching scores per data-change stamp for organisations with tens of thousands of people.

## Screenshots to upload (take them from the running app, 1440 px wide, light theme)

1. Overview with the "One person only" tile and the risk table filtered to Coverage = One person.
2. Key people with Liam Chen expanded ("If Liam were away…").
3. Time Machine comparison: Today / Without development / With development.
4. AI advisor: the five-category plan for Legacy Billing Recovery.
5. AI advisor: "Plan for future skills" with the EU payments example and the gap preview.
6. Skill map heat map.
7. Review queue with a pending change and the audit history entry it produced.

## Pull request description (for merging the integration branch into `main`)

Title: `Keystone: integrate all member work, QA phase and presentation guide`

Body:

```
This fast-forwards main to the team's integration branch (77 commits, no conflicts).

Included:
- Member 1 data layer and contracts, monitoring and docs (Marco)
- Enterprise trust and governance: sessions, roles, review workflow, audit, data quality (Matias)
- Priority 8/9: help, user admin, employee directory, global search, filters and saved views, suggestions (Marco)
- UX: Home, dark mode, Spanish, notification hub, skill map heat map and charts, collapsible sidebar, assistant (Matias)
- QA phase: enterprise dataset, pagination, live updates, AI provider status, strategy templates, root-cause fixes (Marco)
- docs/PRESENTATION.md and docs/DEVPOST.md

Verified from a fresh clone: backend 186/186 tests, frontend build and 9/9 tests, lint clean.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```
