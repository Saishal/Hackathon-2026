# SkillSight — Talent Readiness & Skills Intelligence

SkillSight is a hackathon web app that helps teams understand current skill coverage and future readiness.

## Features

- **Skills heat map**: employees × skills matrix with color-coded proficiency (0-5)
- **Critical skills at risk**: flags skills held by fewer than 2 people at intermediate+ level
- **Gap analysis**: compares current capability with configurable future skill targets
- **Recommendations**: suggests training, mentoring, and certification actions to close key gaps

The backend seeds SQLite with realistic demo data for **20 employees** and **15 skills** on first run.

## Tech Stack

- Frontend: React + Vite
- Backend: Node.js + Express
- Database: SQLite

## Project Structure

- `/frontend` — React dashboard UI
- `/backend` — Express API and SQLite seed logic

## Setup

### 1) Install dependencies

```bash
cd /home/runner/work/Hackathon-2026/Hackathon-2026/frontend && npm install
cd /home/runner/work/Hackathon-2026/Hackathon-2026/backend && npm install
```

### 2) Run backend API

```bash
cd /home/runner/work/Hackathon-2026/Hackathon-2026/backend
npm run start
```

Backend runs on `http://localhost:4000`.

### 3) Run frontend

```bash
cd /home/runner/work/Hackathon-2026/Hackathon-2026/frontend
npm run dev
```

Frontend runs on `http://localhost:5173` and calls the backend at `http://localhost:4000` by default.

If needed, override API URL:

```bash
VITE_API_BASE_URL=http://localhost:4000 npm run dev
```

## API Endpoints

- `GET /api/heatmap`
- `GET /api/critical-skills`
- `GET /api/gap-analysis`
- `GET /api/recommendations`
- `GET /api/future-skills`
- `PUT /api/future-skills` to update target headcount per skill

## Notes

- SQLite DB file is created automatically at `/backend/skillsight.db` and is gitignored.
- No test harness existed initially in this repository; validation is done with targeted build/manual endpoint checks.
