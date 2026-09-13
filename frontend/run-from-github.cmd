@echo off
REM Run the Keystone frontend from GitHub (Windows).
REM The frontend needs the backend API for login, so this script starts BOTH:
REM   backend  <- feature/p1-help   (port 4000, seeded demo data)
REM   frontend <- feature/keystone-ui (port 5173)
REM Requires: git, Node.js (in PATH)

set REPO_URL=https://github.com/Saishal/Hackathon-2026.git
set DIR=Hackathon-2026

if not exist %DIR% (
  git clone %REPO_URL%
)
cd %DIR% || exit /b 1
git fetch origin

REM --- backend from p1-help in a separate worktree (until its PRs merge to main) ---
if not exist ..\ks-backend (
  git worktree add ..\ks-backend origin/feature/p1-help --detach
)
cd ..\ks-backend\backend || exit /b 1
if not exist node_modules call npm ci
call npm run seed:reset
start "keystone-backend" cmd /c "set PORT=4000&& set KEYSTONE_AI_PROVIDER=demo&& node index.js"

REM --- frontend from feature/keystone-ui ---
cd ..\..\%DIR% || exit /b 1
git checkout feature/keystone-ui
git pull origin feature/keystone-ui
cd frontend || exit /b 1
if not exist node_modules call npm ci
start "keystone-frontend" cmd /c "set VITE_API_BASE_URL=http://localhost:4000&& npm run dev"

echo.
echo Frontend: http://localhost:5173
echo Backend:  http://localhost:4000  (health: /api/health)
echo Demo logins: admin@ / hr@ / manager@ / employee@keystone.demo
echo Demo password: Keystone-Demo-2026!
