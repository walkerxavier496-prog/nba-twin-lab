'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const G = require('../scripts/lock_gaps.cjs');

// Melbourne is UTC+11 in November (AEDT). 2026-11-01 01:00Z = 12:00 Melbourne on 11-01.
function fixture({ games, lockDate = '2026-10-31' } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gaps-'));
  fs.mkdirSync(path.join(root, 'data'), { recursive: true });
  fs.writeFileSync(path.join(root, 'data', 'games.json'), JSON.stringify({ games: games || [
    { id: 'a1', date: '2026-10-31T00:00Z', status: 'final' },
    { id: 'b1', date: '2026-11-01T00:00Z', status: 'final' },
    { id: 'b2', date: '2026-11-01T02:30Z', status: 'final' },
    { id: 'c1', date: '2026-11-02T00:00Z', status: 'scheduled' },
    { id: 'old', date: '2025-10-21T23:30Z', status: 'final' },
  ] }));
  if (lockDate) {
    const dir = path.join(root, 'practice', `${lockDate}-melbourne`);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'forecast.lock.json'), JSON.stringify({
      scope: { melbourne_date: lockDate, first_tip_utc: '2026-10-31T00:00:00Z' }, locked_at_utc: '2026-10-30T21:49:42Z', forecasts: [{ game_id: 'a1' }] }));
  }
  return root;
}
const gapFile = (root, date) => path.join(root, 'audit', 'gaps', `${date}.json`);
const NOW = Date.parse('2026-11-01T01:00:00Z'); // after 11-01's first tip (00:00Z) + 10 min

test('a day with games but no pre-tip lock is recorded as a gap once tip-off has passed', () => {
  const root = fixture();
  assert.deepEqual(G.run({ root, now: NOW }), ['2026-11-01']);
  const gap = JSON.parse(fs.readFileSync(gapFile(root, '2026-11-01'), 'utf8'));
  assert.equal(gap.schema, 'nba-twin-lab-lock-gap-v1');
  assert.equal(gap.melbourne_date, '2026-11-01');
  assert.equal(gap.game_count, 2);
  assert.equal(gap.first_tip_utc, '2026-11-01T00:00:00.000Z');
  assert.equal(gap.detected_at_utc, '2026-11-01T01:00:00.000Z');
  assert.match(gap.statement, /no pre-tip forecast lock/i);
});

test('days that are locked, not yet started, or before the first lock are not gaps', () => {
  const root = fixture();
  G.run({ root, now: NOW });
  assert.equal(fs.existsSync(gapFile(root, '2026-10-31')), false); // locked
  assert.equal(fs.existsSync(gapFile(root, '2026-11-02')), false); // not started
  assert.equal(fs.existsSync(gapFile(root, '2025-10-21')), false); // before ledger began
});

test('no gap is declared inside the ten-minute grace period after first tip', () => {
  const root = fixture();
  assert.deepEqual(G.run({ root, now: Date.parse('2026-11-01T00:09:00Z') }), []);
  assert.deepEqual(G.run({ root, now: Date.parse('2026-11-01T00:11:00Z') }), ['2026-11-01']);
});

test('run is append-only: it never rewrites an existing gap record', () => {
  const root = fixture();
  G.run({ root, now: NOW });
  const before = fs.readFileSync(gapFile(root, '2026-11-01'), 'utf8');
  assert.deepEqual(G.run({ root, now: NOW + 60000 }), []);
  assert.equal(fs.readFileSync(gapFile(root, '2026-11-01'), 'utf8'), before);
});

test('with no locks at all nothing is flagged, because the ledger has not started', () => {
  const root = fixture({ lockDate: null });
  assert.deepEqual(G.run({ root, now: NOW }), []);
});

test('summary counts locked days and gaps so the public rate is never hidden', () => {
  const root = fixture();
  G.run({ root, now: NOW });
  const summary = JSON.parse(fs.readFileSync(path.join(root, 'audit', 'gaps', 'index.json'), 'utf8'));
  assert.equal(summary.schema, 'nba-twin-lab-lock-gap-index-v1');
  assert.deepEqual(summary.gap_dates, ['2026-11-01']);
  assert.equal(summary.locked_days, 1);
  assert.equal(summary.gap_count, 1);
  assert.equal(summary.days_evaluated, 2);
});

test('verify rejects a gap record that contradicts an existing pre-tip lock', () => {
  const root = fixture();
  G.run({ root, now: NOW });
  fs.copyFileSync(gapFile(root, '2026-11-01'), gapFile(root, '2026-10-31'));
  const forged = JSON.parse(fs.readFileSync(gapFile(root, '2026-10-31'), 'utf8'));
  forged.melbourne_date = '2026-10-31';
  fs.writeFileSync(gapFile(root, '2026-10-31'), JSON.stringify(forged));
  assert.throws(() => G.verify({ root }), /contradicts an existing lock/);
});

test('verify passes on a consistent record set', () => {
  const root = fixture();
  G.run({ root, now: NOW });
  assert.deepEqual(G.verify({ root }), { gaps: 1 });
});

test('the real repository passes gap verification', () => {
  assert.doesNotThrow(() => G.verify({ root: path.join(__dirname, '..') }));
});
