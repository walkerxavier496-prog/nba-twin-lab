'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const A = require('../scripts/audit-core.cjs');
const T = require('../scripts/daily_tracker.cjs');

const ROOT = path.join(__dirname, '..');

test('Melbourne date discovery follows AEST and AEDT instead of a fixed UTC offset', () => {
  assert.equal(A.melbourneDate('2026-06-01T14:30:00Z'), '2026-06-02');
  assert.equal(A.melbourneDate('2026-10-30T13:30:00Z'), '2026-10-31');
  const display = A.melbourneDisplay('2026-10-30T21:49:42.885Z');
  assert.match(display, /31 October 2026/);
  assert.match(display, /0?8:49:42/);
  assert.match(display, /(AEDT|GMT\+11)/);
});

test('final-result review opens at 6pm Melbourne only four hours after last tip', () => {
  const lock = { scope: { last_tip_utc: '2026-10-31T02:00:00Z' } };
  assert.equal(T.reviewWindowOpen(lock, Date.parse('2026-10-31T06:59:00Z')), false); // 5:59pm AEDT
  assert.equal(T.reviewWindowOpen(lock, Date.parse('2026-10-31T07:00:00Z')), true); // 6:00pm AEDT
  assert.equal(T.reviewWindowOpen({ scope: { last_tip_utc: '2026-10-31T04:00:00Z' } },
    Date.parse('2026-10-31T07:00:00Z')), false); // Last tip too recent
  assert.equal(T.reviewWindowOpen({ scope: {} }, Date.parse('2026-10-31T07:00:00Z')), false);
  // In winter, 6pm AEST is 08:00 UTC, not 07:00 UTC.
  const winter = { scope: { last_tip_utc: '2026-06-01T02:00:00Z' } };
  assert.equal(T.reviewWindowOpen(winter, Date.parse('2026-06-01T07:59:00Z')), false);
  assert.equal(T.reviewWindowOpen(winter, Date.parse('2026-06-01T08:00:00Z')), true);
});

test('integrity detects any post-lock forecast edit and validates the legacy practice lock', () => {
  const payload = A.withIntegrity({ schema: 'test', forecasts: [{ p: 0.6 }] });
  assert.equal(A.verifyIntegrity(payload), true);
  payload.forecasts[0].p = 0.7;
  assert.equal(A.verifyIntegrity(payload), false);
  const legacy = JSON.parse(fs.readFileSync(path.join(ROOT, 'practice/2026-10-31-melbourne/forecast.lock.json')));
  assert.equal(A.verifyIntegrity(legacy), true);
});

function athlete(name, minutes, pts, threes, reb, ast, didNotPlay = false) {
  return {
    athlete: { id: name, displayName: name }, didNotPlay, reason: didNotPlay ? "COACH'S DECISION" : '',
    stats: [String(minutes), String(pts), `5-10`, `${threes}-5`, '2-2', String(reb), String(ast)],
  };
}

test('ESPN result parser distinguishes participants from provider-labelled DNPs', () => {
  const labels = ['MIN', 'PTS', 'FG', '3PT', 'FT', 'REB', 'AST'];
  const payload = {
    header: { id: 'g1', competitions: [{ id: 'g1', status: { type: { completed: true } }, competitors: [
      { homeAway: 'home', score: '110', team: { abbreviation: 'BOS' } },
      { homeAway: 'away', score: '100', team: { abbreviation: 'NY' } },
    ] }] },
    boxscore: { players: [
      { team: { abbreviation: 'NY' }, statistics: [{ labels, athletes: [
        athlete('Away One', '30:30', 20, 3, 5, 4), athlete('Away Two', 25, 10, 1, 4, 3),
        athlete('Away Three', 20, 8, 0, 3, 2), athlete('Away Four', 18, 7, 1, 2, 1),
        athlete('Away Five', 15, 5, 0, 2, 1), athlete('Away DNP', 0, 0, 0, 0, 0, true),
      ] }] },
      { team: { abbreviation: 'BOS' }, statistics: [{ labels, athletes: [
        athlete('Home One', 30, 25, 4, 6, 5), athlete('Home Two', 25, 15, 2, 5, 4),
        athlete('Home Three', 20, 12, 2, 4, 3), athlete('Home Four', 18, 10, 1, 3, 2),
        athlete('Home Five', 15, 8, 1, 2, 1),
      ] }] },
    ] },
  };
  const parsed = A.parseEspnSummary(payload, 'g1');
  assert.equal(parsed.away.abbr, 'NYK');
  assert.equal(parsed.teams.NYK[0].minutes, 30.5);
  assert.equal(parsed.teams.NYK[0].three_pm, 3);
  assert.equal(parsed.teams.NYK.at(-1).played, false);
  assert.equal(parsed.teams.NYK.at(-1).did_not_play, true);
});

test('review metrics score played players only and never turn DNP or absent players into zeroes', () => {
  const lock = A.withIntegrity({
    schema: 'nba-twin-lab-daily-forecast-v2', scope: { melbourne_date: '2026-10-31' }, forecasts: [{
      game_id: 'g1', tip_utc: '2026-10-30T23:00:00Z',
      home: { abbr: 'BOS' }, away: { abbr: 'NY' },
      primary_forecast: { model_id: 'production_elo_v7', home_win_probability: 0.75, projected_score: { home: 108, away: 102 } },
      diagnostics: { roster_aware_beta: { model_id: 'roster_beta_v1', home_win_probability: 0.6 } },
      v9_player_projections: [
        { team: 'BOS', player_id: '1', name: 'Played Player', projection_if_play: { pts: 20, reb: 5, ast: 4, three_pm: 2 } },
        { team: 'BOS', player_id: '2', name: 'DNP Player', projection_if_play: { pts: 15, reb: 4, ast: 3, three_pm: 1 } },
        { team: 'NY', player_id: '3', name: 'Absent Player', projection_if_play: { pts: 10, reb: 3, ast: 2, three_pm: 1 } },
      ],
    }],
  });
  const actuals = { g1: {
    game_id: 'g1', home: { abbr: 'BOS', score: 110 }, away: { abbr: 'NYK', score: 100 },
    teams: {
      BOS: [
        { provider_player_id: 'a', name: 'Played Player', normalized_name: A.normalizeName('Played Player'), played: true, did_not_play: false, minutes: 30, pts: 24, reb: 7, ast: 3, three_pm: 3 },
        { provider_player_id: 'b', name: 'DNP Player', normalized_name: A.normalizeName('DNP Player'), played: false, did_not_play: true, minutes: 0, pts: 0, reb: 0, ast: 0, three_pm: 0 },
      ],
      NYK: [],
    },
  } };
  const review = A.scoreReview(lock, actuals, '2026-10-31T10:00:00Z');
  assert.equal(review.summary.models.production_elo_v7.accuracy, 1);
  assert.equal(review.summary.models.production_elo_v7.brier, 0.0625);
  assert.equal(review.summary.models.production_elo_v7.score_mae_per_team, 2);
  assert.deepEqual(review.summary.player_stats, {
    pts: { count: 1, mae: 4 }, reb: { count: 1, mae: 2 },
    ast: { count: 1, mae: 1 }, three_pm: { count: 1, mae: 1 },
    minutes: { count: 0, mae: null },
  });
  assert.equal(review.games[0].player_counts.played_scored, 1);
  assert.equal(review.games[0].player_counts.dnp_excluded, 1);
  assert.equal(review.games[0].player_counts.not_listed_excluded, 1);
});

test('complete ESPN categories produce the documented ESPN fantasy score and defensive totals', () => {
  const labels = ['MIN', 'PTS', 'FG', '3PT', 'FT', 'REB', 'AST', 'STL', 'BLK', 'TO', 'OREB', 'DREB', '+/-'];
  const row = (name, pts = 20) => ({ athlete: { id: name, displayName: name }, stats: ['30:00', String(pts), '7-15', '3-7', '3-4', '8', '6', '2', '1', '4', '2', '6', '+5'] });
  const payload = {
    header: { id: 'g2', competitions: [{ id: 'g2', status: { type: { completed: true } }, competitors: [
      { homeAway: 'home', score: '111', team: { abbreviation: 'BOS' } },
      { homeAway: 'away', score: '109', team: { abbreviation: 'NYK' } },
    ] }] },
    boxscore: { players: [
      { team: { abbreviation: 'NYK' }, statistics: [{ labels, athletes: Array.from({ length: 5 }, (_, i) => row(`Away ${i}`)) }] },
      { team: { abbreviation: 'BOS' }, statistics: [{ labels, athletes: Array.from({ length: 5 }, (_, i) => row(`Home ${i}`, 22)) }] },
    ] },
  };
  const parsed = A.parseEspnSummary(payload, 'g2');
  assert.equal(parsed.teams.NYK[0].stocks, 3);
  assert.equal(parsed.teams.NYK[0].fpts, 45);
  assert.equal(parsed.teams.NYK[0].double_double, false);
});

test('one verified final is graded independently while every other game stays pending', async () => {
  const lockPath = path.join(ROOT, 'practice/2026-10-31-melbourne/forecast.lock.json');
  const lock = JSON.parse(fs.readFileSync(lockPath));
  const first = lock.forecasts[0];
  const labels = ['MIN', 'PTS', 'FG', '3PT', 'FT', 'REB', 'AST', 'STL', 'BLK', 'TO'];
  const athletes = prefix => Array.from({ length: 5 }, (_, i) => ({
    athlete: { id: `${prefix}-${i}`, displayName: `${prefix} Player ${i}` },
    stats: ['30:00', String(10 + i), '4-9', '1-3', '1-2', '5', '3', '1', '0', '2'],
  }));
  const finalPayload = {
    header: { id: first.game_id, competitions: [{ id: first.game_id, status: { type: { completed: true } }, competitors: [
      { homeAway: 'home', score: '112', team: { abbreviation: first.home.abbr } },
      { homeAway: 'away', score: '105', team: { abbreviation: first.away.abbr } },
    ] }] },
    boxscore: { players: [
      { team: { abbreviation: first.away.abbr }, statistics: [{ labels, athletes: athletes('Away') }] },
      { team: { abbreviation: first.home.abbr }, statistics: [{ labels, athletes: athletes('Home') }] },
    ] },
  };
  const result = await T.processFinalGames(lockPath, Date.parse('2026-11-01T00:00:00Z'), {
    dryRun: true,
    ignoreExisting: true,
    fetcher: async url => url.includes(first.game_id) ? finalPayload : (() => { throw Error('ESPN game is not final'); })(),
  });
  assert.equal(result.reviewed.length, 1);
  assert.equal(result.pending.length, 9);
  const artifact = result.reviewed[0].artifact;
  assert.equal(artifact.schema, 'nba-twin-lab-game-review-v1');
  assert.equal(artifact.games.length, 1);
  assert.deepEqual(Object.keys(artifact.games[0].models).filter(id => /^m[1-6]_/.test(id)).sort(), [
    'm1_elo', 'm2_science', 'm3_player_roster', 'm4_monte_carlo', 'm5_regularized_ml', 'm6_ensemble',
  ]);
  assert.equal(artifact.games[0].actual_players.length, 10);
  assert.equal(A.verifyIntegrity(artifact), true);
});

test('historical pretip forecast remains immutable and a post-tip rebuilding attempt fails closed', () => {
  const file = path.join(ROOT, 'practice/2026-10-31-melbourne/forecast.lock.json');
  const bytes = fs.readFileSync(file);
  const existing = JSON.parse(bytes);
  assert.ok(A.verifyIntegrity(existing));
  assert.equal(existing.scope.games, 10);
  assert.equal(existing.forecasts.length, 10);
  assert.equal(existing.forecasts.reduce((total, game) => total + (game.v9_player_projections?.length || 0), 0), 228);
  assert.ok(existing.forecasts.every(game => game.primary_forecast?.winner_probability >= 0 &&
    game.primary_forecast?.winner_probability <= 1));
  assert.ok(Date.parse(existing.locked_at_utc) < Date.parse(existing.scope.first_tip_utc));
  // There is no ethical way to recreate the October 31 lock using post-tip data.
  assert.throws(() => T.buildLock({ date: '2026-10-31', now: Date.now(), simulations: 100 }),
    /no longer pregame|Tipoff has begun|Outside lock window/);
  assert.equal(A.sha256(fs.readFileSync(file)), A.sha256(bytes), 'Archived forecast bytes must not change');
});

test('official game grades remain bound to the exact original lock and frozen probabilities', () => {
  const lockPath = path.join(ROOT, 'practice/2026-10-31-melbourne/forecast.lock.json');
  const lock = JSON.parse(fs.readFileSync(lockPath));
  const sidecar = JSON.parse(fs.readFileSync(path.join(ROOT, 'audit/supplements/2026-10-31/challenge.lock.json')));
  const review = JSON.parse(fs.readFileSync(path.join(ROOT, 'audit/reviews/2026-10-31/games/401909277.review.json')));
  const forecast = lock.forecasts.find(game => String(game.game_id) === '401909277');
  const challengeGame = sidecar.games.find(game => String(game.game_id) === '401909277');
  const gradedGame = review.games[0];

  assert.equal(T.verifyChallengeLink(lockPath, lock, sidecar), sidecar);
  assert.doesNotThrow(() => T.verifyReviewProbabilities(forecast, challengeGame, gradedGame));

  const reboundSidecar = A.withIntegrity({ ...sidecar, original_forecast_sha256: '0'.repeat(64) });
  assert.throws(() => T.verifyChallengeLink(lockPath, lock, reboundSidecar), /does not reference the original forecast/);

  const changedProductionGrade = JSON.parse(JSON.stringify(gradedGame));
  changedProductionGrade.models.production_elo_v7.p += 0.001;
  assert.throws(() => T.verifyReviewProbabilities(forecast, challengeGame, changedProductionGrade),
    /differs from immutable lock.*production_elo_v7/);

  const changedChallengeGrade = JSON.parse(JSON.stringify(gradedGame));
  changedChallengeGrade.models.m6_ensemble.p += 0.001;
  assert.throws(() => T.verifyReviewProbabilities(forecast, challengeGame, changedChallengeGrade),
    /differs from immutable lock.*m6_ensemble/);
});
