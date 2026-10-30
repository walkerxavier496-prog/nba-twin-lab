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
  });
  assert.equal(review.games[0].player_counts.played_scored, 1);
  assert.equal(review.games[0].player_counts.dnp_excluded, 1);
  assert.equal(review.games[0].player_counts.not_listed_excluded, 1);
});

test('daily builder reproduces the locked production model without touching the existing snapshot', () => {
  const existing = JSON.parse(fs.readFileSync(path.join(ROOT, 'practice/2026-10-31-melbourne/forecast.lock.json')));
  const preview = T.buildLock({ date: '2026-10-31', now: Date.parse('2026-10-30T21:49:42.885Z'), simulations: 100 });
  assert.equal(preview.scope.games, 10);
  assert.equal(preview.scope.player_projections, 228);
  assert.equal(preview.model_policy.production, 'production_elo_v7');
  assert.ok(Math.abs(preview.forecasts[0].primary_forecast.home_win_probability - existing.forecasts[0].primary_forecast.home_win_probability) < 1e-12);
  assert.ok(Math.abs(preview.forecasts[0].primary_forecast.projected_score.home - existing.forecasts[0].primary_forecast.projected_score.home) < 1e-12);
  assert.equal(preview.forecasts[0].source, undefined);
  assert.equal(A.verifyIntegrity(preview), true);
});
