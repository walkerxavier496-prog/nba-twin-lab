'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const C = require('../scripts/five_model_challenge.cjs');
const A = require('../scripts/audit-core.cjs');
const T = require('../scripts/daily_tracker.cjs');
const ROOT = path.join(__dirname, '..');
const report = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/five-model-report.json')));

test('challenge report ranks all six models on one common-game sample', () => {
  assert.equal(report.schema, 'nba-twin-lab-five-model-challenge-v1');
  assert.equal(report.strict_no_future_data, true);
  assert.equal(report.status, 'research_only_not_promoted');
  assert.deepEqual(report.common_evaluation.seasons, [2024, 2025, 2026]);
  assert.ok(report.common_evaluation.games >= 2500);
  for (const id of C.ALL_IDS) {
    const model = report.models[id];
    assert.equal(model.common.games, report.common_evaluation.games, id);
    assert.ok(model.common.brier > 0 && model.common.brier < 0.25, id);
    assert.ok(model.common.logLoss > 0, id);
    assert.ok(model.common.ece >= 0 && model.common.ece <= 1, id);
    assert.equal(model.confidence_95_day_clustered.brier.length, 2, id);
  }
  assert.equal(report.production_model_unchanged, 'production_elo_v7');
  assert.match(report.overlap_disclosure, /not statistically independent/i);
});

test('ensemble weights are nested, non-negative and never use the evaluated season', () => {
  assert.equal(report.ensemble_weights_by_season['2023'].available, false);
  for (const season of [2024, 2025, 2026, 2027]) {
    const fit = report.ensemble_weights_by_season[String(season)];
    assert.equal(fit.available, true);
    assert.ok(fit.training_seasons.every(value => value < season));
    assert.equal(Object.keys(fit.weights).length, 5);
    assert.ok(Object.values(fit.weights).every(value => value >= 0 && value <= 1));
    assert.ok(Math.abs(Object.values(fit.weights).reduce((sum, value) => sum + value, 0) - 1) < 1e-12);
  }
});

test('weight fitter uses only supplied earlier rows and returns a simplex', () => {
  const rows = Array.from({ length: 20 }, (_, index) => ({
    y: index % 2,
    models: Object.fromEntries(C.MODEL_IDS.map((id, modelIndex) => [id, { p: modelIndex === 0 ? index % 2 : 0.5, available: true }])),
  }));
  const fit = C.fitWeights(rows);
  assert.equal(fit.games, 20);
  assert.equal(fit.candidates, 1001);
  assert.ok(fit.weights[0] > 0.5);
  assert.ok(Math.abs(fit.weights.reduce((sum, value) => sum + value, 0) - 1) < 1e-12);
});

test('the immutable pretip six-model sidecar and original lock remain verified after tipoff', () => {
  const file = path.join(ROOT, 'practice/2026-10-31-melbourne/forecast.lock.json');
  const sidecarPath = path.join(ROOT, 'audit/supplements/2026-10-31/challenge.lock.json');
  const before = A.sha256(fs.readFileSync(file));
  const original = JSON.parse(fs.readFileSync(file));
  const challenge = JSON.parse(fs.readFileSync(sidecarPath));
  assert.ok(A.verifyIntegrity(original));
  assert.ok(A.verifyIntegrity(challenge));
  assert.equal(challenge.original_forecast_sha256, before);
  assert.ok(Date.parse(challenge.locked_at_utc) < Date.parse(original.scope.first_tip_utc));
  assert.equal(challenge.games.length, original.forecasts.length);
  for (const game of challenge.games) {
    assert.deepEqual(Object.keys(game.predictions), C.ALL_IDS);
    assert.ok(C.ALL_IDS.every(id => typeof game.predictions[id].available === 'boolean'));
  }
  assert.throws(() => T.buildLock({ date: '2026-10-31', now: Date.now(), simulations: 100 }),
    /no longer pregame|Tipoff has begun|Outside lock window/);
  assert.equal(A.sha256(fs.readFileSync(file)), before, 'No post-tip changes to original forecast');
});
test('review scoring recognizes generic challenge predictions and unavailable rows', () => {
  const forecast = {
    primary_forecast: { model_id: 'production_elo_v7', home_win_probability: 0.6, projected_score: { home: 110, away: 106 } },
    challenge_predictions: {
      m2_science: { available: true, home_win_probability: 0.7, projected_score: null },
      m3_player_roster: { available: false, reason: 'unknown roster' },
    },
  };
  const rows = A.modelRowsForGame(forecast, { home: { score: 112 }, away: { score: 100 } });
  assert.ok(rows.some(row => row.model_id === 'm2_science' && Math.abs(row.brier - 0.09) < 1e-12));
  assert.ok(!rows.some(row => row.model_id === 'm3_player_roster'));
});
