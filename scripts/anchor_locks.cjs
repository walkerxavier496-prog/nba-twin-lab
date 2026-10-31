#!/usr/bin/env node
'use strict';
/**
 * Independent timestamp anchoring for pre-tip forecast locks.
 *
 * Locks are never modified. For each lock this writes ONE small record,
 * audit/anchors/<melbourne_date>.json, binding the lock's exact bytes (SHA-256)
 * to its date. An OpenTimestamps proof of that same SHA-256 is then attached,
 * which anyone can verify against the Bitcoin chain without trusting this repo.
 *
 *   node scripts/anchor_locks.cjs run         create missing anchor records
 *   node scripts/anchor_locks.cjs ots-sync    stamp/upgrade proofs (needs `ots`)
 *   node scripts/anchor_locks.cjs verify      check every anchor against its lock
 *
 * Anchoring must never block locking: ots-sync reports problems and exits 0.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const DEFAULT_ROOT = path.join(__dirname, '..');
const SCHEMA = 'nba-twin-lab-lock-anchor-v1';
const STATUSES = ['unstamped', 'pending', 'confirmed'];

const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const rel = (root, file) => path.relative(root, file).split(path.sep).join('/');
const anchorFile = (root, date) => path.join(root, 'audit', 'anchors', `${date}.json`);
const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));

function filesUnder(directory, name) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) return filesUnder(full, name);
    return entry.name === name ? [full] : [];
  });
}

function locks(root) {
  return [
    ...filesUnder(path.join(root, 'audit', 'snapshots'), 'forecast.lock.json'),
    ...filesUnder(path.join(root, 'practice'), 'forecast.lock.json'),
  ].sort().map(file => ({ file, lock: readJson(file) })).filter(item => item.lock?.scope?.melbourne_date);
}

function anchorDates(root) {
  const directory = path.join(root, 'audit', 'anchors');
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory).filter(n => /^\d{4}-\d{2}-\d{2}\.json$/.test(n)).map(n => n.slice(0, 10)).sort();
}

function run({ root = DEFAULT_ROOT, now = Date.now() } = {}) {
  const created = [];
  for (const { file, lock } of locks(root)) {
    const date = lock.scope.melbourne_date;
    const target = anchorFile(root, date);
    if (fs.existsSync(target)) continue;
    const record = {
      schema: SCHEMA,
      melbourne_date: date,
      lock_path: rel(root, file),
      lock_sha256: sha256(fs.readFileSync(file)),
      lock_integrity_sha256: lock.integrity?.canonical_payload_without_integrity || null,
      lock_locked_at_utc: lock.locked_at_utc || null,
      first_tip_utc: lock.scope.first_tip_utc || null,
      anchor_recorded_at_utc: new Date(now).toISOString(),
      ots: { status: 'unstamped', proof_base64: null, updated_at_utc: null },
    };
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, JSON.stringify(record, null, 2) + '\n', { encoding: 'utf8', flag: 'wx' });
    created.push(date);
  }
  return created;
}

function verify({ root = DEFAULT_ROOT } = {}) {
  const anchored = new Set(anchorDates(root));
  for (const date of anchored) {
    const record = readJson(anchorFile(root, date));
    if (record.schema !== SCHEMA) throw new Error(`Anchor ${date}: unknown schema`);
    if (record.melbourne_date !== date) throw new Error(`Anchor ${date}: date field does not match its file name`);
    if (!STATUSES.includes(record.ots?.status)) throw new Error(`Anchor ${date}: invalid proof status`);
    const lockFile = path.join(root, record.lock_path);
    if (!fs.existsSync(lockFile)) throw new Error(`Anchor ${date}: lock file is missing (${record.lock_path})`);
    if (sha256(fs.readFileSync(lockFile)) !== record.lock_sha256)
      throw new Error(`Anchor ${date}: lock file does not match the anchored hash`);
    if (readJson(lockFile).scope?.melbourne_date !== date) throw new Error(`Anchor ${date}: lock date differs from anchor date`);
    if (record.ots.status !== 'unstamped' && !record.ots.proof_base64) throw new Error(`Anchor ${date}: proof missing`);
  }
  const unanchored = locks(root).map(l => l.lock.scope.melbourne_date).filter(d => !anchored.has(d));
  return { anchored: anchored.size, unanchored };
}

function attachProof({ root = DEFAULT_ROOT, date, proof, status, now = Date.now() }) {
  if (!STATUSES.includes(status)) throw new Error(`Invalid proof status: ${status}`);
  const file = anchorFile(root, date);
  if (!fs.existsSync(file)) throw new Error(`No anchor record for ${date}`);
  const record = readJson(file);
  record.ots = { status, proof_base64: Buffer.from(proof).toString('base64'), updated_at_utc: new Date(now).toISOString() };
  fs.writeFileSync(file, JSON.stringify(record, null, 2) + '\n');
}

function otsSync({ root = DEFAULT_ROOT, otsBin = process.env.OTS_BIN || 'ots', now = Date.now() } = {}) {
  const result = { stamped: [], upgraded: [], pending: [] };
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'ots-'));
  try {
    for (const date of anchorDates(root)) {
      const record = readJson(anchorFile(root, date));
      try {
        const work = path.join(temp, `${date}.lock`);
        if (record.ots.status === 'unstamped') {
          // Stamp a copy: the client writes a sidecar file, and the lock folder must stay untouched.
          fs.copyFileSync(path.join(root, record.lock_path), work);
          if (sha256(fs.readFileSync(work)) !== record.lock_sha256) throw new Error('lock changed since anchoring');
          execFileSync(otsBin, ['stamp', work], { stdio: 'pipe' });
          attachProof({ root, date, proof: fs.readFileSync(`${work}.ots`), status: 'pending', now });
          result.stamped.push(date);
          record.ots.status = 'pending';
          record.ots.proof_base64 = fs.readFileSync(`${work}.ots`).toString('base64');
        }
        if (record.ots.status === 'pending') {
          const proofFile = `${work}.ots`;
          fs.writeFileSync(proofFile, Buffer.from(record.ots.proof_base64, 'base64'));
          const output = String(execFileSync(otsBin, ['upgrade', proofFile], { stdio: 'pipe' }));
          const complete = /Timestamp complete/i.test(output);
          attachProof({ root, date, proof: fs.readFileSync(proofFile), status: complete ? 'confirmed' : 'pending', now });
          if (complete) result.upgraded.push(date); else result.pending.push(date);
        }
      } catch (error) {
        console.warn(`OpenTimestamps skipped for ${date}: ${error.message}`);
      }
    }
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
  return result;
}

function main(argv) {
  const command = argv[2];
  if (command === 'run') console.log('Created anchors:', run().join(', ') || 'none');
  else if (command === 'ots-sync') console.log(JSON.stringify(otsSync()));
  else if (command === 'verify') {
    const result = verify();
    console.log(`Verified ${result.anchored} anchor(s).` + (result.unanchored.length ? ` Not yet anchored: ${result.unanchored.join(', ')}` : ''));
  } else throw new Error(`Usage: anchor_locks.cjs run|ots-sync|verify (got ${command})`);
}

if (require.main === module) {
  try { main(process.argv); } catch (error) { console.error(error.message); process.exit(1); }
}

module.exports = { run, verify, attachProof, otsSync, SCHEMA };
