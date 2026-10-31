'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const H = require('../scripts/player_history.cjs');
const A = require('../scripts/audit-core.cjs');

const root = path.join(__dirname, '..');
const labels = ['MIN', 'PTS', 'FG', '3PT', 'FT', 'REB', 'AST', 'STL', 'BLK', 'TO', 'OREB', 'DREB', '+/-'];
const game = {
  id: '401909280',
  date: '2026-10-30T23:30:00Z',
  status: 'final',
  home: { id: '20', abbr: 'PHI' },
  away: { id: '18', abbr: 'NYK' },
  homeScore: 98,
  awayScore: 93,
};

function player(id, name, points = 20, didNotPlay = false) {
  return {
    athlete: { id: String(id), displayName: name },
    didNotPlay,
    reason: didNotPlay ? "COACH'S DECISION" : '',
    stats: ['35:00', String(points), '8-18', '3-7', '5-6', '5', '6', '2', '0', '2', '1', '4', '+3'],
  };
}

function summary(options = {}) {
  const homeScore = options.homeScore ?? 98;
  const awayScore = options.awayScore ?? 93;
  const date = options.date ?? game.date;
  const rows = side => Array.from({ length: 5 }, (_, index) =>
    player(`${side === 'home' ? '2' : '1'}${index + 1}`, `${side} player ${index + 1}`, options.points ?? 20));
  return {
    header: {
      id: game.id,
      competitions: [{
        id: game.id,
        date,
        status: { type: { completed: true, name: 'STATUS_FINAL', state: 'post' } },
        competitors: [
          { homeAway: 'home', score: String(homeScore), team: { id: game.home.id, abbreviation: game.home.abbr } },
          { homeAway: 'away', score: String(awayScore), team: { id: game.away.id, abbreviation: game.away.abbr } },
        ],
      }],
    },
    boxscore: {
      players: [
        { team: { id: game.away.id, abbreviation: game.away.abbr }, statistics: [{ labels, athletes: rows('away') }] },
        { team: { id: game.home.id, abbreviation: game.home.abbr }, statistics: [{ labels, athletes: rows('home') }] },
      ],
    },
  };
}

function trendGame(id, date, retrieved, stats, extraPlayers = []) {
  return {
    game_id: String(id),
    event_at_utc: date,
    source: { retrieved_at_utc: retrieved },
    players: [{
      player_id: '42',
      name: 'Verified Player',
      identity_status: 'verified',
      availability: 'played',
      team: { id: '1', abbr: 'AAA' },
      stats: { pts: 20, reb: 5, ast: 4, three_pm: 2, fpts: 30, ...stats },
    }, ...extraPlayers],
  };
}

test('ESPN summaries reconcile by game, team and athlete IDs and preserve missing stats', () => {
  const raw = summary();
  raw.boxscore.players[0].statistics[0].athletes[0].stats[1] = '';
  raw.boxscore.players[0].statistics[0].athletes.push(player('199', 'Did Not Play', 0, true));
  const observation = H.normalizeSummary(game, JSON.stringify(raw), '2026-10-31T04:00:00Z', '2026-10-31T03:45:00Z');

  assert.equal(observation.game_id, game.id);
  assert.equal(observation.source.name, 'ESPN public NBA summary (unofficial)');
  assert.equal(observation.players.length, 11);
  assert.equal(observation.players.find(row => row.player_id === '11').stats.pts, null);
  assert.equal(observation.players.find(row => row.player_id === '199').availability, 'dnp');
  assert.equal(observation.players.find(row => row.player_id === '199').stats.pts, null);
  assert.equal(observation.players.find(row => row.player_id === '11').identity_status, 'verified');
  assert.equal(H.validateObservation(observation).normalized_sha256, observation.normalized_sha256);
});

test('score, game identity, team identity and duplicate athlete mismatches fail closed', () => {
  assert.throws(() => H.normalizeSummary(game, summary({ homeScore: 99 }), '2026-10-31T04:00:00Z', '2026-10-31T03:45:00Z'),
    /score disagrees/);
  const wrongGame = summary();
  wrongGame.header.id = '401000000';
  wrongGame.header.competitions[0].id = '401000000';
  assert.throws(() => H.normalizeSummary(game, wrongGame, '2026-10-31T04:00:00Z', '2026-10-31T03:45:00Z'),
    /game ID does not match/);
  const wrongTeam = summary();
  wrongTeam.header.competitions[0].competitors[0].team.id = '999';
  assert.throws(() => H.normalizeSummary(game, wrongTeam, '2026-10-31T04:00:00Z', '2026-10-31T03:45:00Z'),
    /team ID does not match/);
  const duplicate = summary();
  duplicate.boxscore.players[1].statistics[0].athletes[0].athlete.id = '11';
  assert.throws(() => H.normalizeSummary(game, duplicate, '2026-10-31T04:00:00Z', '2026-10-31T03:45:00Z'),
    /appears more than once/);
  const duplicateTeam = summary();
  duplicateTeam.boxscore.players.push(duplicateTeam.boxscore.players[0]);
  assert.throws(() => H.normalizeSummary(game, duplicateTeam, '2026-10-31T04:00:00Z', '2026-10-31T03:45:00Z'),
    /duplicate NYK player tables/);
});

test('append-only collection is idempotent and adds a new artifact for a correction', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nba-player-history-'));
  try {
    const dataDirectory = path.join(tempRoot, 'data');
    fs.mkdirSync(dataDirectory, { recursive: true });
    const now1 = '2026-10-31T04:00:00Z';
    const writeScoreboard = builtAt => fs.writeFileSync(path.join(dataDirectory, 'games.json'), JSON.stringify({
      built_at_utc: builtAt,
      games: [game],
    }));
    writeScoreboard('2026-10-31T03:55:00Z');
    const firstBody = JSON.stringify(summary({ points: 20 }));
    const first = await H.collect({
      root: tempRoot, now: now1, requestDelayMs: 0,
      fetchSummary: async () => firstBody,
    });
    assert.equal(first.appended_count, 1);
    const observationsDirectory = path.join(dataDirectory, 'player-game-history/observations');
    const originalFile = path.join(observationsDirectory, fs.readdirSync(observationsDirectory)[0]);
    const originalBytes = fs.readFileSync(originalFile, 'utf8');

    writeScoreboard('2026-11-01T03:55:00Z');
    const repeated = await H.collect({
      root: tempRoot, now: '2026-11-01T04:00:00Z', requestDelayMs: 0,
      fetchSummary: async () => firstBody,
    });
    assert.equal(repeated.appended_count, 0);
    assert.equal(repeated.unchanged_count, 1);
    assert.equal(fs.readdirSync(observationsDirectory).length, 1);
    assert.equal(fs.readFileSync(originalFile, 'utf8'), originalBytes);

    const corrected = await H.collect({
      root: tempRoot, now: '2026-11-02T04:00:00Z', requestDelayMs: 0,
      fetchSummary: async () => JSON.stringify(summary({ points: 24 })),
    });
    assert.equal(corrected.appended_count, 1);
    assert.equal(fs.readdirSync(observationsDirectory).length, 2);
    assert.equal(fs.readFileSync(originalFile, 'utf8'), originalBytes);
    const observations = H.readObservations(tempRoot);
    const beforeCorrection = H.latestByGame(observations, '2026-11-01T12:00:00Z').get(game.id);
    const afterCorrection = H.latestByGame(observations, '2026-11-03T00:00:00Z').get(game.id);
    assert.equal(beforeCorrection.players[0].stats.pts, 20);
    assert.equal(afterCorrection.players[0].stats.pts, 24);
    const index = JSON.parse(fs.readFileSync(path.join(dataDirectory, 'player-game-history/index.json')));
    assert.equal(index.observation_count, 2);
    assert.equal(index.observations.every(item => /^[a-f0-9]{64}$/.test(item.sha256)), true);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('postponed games are not collected as completed player performances', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nba-player-history-'));
  try {
    const dataDirectory = path.join(tempRoot, 'data');
    fs.mkdirSync(dataDirectory, { recursive: true });
    fs.writeFileSync(path.join(dataDirectory, 'games.json'), JSON.stringify({
      built_at_utc: '2026-10-31T03:55:00Z',
      games: [{ ...game, status: 'postponed' }],
    }));
    let fetched = false;
    const result = await H.collect({
      root: tempRoot,
      now: '2026-10-31T04:00:00Z',
      requestDelayMs: 0,
      fetchSummary: async () => { fetched = true; return JSON.stringify(summary()); },
    });
    assert.equal(fetched, false);
    assert.equal(result.index.observation_count, 0);
    assert.equal(result.trends.players.length, 0);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('a postponed ESPN game is collected under its rescheduled final date when it completes', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nba-player-history-'));
  try {
    const dataDirectory = path.join(tempRoot, 'data');
    fs.mkdirSync(dataDirectory, { recursive: true });
    const writeScoreboard = (builtAt, games) =>
      fs.writeFileSync(path.join(dataDirectory, 'games.json'), JSON.stringify({ built_at_utc: builtAt, games }));
    writeScoreboard('2026-10-31T03:55:00Z', [{ ...game, status: 'postponed' }]);
    const pending = await H.collect({
      root: tempRoot,
      now: '2026-10-31T04:00:00Z',
      requestDelayMs: 0,
      fetchSummary: async () => JSON.stringify(summary()),
    });
    assert.equal(pending.appended_count, 0);

    const rescheduled = { ...game, date: '2026-11-08T23:30:00Z', status: 'final' };
    writeScoreboard('2026-11-09T03:55:00Z', [rescheduled]);
    const final = await H.collect({
      root: tempRoot,
      now: '2026-11-09T04:00:00Z',
      requestDelayMs: 0,
      fetchSummary: async () => JSON.stringify(summary({ date: rescheduled.date })),
    });
    assert.equal(final.appended_count, 1);
    const observation = H.readObservations(tempRoot)[0].observation;
    assert.equal(observation.game_id, game.id);
    assert.equal(observation.event_at_utc, new Date(rescheduled.date).toISOString());
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('player trends require five verified appearances and disclose samples and dates', () => {
  const asOf = '2026-10-31T12:00:00Z';
  const observations = Array.from({ length: 5 }, (_, index) => {
    const date = new Date(Date.parse(asOf) - (index + 1) * DAY_MS).toISOString();
    return trendGame(`g${index}`, date, date, {
      pts: 20 + index,
      reb: 5 + index,
      ast: 4,
      three_pm: 2,
      fpts: 30 + index,
      ...(index === 0 ? { reb: null } : {}),
    });
  });
  const trends = H.buildTrends(observations, asOf);
  assert.equal(trends.players.length, 1);
  const playerTrend = trends.players[0];
  assert.equal(playerTrend.sample_size, 5);
  assert.equal(playerTrend.metrics.points.average, 22);
  assert.equal(playerTrend.metrics.points.sample_size, 5);
  assert.equal(playerTrend.metrics.rebounds.available, false);
  assert.equal(playerTrend.metrics.rebounds.sample_size, 4);
  assert.equal(playerTrend.metrics.fantasy_points.average, 32);
  assert.equal(playerTrend.date_range.end_utc, observations[0].event_at_utc);
  assert.equal(playerTrend.recent_form.available, false);
  assert.equal(trends.methodology.minimum_games, 5);
});

test('recent-form changes require ten appearances and compare the latest five with the prior five', () => {
  const asOf = '2026-10-31T12:00:00Z';
  const observations = Array.from({ length: 10 }, (_, index) => {
    const date = new Date(Date.parse(asOf) - (55 - index * 5) * DAY_MS).toISOString();
    const points = index < 5 ? 10 : 20;
    return trendGame(`form-${index}`, date, date, {
      pts: points, reb: 5, ast: 4, three_pm: 2, fpts: points + 10,
    });
  });
  const trend = H.buildTrends(observations, asOf).players[0];
  assert.equal(trend.sample_size, 5);
  assert.equal(trend.metrics.points.average, 20);
  assert.equal(trend.recent_form.available, true);
  assert.equal(trend.recent_form.sample_size, 10);
  assert.equal(trend.recent_form.points_change, 10);
  assert.equal(trend.recent_form.fantasy_points_change, 10);
});

test('as-of trends exclude later observations and use a later correction only after it was received', () => {
  const asOf = '2026-10-31T12:00:00Z';
  const firstFive = Array.from({ length: 5 }, (_, index) => {
    const event = new Date(Date.parse(asOf) - (index + 1) * DAY_MS).toISOString();
    return trendGame(`game-${index}`, event, event, { pts: 20, reb: 5, ast: 4, three_pm: 2, fpts: 30 });
  });
  const correction = {
    ...trendGame('game-0', firstFive[0].event_at_utc, '2026-11-01T12:00:00Z',
      { pts: 50, reb: 5, ast: 4, three_pm: 2, fpts: 60 }),
  };
  const before = H.buildTrends([...firstFive, correction], asOf);
  const after = H.buildTrends([...firstFive, correction], '2026-11-02T12:00:00Z');
  assert.equal(before.players[0].metrics.points.average, 20);
  assert.equal(after.players[0].metrics.points.average, 26);
});

test('conflicting names for one ESPN athlete ID are disclosed and excluded from trends', () => {
  const asOf = '2026-10-31T12:00:00Z';
  const observations = Array.from({ length: 5 }, (_, index) => {
    const event = new Date(Date.parse(asOf) - (index + 1) * DAY_MS).toISOString();
    const observation = trendGame(`conflict-${index}`, event, event, { pts: 20, reb: 5, ast: 4, three_pm: 2, fpts: 30 });
    if (index === 0) observation.players[0].name = 'Different Person';
    return observation;
  });
  const trends = H.buildTrends(observations, asOf);
  assert.equal(trends.players.length, 0);
  assert.equal(trends.coverage.identity_conflict_count, 1);
  assert.deepEqual(trends.identity_conflicts[0].observed_names.sort(), ['Different Person', 'Verified Player']);
});

test('a real archived completed-game line keeps verified ESPN stats and stays below trend minimum', () => {
  const review = JSON.parse(fs.readFileSync(path.join(root, 'audit/reviews/2026-10-31/games/401909280.review.json')));
  const row = review.games[0].player_results.find(item => item.actual?.provider_player_id === '3934672');
  assert.equal(row.name, 'Jalen Brunson');
  assert.equal(row.actual.pts, 24);
  assert.equal(row.actual.reb, 5);
  assert.equal(row.actual.ast, 6);
  assert.equal(row.actual.three_pm, 3);
  assert.equal(row.actual.fpts, 41);
  assert.equal(A.fantasyPoints(row.actual), row.actual.fpts);
  const observation = {
    game_id: review.game_id,
    event_at_utc: review.games[0].tip_utc,
    source: { retrieved_at_utc: review.provider.retrieved_at_utc },
    players: [{
      player_id: row.actual.provider_player_id,
      name: row.name,
      identity_status: 'verified',
      availability: 'played',
      team: { id: null, abbr: row.team },
      stats: {
        pts: row.actual.pts, reb: row.actual.reb, ast: row.actual.ast,
        three_pm: row.actual.three_pm, fpts: row.actual.fpts,
      },
    }],
  };
  assert.equal(H.buildTrends([observation], review.reviewed_at_utc).players.length, 0);
});

const DAY_MS = 24 * 60 * 60 * 1000;
