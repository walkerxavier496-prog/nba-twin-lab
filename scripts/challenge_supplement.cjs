#!/usr/bin/env node
'use strict';

// An append-only 31 Oct 2026 pregame experiment. It NEVER edits the original
// practice forecast. A missing or late snapshot fails closed, not backfilled.
const fs = require('node:fs');
const path = require('node:path');
const E = require('../predict/engine.js');
const R = require('../predict/roster.js');
const A = require('./audit-core.cjs');
const C = require('./five_model_challenge.cjs');
const T = require('./daily_tracker.cjs');

const ROOT = path.join(__dirname, '..');
const DATE = '2026-10-31';
const ORIGINAL = path.join(ROOT, 'practice/2026-10-31-melbourne/forecast.lock.json');
const DIRECTORY = path.join(ROOT, 'audit/supplements', DATE);
const SIDELOCK = path.join(DIRECTORY, 'challenge.lock.json');
const REVIEW = path.join(DIRECTORY, 'challenge.review.json');
const ORIGINAL_REVIEW = path.join(ROOT, 'audit/reviews', DATE, 'review.json');
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const requireSafe = (condition, message) => { if (!condition) throw Error(message); };
const timestamp = (value, now, deadline, label, maxAgeHours = 72) => {
  const t = Date.parse(value);
  requireSafe(Number.isFinite(t) && t <= now && t < deadline, label + ' timestamp is missing, future-dated, or post-tip');
  requireSafe((now - t) / 3600000 <= maxAgeHours, label + ' is stale');
  return new Date(t).toISOString();
};
function writeOnce(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(A.withIntegrity(data), null, 2) + '\n', { flag: 'wx' });
}
function verifyOriginal() {
  const lock = read(ORIGINAL);
  requireSafe(A.verifyIntegrity(lock), 'Original immutable forecast fails checksum validation');
  requireSafe(lock.scope?.melbourne_date === DATE && lock.scope.games === 10, 'Original game slate mismatch');
  const firstTip = Date.parse(lock.scope.first_tip_utc);
  requireSafe(Number.isFinite(firstTip) && Date.parse(lock.locked_at_utc) < firstTip, 'Original forecast was not pregame');
  return { lock, firstTip, originalHash: A.sha256(fs.readFileSync(ORIGINAL)) };
}
function checkSupplement(supplement, originalHash, firstTip) {
  requireSafe(A.verifyIntegrity(supplement), 'Supplement checksum invalid');
  requireSafe(supplement.schema === 'nba-twin-lab-challenge-sidecar-v1', 'Supplement schema mismatch');
  requireSafe(supplement.original_forecast_sha256 === originalHash, 'Original forecast changed since supplement');
  requireSafe(Date.parse(supplement.locked_at_utc) < firstTip, 'Supplement was locked after tipoff');
  requireSafe(supplement.games?.length === 10, 'Missing challenge games');
  requireSafe(supplement.games.every(game => C.ALL_IDS.every(id => game.predictions?.[id]?.available === true || game.predictions?.[id]?.available === false)), 'Missing challenge availability metadata');
}
function lockChallenge() {
  const { lock, firstTip, originalHash } = verifyOriginal();
  if (fs.existsSync(SIDELOCK)) {
    checkSupplement(read(SIDELOCK), originalHash, firstTip);
    console.log('Existing challenge sidecar verified; no overwrite');
    return;
  }
  const now = Date.now();
  if (now >= firstTip - 60000) {
    console.log('Pregame opportunity closed: refusing to create a retrospectively timed challenge lock');
    return;
  }
  const gameData = read(path.join(ROOT, 'data/games.json'));
  const snapshot = read(path.join(ROOT, 'data/v7-current.json'));
  const context = read(path.join(ROOT, 'data/context.json'));
  const report = read(path.join(ROOT, 'data/five-model-report.json'));
  const rosterPriors = read(path.join(ROOT, 'data/roster-priors.json'));
  const rosterReport = read(path.join(ROOT, 'data/roster-research-report.json'));
  const sources = {
    games: timestamp(gameData.built_at_utc, now, firstTip, 'Game feed', 18),
    player_rotations: timestamp(snapshot.built_at_utc, now, firstTip, 'Player feed', 18),
    historical_report: timestamp(report.generated_at_utc, now, firstTip, 'Model report', 48),
    context: timestamp(context.built_at_utc, now, firstTip, 'Team context', 48),
    roster_report: timestamp(rosterReport.generated_at_utc, now, firstTip, 'Roster report', 48),
  };
  requireSafe(snapshot.strict_no_future_data === true && snapshot.teams?.length === 30, 'Player provenance/coverage missing');
  requireSafe(report.strict_no_future_data === true && report.status === 'research_only_not_promoted', 'Research report not validated');
  requireSafe(rosterPriors.strict_no_future_data && rosterReport.strict_no_future_data, 'Roster provenance missing');
  const profiles = T.contextProfiles(context, Number(lock.forecasts[0]?.game_id && gameData.games.find(g => String(g.id) === String(lock.forecasts[0].game_id))?.season));
  const allGames = new Map((gameData.games || []).map(game => [String(game.id), game]));
  const games = lock.forecasts.map(prior => {
    const game = allGames.get(String(prior.game_id));
    requireSafe(game && game.status === 'scheduled', 'A game is not verifiably scheduled');
    requireSafe(Date.parse(game.date) === Date.parse(prior.tip_utc), 'Tipoff changed relative to original lock');
    requireSafe(A.canonicalTeam(game.home.abbr) === A.canonicalTeam(prior.home.abbr) &&
      A.canonicalTeam(game.away.abbr) === A.canonicalTeam(prior.away.abbr), 'Teams changed since original lock');
    const state = E.ratings(gameData.games, game.date);
    requireSafe(state.finals >= 800, 'Insufficient prior finals for Elo');
    const baseline = E.forecast(game, state, profiles);
    const roster = R.modelForecast({ game, baseline, snapshot, priorRotations: rosterPriors, report: rosterReport, now });
    const models = C.predictLiveModels({ game, baseline, snapshot, rosterForecast: roster, report, gameData, simulations: 10000 });
    requireSafe(C.ALL_IDS.every(id => Object.hasOwn(models, id)), 'Six-model output incomplete');
    return {
      game_id: String(game.id), tip_utc: new Date(game.date).toISOString(),
      home: prior.home.abbr, away: prior.away.abbr,
      predictions: Object.fromEntries(C.ALL_IDS.map(id => [id, models[id].available ? {
        available: true, home_win_probability: models[id].home_win_probability,
        projected_score: models[id].projected_score || null,
        simulations: models[id].simulations || null, seed: models[id].seed || null,
        weights: models[id].weights || null, weights_training_seasons: models[id].weights_training_seasons || null,
        availability: models[id].availability || null, roster_uncertainty: models[id].roster_uncertainty ?? null,
      } : { available: false, reason: models[id].reason || 'Inputs unavailable' }])),
    };
  });
  // Timestamp the END of calculation, not its beginning. A long calculation
  // finishing at or after tipoff is not published as a pregame forecast.
  const finished = Date.now();
  if (finished >= firstTip - 1000) {
    console.log('Model calculations finished too close to/after tipoff; refusing to publish');
    return;
  }
  writeOnce(SIDELOCK, {
    schema: 'nba-twin-lab-challenge-sidecar-v1', locked_at_utc: new Date(finished).toISOString(),
    melbourne_date: DATE, first_tip_utc: new Date(firstTip).toISOString(),
    original_forecast_path: path.relative(ROOT, ORIGINAL).replaceAll(path.sep, '/'),
    original_forecast_sha256: originalHash,
    provenance: sources, research_model_version: report.version,
    rule: 'Immutable separate pre-tip challenger forecasts. Never merge into or replace the original 08:49 AEDT practice lock.',
    limitations: 'Inferred rotations are not official injury confirmations; unavailable models remain unscored.',
    games,
  });
  console.log('Locked separate five-model-plus-ensemble pregame sidecar at ' + new Date(finished).toISOString());
}
function reviewChallenge() {
  if (!fs.existsSync(SIDELOCK) || !fs.existsSync(ORIGINAL_REVIEW)) {
    console.log('Challenge or final-game review not available yet; no result generated');
    return;
  }
  const { originalHash, firstTip } = verifyOriginal();
  const challenge = read(SIDELOCK);
  checkSupplement(challenge, originalHash, firstTip);
  if (fs.existsSync(REVIEW)) {
    requireSafe(A.verifyIntegrity(read(REVIEW)), 'Existing challenge review checksum invalid');
    console.log('Challenge review already exists and is immutable');
    return;
  }
  const baseReview = read(ORIGINAL_REVIEW);
  requireSafe(A.verifyIntegrity(baseReview), 'Base final review checksum invalid');
  const actualById = new Map((baseReview.games || []).map(game => [String(game.game_id), game]));
  const results = challenge.games.map(forecast => {
    const actual = actualById.get(forecast.game_id);
    requireSafe(actual?.home?.score > -1 && actual?.away?.score > -1, 'Official final scores not ready for ' + forecast.game_id);
    const rows = A.modelRowsForGame({ challenge_predictions: forecast.predictions }, { home: actual.home, away: actual.away })
      .filter(row => C.ALL_IDS.includes(row.model_id));
    return { game_id: forecast.game_id, home: actual.home.abbr, away: actual.away.abbr,
      models: Object.fromEntries(rows.map(row => [row.model_id, row])) };
  });
  const summary = Object.fromEntries(C.ALL_IDS.map(id => {
    const rows = results.map(game => game.models[id]).filter(Boolean);
    return [id, { ...A.probabilityMetrics(rows), calibration: A.calibration(rows) }];
  }));
  writeOnce(REVIEW, {
    schema: 'nba-twin-lab-challenge-sidecar-review-v1',
    reviewed_at_utc: new Date().toISOString(), melbourne_date: DATE,
    source_lock_sha256: A.sha256(fs.readFileSync(SIDELOCK)),
    source_base_review_sha256: A.sha256(fs.readFileSync(ORIGINAL_REVIEW)),
    source_original_lock_sha256: originalHash,
    provider: 'Matches immutable final-score and player review; cannot amend forecasts',
    games: results, summary,
  });
  console.log('Wrote separate immutable six-model outcome review');
}
const command = process.argv[2] || 'lock';
if (command === 'lock') lockChallenge();
else if (command === 'review') reviewChallenge();
else if (command === 'verify') {
  const { originalHash, firstTip } = verifyOriginal();
  if (fs.existsSync(SIDELOCK)) checkSupplement(read(SIDELOCK), originalHash, firstTip);
  if (fs.existsSync(REVIEW)) requireSafe(A.verifyIntegrity(read(REVIEW)), 'Challenge review checksum invalid');
  console.log('Supplement integrity checks passed');
} else throw Error('Unknown command: ' + command);
