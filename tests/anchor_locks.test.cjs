'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const N = require('../scripts/anchor_locks.cjs');

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'anchor-'));
  const lockDir = path.join(root, 'practice', '2026-10-31-melbourne');
  fs.mkdirSync(lockDir, { recursive: true });
  const lock = {
    scope: { melbourne_date: '2026-10-31', first_tip_utc: '2026-10-31T00:00:00Z' },
    locked_at_utc: '2026-10-30T21:49:42.885Z',
    integrity: { algorithm: 'sha256', canonical_payload_without_integrity: 'abc123' },
    forecasts: [],
  };
  const lockFile = path.join(lockDir, 'forecast.lock.json');
  fs.writeFileSync(lockFile, JSON.stringify(lock, null, 2) + '\n');
  return { root, lockFile, bytes: fs.readFileSync(lockFile) };
}
const NOW = Date.parse('2026-10-31T01:00:00Z');
const anchorPath = (root, date = '2026-10-31') => path.join(root, 'audit', 'anchors', `${date}.json`);

test('run creates one anchor record binding the exact lock bytes to its date', () => {
  const { root, bytes } = fixture();
  const created = N.run({ root, now: NOW });
  assert.deepEqual(created, ['2026-10-31']);
  const record = JSON.parse(fs.readFileSync(anchorPath(root), 'utf8'));
  assert.equal(record.schema, 'nba-twin-lab-lock-anchor-v1');
  assert.equal(record.melbourne_date, '2026-10-31');
  assert.equal(record.lock_path, 'practice/2026-10-31-melbourne/forecast.lock.json');
  assert.equal(record.lock_sha256, crypto.createHash('sha256').update(bytes).digest('hex'));
  assert.equal(record.lock_integrity_sha256, 'abc123');
  assert.equal(record.anchor_recorded_at_utc, '2026-10-31T01:00:00.000Z');
  assert.equal(record.ots.status, 'unstamped');
});

test('run never overwrites an existing anchor and creates nothing the second time', () => {
  const { root } = fixture();
  N.run({ root, now: NOW });
  const before = fs.readFileSync(anchorPath(root), 'utf8');
  assert.deepEqual(N.run({ root, now: NOW + 3600_000 }), []);
  assert.equal(fs.readFileSync(anchorPath(root), 'utf8'), before);
});

test('verify passes for a matching anchor and reports unanchored locks without failing', () => {
  const { root } = fixture();
  assert.deepEqual(N.verify({ root }), { anchored: 0, unanchored: ['2026-10-31'] });
  N.run({ root, now: NOW });
  assert.deepEqual(N.verify({ root }), { anchored: 1, unanchored: [] });
});

test('verify fails if the lock file changes after it was anchored', () => {
  const { root, lockFile } = fixture();
  N.run({ root, now: NOW });
  fs.writeFileSync(lockFile, fs.readFileSync(lockFile, 'utf8').replace('"forecasts": []', '"forecasts": [1]'));
  assert.throws(() => N.verify({ root }), /does not match the anchored hash/);
});

test('verify fails when an anchor points to a missing lock or another date', () => {
  const { root, lockFile } = fixture();
  N.run({ root, now: NOW });
  fs.rmSync(lockFile);
  assert.throws(() => N.verify({ root }), /lock file is missing/);
  const { root: other } = fixture();
  N.run({ root: other, now: NOW });
  const file = anchorPath(other);
  const record = JSON.parse(fs.readFileSync(file, 'utf8'));
  record.melbourne_date = '2026-11-01';
  fs.writeFileSync(file, JSON.stringify(record));
  assert.throws(() => N.verify({ root: other }), /date/);
});

test('attachProof may change only the proof, never the hash or lock reference', () => {
  const { root } = fixture();
  N.run({ root, now: NOW });
  const before = JSON.parse(fs.readFileSync(anchorPath(root), 'utf8'));
  N.attachProof({ root, date: '2026-10-31', proof: Buffer.from('proof-bytes'), status: 'pending', now: NOW + 1000 });
  const after = JSON.parse(fs.readFileSync(anchorPath(root), 'utf8'));
  assert.equal(after.ots.status, 'pending');
  assert.equal(Buffer.from(after.ots.proof_base64, 'base64').toString(), 'proof-bytes');
  for (const key of ['lock_sha256', 'lock_path', 'melbourne_date', 'anchor_recorded_at_utc', 'lock_integrity_sha256'])
    assert.equal(after[key], before[key]);
  assert.throws(() => N.attachProof({ root, date: '2026-10-31', proof: Buffer.from('x'), status: 'bogus', now: NOW }), /status/);
  assert.throws(() => N.attachProof({ root, date: '2030-01-01', proof: Buffer.from('x'), status: 'pending', now: NOW }), /No anchor/);
});

// A stand-in for the real `ots` client so tests never touch the network.
function fakeOts(dir, { complete }) {
  const bin = path.join(dir, 'fake-ots.cjs');
  fs.writeFileSync(bin, `#!/usr/bin/env node
const fs = require('node:fs');
const [cmd, file] = process.argv.slice(2);
if (cmd === 'stamp') { fs.writeFileSync(file + '.ots', 'STAMPED:' + fs.readFileSync(file).length); console.log('submitted'); }
else if (cmd === 'upgrade') { console.log(${JSON.stringify(complete ? 'Success! Timestamp complete' : 'Pending confirmation in Bitcoin blockchain')}); }
else process.exit(2);
`);
  fs.chmodSync(bin, 0o755);
  return bin;
}

test('otsSync stamps unstamped anchors then upgrades pending ones to confirmed', () => {
  const { root, bytes } = fixture();
  N.run({ root, now: NOW });
  let bin = fakeOts(root, { complete: false });
  assert.deepEqual(N.otsSync({ root, otsBin: bin, now: NOW }), { stamped: ['2026-10-31'], upgraded: [], pending: ['2026-10-31'] });
  let record = JSON.parse(fs.readFileSync(anchorPath(root), 'utf8'));
  assert.equal(record.ots.status, 'pending');
  assert.equal(Buffer.from(record.ots.proof_base64, 'base64').toString(), 'STAMPED:' + bytes.length);
  bin = fakeOts(root, { complete: true });
  assert.deepEqual(N.otsSync({ root, otsBin: bin, now: NOW }), { stamped: [], upgraded: ['2026-10-31'], pending: [] });
  record = JSON.parse(fs.readFileSync(anchorPath(root), 'utf8'));
  assert.equal(record.ots.status, 'confirmed');
  assert.deepEqual(N.otsSync({ root, otsBin: bin, now: NOW }), { stamped: [], upgraded: [], pending: [] });
});

test('otsSync leaves the protected lock folder untouched and survives an unavailable client', () => {
  const { root, lockFile } = fixture();
  N.run({ root, now: NOW });
  const before = fs.readdirSync(path.dirname(lockFile));
  const result = N.otsSync({ root, otsBin: path.join(root, 'does-not-exist'), now: NOW });
  assert.deepEqual(result.stamped, []);
  assert.equal(JSON.parse(fs.readFileSync(anchorPath(root), 'utf8')).ots.status, 'unstamped');
  assert.deepEqual(fs.readdirSync(path.dirname(lockFile)), before);
});

test('the real repository passes anchor verification', () => {
  assert.doesNotThrow(() => N.verify({ root: path.join(__dirname, '..') }));
});
