#!/usr/bin/env node
'use strict';
const IO=require('./research_io.cjs');

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const E = require('../predict/engine.js');
const Science = require('../predict/science.js');
const V8 = require('./v8_research.cjs');
const ScienceResearch = require('./game_science.cjs');
const RosterResearch = require('./roster_research.cjs');

const ROOT = path.join(__dirname, '..');
const MODEL_IDS = ['m1_elo', 'm2_science', 'm3_player_roster', 'm4_monte_carlo', 'm5_regularized_ml'];
const ALL_IDS = [...MODEL_IDS, 'm6_ensemble'];
const EVALUATION_SEASONS = [2023, 2024, 2025, 2026];
const PRIMARY_SEASONS = [2024, 2025, 2026];
const FRESH_SEASON = 2027;
const M2_NAMES = ScienceResearch.modeFeatures.full;
const M3_NAMES = ['elo', 'player', 'team', 'rest', 'continuity', 'rosterShock', 'eloUncertainty', 'currentChange'];
const M5_NAMES = ['elo', 'player', 'team', 'rest', 'continuity', 'momentum', 'restScience', 'shooting', 'threePointStyle', 'turnovers', 'rebounding', 'freeThrows', 'pace', 'h2h'];
const V8_NAMES = ['elo', 'player', 'team', 'rest', 'continuity'];
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const mean = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
const quantile = (values, q) => {
  if (!values.length) return null;
  const sorted = values.slice().sort((a, b) => a - b), position = (sorted.length - 1) * q;
  const low = Math.floor(position), high = Math.ceil(position);
  return sorted[low] + (sorted[high] - sorted[low]) * (position - low);
};
const canonical = value => ({ GS: 'GSW', NY: 'NYK', SA: 'SAS', NO: 'NOP', UTAH: 'UTA', WSH: 'WAS', PHO: 'PHX', BRK: 'BKN', CHO: 'CHA' }[value] || value);
const sha256File = file => crypto.createHash('sha256').update(fs.readFileSync(file.startsWith('data/')?IO.inputPath(file.slice(5)):path.join(ROOT,file))).digest('hex');

function baseFeatureVector(home, away, baseline) {
  const net = snapshot => {
    const current = snapshot.season || {}, prior = snapshot.prior || {}, games = Number(snapshot.games) || 0;
    const currentNet = Number(current.adj_ortg) - Number(current.adj_drtg);
    const priorNet = Number(prior.adj_ortg) - Number(prior.adj_drtg);
    if (Number.isFinite(currentNet) && Number.isFinite(priorNet)) return (games * currentNet + 18 * priorNet) / (games + 18);
    if (Number.isFinite(priorNet)) return priorNet;
    return Number.isFinite(currentNet) ? currentNet : 0;
  };
  const logit = p => Math.log(clamp(p, 0.000001, 0.999999) / (1 - clamp(p, 0.000001, 0.999999)));
  return {
    elo: clamp(logit(baseline.homeWin), -4, 4),
    player: clamp((Number(home.player_delta || 0) - Number(away.player_delta || 0)) / 4, -2, 2),
    team: clamp((net(home) - net(away) - baseline.margin) / 12, -2, 2),
    rest: (away.rest_days === 0 ? 1 : 0) - (home.rest_days === 0 ? 1 : 0),
    continuity: clamp((Number(home.rotation_continuity || 0) - Number(away.rotation_continuity || 0)) * 2, -2, 2),
  };
}

function currentHeadToHead(game, games) {
  const pair = [canonical(game.home.abbr), canonical(game.away.abbr)].sort().join('|');
  const home = canonical(game.home.abbr);
  const meetings = (games || []).filter(item => item.status === 'final' && E.resultKnownBefore(item,game.date) && item.season >= game.season - 2 &&
    [canonical(item.home.abbr), canonical(item.away.abbr)].sort().join('|') === pair).slice(-8).reverse();
  if (!meetings.length) return 0;
  let numerator = 0, denominator = 0;
  meetings.forEach((item, index) => {
    const weight = Math.pow(0.85, index);
    const winner = item.homeScore > item.awayScore ? canonical(item.home.abbr) : canonical(item.away.abbr);
    numerator += (winner === home ? 1 : -1) * weight;
    denominator += weight;
  });
  return (numerator / denominator) * meetings.length / (meetings.length + 6);
}

function buildHistoricalRows(simulations = 400) {
  const intel = IO.read('v7-intelligence.json');
  const rotation = IO.read('rotation-history.json');
  IO.requireChronology(intel);
  IO.requireChronology(rotation);
  if (!intel.strict_no_future_data || intel.coverage?.evaluated_games !== 6150) throw new Error('Historical pregame intelligence failed provenance checks');
  const baseRows = V8.buildRows();
  const scienceRows = ScienceResearch.pregameScienceRows(baseRows, intel.games);
  const rosterRows = RosterResearch.buildRows(intel, baseRows, rotation).rows;
  const base = new Map(baseRows.map(row => [String(row.id), row]));
  const science = new Map(scienceRows.map(row => [String(row.id), row]));
  const roster = new Map(rosterRows.map(row => [String(row.id), row]));
  const rows = [];
  for (let index = 0; index < intel.games.length; index++) {
    const feature = intel.games[index], id = String(feature.result_id);
    const b = base.get(id), s = science.get(id), r = roster.get(id);
    if (!b || !s || !r || feature.pregame?.home?.as_of !== feature.date || feature.pregame?.away?.as_of !== feature.date) {
      throw new Error(`Mismatched pregame feature row ${id}`);
    }
    const game = {
      id, date: b.date, season: feature.season, status: 'final',
      home: { abbr: canonical(feature.home.abbr), name: feature.home.name },
      away: { abbr: canonical(feature.away.abbr), name: feature.away.name },
      homeScore: feature.home_score, awayScore: feature.away_score,
    };
    const simulation = E.independentMonteCarlo(game, { home: feature.pregame.home, away: feature.pregame.away }, {
      simulations, seed: `five-model-v1|${id}|${simulations}`, window: 'last10', priorGames: 12, playerWeight: 0,
    });
    rows.push({
      id, date: b.date, season: b.season, y: b.y, actualHomeScore: feature.home_score, actualAwayScore: feature.away_score,
      early: b.early, rosterCoverage: r.rosterCoverage, rosterUncertainty: r.rosterUncertainty,
      features: { ...s.features, ...r.features }, baseline: { p: b.p, homeScore: b.homeScore, awayScore: b.awayScore },
      monteCarlo: { p: simulation.homeWin, homeScore: simulation.homeScore, awayScore: simulation.awayScore, seed: simulation.seed },
      models: {}, benchmarks: {},
    });
    if ((index + 1) % 1000 === 0) console.log(`Prepared challenge simulation ${index + 1} / ${intel.games.length}`);
  }
  if (rows.length !== 6221) throw new Error(`Expected 6,221 shared pregame rows, found ${rows.length}`);
  return rows;
}

function modelRow(row, p, homeScore = null, awayScore = null) {
  return { available: Number.isFinite(p), p, homeScore, awayScore };
}

function fitBaseModels(rows) {
  const fits = {};
  for (const season of [...EVALUATION_SEASONS, FRESH_SEASON]) {
    const train = IO.trainingRows(rows,season), test = rows.filter(row => row.season === season);
    if (train.length < 1000 || !test.length) throw new Error(`Insufficient chronological sample for ${season}`);
    const m2 = V8.fit(train, M2_NAMES);
    const rosterTrain = train.filter(row => row.rosterCoverage);
    const m3 = V8.fit(rosterTrain, M3_NAMES);
    const m5 = V8.fit(train, M5_NAMES);
    const v8 = V8.fit(train, V8_NAMES);
    fits[season] = { m2, m3, m5, v8, training_games: train.length, roster_training_games: rosterTrain.length };
    for (const row of test) {
      row.models.m1_elo = modelRow(row, row.baseline.p, row.baseline.homeScore, row.baseline.awayScore);
      row.models.m2_science = modelRow(row, V8.predict(row, m2));
      row.models.m3_player_roster = row.rosterCoverage ? modelRow(row, V8.predict(row, m3)) : { available: false, reason: 'Pregame rotation overlap unavailable' };
      row.models.m4_monte_carlo = modelRow(row, row.monteCarlo.p, row.monteCarlo.homeScore, row.monteCarlo.awayScore);
      row.models.m5_regularized_ml = modelRow(row, V8.predict(row, m5));
      row.benchmarks.v8_combined = modelRow(row, V8.predict(row, v8));
    }
  }
  return fits;
}

function fitWeights(rows) {
  let best = null, candidates = 0;
  for (let a = 0; a <= 10; a++) for (let b = 0; b <= 10 - a; b++) for (let c = 0; c <= 10 - a - b; c++) {
    for (let d = 0; d <= 10 - a - b - c; d++) {
      const e = 10 - a - b - c - d, weights = [a, b, c, d, e].map(value => value / 10);
      let loss = 0;
      for (const row of rows) {
        const p = MODEL_IDS.reduce((sum, id, index) => sum + weights[index] * row.models[id].p, 0);
        loss += (p - row.y) ** 2;
      }
      loss /= rows.length;
      const distance = weights.reduce((sum, value) => sum + (value - 0.2) ** 2, 0);
      candidates++;
      if (!best || loss < best.brier - 1e-14 || (Math.abs(loss - best.brier) < 1e-14 && distance < best.distance)) best = { weights, brier: loss, distance };
    }
  }
  return { ...best, candidates, games: rows.length };
}

function addNestedEnsemble(rows) {
  const weights = {};
  for (const season of [...EVALUATION_SEASONS, FRESH_SEASON]) {
    const test = rows.filter(row => row.season === season);
    const priorOOF = IO.trainingRows(rows,season).filter(row => row.season >= 2023 && MODEL_IDS.every(id => row.models[id]?.available));
    if (!priorOOF.length) {
      weights[season] = { available: false, reason: 'No earlier out-of-fold season available' };
      for (const row of test) row.models.m6_ensemble = { available: false, reason: weights[season].reason };
      continue;
    }
    const fit = fitWeights(priorOOF);
    weights[season] = { available: true, model_ids: MODEL_IDS, weights: Object.fromEntries(MODEL_IDS.map((id, index) => [id, fit.weights[index]])),
      training_seasons: [...new Set(priorOOF.map(row => row.season))], training_games: fit.games, training_brier: fit.brier, grid_candidates: fit.candidates };
    for (const row of test) {
      if (!MODEL_IDS.every(id => row.models[id]?.available)) row.models.m6_ensemble = { available: false, reason: 'At least one constituent model unavailable' };
      else row.models.m6_ensemble = modelRow(row, MODEL_IDS.reduce((sum, id, index) => sum + fit.weights[index] * row.models[id].p, 0));
    }
  }
  return weights;
}

function calibration(rows, modelId, bins = 10) {
  const groups = Array.from({ length: bins }, (_, index) => ({ low: index / bins, high: (index + 1) / bins, rows: [] }));
  for (const row of rows) {
    const p = row.models[modelId]?.p;
    if (Number.isFinite(p)) groups[Math.min(bins - 1, Math.floor(p * bins))].rows.push(row);
  }
  const total = groups.reduce((sum, group) => sum + group.rows.length, 0);
  const output = groups.filter(group => group.rows.length).map(group => ({ low: group.low, high: group.high, count: group.rows.length,
    confidence: mean(group.rows.map(row => row.models[modelId].p)), actual: mean(group.rows.map(row => row.y)) }));
  return { bins: output, ece: total ? output.reduce((sum, group) => sum + group.count / total * Math.abs(group.confidence - group.actual), 0) : null };
}

function metrics(rows, modelId, source = 'models') {
  const valid = rows.filter(row => row[source][modelId]?.available);
  if (!valid.length) return { games: 0, accuracy: null, brier: null, logLoss: null, ece: null, scoreMAE: null, scoreGames: 0, calibration: [] };
  const probability = row => row[source][modelId].p;
  const scores = valid.filter(row => Number.isFinite(row[source][modelId].homeScore) && Number.isFinite(row[source][modelId].awayScore));
  const cal = source === 'models' ? calibration(valid, modelId) : { bins: [], ece: null };
  return {
    games: valid.length,
    accuracy: mean(valid.map(row => (probability(row) >= 0.5) === (row.y === 1) ? 1 : 0)),
    brier: mean(valid.map(row => (probability(row) - row.y) ** 2)),
    logLoss: mean(valid.map(row => { const p = clamp(probability(row), 1e-9, 1 - 1e-9); return -(row.y * Math.log(p) + (1 - row.y) * Math.log(1 - p)); })),
    ece: cal.ece, calibration: cal.bins,
    scoreGames: scores.length,
    scoreMAE: scores.length ? mean(scores.map(row => (Math.abs(row[source][modelId].homeScore - row.actualHomeScore) + Math.abs(row[source][modelId].awayScore - row.actualAwayScore)) / 2)) : null,
  };
}

function confidenceIntervals(rows, modelId, repetitions = 300) {
  const byDay = new Map();
  for (const row of rows) {
    const day = String(row.date).slice(0, 10);
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day).push(row);
  }
  const days = [...byDay.values()], draws = { accuracy: [], brier: [], logLoss: [], ece: [], scoreMAE: [] };
  let seed = 0x5f1e0000 + modelId.length;
  const random = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 4294967296; };
  for (let repetition = 0; repetition < repetitions; repetition++) {
    const sample = [];
    for (let index = 0; index < days.length; index++) sample.push(...days[Math.floor(random() * days.length)]);
    const result = metrics(sample, modelId);
    for (const key of Object.keys(draws)) if (Number.isFinite(result[key])) draws[key].push(result[key]);
  }
  return Object.fromEntries(Object.entries(draws).map(([key, values]) => [key, values.length ? [quantile(values, 0.025), quantile(values, 0.975)] : null]));
}

function definitions() {
  return {
    m1_elo: { label: 'M1 · Elo baseline', technique: 'Chronological Elo with home court, rest, prior-season SRS shrinkage and score heuristic', inputs: ['earlier final scores', 'home court', 'rest', 'previous-season SRS'], score_projection: true },
    m2_science: { label: 'M2 · Basketball Science', technique: 'Fixed-L2 logistic regression fitted only on earlier seasons', inputs: ['opponent-adjusted strength', 'form', 'Four Factors', 'pace', 'rest', 'prior head-to-head'], score_projection: false },
    m3_player_roster: { label: 'M3 · Player / Roster', technique: 'Fixed-L2 roster-aware logistic regression fitted only on earlier seasons', inputs: ['Elo', 'inferred expected rotation/minutes', 'player impact proxy', 'roster retention', 'team strength', 'rest'], availability: 'Historical and live availability/minutes are explicitly inferred unless a separately timestamped official sidecar exists', score_projection: false },
    m4_monte_carlo: { label: 'M4 · Possession Monte Carlo', technique: 'Seeded possession-by-possession simulation', inputs: ['opponent-adjusted efficiency', 'pace', 'turnovers', 'shot mix', 'free throws', 'offensive rebounds'], score_projection: true },
    m5_regularized_ml: { label: 'M5 · Regularized ML', technique: 'Fixed-L2 multivariable logistic model; gradient boosting rejected to avoid unnecessary complexity and unstable validation', inputs: ['Elo', 'team/player proxies', 'form', 'Four Factors', 'pace', 'rest', 'continuity', 'head-to-head'], score_projection: false },
    m6_ensemble: { label: 'M6 · Nested weighted ensemble', technique: 'Non-negative weights summing to one, chosen on earlier out-of-fold seasons only by Brier score', inputs: MODEL_IDS, score_projection: false },
  };
}

function generateReport(options = {}) {
  const simulations = Number(options.simulations) || 400;
  const rows = buildHistoricalRows(simulations);
  const fits = fitBaseModels(rows);
  const ensembleWeights = addNestedEnsemble(rows);
  const primaryRows = rows.filter(row => PRIMARY_SEASONS.includes(row.season) && ALL_IDS.every(id => row.models[id]?.available));
  if (primaryRows.length < 2500) throw new Error(`Common evaluation sample unexpectedly small: ${primaryRows.length}`);
  const freshRows = rows.filter(row => row.season === FRESH_SEASON && ALL_IDS.every(id => row.models[id]?.available));
  const models = {};
  for (const id of ALL_IDS) {
    models[id] = {
      common: metrics(primaryRows, id), confidence_95_day_clustered: confidenceIntervals(primaryRows, id),
      by_season: Object.fromEntries(PRIMARY_SEASONS.map(season => [season, metrics(primaryRows.filter(row => row.season === season), id)])),
      early_season: metrics(primaryRows.filter(row => row.early), id),
      established: metrics(primaryRows.filter(row => !row.early), id),
      high_roster_change: metrics(primaryRows.filter(row => Number.isFinite(row.rosterUncertainty) && row.rosterUncertainty >= 0.25), id),
      fresh_inspected_2027: metrics(freshRows, id),
      unavailable_games_2023_to_2027: rows.filter(row => row.season >= 2023 && row.season <= 2027 && !row.models[id]?.available).length,
    };
  }
  const legacy = IO.read('historical-model-report.json');
  const benchmarkRows = primaryRows.filter(row => row.benchmarks.v8_combined?.available);
  const report = {
    schema: 'nba-twin-lab-five-model-challenge-v1', generated_at_utc: new Date().toISOString(), version: '1.0.0', chronology_policy:E.CHRONOLOGY_POLICY,
    status: 'research_only_not_promoted', strict_no_future_data: true, primary_metric: 'Brier score',
    production_model_unchanged: 'production_elo_v7', simulations_per_historical_game: simulations,
    common_evaluation: { seasons: PRIMARY_SEASONS, games: primaryRows.length, rule: 'Only games with all five base models and the already-fitted ensemble available are ranked.',
      ensemble_eligibility: 'The 2023 season is excluded from the six-model leaderboard because no earlier out-of-fold season existed to fit ensemble weights.' },
    chronology: { base_models: 'Every fitted model uses only seasons earlier than its evaluation season.',
      ensemble: 'For season S, weights use only complete out-of-fold predictions from seasons earlier than S; no evaluated-season games choose weights.',
      fresh_2027: 'Previously inspected diagnostic sample, never called an untouched holdout.' },
    overlap_disclosure: 'The models are separately specified but not statistically independent. M1, M2, M3 and M5 share Elo-derived information; M2, M4 and M5 share team-efficiency/Four-Factor inputs; M3 and M5 share inferred player/rotation features.',
    model_definitions: definitions(), models, ensemble_weights_by_season: ensembleWeights,
    fits_by_evaluation_season: fits,
    benchmarks: {
      established_elo: { scope: 'Same common-game leaderboard', metrics: models.m1_elo.common },
      v8_combined: { scope: 'Same common-game sample; earlier regularized Elo/player/team/rest/continuity model', metrics: metrics(benchmarkRows, 'v8_combined', 'benchmarks') },
      v6_locked_blend: { scope: 'Legacy untouched 2025–26 season only; not directly rankable against the multi-season common leaderboard', metrics: legacy.models?.combined?.by_split?.test || null,
        optimization: legacy.optimization?.chosen || null },
    },
    slices: { early_season: 'Either team had fewer than 10 games at tipoff.', high_roster_change: 'Pregame inferred prior-rotation replacement uncertainty at least 0.25; injuries and trades can be confounded.' },
    player_stat_policy: { tracked_separately: true, metrics: ['PTS MAE', 'REB MAE', 'AST MAE', '3PM MAE'], source: 'data/audit-ledger.json', rule: 'Only players with observed minutes > 0 are scored; DNP and absent rows are excluded.' },
    source_provenance: {
      historical_pregame_features: { path: path.relative(ROOT,IO.inputPath('v7-intelligence.json')), sha256: sha256File('data/v7-intelligence.json') },
      rotation_history: { path: path.relative(ROOT,IO.inputPath('rotation-history.json')), sha256: sha256File('data/rotation-history.json') },
      historical_results: { path: 'data/historical-games.json', sha256: sha256File('data/historical-games.json') },
      generator: { path: 'scripts/five_model_challenge.cjs', sha256: sha256File('scripts/five_model_challenge.cjs') },
    },
    limitations: ['No betting-market inputs and no claim of betting advantage.', 'Historical player availability is inferred rather than an official injury archive.',
      'The five models overlap in inputs and should not be described as independent evidence.', `Historical M4 uses ${simulations} seeded simulations per game for tractability; locked live forecasts use the daily workflow's larger configured simulation count.`,
      'Confidence intervals describe sampling uncertainty, not all data/provider/model uncertainty.', 'No model is promoted automatically, regardless of leaderboard rank.'],
  };
  return report;
}

function predictLiveModels({ game, baseline, snapshot, rosterForecast, report, gameData, simulations = 20000 }) {
  if (report?.schema !== 'nba-twin-lab-five-model-challenge-v1' || !report.strict_no_future_data) throw new Error('Five Model Challenge artifact failed provenance checks');
  const teams = new Map((snapshot.teams || []).map(team => [canonical(team.abbr), team]));
  const home = teams.get(canonical(game.home.abbr)), away = teams.get(canonical(game.away.abbr));
  if (!home || !away || home.as_of !== away.as_of) throw new Error('Matching pregame team snapshots unavailable');
  const seasonFit = report.fits_by_evaluation_season?.[String(game.season)] || report.fits_by_evaluation_season?.[game.season];
  const weights = report.ensemble_weights_by_season?.[String(game.season)] || report.ensemble_weights_by_season?.[game.season];
  if (!seasonFit?.m2 || !seasonFit?.m5) throw new Error(`No earlier-season fit for ${game.season}`);
  const base = baseFeatureVector(home, away, baseline);
  const science = Science.scienceFeatures(home, away, currentHeadToHead(game, gameData?.games || []));
  const features = { ...base, ...science };
  const simulation = E.independentMonteCarlo(game, { home, away }, { simulations, seed: `five-model-live-v1|${game.id}|${game.date}|${simulations}`, window: 'last10', priorGames: 12, playerWeight: 0 });
  const output = {
    m1_elo: { available: true, home_win_probability: baseline.homeWin, projected_score: { home: baseline.homeScore, away: baseline.awayScore } },
    m2_science: { available: true, home_win_probability: V8.predict({ features }, seasonFit.m2), projected_score: null },
    m3_player_roster: rosterForecast?.available ? { available: true, home_win_probability: V8.predict({ features: rosterForecast.features }, seasonFit.m3), projected_score: null,
      availability: 'inferred_unless_official_sidecar', roster_uncertainty: rosterForecast.rosterUncertainty } : { available: false, reason: rosterForecast?.reason || 'Roster inputs unavailable' },
    m4_monte_carlo: { available: true, home_win_probability: simulation.homeWin, projected_score: { home: simulation.homeScore, away: simulation.awayScore }, simulations, seed: simulation.seed },
    m5_regularized_ml: { available: true, home_win_probability: V8.predict({ features }, seasonFit.m5), projected_score: null },
  };
  if (weights?.available && MODEL_IDS.every(id => output[id]?.available)) {
    output.m6_ensemble = { available: true, home_win_probability: MODEL_IDS.reduce((sum, id) => sum + weights.weights[id] * output[id].home_win_probability, 0),
      projected_score: null, weights: weights.weights, weights_training_seasons: weights.training_seasons };
  } else output.m6_ensemble = { available: false, reason: weights?.reason || 'A constituent model is unavailable' };
  return output;
}

if (require.main === module) {
  const output = process.argv[2]?.startsWith('--')?undefined:process.argv[2];
  const simulationsArg = process.argv.find(value => value.startsWith('--simulations='));
  const report = generateReport({ simulations: simulationsArg ? Number(simulationsArg.split('=')[1]) : 400 });
  const saved=IO.write('five-model-report.json',{...report,chronology_policy:E.CHRONOLOGY_POLICY},output);
  console.log(`Wrote ${saved} with ${report.common_evaluation.games} common games`);
  for (const id of ALL_IDS) {
    const m = report.models[id].common;
    console.log(`${id}: n=${m.games} accuracy=${(m.accuracy * 100).toFixed(1)}% Brier=${m.brier.toFixed(4)} logloss=${m.logLoss.toFixed(4)} ECE=${m.ece.toFixed(4)}`);
  }
}

module.exports = { MODEL_IDS, ALL_IDS, M2_NAMES, M3_NAMES, M5_NAMES, baseFeatureVector, currentHeadToHead, fitWeights, metrics, generateReport, predictLiveModels };
