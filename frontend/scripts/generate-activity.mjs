// generate-activity.mjs — builds frontend/src/data/activity.json from the git
// history of ALL team branches, so the Activity Log panel shows who changed
// what and when, across members 1–4 (plus merges to main).
//
// Attribution: a commit is credited to the branch it ORIGINATED on
// (git log origin/main..origin/<branch>) — shared ancestor history never
// steals credit. Commits that only exist on main (merged PRs, direct pushes,
// other helper branches) are credited to "Team · Merged to main".
//
// Run from anywhere:  node frontend/scripts/generate-activity.mjs
// The sync automation re-runs this after every fetch.

import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const frontendDir = join(here, '..');
const repoRoot = join(frontendDir, '..');
const outFile = join(frontendDir, 'src', 'data', 'activity.json');

const git = (args) => execSync(`git ${args}`, { cwd: repoRoot, encoding: 'utf8' }).trim();

const MEMBER_BRANCHES = [
  ['feature/workforce-data', 'Member 1', 'Data & contracts'],
  ['feature/risk-simulation', 'Member 2', 'Risk & Time Machine'],
  ['feature/keystone-ui', 'Member 3', 'Frontend & integration'],
  ['feature/ai-recommendations', 'Member 4', 'AI recommendations'],
];
const TEAM = ['main', 'Team', 'Merged to main'];

const seen = new Map(); // hash -> entry

function collect(range, member, role, branch) {
  let log;
  try {
    // Skip branches that don't exist on the remote (e.g. not pushed yet).
    const head = range.includes('..') ? range.split('..')[1] : range;
    git(`rev-parse --verify --quiet ${head}`);
    log = git(`log ${range} --format=%H%x1f%an%x1f%aI%x1f%s --no-merges`);
  } catch {
    return;
  }
  if (!log) return;
  for (const line of log.split('\n')) {
    const [hash, author, isoDate, subject] = line.split('\x1f');
    if (!hash || seen.has(hash)) continue;
    seen.set(hash, { hash: hash.slice(0, 7), member, role, branch, author, isoDate, subject });
  }
}

// 1) Commits unique to each member's branch (originated there).
for (const [branch, member, role] of MEMBER_BRANCHES) {
  collect(`origin/main..origin/${branch}`, member, role, branch);
}
// 2) Everything else reachable from main (PR merges, direct pushes).
collect('origin/main', TEAM[1], TEAM[2], TEAM[0]);

const activity = [...seen.values()].sort((a, b) => b.isoDate.localeCompare(a.isoDate)).slice(0, 100);
writeFileSync(outFile, JSON.stringify({ generatedAt: new Date().toISOString(), entries: activity }, null, 2));
const counts = {};
for (const e of activity) counts[e.member] = (counts[e.member] || 0) + 1;
console.log(`activity.json: ${activity.length} commits`, counts);
