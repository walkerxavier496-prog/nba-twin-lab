#!/usr/bin/env node
'use strict';
/**
 * Public record of missed pre-tip locks.
 *
 * If a Melbourne date has NBA games, the first tip-off passed more than ten
 * minutes ago, and no forecast lock exists for that date, the miss is written to
 * audit/gaps/<date>.json (append-only) instead of vanishing into a CI log.
 * audit/gaps/index.json is a derived summary so the page can show the real
 * lock rate (locked days vs. gaps) rather than only the successes.
 *
 * Only dates on or after the first existing lock are evaluated: the ledger
 * cannot be said to have "missed" days before it started.
 *
 *   node scripts/lock_gaps.cjs run      record new gaps + refresh the summary
 *   node scripts/lock_gaps.cjs verify   reject gap records that contradict a lock
 */
const fs = require('node:fs');
const path = require('node:path');
const A = require('./audit-core.cjs');

const DEFAULT_ROOT = path.join(__dirname, '..');
const GAP_SCHEMA = 'nba-twin-lab-lock-gap-v1';
const INDEX_SCHEMA = 'nba-twin-lab-lock-gap-index-v1';
const GRACE_MS = 10 * 60 * 1000; // same threshold the tracker uses for "LOCK GAP"

const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const gapDir = root => path.join(root, 'audit', 'gaps');
const gapFile = (root, date) => path.join(gapDir(root), `${date}.json`);

function filesUnder(directory, name) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) return filesUnder(full, name);
    return entry.name === name ? [full] : [];
  });
}

function lockedDates(root) {
  const files = [...filesUnder(path.join(root, 'audit', 'snapshots'), 'forecast.lock.json'),
                 ...filesUnder(path.join(root, 'practice'), 'forecast.lock.json')];
  return new Set(files.map(file => { try { return readJson(file).scope?.melbourne_date; } catch { return null; } }).filter(Boolean));
}

function gapDates(root) {
  if (!fs.existsSync(gapDir(root))) return [];
  return fs.readdirSync(gapDir(root)).filter(n => /^\d{4}-\d{2}-\d{2}\.json$/.test(n)).map(n => n.slice(0, 10)).sort();
}

function run({ root = DEFAULT_ROOT, now = Date.now() } = {}) {
  const locked = lockedDates(root);
  const created = [];
  if (!locked.size) return created; // ledger has not started
  const start = [...locked].sort()[0];
  const games = readJson(path.join(root, 'data', 'games.json')).games || [];
  const byDate = new Map();
  for (const game of games) {
    const tip = Date.parse(game.date);
    if (!Number.isFinite(tip)) continue;
    const date = A.melbourneDate(tip);
    if (date < start) continue;
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date).push(tip);
  }
  let evaluated = 0, lockedDays = 0;
  for (const [date, tips] of [...byDate.entries()].sort()) {
    const firstTip = Math.min(...tips);
    if (now <= firstTip + GRACE_MS) continue; // not yet decidable
    evaluated += 1;
    if (locked.has(date)) { lockedDays += 1; continue; }
    const target = gapFile(root, date);
    if (!fs.existsSync(target)) {
      fs.mkdirSync(gapDir(root), { recursive: true });
      fs.writeFileSync(target, JSON.stringify({
        schema: GAP_SCHEMA,
        melbourne_date: date,
        game_count: tips.length,
        first_tip_utc: new Date(firstTip).toISOString(),
        detected_at_utc: new Date(now).toISOString(),
        statement: 'No pre-tip forecast lock exists for this date. No forecast is claimed and nothing was backfilled.',
      }, null, 2) + '\n', { encoding: 'utf8', flag: 'wx' });
      created.push(date);
    }
  }
  const dates = gapDates(root);
  if (dates.length || fs.existsSync(gapDir(root))) {
    fs.mkdirSync(gapDir(root), { recursive: true });
    fs.writeFileSync(path.join(gapDir(root), 'index.json'), JSON.stringify({
      schema: INDEX_SCHEMA, since: start, days_evaluated: evaluated, locked_days: lockedDays,
      gap_count: dates.length, gap_dates: dates,
    }, null, 2) + '\n');
  }
  return created;
}

function verify({ root = DEFAULT_ROOT } = {}) {
  const locked = lockedDates(root);
  const dates = gapDates(root);
  for (const date of dates) {
    const record = readJson(gapFile(root, date));
    if (record.schema !== GAP_SCHEMA) throw new Error(`Gap ${date}: unknown schema`);
    if (record.melbourne_date !== date) throw new Error(`Gap ${date}: date field does not match its file name`);
    if (locked.has(date)) throw new Error(`Gap ${date}: contradicts an existing lock for that date`);
  }
  return { gaps: dates.length };
}

function main(argv) {
  const command = argv[2];
  if (command === 'run') console.log('Recorded gaps:', run().join(', ') || 'none');
  else if (command === 'verify') console.log(`Verified ${verify().gaps} gap record(s).`);
  else throw new Error(`Usage: lock_gaps.cjs run|verify (got ${command})`);
}

if (require.main === module) {
  try { main(process.argv); } catch (error) { console.error(error.message); process.exit(1); }
}

module.exports = { run, verify, GAP_SCHEMA, INDEX_SCHEMA };
