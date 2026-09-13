# Keystone — presentation guide

**Tagline:** Find your keystones before they walk out the door.

**One-line pitch:** Keystone shows leaders exactly which people are quietly holding critical company knowledge together, quantifies the risk if they leave, and simulates whether targeted training and mentoring actually fixes it — before it's too late.

The interactive version of this guide (with a copy button for the Gemini prompt) was published as a Claude artifact; this file is the canonical copy in the repository.

## 1. The story in 30 seconds

An arch does not fall when a stone cracks. It falls when the keystone goes. Every organisation has a handful of people whose knowledge holds a critical process together. Nobody planned it; it accumulated. Leaders usually discover it in an exit interview. Keystone finds those people from evidence the company already has, puts a number on the dependency, and lets you test the fix before committing to it.

**Demo story:** Harbor & Pine Co. runs payments on a legacy billing system. Only **Liam Chen** can do *Legacy Billing Recovery*. Two people are required; one is qualified; the skill scores **80/100**. If Liam is away, coverage drops from one to zero. Mason Green is the closest backup at level 2. The presentation is: *find Liam → see what breaks → prove that mentoring Mason fixes it → know what skills the next strategy needs.*

## 2. The brief's five questions → what Keystone does

| Official question | Keystone answer | Where to point |
|---|---|---|
| What skills and competencies exist across our workforce today? | A live skills inventory: every employee–skill relationship with level, evidence source and verification date. Network, matrix, heat map, charts, CSV export. | Skill map, Data & evidence |
| Which critical skills are concentrated in only a few individuals? | The **Bus Factor**: people recorded at target level. One person = one departure removes all coverage. | Overview "One person only" tile and risk table |
| Where are our greatest capability gaps and succession risks? | The **Keystone Score** per skill and per person, succession readiness per role, and the **Time Machine** over 1/3/5 years. | Key people, Time Machine |
| How can employees close skill gaps through training, mentoring, certifications, job rotations or project experiences? | The **AI advisor** drafts a plan in exactly those five categories, grounded in recorded evidence and the verified catalogue, marked "requires review", schedulable into the Time Machine. | AI advisor → Develop a skill |
| What skills will be needed to support future business and technology strategies? | Type a strategic direction; Keystone proposes the required skills, flags which don't exist yet, previews the gap, and routes them through approval into the plan. | AI advisor → Plan for future skills |

All five are covered. The fifth was the open gap a week ago; it is now closed by the strategy proposal flow (9 initiative templates offline, live provider when configured).

## 3. The deck, slide by slide

| # | Slide | On screen | Say |
|---|---|---|---|
| 1 | **Keystone** — tagline only | A simple arch with one highlighted keystone | "In every company there are a few people the whole thing quietly rests on. We built the tool that finds them before their resignation email does." |
| 2 | **The problem nobody sees until it's too late** — knowledge concentrates by accident; HR records titles, not who can recover billing at 2 a.m.; leaders learn in the exit interview | "Only Liam knows how." | "Harbor & Pine has forty-four people and one person who can recover a failed billing run. Nobody decided that. It just happened." |
| 3 | **What Keystone does** — one-line pitch; Find / Quantify / Simulate; the five questions ticked | Checklist | "Everything runs on evidence the company already has: who holds which skill, at what level, verified when." |
| 4 | **Two numbers, no black box** — Bus Factor; Keystone Score formula; worked example = 80 | Formula + example | "This measures dependency, not attrition. We deliberately don't use tenure, age or sentiment." |
| 5 | **Q1 · Your skills inventory, alive** — network, matrix, heat map, charts, CSV export | Heat map with legend | "Unknown is a real state. If we have no verified evidence, we say so — we never treat missing data as zero." |
| 6 | **Q2 · Skills held by one person** — overview tiles; risk table with owner, due date, review; URL-backed filters | Risk table, Legacy Billing Recovery at 80, "Assign owner" | "A risk without an owner is a wish. Every one of these gets a person, a date and a next review." |
| 7 | **Q3 · Who we depend on, and over time** — Key people "if away" + backups; succession; Time Machine 1/3/5 years | Time Machine comparison | "Liam leaves in month 3. Legacy Billing Recovery goes 1 → 0. Now watch what mentoring Mason does to that line." |
| 8 | **Q4 · Closing the gap in five ways** — training, mentoring, certification, job rotation, project experience; grounded, validated, requires review; schedulable | Five-category plan | "The model can't invent a mentor who isn't on record or a course that isn't verified. If it tries, the grounding check rejects it." |
| 9 | **Q5 · The skills the strategy will need** — direction → requirements → existing/new → gap preview → approval | EU payments example: Payments Compliance, Cybersecurity, Data Privacy (GDPR), Incident Response, IAM, Cloud Architecture, Kubernetes, DevOps | "This was the one bullet we hadn't covered a week ago. Now the same engine answers it, and nothing becomes official without a reviewer." |
| 10 | **Built to be trusted** — four roles, server-side scoping; four-eyes review; append-only audit; data-quality score; live updates; help; EN/ES; dark mode | Review queue + audit trail | "Four-eyes on every fact. You can't approve your own submission — the server refuses." |
| 11 | **Under the hood** — Node 22/Express/SQLite/Ajv; React 19/Vite; OpenAI structured output validated against evidence with deterministic fallback; 186 + 9 tests; 280-person dataset | Architecture diagram | "Deterministic where it must be, generative where it helps, validated in between." |
| 12 | **Tagline** — repo link; ask: "Give us your skills export and we'll show you your keystones in an hour." | The arch with two highlighted stones | "Thank you. Questions?" |

The Keystone Score, for slide 4:

```
gap      = max(0, requiredHolders − busFactor)
shortage = gap / requiredHolders
score    = round(100 × criticality/5 × (0.6 / max(1, busFactor) + 0.4 × shortage))
```

## 4. Live demo script (six minutes)

Sign in as `admin@keystone.demo` beforehand; 1440 px wide, light theme, English; screenshots of every step ready as a fallback.

1. **Home → Overview.** Point at "One person only · 3" and "Key people · Liam Chen 80/100". *"Three skills rest on one person. The most exposed is Legacy Billing Recovery, scored 80 out of 100."*
2. **Overview risk table → Coverage = One person, Owner = No owner.** Show chips and URL. Assign an owner on one row. *"Filters live in the URL, so I can paste this exact view to the CFO. And a risk isn't real until it has an owner and a date."*
3. **Key people → expand Liam Chen.** *"Mason is the closest backup at level 2 — below target. That's our development case."*
4. **Time Machine → Add departure: Liam Chen, month 3 → Compare.** *"If nothing changes, coverage is zero in month 3."*
5. **AI advisor → Develop a skill: Legacy Billing Recovery → Generate → Add mentoring to Time Machine.** *"Five levers, every one tied to a real person and a verified resource. Accepted actions go into the plan as unverified."*
6. **Time Machine → Compare again.** *"Same departure, with the mentoring plan: coverage holds."*
7. **AI advisor → Plan for future skills:** "Launch a regulated payments product in the EU next year: PCI-grade security, GDPR privacy engineering and cloud automation." → Propose → I reviewed → Preview gaps. *"Question five. Eight requirements, each marked existing or new, with a gap preview — and they only reach the plan after approval."*
8. **Review queue (optional).** Show the "you submitted this, so you cannot approve it" note. *"Four-eyes on every fact."*

If the backend or network fails: switch to the screenshots, say "let me show you the recorded run", keep the narration identical. Never debug on stage.

## 5. Proof points

- 186 backend tests, 0 failures; 9 frontend tests; lint and build clean.
- Tested with 280 people, 68 skills, 62 roles, 1,369 evidence records (`npm run seed:enterprise`).
- 70 API endpoints, each behind a session and a permission check; 4 roles with server-side scoping.
- 5/5 brief questions, each with its own screen.
- Any open tab shows a colleague's change within 20 seconds, no reload.

## 6. Likely judge questions

- **Are you predicting who will quit?** No. Scores measure dependency, computed from recorded skills. Tenure, age and sentiment are excluded on purpose: that would be an attrition model, needing personal data we don't hold, and the brief rules it out.
- **Where does the data come from?** Evidence the company already has: skills, levels, source, verification date. The demo loads CSV; an HRIS export is the same shape. Missing evidence stays "unknown".
- **How do you stop the AI making things up?** Strict JSON schema, every answer validated against the recorded workforce and verified catalogue, labelled rule-based fallback on failure, every result "requires review", nothing official without a reviewer.
- **What if someone games the scores?** Nobody edits a score. Evidence is proposed by one person and approved by another, every step is audited, data-quality rules flag unverified and stale evidence.
- **Does it scale?** 280 people tested, every page paginated, heaviest endpoint under 350 ms. Caching scores per data-change stamp is the next step for tens of thousands of people.
- **What next?** HRIS/LMS connectors and CSV import, SSO, live provider key in production.
- **Why "Keystone"?** The stone at the top of an arch that holds the others in place. Remove it and the arch falls.

## 7. Gemini prompt

Paste into Gemini (slides/canvas mode, or ask for a Google Slides deck). If it returns an outline, reply "now create the presentation from this outline".

```text
You are a senior presentation designer. Create a 12-slide hackathon pitch deck for a software product called Keystone. Use only the facts in this brief; do not invent statistics, customers, quotes or features. Where you need an image, describe it precisely so I can create it, or use a simple diagram made of shapes.

PRODUCT
- Title: Keystone
- Tagline: "Find your keystones before they walk out the door."
- One-line pitch: Keystone shows leaders exactly which people are secretly holding critical company knowledge together, quantifies the risk if they leave, and simulates whether targeted training and mentoring actually fixes it before it's too late.
- Metaphor: the keystone is the stone at the top of an arch that holds all the others in place; remove it and the arch falls.
- Demo organisation (fictional): Harbor & Pine Co., 44 people. Only Liam Chen can perform "Legacy Billing Recovery" (a critical skill, criticality 5). Two people are required; one is qualified; the skill scores 80/100. Closest backup: Mason Green at level 2 (target is 3).

THE BRIEF'S FIVE QUESTIONS AND HOW KEYSTONE ANSWERS EACH (all five are covered)
1. "What skills and competencies exist across our workforce today?" -> a live skills inventory: every employee-skill relationship with level, evidence source and verification date; network view, matrix, department heat map and charts; CSV export.
2. "Which critical skills are concentrated in only a few individuals?" -> the Bus Factor: how many people are recorded at the target level for a skill. One person means one departure removes all coverage.
3. "Where are our greatest capability gaps and succession risks?" -> the Keystone Score (0-100) per skill and per person, succession readiness per role, and the Time Machine projecting 1, 3 and 5 years.
4. "How can employees close skill gaps through training, mentoring, certifications, job rotations, or project experiences?" -> the AI advisor drafts a plan in exactly those five categories for a skill, naming a learner, a mentor and a verified resource, with a milestone and verification method. Accepted actions are scheduled into the Time Machine as planned, unverified development.
5. "What skills will be needed to support future business and technology strategies?" -> the user types a strategic direction (e.g. "launch a regulated payments product in the EU"); Keystone proposes the required skills with target level, people needed and start month, marks which skills do not exist in the company yet (hire, build or partner), previews the gap, and routes them through approval before they enter the plan.

HOW THE SCORES WORK (say clearly: dependency, not a prediction of who will quit; tenure, age and sentiment are deliberately excluded)
- Bus Factor for a skill = number of employees recorded at or above the skill's target proficiency.
- Keystone Score for a skill: gap = max(0, requiredHolders - busFactor); shortage = gap / requiredHolders; score = round(100 x criticality/5 x (0.6 / max(1, busFactor) + 0.4 x shortage)). Example: Legacy Billing Recovery, 1 holder, 2 required, criticality 5 -> 80.
- Employee Keystone Score = how much worse every skill they hold would score if they were removed, summed, capped at 100.
- Recomputed from evidence on every request; never stored; missing evidence is "unknown", never zero.

TRUST AND GOVERNANCE
- Four roles: admin, HR, manager (sees only their team), employee (sees only themselves); enforced on the server on every request.
- Every change to official data is proposed by one person and approved by a different person (you cannot approve your own submission), applied in one transaction, and written to an append-only audit history.
- Data-quality rules flag unverified, stale and missing evidence and produce a data-health score.
- Live updates: any open tab shows a colleague's change within 20 seconds without reloading. Contextual help on every page, English and Spanish, dark mode.

TECHNOLOGY AND PROOF
- Node.js 22 + Express, SQLite, Ajv validation, scrypt passwords, HttpOnly sessions; React 19 + Vite; scores are never computed in the browser.
- AI: OpenAI Responses API with a strict JSON schema, every answer validated against recorded evidence, deterministic labelled fallback when no key is configured or the provider fails.
- 186 backend tests and 9 frontend tests passing; tested with a 280-person, 68-skill, 62-role, 1,369-evidence-record dataset; 70 API endpoints, each behind a session and permission check.

SLIDES (title, content, and speaker notes for each)
1. Title slide: "Keystone" and the tagline only. Visual: a simple stone arch with one highlighted keystone.
2. The problem: knowledge concentrates in individuals by accident; HR systems record titles, not who can recover the billing system at 2 a.m.; leaders find out in the exit interview. Big line: "Only Liam knows how."
3. What Keystone does: the one-line pitch; three verbs Find / Quantify / Simulate; the five questions as a checklist, all ticked.
4. Two numbers, no black box: the Bus Factor and the Keystone Score with the formula and the worked example (80). Note: dependency, not attrition.
5. Q1 - the skills inventory: network, matrix, heat map, charts, CSV export; "Unknown" is a real state.
6. Q2 - skills held by one person: overview tiles (No one qualified / One person only / Key people / Data health), risk table with owner, due date, next review; filters that live in the URL.
7. Q3 - dependency and time: Key people with "if they were away" and closest backups; succession readiness; Time Machine comparing Today / Without development / With development over 1, 3, 5 years.
8. Q4 - closing the gap five ways: the AI plan for Legacy Billing Recovery with a named learner (Mason Green), mentor (Liam Chen) and verified resource per category; "requires review"; accepted actions go into the Time Machine as unverified.
9. Q5 - the skills the strategy will need: example direction "Launch a regulated payments product in the EU" producing Payments Compliance, Cybersecurity, Data Privacy (GDPR), Incident Response, Identity & Access Management, Cloud Architecture, Kubernetes, DevOps, each marked existing or new; gap preview; approval before it enters the plan.
10. Built to be trusted: roles and scoping, four-eyes review, audit history, data-quality score, live updates, help, two languages.
11. Under the hood: the technology list and the proof numbers; a simple architecture diagram: CSV/HRIS -> SQLite -> risk engine -> API -> React, with the AI provider on the side behind a validator.
12. Closing: the tagline, the ask "Give us your skills export and we'll show you your keystones in an hour", thank you.

DESIGN
- Tone: confident, calm, precise; plain language; no buzzwords, no exclamation marks.
- Palette: deep slate (#16202A) text, light stone grey (#EEF1F4) backgrounds, one amber accent (#B8731C) used sparingly for the keystone and the key number on each slide. No purple gradients, no stock photos of handshakes.
- Typography: a strong geometric or grotesque display face for titles, a clean humanist sans for body; large numbers where a number is the point of the slide.
- Each slide: one headline, at most four bullets or one diagram, and a short speaker note of two to three sentences that I can read aloud. Put the exact speaker note text below each slide.
- Keep every fact traceable to this brief. If a slide needs a screenshot of the product, write "[screenshot: <what it shows>]" as a placeholder.
```

## 8. Before you present

- Pull the latest `feature/ux-personalization`; `npm test --prefix backend` (expect 186 passing).
- Choose the dataset: the 44-person demo tells the story cleanly; `npm run seed:enterprise --prefix backend` (280 people) impresses on scale. The story holds in both.
- For "Live AI" on stage put `OPENAI_API_KEY` and `KEYSTONE_AI_MODEL=gpt-4.1-mini` in `backend/.env`; the AI advisor's status line confirms it. Without a key it says "Demo mode" honestly — fine to show.
- Start both servers; check `http://localhost:4000/api/health` says ok.
- Sign in as `admin@keystone.demo` with "Keep me signed in"; light theme, English, 1440 px wide, other tabs closed.
- Run the demo script once end to end; screenshot every step for the fallback deck.
- Keep the demo password and `hr@keystone.demo` in a text file, not on a slide.
- Last line before Q&A is the tagline. Stop talking after it.
