'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const A = require('./audit-core.cjs');

const ROOT = path.join(__dirname, '..');
const OBSERVATION_SCHEMA = 'nba-twin-lab-player-game-observation-v1';
const INDEX_SCHEMA = 'nba-twin-lab-player-game-history-index-v1';
const TRENDS_SCHEMA = 'nba-twin-lab-player-trends-v1';
const SOURCE_NAME = 'ESPN public NBA summary (unofficial)';
const SUMMARY_ENDPOINT = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary';
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_SCOREBOARD_AGE_MS = 48 * 60 * 60 * 1000;
const TREND_WINDOW_DAYS = 30;
const TREND_MIN_GAMES = 5;
const STAT_FIELDS = [
  'minutes', 'pts', 'reb', 'ast', 'three_pm', 'fgm', 'fga', 'ftm', 'fta',
  'stl', 'blk', 'tov', 'oreb', 'dreb', 'plus_minus', 'fpts',
];
const TREND_FIELDS = {
  points: 'pts',
  rebounds: 'reb',
  assists: 'ast',
  three_pointers: 'three_pm',
  fantasy_points: 'fpts',
};

const finite = value => value !== null && value !== undefined && value !== '' &&
  Number.isFinite(Number(value)) ? Number(value) : null;
const iso = (value, label) => {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error(`Invalid ${label}`);
  return date.toISOString();
};
const sha256Bytes = value => crypto.createHash('sha256').update(value).digest('hex');
const jsonText = value => JSON.stringify(value, null, 2) + '\n';
const aliasAbbr = value => A.canonicalTeam(value);
const normalizedValue = observation => ({
  game_id: observation.game_id,
  event_at_utc: observation.event_at_utc,
  home: observation.home,
  away: observation.away,
  players: observation.players,
});

function playersFromSummary(parsed, game) {
  const teamIds = {
    [aliasAbbr(game.home.abbr)]: game.home.id == null ? null : String(game.home.id),
    [aliasAbbr(game.away.abbr)]: game.away.id == null ? null : String(game.away.id),
  };
  const output = [];
  const seenIds = new Set();
  for (const abbr of [parsed.away.abbr, parsed.home.abbr]) {
    for (const player of parsed.teams[abbr]) {
      const providerId = String(player.provider_player_id || '');
      const playerId = /^\d+$/.test(providerId) ? providerId : null;
      if (playerId && seenIds.has(playerId)) {
        throw new Error(`ESPN athlete ID ${playerId} appears more than once in game ${parsed.game_id}`);
      }
      if (playerId) seenIds.add(playerId);
      const name = String(player.name || '').trim() || null;
      const didNotPlay = player.did_not_play === true;
      const stats = Object.fromEntries(STAT_FIELDS.map(key => [
        key,
        didNotPlay ? null : finite(key === 'minutes' ? player.minutes : player[key]),
      ]));
      for (const [key, value] of Object.entries(stats)) {
        if (value !== null && key !== 'plus_minus' && key !== 'fpts' && value < 0) {
          throw new Error(`ESPN returned a negative ${key} value for athlete ${playerId || 'without an ID'}`);
        }
      }
      output.push({
        player_id: playerId,
        name,
        identity_status: playerId && name ? 'verified' : 'unresolved',
        team: { id: teamIds[abbr] || null, abbr },
        availability: didNotPlay ? 'dnp' : player.played ? 'played' : 'unavailable',
        dnp_reason: didNotPlay ? String(player.dnp_reason || 'Not specified') : null,
        stats,
      });
    }
  }
  return output;
}

function validatePlayerTables(payload, game) {
  const expected = new Map([
    [aliasAbbr(game.home.abbr), game.home],
    [aliasAbbr(game.away.abbr), game.away],
  ]);
  if (expected.size !== 2) throw new Error(`Scoreboard game ${game.id} does not have two distinct teams`);
  const groups = payload?.boxscore?.players;
  if (!Array.isArray(groups)) throw new Error(`ESPN summary has no player tables for game ${game.id}`);
  const seen = new Set();
  for (const group of groups) {
    const abbr = aliasAbbr(group?.team?.abbreviation);
    const scoreboardTeam = expected.get(abbr);
    if (!scoreboardTeam) throw new Error(`ESPN summary has an unexpected player team for game ${game.id}`);
    if (seen.has(abbr)) throw new Error(`ESPN summary has duplicate ${abbr} player tables for game ${game.id}`);
    seen.add(abbr);
    if (scoreboardTeam.id != null && group.team?.id != null &&
        String(scoreboardTeam.id) !== String(group.team.id)) {
      throw new Error(`ESPN ${abbr} player-table team ID does not match scoreboard game ${game.id}`);
    }
    if (!Array.isArray(group.statistics) ||
        !group.statistics.some(item => Array.isArray(item?.labels) && Array.isArray(item?.athletes))) {
      throw new Error(`ESPN ${abbr} player table is incomplete for game ${game.id}`);
    }
  }
  if (seen.size !== expected.size) throw new Error(`ESPN summary is missing a team player table for game ${game.id}`);
}

function normalizeSummary(game, responseBody, retrievedAtUtc, scoreboardSnapshotAtUtc) {
  const rawBody = typeof responseBody === 'string' ? responseBody : JSON.stringify(responseBody);
  const payload = typeof responseBody === 'string' ? JSON.parse(responseBody) : responseBody;
  const competition = payload?.header?.competitions?.[0];
  const sourceGameId = String(competition?.id || payload?.header?.id || '');
  const gameId = String(game?.id || '');
  if (!/^\d+$/.test(gameId) || sourceGameId !== gameId) {
    throw new Error(`ESPN summary game ID does not match scoreboard game ${gameId || '(missing)'}`);
  }

  const homeAbbr = aliasAbbr(game?.home?.abbr);
  const awayAbbr = aliasAbbr(game?.away?.abbr);
  validatePlayerTables(payload, game);
  const parsed = A.parseEspnSummary(payload, gameId);
  if (parsed.home.abbr !== homeAbbr || parsed.away.abbr !== awayAbbr) {
    throw new Error(`ESPN summary teams do not match scoreboard game ${gameId}`);
  }
  const scoreboardHome = finite(game.homeScore);
  const scoreboardAway = finite(game.awayScore);
  if (scoreboardHome === null || scoreboardAway === null ||
      parsed.home.score !== scoreboardHome || parsed.away.score !== scoreboardAway) {
    throw new Error(`ESPN summary final score disagrees with scoreboard game ${gameId}`);
  }

  const competitors = competition.competitors || [];
  for (const [side, team] of [['home', game.home], ['away', game.away]]) {
    const competitor = competitors.find(item => item.homeAway === side);
    if (team?.id != null && competitor?.team?.id != null &&
        String(team.id) !== String(competitor.team.id)) {
      throw new Error(`ESPN ${side} team ID does not match scoreboard game ${gameId}`);
    }
  }

  const scoreboardDate = iso(game.date, `scoreboard date for game ${gameId}`);
  const providerDate = competition.date ? iso(competition.date, `ESPN event date for game ${gameId}`) : null;
  const eventAtUtc = providerDate || scoreboardDate;
  const retrieved = iso(retrievedAtUtc, 'local retrieval timestamp');
  if (Date.parse(eventAtUtc) > Date.parse(retrieved)) {
    throw new Error(`ESPN final game ${gameId} has an event date after its local retrieval`);
  }
  const sourceExtract = {
    header: payload.header,
    boxscore_players: payload.boxscore?.players,
  };
  if (!Array.isArray(sourceExtract.boxscore_players)) {
    throw new Error(`ESPN summary has no player tables for game ${gameId}`);
  }
  const homeId = game.home?.id == null ? null : String(game.home.id);
  const awayId = game.away?.id == null ? null : String(game.away.id);
  const observation = {
    schema: OBSERVATION_SCHEMA,
    game_id: gameId,
    event_at_utc: eventAtUtc,
    event_date_source: providerDate ? 'ESPN summary event date' : 'ESPN scoreboard snapshot date',
    home: { id: homeId, abbr: parsed.home.abbr, score: parsed.home.score },
    away: { id: awayId, abbr: parsed.away.abbr, score: parsed.away.score },
    players: playersFromSummary(parsed, game),
    source: {
      name: SOURCE_NAME,
      url: `${SUMMARY_ENDPOINT}?event=${encodeURIComponent(gameId)}`,
      scoreboard_snapshot_at_utc: iso(scoreboardSnapshotAtUtc, 'scoreboard snapshot timestamp'),
      retrieved_at_utc: retrieved,
      response_sha256: sha256Bytes(rawBody),
      extract_sha256: A.sha256(sourceExtract),
    },
    source_extract: sourceExtract,
  };
  observation.normalized_sha256 = A.sha256(normalizedValue(observation));
  return observation;
}

function validateObservation(observation) {
  if (observation?.schema !== OBSERVATION_SCHEMA ||
      !/^\d+$/.test(String(observation.game_id || '')) ||
      !/^[a-f0-9]{64}$/.test(String(observation.normalized_sha256 || '')) ||
      !/^[a-f0-9]{64}$/.test(String(observation.source?.response_sha256 || '')) ||
      !/^[a-f0-9]{64}$/.test(String(observation.source?.extract_sha256 || ''))) {
    throw new Error('Player-game observation schema or digest is invalid');
  }
  const eventAt = Date.parse(iso(observation.event_at_utc, 'observation event timestamp'));
  const retrievedAt = Date.parse(iso(observation.source.retrieved_at_utc, 'observation retrieval timestamp'));
  iso(observation.source.scoreboard_snapshot_at_utc, 'scoreboard snapshot timestamp');
  if (eventAt > retrievedAt) throw new Error(`Player-game observation ${observation.game_id} has an event date after local retrieval`);
  if (A.sha256(observation.source_extract) !== observation.source.extract_sha256) {
    throw new Error(`Player-game observation ${observation.game_id} source extract hash mismatch`);
  }
  if (A.sha256(normalizedValue(observation)) !== observation.normalized_sha256) {
    throw new Error(`Player-game observation ${observation.game_id} normalized hash mismatch`);
  }
  if (!Array.isArray(observation.players)) throw new Error(`Player-game observation ${observation.game_id} has no players`);
  const sourcePayload = {
    header: observation.source_extract.header,
    boxscore: { players: observation.source_extract.boxscore_players },
  };
  validatePlayerTables(sourcePayload, {
    id: observation.game_id,
    home: observation.home,
    away: observation.away,
  });
  const parsed = A.parseEspnSummary(sourcePayload, observation.game_id);
  if (parsed.home.abbr !== observation.home.abbr || parsed.away.abbr !== observation.away.abbr ||
      parsed.home.score !== observation.home.score || parsed.away.score !== observation.away.score) {
    throw new Error(`Player-game observation ${observation.game_id} does not match its stored ESPN source extract`);
  }
  const game = {
    id: observation.game_id,
    home: observation.home,
    away: observation.away,
  };
  const players = playersFromSummary(parsed, game);
  if (A.sha256({ ...normalizedValue(observation), players }) !== observation.normalized_sha256) {
    throw new Error(`Player-game observation ${observation.game_id} is not reproducible from its ESPN source extract`);
  }
  return observation;
}

function observationFilename(observation) {
  const stamp = observation.source.retrieved_at_utc
    .replace(/[-:]/g, '').replace(/\.(\d{3})\d*Z$/, '$1Z').replace('Z', '');
  return `${observation.game_id}-${stamp}-${observation.normalized_sha256}.json`;
}

function readObservations(root) {
  const directory = path.join(root, 'data/player-game-history/observations');
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory).filter(name => name.endsWith('.json')).sort().map(name => {
    const file = path.join(directory, name);
    const body = fs.readFileSync(file, 'utf8');
    const observation = validateObservation(JSON.parse(body));
    if (name !== observationFilename(observation)) {
      throw new Error(`Player-game observation filename does not match its content: ${name}`);
    }
    return { path: path.relative(root, file).split(path.sep).join('/'), body, observation };
  });
}

function latestByGame(observations, asOfUtc = null) {
  const cutoff = asOfUtc === null ? Infinity : Date.parse(iso(asOfUtc, 'history cutoff'));
  const latest = new Map();
  for (const item of observations) {
    const observation = item.observation || item;
    const retrieved = Date.parse(observation.source.retrieved_at_utc);
    const event = Date.parse(observation.event_at_utc);
    if (retrieved > cutoff || event > cutoff) continue;
    const prior = latest.get(observation.game_id);
    if (!prior || Date.parse(prior.source.retrieved_at_utc) < retrieved) {
      latest.set(observation.game_id, observation);
    }
  }
  return latest;
}

function averageMetric(games, field, required) {
  const values = games.map(game => finite(game.stats?.[field])).filter(value => value !== null);
  const available = values.length >= required;
  const mean = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  return {
    available,
    sample_size: values.length,
    required_games: required,
    average: available ? Math.round(mean * 10) / 10 : null,
  };
}

function buildTrends(observations, asOfUtc, options = {}) {
  const asOf = iso(asOfUtc, 'trend as-of timestamp');
  const minimumGames = options.minimumGames ?? TREND_MIN_GAMES;
  const windowDays = options.windowDays ?? TREND_WINDOW_DAYS;
  if (!Number.isInteger(minimumGames) || minimumGames < 2 ||
      !Number.isInteger(windowDays) || windowDays < 1) {
    throw new Error('Trend sample and window requirements must be positive integers');
  }
  const cutoff = Date.parse(asOf);
  const windowStart = cutoff - windowDays * DAY_MS;
  const byPlayer = new Map();
  const currentGames = [...latestByGame(observations, asOf).values()];
  for (const game of currentGames) {
    const eventAt = Date.parse(game.event_at_utc);
    if (eventAt < cutoff - 60 * DAY_MS) continue;
    for (const player of game.players) {
      if (player.identity_status !== 'verified' || !player.player_id || !player.name ||
          player.availability !== 'played') continue;
      const rows = byPlayer.get(player.player_id) || [];
      rows.push({
        game_id: game.game_id,
        event_at_utc: game.event_at_utc,
        retrieved_at_utc: game.source.retrieved_at_utc,
        name: player.name,
        team: player.team,
        stats: player.stats,
      });
      byPlayer.set(player.player_id, rows);
    }
  }

  const players = [];
  const identityConflicts = [];
  for (const [playerId, entries] of byPlayer) {
    entries.sort((a, b) => Date.parse(a.event_at_utc) - Date.parse(b.event_at_utc));
    const aliases = [...new Set(entries.map(entry => A.normalizeName(entry.name)))];
    if (aliases.length > 1) {
      identityConflicts.push({
        player_id: playerId,
        observed_names: [...new Set(entries.map(entry => entry.name))].sort(),
        reason: 'One ESPN athlete ID has materially different normalized names in the selected window.',
      });
      continue;
    }
    const rollingWindow = entries.filter(entry => Date.parse(entry.event_at_utc) >= windowStart);
    const recent = rollingWindow.slice(-minimumGames);
    if (recent.length < minimumGames) continue;
    const metrics = Object.fromEntries(Object.entries(TREND_FIELDS).map(([name, field]) =>
      [name, averageMetric(recent, field, minimumGames)]));
    const last60Days = entries;
    let recentForm = {
      available: false,
      sample_size: last60Days.length,
      required_games: 2 * minimumGames,
      points_change: null,
      fantasy_points_change: null,
    };
    if (last60Days.length >= 2 * minimumGames) {
      const previous = last60Days.slice(-(2 * minimumGames), -minimumGames);
      const current = last60Days.slice(-minimumGames);
      const pointsPrior = averageMetric(previous, 'pts', minimumGames);
      const pointsCurrent = averageMetric(current, 'pts', minimumGames);
      const fantasyPrior = averageMetric(previous, 'fpts', minimumGames);
      const fantasyCurrent = averageMetric(current, 'fpts', minimumGames);
      recentForm = {
        available: pointsPrior.available && pointsCurrent.available,
        sample_size: last60Days.length,
        required_games: 2 * minimumGames,
        points_change: pointsPrior.available && pointsCurrent.available
          ? Math.round((pointsCurrent.average - pointsPrior.average) * 10) / 10 : null,
        fantasy_points_change: fantasyPrior.available && fantasyCurrent.available
          ? Math.round((fantasyCurrent.average - fantasyPrior.average) * 10) / 10 : null,
      };
    }
    players.push({
      player_id: playerId,
      name: recent.at(-1).name,
      last_recorded_team: recent.at(-1).team,
      sample_size: recent.length,
      date_range: {
        start_utc: recent[0].event_at_utc,
        end_utc: recent.at(-1).event_at_utc,
      },
      game_ids: recent.map(entry => entry.game_id),
      metrics,
      recent_form: recentForm,
    });
  }
  players.sort((a, b) =>
    (b.metrics.points.average ?? -Infinity) - (a.metrics.points.average ?? -Infinity) ||
    a.player_id.localeCompare(b.player_id));
  return {
    schema: TRENDS_SCHEMA,
    generated_at_utc: asOf,
    as_of_utc: asOf,
    methodology: {
      source: SOURCE_NAME,
      observation_rule: 'Latest complete ESPN summary locally retrieved by the as-of timestamp; game event also must precede that timestamp.',
      window_days: windowDays,
      minimum_games: minimumGames,
      metric_rule: 'Averages use the latest eligible player appearances in the rolling window; missing stats and DNPs are excluded, never converted to zero.',
      recent_form_rule: `Last ${minimumGames} appearances are compared with the prior ${minimumGames} only when both groups are available within 60 days.`,
    },
    coverage: {
      verified_final_games: currentGames.length,
      players_meeting_minimum: players.length,
      identity_conflict_count: identityConflicts.length,
      window_start_utc: new Date(windowStart).toISOString(),
      window_end_utc: asOf,
    },
    identity_conflicts: identityConflicts,
    players,
  };
}

function writeAtomic(file, body) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.tmp`;
  try {
    fs.writeFileSync(temp, body, { flag: 'w' });
    fs.renameSync(temp, file);
  } catch (error) {
    if (fs.existsSync(temp)) fs.unlinkSync(temp);
    throw error;
  }
}

function writeExclusive(file, body) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  try {
    fs.writeFileSync(file, body, { flag: 'wx' });
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    if (fs.readFileSync(file, 'utf8') !== body) {
      throw new Error(`Refusing to overwrite a different immutable player-game artifact: ${file}`);
    }
  }
}

async function fetchSummary(gameId, options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') throw new Error('Node fetch is unavailable');
  const attempts = options.attempts ?? 3;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const url = `${SUMMARY_ENDPOINT}?event=${encodeURIComponent(gameId)}`;
      const response = await fetchImpl(url, {
        headers: { Accept: 'application/json', 'User-Agent': 'NBA-Twin-Lab-player-history/1.0' },
        signal: AbortSignal.timeout(15000),
      });
      const body = await response.text();
      if (!response.ok) throw new Error(`ESPN summary returned HTTP ${response.status}`);
      JSON.parse(body);
      return body;
    } catch (error) {
      if (attempt === attempts) throw error;
      await new Promise(resolve => setTimeout(resolve, (options.retryDelayMs ?? 400) * attempt));
    }
  }
  throw new Error(`Unable to retrieve ESPN summary for game ${gameId}`);
}

function readIndex(file) {
  if (!fs.existsSync(file)) return null;
  const index = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (index.schema !== INDEX_SCHEMA || !Number.isFinite(Date.parse(index.coverage_start_utc)) ||
      !Array.isArray(index.observations)) {
    throw new Error('Player-game history index is invalid; refusing to replace it');
  }
  return index;
}

function verifyIndex(index, observations) {
  if (!index) return;
  const byPath = new Map(observations.map(item => [item.path, item.body]));
  for (const entry of index.observations || []) {
    const body = byPath.get(entry.path);
    if (!body || sha256Bytes(body) !== entry.sha256) {
      throw new Error(`Player-game history index references a missing or changed observation: ${entry.path}`);
    }
  }
}

async function collect(options = {}) {
  const root = path.resolve(options.root || ROOT);
  const now = iso(options.now || new Date(), 'collection timestamp');
  const nowMs = Date.parse(now);
  const historyDirectory = path.join(root, 'data/player-game-history');
  const observationDirectory = path.join(historyDirectory, 'observations');
  const indexPath = path.join(historyDirectory, 'index.json');
  const trendsPath = path.join(historyDirectory, 'trends.json');
  const gamesPath = path.join(root, 'data/games.json');
  const gamesSnapshot = JSON.parse(fs.readFileSync(gamesPath, 'utf8'));
  const snapshotAt = Date.parse(gamesSnapshot.built_at_utc);
  if (!Number.isFinite(snapshotAt) || snapshotAt > nowMs ||
      nowMs - snapshotAt > MAX_SCOREBOARD_AGE_MS) {
    throw new Error('ESPN scoreboard snapshot is missing, future-dated, or older than 48 hours');
  }
  if (!Array.isArray(gamesSnapshot.games)) throw new Error('ESPN scoreboard snapshot has no games array');

  const initialBackfillDays = options.initialBackfillDays ?? 30;
  const correctionWindowDays = options.correctionWindowDays ?? 7;
  if (!Number.isInteger(initialBackfillDays) || initialBackfillDays < 1 ||
      !Number.isInteger(correctionWindowDays) || correctionWindowDays < 1) {
    throw new Error('Player-history collection windows must be positive integers');
  }
  const oldIndex = readIndex(indexPath);
  const coverageStart = oldIndex?.coverage_start_utc ||
    new Date(nowMs - initialBackfillDays * DAY_MS).toISOString();
  if (Date.parse(coverageStart) > nowMs) throw new Error('Player-history coverage start is future-dated');
  const existing = readObservations(root);
  verifyIndex(oldIndex, existing);
  const latest = latestByGame(existing, now);
  const ids = new Set();
  const candidates = [];
  const invalidGames = [];
  for (const game of gamesSnapshot.games) {
    const id = String(game.id || '');
    if (/^\d+$/.test(id)) {
      if (ids.has(id)) throw new Error(`Duplicate ESPN game ID in scoreboard snapshot: ${id}`);
      ids.add(id);
    } else if (game.status === 'final') {
      invalidGames.push({ game_id: id || null, reason: 'Final scoreboard game has no numeric ESPN game ID.' });
      continue;
    }
    if (game.status !== 'final') continue;
    const eventAt = Date.parse(game.date);
    if (!Number.isFinite(eventAt)) {
      invalidGames.push({ game_id: id, reason: 'Final scoreboard game has no valid event date.' });
      continue;
    }
    if (eventAt > nowMs || eventAt < Date.parse(coverageStart)) continue;
    const correctionWindow = eventAt >= nowMs - correctionWindowDays * DAY_MS;
    const notYetCollected = !latest.has(id) && eventAt >= Date.parse(coverageStart);
    if (notYetCollected || correctionWindow) candidates.push(game);
  }
  candidates.sort((a, b) => Date.parse(a.date) - Date.parse(b.date) || String(a.id).localeCompare(String(b.id)));

  const fetcher = options.fetchSummary || (gameId => fetchSummary(gameId, options.fetchOptions));
  const failures = [...invalidGames];
  let unchangedCount = 0;
  let appendedCount = 0;
  for (const [index, game] of candidates.entries()) {
    try {
      const body = await fetcher(String(game.id));
      const observation = normalizeSummary(game, body, now, gamesSnapshot.built_at_utc);
      const previous = latest.get(observation.game_id);
      if (previous?.normalized_sha256 === observation.normalized_sha256) {
        unchangedCount++;
      } else {
        const file = path.join(observationDirectory, observationFilename(observation));
        writeExclusive(file, jsonText(observation));
        latest.set(observation.game_id, observation);
        appendedCount++;
      }
    } catch (error) {
      failures.push({
        game_id: String(game.id),
        reason: String(error?.message || error),
      });
    }
    if (options.requestDelayMs ?? 250) {
      await new Promise(resolve => setTimeout(resolve, options.requestDelayMs ?? 250));
    }
  }

  const allObservations = readObservations(root);
  const artifacts = allObservations.map(item => ({
    path: item.path,
    sha256: sha256Bytes(item.body),
    game_id: item.observation.game_id,
    event_at_utc: item.observation.event_at_utc,
    retrieved_at_utc: item.observation.source.retrieved_at_utc,
    normalized_sha256: item.observation.normalized_sha256,
    player_count: item.observation.players.length,
  }));
  const latestGames = latestByGame(allObservations, now);
  const observationTimes = artifacts.map(item => Date.parse(item.retrieved_at_utc)).filter(Number.isFinite);
  const index = {
    schema: INDEX_SCHEMA,
    generated_at_utc: now,
    coverage_start_utc: coverageStart,
    source: {
      name: SOURCE_NAME,
      endpoint: SUMMARY_ENDPOINT,
      game_identity: 'ESPN event ID; each game observation must match the independent ESPN scoreboard ID, teams, team IDs where available, and final score.',
      player_identity: 'ESPN athlete ID; name-only matching is never used for trends.',
      immutability: 'Each new game version is written once. A corrected summary creates a new content-versioned observation; previous files are never replaced.',
    },
    observation_count: artifacts.length,
    verified_final_game_count: latestGames.size,
    latest_observation_utc: observationTimes.length ? new Date(Math.max(...observationTimes)).toISOString() : null,
    attempted_game_count: candidates.length,
    appended_observation_count: appendedCount,
    unchanged_game_count: unchangedCount,
    unavailable_games: failures,
    observations: artifacts,
  };
  const indexBody = jsonText(index);
  writeAtomic(indexPath, indexBody);
  const trends = buildTrends(allObservations, now);
  trends.source = {
    index_path: 'data/player-game-history/index.json',
    index_sha256: sha256Bytes(indexBody),
  };
  trends.coverage = {
    ...trends.coverage,
    coverage_start_utc: coverageStart,
    observation_count: artifacts.length,
    unavailable_game_count: failures.length,
  };
  writeAtomic(trendsPath, jsonText(trends));
  return {
    index,
    trends,
    appended_count: appendedCount,
    unchanged_count: unchangedCount,
    failure_count: failures.length,
  };
}

async function main(argv) {
  const command = argv[2] || 'collect';
  if (command !== 'collect') throw new Error(`Unknown command: ${command}`);
  const result = await collect();
  console.log(`Player history: ${result.appended_count} immutable observations added; ${result.unchanged_count} unchanged; ${result.failure_count} unavailable.`);
  for (const failure of result.index.unavailable_games) {
    console.warn(`Game ${failure.game_id || '(unknown)'}: ${failure.reason}`);
  }
}

if (require.main === module) {
  main(process.argv).catch(error => {
    console.error(error.message || error);
    process.exitCode = 1;
  });
}

module.exports = {
  OBSERVATION_SCHEMA,
  INDEX_SCHEMA,
  TRENDS_SCHEMA,
  normalizeSummary,
  validateObservation,
  observationFilename,
  readObservations,
  latestByGame,
  buildTrends,
  fetchSummary,
  collect,
};
