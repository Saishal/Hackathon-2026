// One place for dates, so data-quality rules, validation and tests agree on "today".
const { loadConfig } = require('../config');

function today(env = process.env) {
  return loadConfig(env).today ?? new Date().toISOString().slice(0, 10);
}

const nowIso = () => new Date().toISOString();

// Rejects impossible dates such as 2026-02-30, which Date.parse would roll into March.
function isCalendarDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

// Calendar month arithmetic that clamps to the last day of the target month (Jan 31 + 1 = Feb 28).
function addMonths(date, months) {
  const [year, month, day] = date.split('-').map(Number);
  const target = new Date(Date.UTC(year, month - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target.toISOString().slice(0, 10);
}

module.exports = { today, nowIso, isCalendarDate, addMonths };
