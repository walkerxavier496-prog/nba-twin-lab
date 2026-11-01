#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const E = require('../predict/engine.js');
const R = require('../predict/roster.js');
const RI = require('../predict/roster-integrity.js');
const RS = require('../predict/roster-strength.js');
const A = require('./audit-core.cjs');
const C = require('./five_model_challenge.cjs');
const SM = require('../predict/score-machine.js');

const ROOT = path.join(__dirname, '..');
const DATA = path.join(ROOT, 'data');
const AUDIT = path.join(ROOT, 'audit');
const SUMMARY_ENDPOINT = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary';
const LOCK_MINUTES_BEFORE_TIP = 45;
const LOCK_MAX_MINUTES_BEFORE_TIP = 180;
const MAX_GAME_FEED_AGE_HOURS = 18;
const MAX_PLAYER_FEED_AGE_HOURS = 18;
const DEFAULT_SIMULATIONS = 20000;

const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const writeExclusive = (file, value) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n', { encoding: 'utf8', flag: 'wx' });
};
const writeAtomic = (file, value) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(value, null, 2) + '\n');
  fs.renameSync(temp, file);
};
const finite = value => value !== null && value !== '' && Number.isFinite(Number(value)) ? Number(value) : null;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

function parseArgs(argv) {
  const out = { command: argv[2] || 'run' };
  for (let i = 3; i < argv.length; i++) {
    if (argv[i] === '--date') out.date = argv[++i];
    else if (argv[i] === '--now') out.now = argv[++i];
    else if (argv[i] === '--dry-run') out.dryRun = true;
    else if (argv[i] === '--simulations') out.simulations = Number(argv[++i]);
    else throw new Error(`Unknown argument: ${argv[i]}`);
  }
  return out;
}

function filesUnder(directory, name) {
  if (!fs.existsSync(directory)) return [];
  const output = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) output.push(...filesUnder(full, name));
    else if (entry.name === name) output.push(full);
  }
  return output;
}

function lockFiles() {
  return [
    ...filesUnder(path.join(AUDIT, 'snapshots'), 'forecast.lock.json'),
    ...filesUnder(path.join(ROOT, 'practice'), 'forecast.lock.json'),
  ].sort();
}

function lockForDate(date) {
  return lockFiles().find(file => {
    try { return readJson(file)?.scope?.melbourne_date === date; } catch { return false; }
  }) || null;
}

function reviewFile(date) {
  return path.join(AUDIT, 'reviews', date, 'review.json');
}

function gameReviewFile(date, gameId) {
  return path.join(AUDIT, 'reviews', date, 'games', `${gameId}.review.json`);
}

function gameReviewFiles(date) {
  const directory = path.join(AUDIT, 'reviews', date, 'games');
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory).filter(name => /^\d+\.review\.json$/.test(name)).sort().map(name => path.join(directory, name));
}

function verifyChallengeLink(lockFile, lock, value) {
  const date = lock.scope?.melbourne_date;
  const firstTip = Date.parse(lock.scope?.first_tip_utc);
  const lockedAt = Date.parse(value?.locked_at_utc);
  const originalPath = path.relative(ROOT, lockFile).replaceAll(path.sep, '/');
  if (!A.verifyIntegrity(value) || value.schema !== 'nba-twin-lab-challenge-sidecar-v1' ||
      value.melbourne_date !== date) throw new Error(`Challenge lock integrity failed for ${date}`);
  if (value.original_forecast_path !== originalPath ||
      value.original_forecast_sha256 !== A.sha256(fs.readFileSync(lockFile))) {
    throw new Error(`Challenge lock does not reference the original forecast for ${date}`);
  }
  if (!Number.isFinite(firstTip) || Date.parse(value.first_tip_utc) !== firstTip ||
      !Number.isFinite(lockedAt) || lockedAt >= firstTip) {
    throw new Error(`Challenge lock was not verified before the original first tip for ${date}`);
  }
  const sidecarGames = value.games;
  if (!Array.isArray(sidecarGames) || sidecarGames.length !== lock.forecasts?.length) {
    throw new Error(`Challenge game coverage mismatch for ${date}`);
  }
  const byId = new Map(sidecarGames.map(game => [String(game.game_id), game]));
  if (byId.size !== sidecarGames.length) throw new Error(`Duplicate challenge game for ${date}`);
  for (const forecast of lock.forecasts || []) {
    const game = byId.get(String(forecast.game_id));
    if (!game || Date.parse(game.tip_utc) !== Date.parse(forecast.tip_utc) ||
        A.canonicalTeam(game.home) !== A.canonicalTeam(forecast.home.abbr) ||
        A.canonicalTeam(game.away) !== A.canonicalTeam(forecast.away.abbr)) {
      throw new Error(`Challenge game does not match original lock for ${forecast.game_id}`);
    }
    for (const modelId of C.ALL_IDS) {
      const prediction = game.predictions?.[modelId];
      if (!prediction || typeof prediction.available !== 'boolean' ||
          (prediction.available && (finite(prediction.home_win_probability) === null ||
            prediction.home_win_probability < 0 || prediction.home_win_probability > 1))) {
        throw new Error(`Invalid locked challenge probability for ${forecast.game_id}/${modelId}`);
      }
    }
  }
  return value;
}

function challengeLockForDate(date, lockFile, lock) {
  const file = path.join(AUDIT, 'supplements', date, 'challenge.lock.json');
  if (!fs.existsSync(file)) return null;
  const value = verifyChallengeLink(lockFile, lock, readJson(file));
  return { file, value };
}

function contextProfiles(context, season) {
  const aliases = { GS: 'GSW', NY: 'NYK', SA: 'SAS', NO: 'NOP', UTAH: 'UTA', WSH: 'WAS', PHX: 'PHO', BKN: 'BRK', CHA: 'CHO' };
  const profiles = {};
  for (const team of context.teams || []) if (Number(team.season) < Number(season)) profiles[team.abbr] = team;
  for (const [gameAbbr, sourceAbbr] of Object.entries(aliases)) if (profiles[sourceAbbr]) profiles[gameAbbr] = profiles[sourceAbbr];
  return profiles;
}

// Score Machine V1 trains only on earlier seasons' verified-chronology
// pregame snapshots. No existing lock is ever rebuilt or changed.
function trainedScoreMachine(season) {
  const file=path.join(DATA,'v7-intelligence.json'),dataset=readJson(file);
  if(!dataset.strict_no_future_data||!Array.isArray(dataset.games)||dataset.coverage?.evaluated_games<6000)
    throw Error('Score-machine pretip historical provenance missing');
  const training=dataset.games.filter(g=>Number(g.season)<Number(season)).map(g=>{
    if(!/^20\d\d-\d\d-\d\d$/.test(g.date)||g.pregame?.home?.as_of!==g.date||g.pregame?.away?.as_of!==g.date)
      throw Error('Score-machine training snapshot not pretip');
    const x=SM.vector(g.pregame.home,g.pregame.away);
    if(!x||!Number.isFinite(g.home_score)||!Number.isFinite(g.away_score)||g.home_score===g.away_score)
      throw Error('Score-machine historical row incomplete');
    return {x,margin:g.home_score-g.away_score,total:g.home_score+g.away_score};
  });
  return {fit:SM.train(training),source_sha256:A.sha256(fs.readFileSync(file))};
}

function playerTeams(snapshot) {
  return new Map((snapshot.teams || []).map(team => [A.canonicalTeam(team.abbr), team]));
}

function teamPace(team) {
  const season = team?.season || {}, prior = team?.prior || {}, games = Number(season.games) || 0;
  const current = finite(season.pace), old = finite(prior.pace);
  if (current !== null && old !== null) return (games * current + 12 * old) / (games + 12);
  return current ?? old ?? 100;
}

function teamDefense(team) {
  const season = team?.season || {}, prior = team?.prior || {}, games = Number(season.games) || 0;
  const current = finite(season.drtg), old = finite(prior.drtg);
  if (current !== null && old !== null) return (games * current + 12 * old) / (games + 12);
  return current ?? old;
}

function v9Factor(team, opponent) {
  const expectedPace = clamp((teamPace(team) + teamPace(opponent)) / 2, 90, 110);
  const paceFactor = clamp(expectedPace / teamPace(team), 0.92, 1.08);
  const opponentDefense = teamDefense(opponent);
  return { paceFactor, defenseFactor: opponentDefense === null ? 1 : clamp(opponentDefense / 112, 0.92, 1.08) };
}

function v9Projections(game, teams) {
  const home = teams.get(A.canonicalTeam(game.home.abbr)), away = teams.get(A.canonicalTeam(game.away.abbr));
  if (!home || !away) throw new Error(`V9 team coverage missing for ${game.away.abbr} @ ${game.home.abbr}`);
  const rows = [];
  for (const [side, team, opponent] of [['away', away, home], ['home', home, away]]) {
    const factor = v9Factor(team, opponent);
    for (const player of team.rotation || []) {
      if (!player.stats_if_play || Number(player.observed_games) < 3) continue;
      const project = stat => {
        const raw = finite(player.stats_if_play[stat]);
        return raw === null ? null : clamp(raw * factor.paceFactor * (stat === 'points' ? factor.defenseFactor : 1), 0, 70);
      };
      rows.push({
        side, team: A.canonicalTeam(team.abbr), player_id: String(player.player_id), name: player.name,
        expected_minutes_if_play: finite(player.minutes_if_play),
        play_probability_inferred: finite(player.play_probability),
        availability: {
          classification: 'inferred_only',
          source: player.availability_source || team.availability_source || 'prior appearances; no verified pregame injury feed',
          status: player.status || 'rotation inferred',
          last_observed_game: player.last_game || null,
          warning: 'Conditional projection is not a claim that the player will play. Official injury and confirmed rotation status are unavailable unless separately snapshotted.',
        },
        projection_if_play: {
          pts: project('points'), reb: project('rebounds'), ast: project('assists'), three_pm: project('threes'),
        },
      });
    }
  }
  return rows;
}

function sourceTime(source, field = 'built_at_utc') {
  const value = source?.[field];
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(`Missing or invalid source timestamp ${field}`);
  return parsed;
}

function assertFresh(label, source, now, maxHours, firstTip, field = 'built_at_utc') {
  const timestamp = sourceTime(source, field);
  const ageHours = (now - timestamp) / 3600000;
  if (timestamp > now + 60000 || timestamp >= firstTip) throw new Error(`${label} source is future-dated or post-tip`);
  if (ageHours > maxHours) throw new Error(`${label} source is stale (${ageHours.toFixed(1)}h)`);
  return new Date(timestamp).toISOString();
}

function buildLock({ date, now, simulations = DEFAULT_SIMULATIONS }) {
  const gameData = readJson(path.join(DATA, 'games.json'));
  const snapshot = readJson(path.join(DATA, 'v7-current.json'));
  const context = readJson(path.join(DATA, 'context.json'));
  const rosterPriors = readJson(path.join(DATA, 'roster-priors.json'));
  const rosterReport = readJson(path.join(DATA, 'roster-research-report.json'));
  const challengeReport = readJson(path.join(DATA, 'five-model-report.json'));
  const officialAvailability = readJson(path.join(DATA, 'availability-current.json'));
  const games = (gameData.games || []).filter(game => A.melbourneDate(game.date) === date).sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
  if (!games.length) throw new Error(`No validated NBA games discovered for Melbourne date ${date}`);
  if (games.some(game => game.status !== 'scheduled')) throw new Error('At least one target game is no longer pregame; lock refused');
  const firstTip = Math.min(...games.map(game => Date.parse(game.date)));
  const lastTip = Math.max(...games.map(game => Date.parse(game.date)));
  if (!Number.isFinite(firstTip) || now >= firstTip) throw new Error('Tipoff has begun; lock refused');
  const minutesBefore = (firstTip - now) / 60000;
  if (minutesBefore < LOCK_MINUTES_BEFORE_TIP || minutesBefore > LOCK_MAX_MINUTES_BEFORE_TIP) {
    const error = new Error(`Outside lock window (${minutesBefore.toFixed(1)} minutes before first tip)`);
    error.code = 'OUTSIDE_WINDOW';
    throw error;
  }
  const gameBuilt = assertFresh('Schedule/results', gameData, now, MAX_GAME_FEED_AGE_HOURS, firstTip);
  const playerBuilt = assertFresh('V9 player/rotation', snapshot, now, MAX_PLAYER_FEED_AGE_HOURS, firstTip);
  if (!snapshot.strict_no_future_data || snapshot.teams?.length !== 30) throw new Error('V9 snapshot failed provenance or coverage checks');
  const season = Number(games[0].season);
  if (games.some(game => Number(game.season) !== season) || Number(snapshot.coverage?.season) !== season) throw new Error('Season mismatch in lock inputs');
  const profiles = contextProfiles(context, season), teams = playerTeams(snapshot);
  const scoreFit = trainedScoreMachine(season);
  const scoreTeamIndex = new Map(snapshot.teams.map(t=>[R.canonical(t.abbr),t]));
  const forecasts = [];
  for (const game of games) {
    const state = E.ratings(gameData.games, new Date(Math.min(now, Date.parse(game.date))).toISOString());
    if (state.finals < 800) throw new Error('Historical Elo coverage is insufficient');
    const primary = E.forecast(game, state, profiles);
    const simulation = E.monteCarlo(game, state, profiles, { simulations, seed: `daily-audit-v2|${game.id}|${game.date}|${simulations}` });
    const roster = R.modelForecast({ game, baseline: primary, snapshot, priorRotations: rosterPriors, report: rosterReport, now });
    const challenge = C.predictLiveModels({ game, baseline: primary, snapshot, rosterForecast: roster,
      report: challengeReport, gameData, simulations });
    const rosterIntegrity = RI.auditGame({game,snapshot,availability:officialAvailability,now});
    const rosterStrength = RS.matchup(rosterIntegrity);
    const scoreForecast=SM.predict(scoreFit.fit,
      scoreTeamIndex.get(R.canonical(game.home.abbr)),scoreTeamIndex.get(R.canonical(game.away.abbr)));
    forecasts.push({
      game_id: String(game.id), tip_utc: new Date(game.date).toISOString(), tip_melbourne: A.melbourneDisplay(game.date),
      away: { id: String(game.away.id), name: game.away.name, abbr: game.away.abbr },
      home: { id: String(game.home.id), name: game.home.name, abbr: game.home.abbr },
      primary_forecast: {
        model_id: 'production_elo_v7', model: 'production Elo baseline', version_status: 'production',
        winner: primary.homeWin >= 0.5 ? game.home.abbr : game.away.abbr,
        winner_probability: Math.max(primary.homeWin, primary.awayWin),
        home_win_probability: primary.homeWin, away_win_probability: primary.awayWin,
        projected_score: { away: primary.awayScore, home: primary.homeScore },
      },
      diagnostics: {
        monte_carlo: {
          model_id: 'possession_monte_carlo_v5', version_status: 'diagnostic_not_promoted', simulations,
          seed: simulation.seed, home_win_probability: simulation.homeWin, away_win_probability: simulation.awayWin,
          projected_score: { away: simulation.awayScore, home: simulation.homeScore },
        },
        roster_aware_beta: roster.available ? {
          model_id: 'roster_beta_v1', version_status: 'research_only_not_promoted',
          home_win_probability: roster.homeWin, away_win_probability: roster.awayWin,
          source_built_at: roster.sourceBuiltAt, uncertainty: roster.rosterUncertainty,
        } : { model_id: 'roster_beta_v1', version_status: 'unavailable', reason: roster.reason },
      },
      challenge_predictions: Object.fromEntries(Object.entries(challenge).map(([modelId, prediction]) => [modelId, prediction.available ? {
        model_id: modelId, model_version: challengeReport.version, version_status: 'research_only_not_promoted',
        available: true, home_win_probability: prediction.home_win_probability,
        away_win_probability: 1 - prediction.home_win_probability,
        projected_score: prediction.projected_score,
        simulations: prediction.simulations, seed: prediction.seed, weights: prediction.weights,
        weights_training_seasons: prediction.weights_training_seasons,
        availability: prediction.availability, roster_uncertainty: prediction.roster_uncertainty,
      } : { model_id: modelId, model_version: challengeReport.version, version_status: 'unavailable', available: false, reason: prediction.reason }])),
      research_score_machine: scoreForecast.available ? {
        model_id:'joint_score_margin_v1',version_status:'research_only_not_promoted',available:true,
        home_win_probability:scoreForecast.home_win_probability,
        away_win_probability:1-scoreForecast.home_win_probability,
        projected_score:{home:scoreForecast.projected_home_score,away:scoreForecast.projected_away_score},
        display_score:{home:scoreForecast.rounded_home_score,away:scoreForecast.rounded_away_score},
        projected_home_margin:scoreForecast.projected_home_margin,
        margin_range_80:scoreForecast.margin_range_80,explanation:scoreForecast.explanation,
        training_games:scoreFit.fit.training_games,training_source_sha256:scoreFit.source_sha256,
        trained_on_seasons_before:season,team_snapshot_utc:snapshot.built_at_utc,
        official_game_day_availability_used:false,
        validation_status:'historical_walk_forward_only_prospective_unproven'
      } : {model_id:'joint_score_margin_v1',available:false,reason:scoreForecast.reason},
      v18_roster_integrity: rosterIntegrity,
      v18_roster_strength: rosterStrength,
      v9_player_projections: v9Projections(game, teams),
    });
  }
  const playerCount = forecasts.reduce((count, game) => count + game.v9_player_projections.length, 0);
  return A.withIntegrity({
    schema: 'nba-twin-lab-daily-forecast-v2',
    locked_at_utc: new Date(now).toISOString(), locked_at_melbourne: A.melbourneDisplay(now),
    immutable_intent: 'Forecast fields are append-only and must never be edited after publication. Results belong in a separate review artifact.',
    scope: {
      melbourne_date: date, timezone: 'Australia/Melbourne', games: games.length, player_projections: playerCount,
      first_tip_utc: new Date(firstTip).toISOString(), last_tip_utc: new Date(lastTip).toISOString(),
    },
    model_policy: {
      production: 'production_elo_v7',
      research_comparisons: [...C.ALL_IDS, 'v9_conditional_player_stats'],
      promotion: 'No automatic promotion. Research must beat the production model prospectively on probability and error metrics before a reviewed code change.',
    },
    source_provenance: {
      schedule_results: { name: gameData.source?.name, url: gameData.source?.url, built_at_utc: gameBuilt, status: gameData.source?.status },
      team_context: { name: context.source?.name, url: context.source?.url, built_at_utc: context.built_at_utc },
      v9_player_rotation: { name: 'NBA Stats-derived pregame player logs via repository V9 builder', built_at_utc: playerBuilt, strict_no_future_data: true },
      roster_research: { generated_at_utc: rosterReport.generated_at_utc, status: rosterReport.status },
      five_model_challenge: { generated_at_utc: challengeReport.generated_at_utc, version: challengeReport.version,
        schema: challengeReport.schema, status: challengeReport.status, strict_no_future_data: challengeReport.strict_no_future_data },
      injuries: { name: 'Availability source for V18 audit', status: officialAvailability.status,
        source_url: officialAvailability.source?.url || null, published_at_utc: officialAvailability.published_at_utc || null,
        effect: 'V18 checks current-roster and injury provenance; Elo/V9 model outputs are not recomputed from this audit' },
    },
    review_protocol: {
      game_metrics: ['winner_accuracy', 'brier', 'log_loss', 'score_mae_per_team'],
      player_metrics: ['pts_mae', 'reb_mae', 'ast_mae', 'three_pm_mae'],
      played_rule: 'Score only provider-listed players with minutes > 0; DNP and absent rows are excluded, never zero-filled.',
    },
    forecasts,
  });
}

async function fetchJson(url, attempts = 3) {
  let last;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 20000);
      const response = await fetch(url, { headers: { Accept: 'application/json' }, signal: controller.signal });
      clearTimeout(timer);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      last = error;
      if (attempt < attempts) await new Promise(resolve => setTimeout(resolve, attempt * 750));
    }
  }
  throw last;
}

async function buildReview(lock, now) {
  const actuals = {};
  const providerHashes = {};
  for (const forecast of lock.forecasts || []) {
    const url = `${SUMMARY_ENDPOINT}?event=${encodeURIComponent(forecast.game_id)}`;
    const raw = await fetchJson(url);
    actuals[String(forecast.game_id)] = A.parseEspnSummary(raw, forecast.game_id);
    providerHashes[String(forecast.game_id)] = { url, response_sha256: A.sha256(raw) };
  }
  const review = A.scoreReview(lock, actuals, now);
  review.providers.game_and_player_results.games = providerHashes;
  return A.withIntegrity(Object.fromEntries(Object.entries(review).filter(([key]) => key !== 'integrity')));
}

function mergeChallengeForecast(forecast, challenge) {
  const sidecar = challenge?.games?.find(game => String(game.game_id) === String(forecast.game_id));
  return sidecar ? { ...forecast, challenge_predictions: sidecar.predictions || {} } : forecast;
}

function derivedReviewForDate(lock, date, now) {
  const gameFiles = gameReviewFiles(date);
  if (!gameFiles.length) return null;
  const gameArtifacts = gameFiles.map(file => readJson(file));
  for (const [index, artifact] of gameArtifacts.entries()) if (!A.verifyIntegrity(artifact) || artifact.schema !== 'nba-twin-lab-game-review-v1') {
    throw new Error(`Per-game review integrity failed for ${path.relative(ROOT, gameFiles[index])}`);
  }
  const games = gameArtifacts.flatMap(artifact => artifact.games || []).sort((a, b) => Date.parse(a.tip_utc) - Date.parse(b.tip_utc));
  return A.withIntegrity({
    schema: 'nba-twin-lab-daily-review-v3',
    generated_at_utc: new Date(now).toISOString(), melbourne_date: date,
    status: games.length === Number(lock.scope?.games) ? 'complete' : 'partial',
    completed_games: games.length, expected_games: Number(lock.scope?.games || lock.forecasts?.length || 0),
    source_lock_integrity_sha256: lock.integrity?.canonical_payload_without_integrity || null,
    rule: 'Derived only from append-only per-game reviews. A final is published independently; incomplete or missing boxes remain pending and are never zero-filled.',
    game_review_paths: gameFiles.map(file => path.relative(ROOT, file).replaceAll(path.sep, '/')),
    games, summary: A.summarizeGames(games),
  });
}

function writeDerivedReview(lock, date, now) {
  const review = derivedReviewForDate(lock, date, now);
  if (!review) return null;
  const file = reviewFile(date);
  if (fs.existsSync(file)) {
    const previous = readJson(file);
    const comparable = value => Object.fromEntries(Object.entries(value).filter(([key]) => !['generated_at_utc', 'integrity'].includes(key)));
    if (A.stableStringify(comparable(previous)) === A.stableStringify(comparable(review))) return previous;
  }
  writeAtomic(file, review);
  return review;
}

async function processFinalGames(lockFile, now, { fetcher = fetchJson, dryRun = false, ignoreExisting = false } = {}) {
  const lock = readJson(lockFile);
  if (!A.verifyIntegrity(lock)) throw new Error(`Forecast lock integrity failed: ${path.relative(ROOT, lockFile)}`);
  const date = lock.scope.melbourne_date;
  const challenge = challengeLockForDate(date, lockFile, lock);
  const outcomes = { reviewed: [], pending: [], existing: [] };
  for (const forecast of lock.forecasts || []) {
    const gameId = String(forecast.game_id), destination = gameReviewFile(date, gameId);
    if (fs.existsSync(destination) && !ignoreExisting) {
      if (!A.verifyIntegrity(readJson(destination))) throw new Error(`Existing game review integrity failed: ${path.relative(ROOT, destination)}`);
      outcomes.existing.push(gameId); continue;
    }
    if (!(Date.parse(forecast.tip_utc) < now)) { outcomes.pending.push({ game_id: gameId, reason: 'tipoff_not_reached' }); continue; }
    const url = `${SUMMARY_ENDPOINT}?event=${encodeURIComponent(gameId)}`;
    try {
      const raw = await fetcher(url);
      const actual = A.parseEspnSummary(raw, gameId);
      const merged = mergeChallengeForecast(forecast, challenge?.value);
      const oneGameLock = A.withIntegrity({ ...lock, forecasts: [merged] });
      const scored = A.scoreReview(oneGameLock, { [gameId]: actual }, now);
      const artifact = A.withIntegrity({
        schema: 'nba-twin-lab-game-review-v1', reviewed_at_utc: new Date(now).toISOString(),
        melbourne_date: date, game_id: gameId,
        source_lock_path: path.relative(ROOT, lockFile).replaceAll(path.sep, '/'),
        source_lock_sha256: A.sha256(fs.readFileSync(lockFile)),
        source_lock_integrity_sha256: lock.integrity?.canonical_payload_without_integrity || null,
        challenge_lock_path: challenge ? path.relative(ROOT, challenge.file).replaceAll(path.sep, '/') : null,
        challenge_lock_sha256: challenge ? A.sha256(fs.readFileSync(challenge.file)) : null,
        provider: { name: 'ESPN public NBA summary (unofficial)', url, retrieved_at_utc: new Date(now).toISOString(), response_sha256: A.sha256(raw) },
        completion_rule: 'Written only after a verified final score and complete player tables for both teams. Missing, postponed, live, or incomplete boxes remain pending.',
        games: scored.games, summary: scored.summary,
      });
      if (dryRun) outcomes.reviewed.push({ game_id: gameId, artifact });
      else { writeExclusive(destination, artifact); outcomes.reviewed.push({ game_id: gameId }); }
    } catch (error) {
      outcomes.pending.push({ game_id: gameId, reason: error.message });
    }
  }
  if (!dryRun) writeDerivedReview(lock, date, now);
  return outcomes;
}

function buildPerformanceCentre(now) {
  const days = [];
  for (const file of lockFiles()) {
    const lock = readJson(file), date = lock?.scope?.melbourne_date;
    if (!date) continue;
    const reviewPath = reviewFile(date);
    if (!fs.existsSync(reviewPath)) continue;
    const review = readJson(reviewPath);
    const games = (review.games || []).map(game => {
      const gradeByProvider = new Map((game.player_results || []).filter(row => row.actual?.provider_player_id).map(row => [String(row.actual.provider_player_id), row]));
      return {
        game_id: game.game_id, tip_utc: game.tip_utc, home: game.home, away: game.away,
        players: (game.actual_players || []).map(player => ({
        id: player.provider_player_id, name: player.name, team: player.team,
        minutes: player.minutes, pts: player.pts, reb: player.reb, ast: player.ast, three: player.three_pm,
        stl: player.stl, blk: player.blk, stocks: player.stocks, tov: player.tov, fpts: player.fpts,
        double_double: player.double_double, triple_double: player.triple_double,
        projection_grade: gradeByProvider.has(String(player.provider_player_id)) ? {
          disposition: gradeByProvider.get(String(player.provider_player_id)).disposition,
          projection_if_play: gradeByProvider.get(String(player.provider_player_id)).projection_if_play,
          absolute_errors: gradeByProvider.get(String(player.provider_player_id)).absolute_errors,
        } : null,
        })),
      };
    });
    days.push({ melbourne_date: date, status: review.status || 'complete', completed_games: games.length,
      expected_games: review.expected_games || lock.scope.games, games });
  }
  const logs = new Map();
  for (const day of days) for (const game of day.games) for (const player of game.players) {
    const key = player.id || `${player.team}:${A.normalizeName(player.name)}`;
    if (!logs.has(key)) logs.set(key, { id: player.id, name: player.name, team: player.team, games: [] });
    logs.get(key).games.push({ melbourne_date: day.melbourne_date, game_id: game.game_id, ...player });
  }
  const meanStat = (games, stat) => {
    const values = games.map(game => finite(game[stat])).filter(Number.isFinite);
    return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  };
  const players = [...logs.values()].map(player => {
    player.games.sort((a, b) => b.melbourne_date.localeCompare(a.melbourne_date));
    const form = count => Object.fromEntries(['pts', 'reb', 'ast', 'three', 'fpts'].map(stat => [stat, meanStat(player.games.slice(0, count), stat)]));
    return { ...player, last5: { games: Math.min(5, player.games.length), averages: form(5) }, last10: { games: Math.min(10, player.games.length), averages: form(10) } };
  });
  const payload = { schema: 'nba-twin-lab-performance-centre-v1', generated_at_utc: new Date(now).toISOString(),
    source: 'Append-only verified ESPN final-game reviews; live games are layered in the browser and labelled live.',
    fantasy_formula: 'ESPN default: PTS + 3PM + 2 FGM - FGA + FTM - FTA + REB + 2 AST + 4 STL + 4 BLK - 2 TOV',
    days: days.sort((a, b) => a.melbourne_date.localeCompare(b.melbourne_date)), players };
  const destination = path.join(DATA, 'performance-centre.json');
  if (fs.existsSync(destination)) {
    const previous = readJson(destination);
    const comparable = value => Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'generated_at_utc'));
    if (A.stableStringify(comparable(previous)) === A.stableStringify(comparable(payload))) return previous;
  }
  writeAtomic(destination, payload);
  return payload;
}

function recordsForLedger() {
  const records = [];
  for (const file of lockFiles()) {
    const lock = readJson(file), date = lock?.scope?.melbourne_date;
    if (!date) continue;
    const reviewPath = reviewFile(date), review = fs.existsSync(reviewPath) ? readJson(reviewPath) : null;
    const completedGames = review?.games?.length || 0, expectedGames = Number(lock.scope.games || lock.forecasts?.length || 0);
    const lockRelative = path.relative(ROOT, file).replaceAll(path.sep, '/');
    const reviewRelative = review ? path.relative(ROOT, reviewPath).replaceAll(path.sep, '/') : null;
    records.push({
      review,
      entry: {
        melbourne_date: date,
        status: completedGames === expectedGames && expectedGames > 0 ? 'reviewed' : completedGames ? 'partially_reviewed' : 'locked_awaiting_results',
        game_count: lock.scope.games,
        reviewed_game_count: completedGames,
        pending_game_count: Math.max(0, expectedGames - completedGames),
        player_projection_count: lock.scope.player_projections ?? (lock.forecasts || []).reduce((n, game) => n + (game.v9_player_projections || []).length, 0),
        locked_at_utc: lock.locked_at_utc, locked_at_melbourne: lock.locked_at_melbourne,
        lock_path: lockRelative, lock_sha256: A.sha256(fs.readFileSync(file)),
        lock_integrity_sha256: lock.integrity?.canonical_payload_without_integrity || null,
        review_path: reviewRelative,
        review_sha256: review ? A.sha256(fs.readFileSync(reviewPath)) : null,
        summary: review?.summary || null,
      },
    });
  }
  return records.sort((a, b) => a.entry.melbourne_date.localeCompare(b.entry.melbourne_date));
}

function buildLedger(now) {
  const ledger = A.aggregateReviews(recordsForLedger(), now);
  const file = path.join(DATA, 'audit-ledger.json');
  if (fs.existsSync(file)) {
    const previous = readJson(file);
    const comparable = value => Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'generated_at_utc'));
    if (A.stableStringify(comparable(previous)) === A.stableStringify(comparable(ledger))) {
      console.log('Audit ledger is unchanged');
      return previous;
    }
  }
  writeAtomic(file, ledger);
  return ledger;
}

function verifyLockedProbability(reviewGame, modelId, lockedProbability, context, required = false) {
  const probability = finite(lockedProbability);
  const graded = reviewGame.models?.[modelId];
  if (probability === null) {
    if (required || graded) throw new Error(`Missing locked probability for ${context}/${modelId}`);
    return;
  }
  if (probability < 0 || probability > 1 || !graded || graded.p !== probability) {
    throw new Error(`Graded probability differs from immutable lock for ${context}/${modelId}`);
  }
}

function verifyReviewProbabilities(forecast, challengeGame, reviewGame) {
  const gameId = String(forecast.game_id);
  if (String(reviewGame.game_id) !== gameId) throw new Error(`Reviewed game does not match lock for ${gameId}`);
  verifyLockedProbability(reviewGame, forecast.primary_forecast?.model_id || 'production_elo_v7',
    forecast.primary_forecast?.home_win_probability, gameId, true);
  const scoreMachine=forecast.research_score_machine;
  verifyLockedProbability(reviewGame,'joint_score_margin_v1',
    scoreMachine?.available===true?scoreMachine.home_win_probability:null,gameId);
  const monteCarlo = forecast.diagnostics?.monte_carlo;
  verifyLockedProbability(reviewGame, monteCarlo?.model_id || 'possession_monte_carlo_v5',
    monteCarlo?.home_win_probability, gameId);
  const roster = forecast.diagnostics?.roster_aware_beta;
  verifyLockedProbability(reviewGame, roster?.model_id || 'roster_beta_v1',
    roster?.home_win_probability, gameId);
  for (const modelId of C.ALL_IDS) {
    const prediction = challengeGame ? challengeGame.predictions?.[modelId] : forecast.challenge_predictions?.[modelId];
    if (!prediction) {
      if (reviewGame.models?.[modelId]) throw new Error(`Unexpected graded challenge model for ${gameId}/${modelId}`);
      continue;
    }
    verifyLockedProbability(reviewGame, modelId,
      prediction.available === true ? prediction.home_win_probability : null,
      gameId);
  }
}

function verifyAll() {
  const lockRecords = new Map();
  for (const file of lockFiles()) {
    const value = readJson(file);
    if (!A.verifyIntegrity(value)) throw new Error(`Lock integrity failed: ${path.relative(ROOT, file)}`);
    if (!value.scope?.melbourne_date || !(value.forecasts || []).length) throw new Error(`Lock coverage failed: ${path.relative(ROOT, file)}`);
    const relative = path.relative(ROOT, file).replaceAll(path.sep, '/');
    lockRecords.set(relative, { file, relative, value, sha256: A.sha256(fs.readFileSync(file)) });
  }
  const dailyReviews = filesUnder(path.join(AUDIT, 'reviews'), 'review.json');
  for (const file of dailyReviews) {
    const review = readJson(file), relative = path.relative(ROOT, file).replaceAll(path.sep, '/');
    if (!A.verifyIntegrity(review)) throw new Error(`Review integrity failed: ${relative}`);
    if (review.source_lock_integrity_sha256) {
      const source = [...lockRecords.values()].find(record =>
        record.value.scope.melbourne_date === review.melbourne_date &&
        record.value.integrity?.canonical_payload_without_integrity === review.source_lock_integrity_sha256);
      if (!source) throw new Error(`Daily review source lock mismatch: ${relative}`);
      const challenge = challengeLockForDate(review.melbourne_date, source.file, source.value);
      const challengeGames = new Map((challenge?.value.games || []).map(game => [String(game.game_id), game]));
      for (const game of review.games || []) {
        const forecast = source.value.forecasts.find(item => String(item.game_id) === String(game.game_id));
        if (!forecast) throw new Error(`Daily review contains an unlocked game: ${relative}/${game.game_id}`);
        verifyReviewProbabilities(forecast, challengeGames.get(String(game.game_id)), game);
      }
    }
  }
  const gameReviews = fs.existsSync(path.join(AUDIT, 'reviews')) ? fs.readdirSync(path.join(AUDIT, 'reviews'), { withFileTypes: true }).flatMap(entry =>
    entry.isDirectory() ? gameReviewFiles(entry.name) : []) : [];
  for (const file of gameReviews) {
    const artifact = readJson(file), relative = path.relative(ROOT, file).replaceAll(path.sep, '/');
    if (!A.verifyIntegrity(artifact) || artifact.schema !== 'nba-twin-lab-game-review-v1' ||
        !Array.isArray(artifact.games) || artifact.games.length !== 1) {
      throw new Error(`Game review integrity failed: ${relative}`);
    }
    const source = lockRecords.get(artifact.source_lock_path);
    if (!source || artifact.melbourne_date !== source.value.scope.melbourne_date ||
        artifact.source_lock_sha256 !== source.sha256 ||
        artifact.source_lock_integrity_sha256 !== source.value.integrity?.canonical_payload_without_integrity) {
      throw new Error(`Game review source lock mismatch: ${relative}`);
    }
    const challenge = challengeLockForDate(artifact.melbourne_date, source.file, source.value);
    const expectedChallengePath = challenge ? path.relative(ROOT, challenge.file).replaceAll(path.sep, '/') : null;
    const expectedChallengeHash = challenge ? A.sha256(fs.readFileSync(challenge.file)) : null;
    if ((artifact.challenge_lock_path || null) !== expectedChallengePath ||
        (artifact.challenge_lock_sha256 || null) !== expectedChallengeHash) {
      throw new Error(`Game review challenger sidecar hash mismatch: ${relative}`);
    }
    const game = artifact.games[0];
    const forecast = source.value.forecasts.find(item => String(item.game_id) === String(artifact.game_id));
    if (!forecast || String(game.game_id) !== String(artifact.game_id)) {
      throw new Error(`Game review does not match a locked game: ${relative}`);
    }
    const challengeGame = challenge?.value.games.find(item => String(item.game_id) === String(artifact.game_id));
    verifyReviewProbabilities(forecast, challengeGame, game);
  }
  const ledger = readJson(path.join(DATA, 'audit-ledger.json'));
  if (ledger.schema !== 'nba-twin-lab-audit-ledger-v2' || !Array.isArray(ledger.entries)) throw new Error('Ledger schema invalid');
  for (const entry of ledger.entries) {
    const source = lockRecords.get(entry.lock_path);
    if (!source || entry.lock_sha256 !== source.sha256 ||
        entry.lock_integrity_sha256 !== source.value.integrity?.canonical_payload_without_integrity) {
      throw new Error(`Ledger forecast-lock hash mismatch: ${entry.lock_path}`);
    }
    if (entry.review_path) {
      const reviewFilePath = path.join(ROOT, entry.review_path);
      if (!fs.existsSync(reviewFilePath) || entry.review_sha256 !== A.sha256(fs.readFileSync(reviewFilePath))) {
        throw new Error(`Ledger postgame-review hash mismatch: ${entry.review_path}`);
      }
    }
  }
  console.log(`Verified ${lockRecords.size} immutable lock(s), original lock hashes, ${gameReviews.length} append-only game review(s), challenger sidecar hashes, locked-to-graded probabilities, ${dailyReviews.length} daily roll-up(s), and the derived ledger`);
}

function reviewWindowOpen(lock, now) {
  const lastTip = Date.parse(lock?.scope?.last_tip_utc);
  return Number.isFinite(lastTip) && Number.isFinite(now) &&
    now >= lastTip + 4 * 3600000 && A.melbourneHour(now) >= 18;
}

async function run(options) {
  const now = Date.parse(options.now || new Date().toISOString());
  if (!Number.isFinite(now)) throw new Error('Invalid --now timestamp');
  const date = options.date || process.env.TRACKER_DATE || A.melbourneDate(now);
  let existing = lockForDate(date);
  if (existing) {
    console.log(`Forecast already locked for ${date}: ${path.relative(ROOT, existing)}`);
  } else {
    try {
      const lock = buildLock({ date, now, simulations: options.simulations || Number(process.env.TRACKER_SIMULATIONS) || DEFAULT_SIMULATIONS });
      const destination = path.join(AUDIT, 'snapshots', date, 'forecast.lock.json');
      if (options.dryRun) console.log(JSON.stringify(lock, null, 2));
      else {
        writeExclusive(destination, lock);
        console.log(`Locked ${lock.scope.games} games and ${lock.scope.player_projections} player projections for ${date}`);
        existing = destination;
      }
    } catch (error) {
      if (error.code === 'OUTSIDE_WINDOW') console.log(`No lock written: ${error.message}`);
      else {
        const gameData = readJson(path.join(DATA, 'games.json'));
        const target = (gameData.games || []).filter(game => A.melbourneDate(game.date) === date);
        const firstTip = target.length ? Math.min(...target.map(game => Date.parse(game.date))) : null;
        if (firstTip && now > firstTip + 10 * 60000) console.error(`LOCK GAP ${date}: ${error.message}`);
        else console.log(`Lock deferred safely: ${error.message}`);
      }
    }
  }
  for (const file of lockFiles()) {
    try {
      const result = await processFinalGames(file, now, { dryRun: options.dryRun });
      if (result.reviewed.length) console.log(`Reviewed ${result.reviewed.length} newly completed game(s) for ${readJson(file).scope.melbourne_date}`);
      if (result.pending.length) console.log(`${result.pending.length} game(s) remain pending final/complete box data for ${readJson(file).scope.melbourne_date}`);
    } catch (error) { console.log(`Per-game review deferred safely: ${error.message}`); }
  }
  if (!options.dryRun) { buildLedger(now); buildPerformanceCentre(now); }
}

async function main() {
  const options = parseArgs(process.argv);
  if (options.command === 'run') await run(options);
  else if (options.command === 'lock-preview') console.log(JSON.stringify(buildLock({
    date: options.date || A.melbourneDate(options.now || Date.now()),
    now: Date.parse(options.now || new Date().toISOString()), simulations: options.simulations || DEFAULT_SIMULATIONS,
  }), null, 2));
  else if (options.command === 'index') buildLedger(Date.parse(options.now || new Date().toISOString()));
  else if (options.command === 'verify') verifyAll();
  else throw new Error(`Unknown command: ${options.command}`);
}

if (require.main === module) main().catch(error => { console.error(error.stack || error.message); process.exit(1); });

module.exports = {
  buildLock, buildReview, buildLedger, buildPerformanceCentre, processFinalGames, derivedReviewForDate,
  verifyAll, verifyChallengeLink, verifyReviewProbabilities, reviewWindowOpen, v9Projections, contextProfiles, trainedScoreMachine, gameReviewFile,
  LOCK_MINUTES_BEFORE_TIP, LOCK_MAX_MINUTES_BEFORE_TIP,
};
