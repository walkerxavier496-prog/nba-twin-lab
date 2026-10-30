'use strict';

const crypto = require('node:crypto');

const STAT_KEYS = ['pts', 'reb', 'ast', 'three_pm'];
const MODEL_LABELS = {
  production_elo_v7: 'Production Elo v7',
  possession_monte_carlo_v5: 'Possession Monte Carlo v5',
  roster_beta_v1: 'Roster-aware beta v1',
  m1_elo: 'M1 · Elo baseline',
  m2_science: 'M2 · Basketball Science',
  m3_player_roster: 'M3 · Player / Roster',
  m4_monte_carlo: 'M4 · Possession Monte Carlo',
  m5_regularized_ml: 'M5 · Regularized ML',
  m6_ensemble: 'M6 · Nested weighted ensemble',
};

const mean = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const finite = value => value !== null && value !== '' && Number.isFinite(Number(value)) ? Number(value) : null;

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, stableValue(value[key])]));
  }
  return value;
}

function stableStringify(value) {
  return JSON.stringify(stableValue(value));
}

function sha256(value) {
  const body = typeof value === 'string' || Buffer.isBuffer(value) ? value : stableStringify(value);
  return crypto.createHash('sha256').update(body).digest('hex');
}

function withIntegrity(payload) {
  const clean = structuredClone(payload);
  delete clean.integrity;
  return {
    ...clean,
    integrity: {
      algorithm: 'sha256',
      canonical_payload_without_integrity: sha256(clean),
    },
  };
}

function verifyIntegrity(payload) {
  if (!payload?.integrity || payload.integrity.algorithm !== 'sha256') return false;
  const clean = structuredClone(payload);
  delete clean.integrity;
  const expected = payload.integrity.canonical_payload_without_integrity;
  // v1 practice locks used insertion-order JSON; v2 uses sorted-key canonical JSON.
  return sha256(clean) === expected || sha256(JSON.stringify(clean)) === expected;
}

function zoneParts(value, timeZone = 'Australia/Melbourne') {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error('Invalid timestamp');
  const parts = new Intl.DateTimeFormat('en-AU', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hourCycle: 'h23', timeZoneName: 'short',
  }).formatToParts(date);
  const get = type => parts.find(part => part.type === type)?.value;
  return {
    year: get('year'), month: get('month'), day: get('day'),
    hour: get('hour'), minute: get('minute'), second: get('second'),
    zone: get('timeZoneName'),
  };
}

function melbourneDate(value) {
  const p = zoneParts(value);
  return `${p.year}-${p.month}-${p.day}`;
}

function melbourneHour(value) {
  return Number(zoneParts(value).hour);
}

function melbourneDisplay(value) {
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Melbourne', weekday: 'long', year: 'numeric', month: 'long',
    day: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit', timeZoneName: 'short',
  }).format(date);
}

function normalizeName(value) {
  return String(value || '')
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[’'`.\-]/g, ' ').replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\b(jr|sr|ii|iii|iv)\b/g, ' ').replace(/\s+/g, ' ').trim();
}

function canonicalTeam(value) {
  const aliases = { GS: 'GSW', NY: 'NYK', SA: 'SAS', NO: 'NOP', UTAH: 'UTA', WSH: 'WAS', PHO: 'PHX', BRK: 'BKN', CHO: 'CHA' };
  const key = String(value || '').toUpperCase();
  return aliases[key] || key;
}

function parseMinutes(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  if (String(value).includes(':')) {
    const [minutes, seconds] = String(value).split(':').map(Number);
    return Number.isFinite(minutes) && Number.isFinite(seconds) ? minutes + seconds / 60 : null;
  }
  return finite(value);
}

function madeThrees(value) {
  if (typeof value === 'string' && value.includes('-')) return finite(value.split('-')[0]);
  return finite(value);
}

function parseEspnSummary(payload, expectedGameId = null) {
  const competition = payload?.header?.competitions?.[0];
  const competitors = competition?.competitors;
  const status = competition?.status?.type || payload?.header?.competitions?.[0]?.status?.type || {};
  if (!Array.isArray(competitors) || competitors.length !== 2) throw new Error('ESPN summary missing two competitors');
  if (!(status.completed === true || status.name === 'STATUS_FINAL' || status.state === 'post')) throw new Error('ESPN game is not final');
  const side = homeAway => competitors.find(item => item.homeAway === homeAway);
  const home = side('home'), away = side('away');
  const homeScore = finite(home?.score), awayScore = finite(away?.score);
  if (homeScore === null || awayScore === null || homeScore === awayScore) throw new Error('ESPN final score is invalid');
  const gameId = String(competition.id || payload?.header?.id || expectedGameId || '');
  if (expectedGameId && gameId && gameId !== String(expectedGameId)) throw new Error('ESPN summary game ID mismatch');
  const teams = {};
  for (const group of payload?.boxscore?.players || []) {
    const abbr = canonicalTeam(group?.team?.abbreviation);
    const table = group?.statistics?.find(item => Array.isArray(item.labels) && Array.isArray(item.athletes));
    if (!abbr || !table) continue;
    const index = Object.fromEntries(table.labels.map((label, i) => [String(label).toUpperCase(), i]));
    for (const required of ['MIN', 'PTS', '3PT', 'REB', 'AST']) {
      if (!Number.isInteger(index[required])) throw new Error(`ESPN box score missing ${required} for ${abbr}`);
    }
    teams[abbr] = table.athletes.map(row => {
      const stats = row.stats || [];
      const minutes = parseMinutes(stats[index.MIN]);
      const didNotPlay = row.didNotPlay === true;
      return {
        provider_player_id: String(row?.athlete?.id || ''),
        name: String(row?.athlete?.displayName || ''),
        normalized_name: normalizeName(row?.athlete?.displayName),
        played: !didNotPlay && minutes !== null && minutes > 0,
        did_not_play: didNotPlay,
        dnp_reason: didNotPlay ? String(row.reason || 'Not specified') : null,
        minutes,
        pts: finite(stats[index.PTS]),
        reb: finite(stats[index.REB]),
        ast: finite(stats[index.AST]),
        three_pm: madeThrees(stats[index['3PT']]),
      };
    });
  }
  const homeAbbr = canonicalTeam(home?.team?.abbreviation), awayAbbr = canonicalTeam(away?.team?.abbreviation);
  if (!teams[homeAbbr] || !teams[awayAbbr]) throw new Error('ESPN summary missing a team player table');
  for (const abbr of [homeAbbr, awayAbbr]) {
    if (teams[abbr].filter(player => player.played).length < 5) throw new Error(`ESPN box score has too few participants for ${abbr}`);
  }
  return {
    game_id: String(expectedGameId || gameId),
    home: { abbr: homeAbbr, score: homeScore },
    away: { abbr: awayAbbr, score: awayScore },
    teams,
  };
}

function probabilityMetrics(rows) {
  const valid = rows.filter(row => Number.isFinite(row.p) && (row.actual === 0 || row.actual === 1));
  return {
    count: valid.length,
    accuracy: mean(valid.map(row => (row.p >= 0.5) === (row.actual === 1) ? 1 : 0)),
    brier: mean(valid.map(row => (row.p - row.actual) ** 2)),
    log_loss: mean(valid.map(row => {
      const p = clamp(row.p, 1e-12, 1 - 1e-12);
      return -(row.actual * Math.log(p) + (1 - row.actual) * Math.log(1 - p));
    })),
    score_mae_per_team: mean(valid.filter(row => Number.isFinite(row.score_mae_per_team)).map(row => row.score_mae_per_team)),
  };
}

function calibration(rows, bins = 10) {
  const valid = rows.filter(row => Number.isFinite(row.p) && (row.actual === 0 || row.actual === 1));
  const output = [];
  for (let i = 0; i < bins; i++) {
    const low = i / bins, high = (i + 1) / bins;
    const selected = valid.filter(row => row.p >= low && (i === bins - 1 ? row.p <= high : row.p < high));
    if (!selected.length) continue;
    output.push({
      low, high, count: selected.length,
      mean_probability: mean(selected.map(row => row.p)),
      observed_rate: mean(selected.map(row => row.actual)),
    });
  }
  return output;
}

function modelRowsForGame(forecast, actual) {
  const actualHome = actual.home.score > actual.away.score ? 1 : 0;
  const entries = [{
    model_id: forecast?.primary_forecast?.model_id || 'production_elo_v7',
    label: MODEL_LABELS.production_elo_v7,
    p: finite(forecast?.primary_forecast?.home_win_probability),
    home_score: finite(forecast?.primary_forecast?.projected_score?.home),
    away_score: finite(forecast?.primary_forecast?.projected_score?.away),
  }];
  const mc = forecast?.diagnostics?.monte_carlo;
  if (mc && finite(mc.home_win_probability) !== null) entries.push({
    model_id: mc.model_id || 'possession_monte_carlo_v5',
    label: MODEL_LABELS.possession_monte_carlo_v5,
    p: finite(mc.home_win_probability),
    home_score: finite(mc.projected_score?.home), away_score: finite(mc.projected_score?.away),
  });
  const roster = forecast?.diagnostics?.roster_aware_beta;
  if (roster && finite(roster.home_win_probability) !== null) entries.push({
    model_id: roster.model_id || 'roster_beta_v1',
    label: MODEL_LABELS.roster_beta_v1,
    p: finite(roster.home_win_probability), home_score: null, away_score: null,
  });
  for (const [modelId, prediction] of Object.entries(forecast?.challenge_predictions || {})) {
    if (prediction?.available !== true || finite(prediction.home_win_probability) === null) continue;
    entries.push({
      model_id: modelId,
      label: MODEL_LABELS[modelId] || modelId,
      p: finite(prediction.home_win_probability),
      home_score: finite(prediction.projected_score?.home),
      away_score: finite(prediction.projected_score?.away),
    });
  }
  return entries.filter(entry => entry.p !== null).map(entry => ({
    ...entry,
    actual: actualHome,
    correct: (entry.p >= 0.5) === (actualHome === 1),
    brier: (entry.p - actualHome) ** 2,
    log_loss: -(actualHome * Math.log(clamp(entry.p, 1e-12, 1 - 1e-12)) + (1 - actualHome) * Math.log(clamp(1 - entry.p, 1e-12, 1 - 1e-12))),
    score_mae_per_team: entry.home_score === null || entry.away_score === null ? null :
      (Math.abs(entry.home_score - actual.home.score) + Math.abs(entry.away_score - actual.away.score)) / 2,
  }));
}

function scorePlayers(forecast, actual) {
  const actualByTeam = new Map(Object.entries(actual.teams).map(([abbr, players]) => [canonicalTeam(abbr), new Map(players.map(player => [player.normalized_name, player]))]));
  const rows = [];
  for (const projection of forecast.v9_player_projections || []) {
    const team = canonicalTeam(projection.team);
    const observed = actualByTeam.get(team)?.get(normalizeName(projection.name));
    let disposition = 'not_listed_excluded';
    if (observed?.played) disposition = 'played_scored';
    else if (observed?.did_not_play) disposition = 'dnp_excluded';
    const errors = {};
    for (const stat of STAT_KEYS) {
      const predicted = finite(projection?.projection_if_play?.[stat]);
      const value = finite(observed?.[stat]);
      errors[stat] = disposition === 'played_scored' && predicted !== null && value !== null ? Math.abs(predicted - value) : null;
    }
    rows.push({
      team, player_id: String(projection.player_id || ''), name: projection.name,
      disposition,
      actual: observed ? {
        provider_player_id: observed.provider_player_id, played: observed.played,
        did_not_play: observed.did_not_play, dnp_reason: observed.dnp_reason,
        minutes: observed.minutes, pts: observed.pts, reb: observed.reb, ast: observed.ast, three_pm: observed.three_pm,
      } : { played: false, did_not_play: null, reason: 'Player absent from provider box score; excluded, never treated as zero' },
      projection_if_play: projection.projection_if_play,
      absolute_errors: errors,
    });
  }
  return rows;
}

function scoreReview(lock, actuals, retrievedAt) {
  if (!verifyIntegrity(lock)) throw new Error('Forecast lock integrity check failed');
  const games = [];
  for (const forecast of lock.forecasts || []) {
    const actual = actuals[String(forecast.game_id)];
    if (!actual) throw new Error(`Missing final provider result for ${forecast.game_id}`);
    if (canonicalTeam(forecast.home.abbr) !== actual.home.abbr || canonicalTeam(forecast.away.abbr) !== actual.away.abbr) {
      throw new Error(`Provider teams do not match lock for ${forecast.game_id}`);
    }
    const modelRows = modelRowsForGame(forecast, actual);
    const playerRows = scorePlayers(forecast, actual);
    games.push({
      game_id: String(forecast.game_id), tip_utc: forecast.tip_utc,
      home: actual.home, away: actual.away,
      models: Object.fromEntries(modelRows.map(row => [row.model_id, row])),
      player_results: playerRows,
      player_counts: {
        projected: playerRows.length,
        played_scored: playerRows.filter(row => row.disposition === 'played_scored').length,
        dnp_excluded: playerRows.filter(row => row.disposition === 'dnp_excluded').length,
        not_listed_excluded: playerRows.filter(row => row.disposition === 'not_listed_excluded').length,
      },
    });
  }
  const modelIds = [...new Set(games.flatMap(game => Object.keys(game.models)))];
  const models = Object.fromEntries(modelIds.map(modelId => {
    const rows = games.map(game => game.models[modelId]).filter(Boolean);
    return [modelId, { label: rows[0]?.label || modelId, ...probabilityMetrics(rows), calibration: calibration(rows) }];
  }));
  const playerRows = games.flatMap(game => game.player_results);
  const playerStats = Object.fromEntries(STAT_KEYS.map(stat => {
    const values = playerRows.map(row => row.absolute_errors[stat]).filter(Number.isFinite);
    return [stat, { count: values.length, mae: mean(values) }];
  }));
  return withIntegrity({
    schema: 'nba-twin-lab-daily-review-v2',
    reviewed_at_utc: new Date(retrievedAt).toISOString(),
    melbourne_date: lock.scope.melbourne_date,
    lock_integrity_sha256: lock.integrity.canonical_payload_without_integrity,
    rules: {
      played: 'Score a projection only when the provider lists the player with minutes greater than zero.',
      dnp: 'Provider DNPs and players absent from the provider box score are excluded, never scored as zero.',
      missing: 'Missing games, non-final scores, malformed box scores, or fewer than five participants per team fail closed.',
    },
    providers: {
      game_and_player_results: {
        name: 'ESPN public NBA summary (unofficial)',
        status: 'undocumented; normalized result retained for reproducibility',
        retrieved_at_utc: new Date(retrievedAt).toISOString(),
      },
    },
    games, summary: { models, player_stats: playerStats },
  });
}

function aggregateReviews(records, generatedAt) {
  const modelRows = {}, playerErrors = Object.fromEntries(STAT_KEYS.map(stat => [stat, []]));
  for (const record of records) {
    for (const game of record.review?.games || []) {
      for (const [modelId, row] of Object.entries(game.models || {})) (modelRows[modelId] ||= []).push(row);
      for (const player of game.player_results || []) for (const stat of STAT_KEYS) {
        if (Number.isFinite(player.absolute_errors?.[stat])) playerErrors[stat].push(player.absolute_errors[stat]);
      }
    }
  }
  return {
    schema: 'nba-twin-lab-audit-ledger-v2',
    generated_at_utc: new Date(generatedAt).toISOString(),
    timezone: 'Australia/Melbourne',
    production_policy: 'production_elo_v7 remains production; research models are comparisons only and are never promoted automatically',
    entries: records.map(record => record.entry),
    longitudinal: {
      models: Object.fromEntries(Object.entries(modelRows).map(([id, rows]) => [id, {
        label: rows[0]?.label || id, ...probabilityMetrics(rows), calibration: calibration(rows),
      }])),
      player_stats: Object.fromEntries(STAT_KEYS.map(stat => [stat, { count: playerErrors[stat].length, mae: mean(playerErrors[stat]) }])),
    },
  };
}

module.exports = {
  STAT_KEYS, MODEL_LABELS, stableStringify, sha256, withIntegrity, verifyIntegrity,
  zoneParts, melbourneDate, melbourneHour, melbourneDisplay, normalizeName, canonicalTeam,
  parseMinutes, parseEspnSummary, probabilityMetrics, calibration, modelRowsForGame,
  scorePlayers, scoreReview, aggregateReviews,
};
