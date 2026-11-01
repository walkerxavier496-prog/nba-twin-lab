#!/usr/bin/env node
'use strict';
/* Research-only historical player box-score corpus for the player-first engine.
 *
 *   node scripts/player_box_corpus.cjs fetch  [--concurrency 5]   # resumable; caches compact games in $NBA_CORPUS_CACHE
 *   node scripts/player_box_corpus.cjs assemble                    # writes research-reviews/player-engine-v1/corpus/<season>.json.gz (never overwrites)
 *
 * Source: ESPN public NBA game summary (unofficial). Only the postgame box score is read; the summary's
 * injury list is deliberately ignored because it is a snapshot taken at fetch time, not a pregame record.
 * Nothing here touches production data, locks, audits or model weights.
 */
const fs = require('node:fs'), path = require('node:path'), zlib = require('node:zlib'), crypto = require('node:crypto');
const ROOT = path.join(__dirname, '..');
const CACHE = process.env.NBA_CORPUS_CACHE || '/private/tmp/nba-corpus-cache';
const OUT = path.join(ROOT, 'research-reviews/player-engine-v1/corpus');
const ENDPOINT = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary';
const num = v => { const n = Number(v); return Number.isFinite(n) ? n : null; };
const pair = v => { const m = /^(\d+)-(\d+)$/.exec(String(v ?? '').trim()); return m ? [Number(m[1]), Number(m[2])] : [null, null]; };

// Pure: ESPN summary -> compact record. Exported for tests.
function compactGame(summary, game) {
  const groups = summary?.boxscore?.players;
  if (!Array.isArray(groups) || groups.length !== 2) throw new Error('box score missing');
  const players = [];
  for (const group of groups) {
    const teamId = String(group.team?.id);
    const isHome = teamId === String(game.home.id);
    if (!isHome && teamId !== String(game.away.id)) throw new Error('team does not match game ' + game.id);
    const table = group.statistics?.[0];
    if (!table) throw new Error('stat table missing');
    const idx = Object.fromEntries((table.labels || []).map((label, i) => [label, i]));
    for (const entry of table.athletes || []) {
      const id = String(entry.athlete?.id || '');
      if (!id) continue;
      const row = { id, tm: isHome ? 'H' : 'A', st: entry.starter ? 1 : 0 };
      const stats = entry.stats || [];
      if (entry.didNotPlay || !stats.length) { row.dnp = String(entry.reason || 'DNP').slice(0, 40); players.push(row); continue; }
      const [fgm, fga] = pair(stats[idx['FG']]), [tpm, tpa] = pair(stats[idx['3PT']]), [ftm, fta] = pair(stats[idx['FT']]);
      Object.assign(row, {
        min: num(stats[idx['MIN']]), pts: num(stats[idx['PTS']]), fgm, fga, tpm, tpa, ftm, fta,
        reb: num(stats[idx['REB']]), oreb: num(stats[idx['OREB']]), dreb: num(stats[idx['DREB']]),
        ast: num(stats[idx['AST']]), tov: num(stats[idx['TO']]), stl: num(stats[idx['STL']]), blk: num(stats[idx['BLK']]),
        pf: num(stats[idx['PF']]), pm: num(String(stats[idx['+/-']] ?? '').replace('+', '')),
      });
      if (row.min === null) { row.dnp = 'NO MINUTES'; for (const k of ['min','pts','fgm','fga','tpm','tpa','ftm','fta','reb','oreb','dreb','ast','tov','stl','blk','pf','pm']) delete row[k]; }
      players.push(row);
    }
    for (const entry of table.athletes || []) {
      const pos = entry.athlete?.position?.abbreviation;
      if (pos) (compactGame.positions ||= {})[String(entry.athlete.id)] = { n: entry.athlete.displayName, p: pos };
    }
  }
  return { id: String(game.id), date: game.date, season: game.season, home: { id: String(game.home.id), abbr: game.home.abbr },
    away: { id: String(game.away.id), abbr: game.away.abbr }, hs: game.homeScore, as: game.awayScore, players };
}

async function fetchJson(url, attempts = 5) {
  for (let i = 0; i < attempts; i++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(25000) });
      if (response.status === 404) return null;
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return await response.json();
    } catch (error) {
      if (i === attempts - 1) throw error;
      await new Promise(r => setTimeout(r, 800 * 2 ** i + Math.random() * 400));
    }
  }
}

// Completed games: the certified historical set plus current-season finals not in it (read-only inputs).
function listGames() {
  const historical = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/historical-games.json'))).games.filter(g => g.status === 'final');
  const known = new Set(historical.map(g => g.id));
  const current = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/games.json'))).games.filter(g => g.status === 'final' && !known.has(g.id));
  return [...historical, ...current];
}

async function fetchAll(concurrency) {
  const games = listGames();
  fs.mkdirSync(CACHE, { recursive: true });
  const todo = games.filter(g => !fs.existsSync(path.join(CACHE, g.id + '.json')));
  console.log(`games ${games.length}, cached ${games.length - todo.length}, to fetch ${todo.length}`);
  let done = 0, failed = 0, cursor = 0;
  const positions = fs.existsSync(path.join(CACHE, '_positions.json')) ? JSON.parse(fs.readFileSync(path.join(CACHE, '_positions.json'))) : {};
  async function worker() {
    while (cursor < todo.length) {
      const game = todo[cursor++];
      try {
        const summary = await fetchJson(`${ENDPOINT}?event=${game.id}`);
        if (!summary) { fs.writeFileSync(path.join(CACHE, game.id + '.json'), JSON.stringify({ id: game.id, missing: true })); continue; }
        compactGame.positions = {};
        const record = compactGame(summary, game);
        Object.assign(positions, compactGame.positions);
        fs.writeFileSync(path.join(CACHE, game.id + '.json'), JSON.stringify(record));
      } catch (error) { failed++; console.log('FAIL', game.id, error.message); }
      if (++done % 200 === 0) { fs.writeFileSync(path.join(CACHE, '_positions.json'), JSON.stringify(positions)); console.log(`${done}/${todo.length} fetched, ${failed} failed`); }
      await new Promise(r => setTimeout(r, 40 + Math.random() * 60));
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  fs.writeFileSync(path.join(CACHE, '_positions.json'), JSON.stringify(positions));
  console.log(`finished: ${done} fetched, ${failed} failed`);
}

function assemble() {
  const games = listGames();
  fs.mkdirSync(OUT, { recursive: true });
  const bySeason = new Map(), missing = [];
  for (const g of games) {
    const file = path.join(CACHE, g.id + '.json');
    if (!fs.existsSync(file)) { missing.push(g.id); continue; }
    const record = JSON.parse(fs.readFileSync(file));
    if (record.missing) { missing.push(g.id); continue; }
    (bySeason.get(record.season) || bySeason.set(record.season, []).get(record.season)).push(record);
  }
  const manifest = { schema: 'nba-twin-lab-player-box-corpus-v1', source: 'ESPN public NBA game summary (unofficial), postgame box score only',
    note: 'Research input. Postgame availability is governed by the engine, never by this file.', seasons: {}, missing_game_ids: missing };
  for (const [season, records] of [...bySeason].sort((a, b) => a[0] - b[0])) {
    records.sort((a, b) => Date.parse(a.date) - Date.parse(b.date) || a.id.localeCompare(b.id));
    const bytes = zlib.gzipSync(Buffer.from(JSON.stringify({ season, games: records })));
    const partial = records.length < 1000 && Number(season) === Math.max(...bySeason.keys());
    const stamp = records[records.length - 1].date.slice(0, 10).replaceAll('-', '');
    const file = path.join(OUT, partial ? `${season}-to-${stamp}.json.gz` : `${season}.json.gz`);
    if (fs.existsSync(file)) { const same = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') === crypto.createHash('sha256').update(bytes).digest('hex'); console.log(season, same ? 'unchanged' : 'EXISTS (not overwritten)'); manifest.seasons[season] = { games: records.length, file: path.basename(file), sha256: crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') }; continue; }
    fs.writeFileSync(file, bytes, { flag: 'wx' });
    manifest.seasons[season] = { games: records.length, file: path.basename(file), sha256: crypto.createHash('sha256').update(bytes).digest('hex'), through: records[records.length - 1].date };
  }
  const positionsFile = path.join(CACHE, '_positions.json');
  if (fs.existsSync(positionsFile) && !fs.existsSync(path.join(OUT, 'players.json.gz')))
    fs.writeFileSync(path.join(OUT, 'players.json.gz'), zlib.gzipSync(fs.readFileSync(positionsFile)), { flag: 'wx' });
  const manifestFile = path.join(OUT, 'manifest.json');
  const manifestName = fs.existsSync(manifestFile) ? `manifest-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}.json` : 'manifest.json';
  if (!fs.existsSync(path.join(OUT, manifestName))) fs.writeFileSync(path.join(OUT, manifestName), JSON.stringify(manifest, null, 1) + '\n', { flag: 'wx' });
  console.log('assembled', Object.entries(manifest.seasons).map(([s, v]) => `${s}:${v.games}`).join(' '), 'missing', missing.length);
}

if (require.main === module) {
  const command = process.argv[2], concurrency = Number(process.argv[process.argv.indexOf('--concurrency') + 1]) || 5;
  (command === 'fetch' ? fetchAll(concurrency) : command === 'assemble' ? Promise.resolve(assemble()) : Promise.reject(new Error('usage: fetch|assemble')))
    .catch(error => { console.error(error); process.exit(1); });
}
module.exports = { compactGame };
