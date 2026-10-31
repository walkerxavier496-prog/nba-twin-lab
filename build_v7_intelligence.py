#!/usr/bin/env python3
"""Build leakage-safe rolling team/player features for NBA Twin Lab V7.

The upstream parquet files are queried from llimllib/nba_data, which is built
from stats.nba.com. Raw files are not redistributed. This script publishes
compact pregame aggregates and current inferred rotations. Player game logs
contain players who appeared, not official pregame injury designations;
availability is therefore always labelled inferred.
"""
from __future__ import annotations

import argparse
import collections
import datetime as dt
import json
import math
import pathlib
import statistics
import sys
import heapq
import os
from typing import Any

import duckdb
from historical_chronology import POLICY, prediction_time, result_availability, load_evidence

ROOT = pathlib.Path(__file__).parent
OUTPUT = ROOT / "data" / "v7-intelligence.json"
CURRENT_OUTPUT = ROOT / "data" / "v7-current.json"
HISTORY = ROOT / "data" / "historical-games.json"
CATALOG = "https://basketball-data.billmill.org/nba/nba.duckdb"
METADATA = "https://basketball-data.billmill.org/nba/metadata.json"
EVALUATED = tuple(range(2022, 2027))
ALIASES = {"GS": "GSW", "NY": "NYK", "SA": "SAS", "NO": "NOP",
           "UTAH": "UTA", "WSH": "WAS", "PHO": "PHX", "BRK": "BKN",
           "CHO": "CHA"}
PLAYER_STATS = ("points", "rebounds", "assists", "threes", "steals", "blocks", "turnovers")
METRICS = ("ortg", "drtg", "adj_ortg", "adj_drtg", "pace", "efg", "opp_efg", "three_rate",
           "opp_three_rate", "tov_rate", "opp_tov_rate", "orb_rate",
           "drb_rate", "ftr", "opp_ftr", "two_pct", "three_pct", "ft_pct")


def canonical(abbr: str) -> str:
    return ALIASES.get(abbr, abbr)


def finite(value: Any, fallback: float | None = None) -> float | None:
    try:
        number = float(value)
        return number if math.isfinite(number) else fallback
    except (TypeError, ValueError):
        return fallback


def ratio(a: Any, b: Any, fallback: float) -> float:
    x, y = finite(a), finite(b)
    return x / y if x is not None and y and y > 0 else fallback


def clipped(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def weighted_mean(rows: list[dict], key: str, decay: float = 1.0) -> float | None:
    total = weight = 0.0
    for age, row in enumerate(reversed(rows)):
        value = finite(row.get(key))
        if value is None:
            continue
        w = decay ** age
        total += value * w
        weight += w
    return total / weight if weight else None


def summarise(rows: list[dict], limit: int | None = None) -> dict:
    subset = rows[-limit:] if limit else rows
    decay = .82 if limit else 1.0
    return {"games": len(subset), **{key: weighted_mean(subset, key, decay)
                                      for key in METRICS}}


def round_tree(value: Any) -> Any:
    if isinstance(value, float):
        return round(value, 5) if math.isfinite(value) else None
    if isinstance(value, dict):
        return {key: round_tree(item) for key, item in value.items()}
    if isinstance(value, list):
        return [round_tree(item) for item in value]
    return value


def fetch_rows(connection: duckdb.DuckDBPyConnection) -> tuple[list[dict], list[dict]]:
    team_sql = """
    SELECT l.season, l.game_id, CAST(l.game_date AS VARCHAR) game_date,
      l.team_id, l.opp_team_id, g.home_team_id, g.away_team_id,
      t.nba_abbrev, t.full_name, o.nba_abbrev opp_abbrev,
      l.pts, l.fgm, l.fga, l.fg3m, l.fg3a, l.ftm, l.fta,
      l.oreb, l.dreb, l.tov, l.off_rating, l.def_rating, l.pace,
      l.poss, l.efg_pct, l.tm_tov_pct, l.oreb_pct, l.dreb_pct, l.team_oreb
    FROM nba.team_game_logs l
    JOIN nba.games g USING (season, game_id)
    JOIN nba.team_seasons t ON t.season=l.season AND t.team_id=l.team_id
    JOIN nba.team_seasons o ON o.season=l.season AND o.team_id=l.opp_team_id
    WHERE l.season BETWEEN 2021 AND 2027 AND l.game_id LIKE '002%'
      AND t.is_nba AND o.is_nba
    ORDER BY l.season, l.game_date, l.game_id, l.team_id
    """
    player_sql = """
    SELECT l.season, l.game_id, CAST(l.game_date AS VARCHAR) game_date,
      l.player_id, p.name, l.team_id, l.opp_team_id, l.min, l.pts,
      l.fga, l.fta, l.fg3m, l.ast, l.stl, l.blk, l.tov, l.oreb, l.dreb, l.plus_minus,
      l.off_rating, l.def_rating, l.net_rating, l.usg_pct, l.ts_pct,
      l.efg_pct, l.pie
    FROM nba.player_game_logs l JOIN nba.players p USING (player_id)
    WHERE l.season BETWEEN 2021 AND 2027 AND l.game_id LIKE '002%'
    ORDER BY l.season, l.game_date, l.game_id, l.team_id, l.player_id
    """

    def records(sql: str) -> list[dict]:
        result = connection.execute(sql)
        names = [column[0] for column in result.description]
        return [dict(zip(names, row)) for row in result.fetchall()]

    return records(team_sql), records(player_sql)


def box_metrics(row: dict, opponent: dict) -> dict[str, float]:
    poss = finite(row.get("poss")) or (finite(row.get("fga"), 0) +
        .44 * finite(row.get("fta"), 0) + finite(row.get("tov"), 0) -
        finite(row.get("oreb"), 0))
    opp_poss = finite(opponent.get("poss")) or poss
    own_oreb = finite(row.get("oreb"), 0) + finite(row.get("team_oreb"), 0)
    opp_oreb = finite(opponent.get("oreb"), 0) + finite(opponent.get("team_oreb"), 0)
    ortg = 100 * finite(row.get("pts"), 0) / max(poss, 1)
    drtg = 100 * finite(opponent.get("pts"), 0) / max(opp_poss, 1)
    return {
        "ortg": ortg, "drtg": drtg,
        # Prior-season profiles use raw full-season values as the neutral
        # anchor; current-season rows are replaced with online opponent-
        # adjusted values immediately before they enter future state.
        "adj_ortg": ortg, "adj_drtg": drtg,
        "pace": (poss + opp_poss) / 2,
        "efg": ratio(finite(row.get("fgm"), 0) + .5 * finite(row.get("fg3m"), 0), row.get("fga"), .54),
        "opp_efg": ratio(finite(opponent.get("fgm"), 0) + .5 * finite(opponent.get("fg3m"), 0), opponent.get("fga"), .54),
        "three_rate": ratio(row.get("fg3a"), row.get("fga"), .40),
        "opp_three_rate": ratio(opponent.get("fg3a"), opponent.get("fga"), .40),
        "tov_rate": finite(row.get("tov"), 0) / max(poss, 1),
        "opp_tov_rate": finite(opponent.get("tov"), 0) / max(opp_poss, 1),
        "orb_rate": own_oreb / max(own_oreb + finite(opponent.get("dreb"), 0), 1),
        "drb_rate": finite(row.get("dreb"), 0) / max(finite(row.get("dreb"), 0) + opp_oreb, 1),
        "ftr": ratio(row.get("fta"), row.get("fga"), .25),
        "opp_ftr": ratio(opponent.get("fta"), opponent.get("fga"), .25),
        "two_pct": ratio(finite(row.get("fgm"), 0) - finite(row.get("fg3m"), 0), finite(row.get("fga"), 0) - finite(row.get("fg3a"), 0), .54),
        "three_pct": ratio(row.get("fg3m"), row.get("fg3a"), .36),
        "ft_pct": ratio(row.get("ftm"), row.get("fta"), .78),
    }


def player_game(row: dict) -> dict[str, float]:
    minutes = max(finite(row.get("min"), 0), 0)
    net = clipped(finite(row.get("net_rating"), 0), -25, 25)
    ts, usage = finite(row.get("ts_pct"), .56), finite(row.get("usg_pct"), .20)
    if usage <= 1:
        usage *= 100
    # Transparent, deliberately conservative proxy; this is not EPM or RAPM.
    impact = clipped(.32 * net + 18 * (ts - .56) + .08 * (usage - 20), -12, 12)
    raw = {"points": finite(row.get("pts"), 0),
           "rebounds": finite(row.get("oreb"), 0) + finite(row.get("dreb"), 0),
           "assists": finite(row.get("ast"), 0),
           "threes": finite(row.get("fg3m"), 0),
           "steals": finite(row.get("stl"), 0),
           "blocks": finite(row.get("blk"), 0),
           "turnovers": finite(row.get("tov"), 0)}
    return {"minutes": minutes, **raw,
            **{f"{stat}_per36": clipped(value * 36 / minutes, 0, cap)
               for stat, value, cap in ((stat, raw[stat], cap)
                   for stat, cap in (("points", 55), ("rebounds", 30),
                       ("assists", 22), ("threes", 12), ("steals", 9),
                       ("blocks", 9), ("turnovers", 12)))
               if minutes >= 5},
            "usage": usage, "ts": ts, "impact": impact,
            "off_rating": finite(row.get("off_rating"), 110),
            "def_rating": finite(row.get("def_rating"), 110)}


class PlayerState:
    def __init__(self, player_id: str, name: str, prior: list[dict] | None = None):
        self.player_id, self.name = player_id, name
        self.games = list(prior or [])[-20:]
        self.team_games_last_played = -99
        self.last_date: str | None = None

    def projection(self, team_games: int) -> dict:
        recent = self.games[-10:]
        minutes = weighted_mean(recent, "minutes", .84) or 0
        impact = weighted_mean(recent, "impact", .88) or 0
        usage = weighted_mean(recent, "usage", .88) or 0
        missed = max(0, team_games - self.team_games_last_played - 1)
        play_probability = (0.97, .68, .38, .16)[min(missed, 3)]
        status = "rotation inferred"
        if missed == 1:
            status = "missed last game · inferred uncertain"
        elif missed == 2:
            status = "missed 2 games · inferred unlikely"
        elif missed >= 3:
            status = f"missed {missed}+ games · inferred out of rotation"
        conditional_minutes = clipped(minutes, 0, 40)
        eligible = [game for game in recent if game.get("minutes", 0) >= 5]
        sufficient = len(eligible) >= 3
        rates = {stat: weighted_mean(eligible, f"{stat}_per36", .86)
                 if sufficient else None for stat in PLAYER_STATS}
        if_play = {stat: clipped(rate * conditional_minutes / 36, 0, 70)
                   if rate is not None else None for stat, rate in rates.items()}
        baseline = {stat: statistics.fmean(game[stat] for game in eligible)
                    if sufficient else None for stat in PLAYER_STATS}
        return {"player_id": self.player_id, "name": self.name,
                "expected_minutes": clipped(conditional_minutes * play_probability, 0, 40),
                "minutes_if_play": conditional_minutes,
                "play_probability": play_probability, "impact_proxy": impact,
                "usage": usage, "ts": weighted_mean(recent, "ts", .88),
                "stat_rates_per36": rates, "stats_if_play": if_play,
                "stats_unconditional": {stat: value * play_probability if value is not None else None
                                        for stat, value in if_play.items()},
                "baseline_last10": baseline,
                "observed_games": len(eligible),
                "missed_team_games": missed, "status": status,
                "availability": "inferred", "last_game": self.last_date}


def build_payload(connection: duckdb.DuckDBPyConnection, *, rows=None, as_of=None) -> dict:
    team_rows, player_rows = rows if rows is not None else fetch_rows(connection)
    team_abbr = {(row["season"], row["team_id"]): canonical(row["nba_abbrev"])
                 for row in team_rows}
    players_by_game: dict[tuple[int, str, str], list[dict]] = collections.defaultdict(list)
    for row in player_rows:
        players_by_game[(row["season"], row["game_id"], row["team_id"])].append(row)
    boxes: dict[tuple[int, str], list[dict]] = collections.defaultdict(list)
    for row in team_rows:
        row["nba_abbrev"] = canonical(row["nba_abbrev"])
        row["opp_abbrev"] = canonical(row["opp_abbrev"])
        boxes[(row["season"], row["game_id"])].append(row)

    local = json.loads(HISTORY.read_text(encoding="utf-8"))
    local_index: dict[tuple[int, tuple[str, str]], list[dict]] = collections.defaultdict(list)
    current_results = json.loads((ROOT / "data/games.json").read_text())
    proof_file = ROOT / "research-reviews/chronology-v1/inputs/result-availability.json"
    evidence = load_evidence(proof_file)
    unique_results = {str(g["id"]): g for g in local["games"] + current_results["games"]}
    for game in unique_results.values():
        observed = evidence.get(str(game["id"]))
        if observed and all(observed.get(k) == game.get(k) for k in ("homeScore", "awayScore")) and prediction_time(observed["date"]) == prediction_time(game["date"]):
            game = {**game, **observed}
        if game.get("status") == "final":
            pair = tuple(sorted((canonical(game["home"]["abbr"]), canonical(game["away"]["abbr"]))))
            local_index[(game["season"], pair)].append(game)

    prior_team: dict[tuple[int, str], dict] = {}
    prior_player: dict[tuple[int, str, str], list[dict]] = collections.defaultdict(list)
    season_games: dict[int, list[tuple[dict, dict]]] = collections.defaultdict(list)
    ordered_games: list[tuple[dict, dict, dict | None]] = []
    score_matches = 0
    used_result_ids = set()
    for (season, _game_id), rows in boxes.items():
        if len(rows) != 2:
            raise ValueError(f"{season} {_game_id} has {len(rows)} team rows")
        pair = tuple(sorted((rows[0]["nba_abbrev"], rows[1]["nba_abbrev"])))
        home = next((row for row in rows if row["team_id"] == row["home_team_id"]), None)
        away = next((row for row in rows if row["team_id"] == row["away_team_id"]), None)
        candidates = local_index.get((season, pair), [])
        source_date = dt.date.fromisoformat(rows[0]["game_date"])
        local_game = None
        if home and away:
            matches = [game for game in candidates
                if canonical(game["home"]["abbr"]) == home["nba_abbrev"]
                and canonical(game["away"]["abbr"]) == away["nba_abbrev"]
                and (game["homeScore"], game["awayScore"]) == (home["pts"], away["pts"])
                and abs((dt.date.fromisoformat(game["date"][:10]) - source_date).days) <= 1]
            if len(matches) > 1:
                raise ValueError(f"Ambiguous historical result identity for {season} {_game_id}")
            local_game = matches[0] if matches else None
        else:
            # Neutral-site NBA rows omit home/away. ESPN supplies the display
            # designation, so use the independently matching score record.
            matches = [game for game in candidates
                if sorted((game["homeScore"], game["awayScore"])) == sorted((rows[0]["pts"], rows[1]["pts"]))
                and abs((dt.date.fromisoformat(game["date"][:10]) - source_date).days) <= 1]
            if len(matches) > 1:
                raise ValueError("Ambiguous neutral-site historical result identity")
            local_game = matches[0] if matches else None
            if local_game:
                home_abbr = canonical(local_game["home"]["abbr"])
                home = next(row for row in rows if row["nba_abbrev"] == home_abbr)
                away = next(row for row in rows if row is not home)
        if local_game and season in EVALUATED:
            if local_game["id"] in used_result_ids:
                raise ValueError("Historical result matched more than once")
            used_result_ids.add(local_game["id"])
            score_matches += 1
        elif season in EVALUATED:
            raise ValueError(f"No independent score match for {season} {_game_id}")
        if home is None or away is None:
            home, away = rows
        season_games[season].append((home, away))
        ordered_games.append((home, away, local_game))
    expected_counts = collections.Counter(g["season"] for g in local["games"] if g["season"] in EVALUATED and g.get("status") == "final")
    expected_total = sum(expected_counts.values())
    if score_matches != expected_total:
        raise ValueError(f"Only {score_matches}/{expected_total} historical scores cross-validated")

    prior_ready = {}
    availability_by_game = {h["game_id"]: result_availability(g or {"date": h["game_date"]}) for h, a, g in ordered_games}
    for season, games in season_games.items():
        by_team: dict[str, list[dict]] = collections.defaultdict(list)
        for home, away in games:
            by_team[home["nba_abbrev"]].append(box_metrics(home, away))
            by_team[away["nba_abbrev"]].append(box_metrics(away, home))
        for abbr, rows in by_team.items():
            prior_team[(season + 1, abbr)] = summarise(rows)
            prior_ready[(season + 1, abbr)] = max(availability_by_game[h["game_id"]] for h, a in games if abbr in (h["nba_abbrev"], a["nba_abbrev"]))
    for row in player_rows:
        abbr = team_abbr.get((row["season"], row["team_id"]))
        if abbr:
            prior_player[(row["season"] + 1, abbr, row["player_id"])].append(player_game(row))

    team_history: dict[tuple[int, str], list[dict]] = collections.defaultdict(list)
    team_last_date: dict[tuple[int, str], str] = {}
    lineup_history: dict[tuple[int, str], list[float]] = collections.defaultdict(list)
    player_states: dict[tuple[int, str, str], PlayerState] = {}
    team_players: dict[tuple[int, str], set[str]] = collections.defaultdict(set)
    league_history: dict[int, list[float]] = collections.defaultdict(list)
    latest_availability = {}
    output_games: list[dict] = []
    rotation_history: list[dict] = []
    stat_errors: dict[int, dict[str, dict]] = collections.defaultdict(
        lambda: collections.defaultdict(lambda: {"count": 0, "sum_abs_error": 0.0,
                                                  "baseline_abs_error": 0.0}))
    participation: dict[int, dict[str, int]] = collections.defaultdict(
        lambda: {"actual_appearances": 0, "matched_projections": 0})
    names = {row["player_id"]: row["name"] for row in player_rows}

    def seed_prior_roster(season: int, abbr: str, cutoff) -> None:
        key = (season, abbr)
        if team_players[key] or prior_ready.get(key, cutoff) >= cutoff:
            return
        for (target, prior_abbr, player_id), logs in prior_player.items():
            if target == season and prior_abbr == abbr:
                state = PlayerState(player_id, names.get(player_id, player_id), logs)
                state.team_games_last_played = -1
                player_states[(season, abbr, player_id)] = state
                team_players[key].add(player_id)

    def snapshot(season: int, abbr: str, date: str, include_rotation: bool = False, cutoff=None) -> dict:
        key, rows = (season, abbr), team_history[(season, abbr)]
        cutoff = cutoff or prediction_time(date)
        prior = (prior_team.get((season, abbr)) if prior_ready.get((season, abbr), cutoff) < cutoff else None) or {"games": 0}
        last = team_last_date.get(key)
        rest = None if not last else max(0, (dt.date.fromisoformat(date) - dt.date.fromisoformat(last)).days - 1)
        projections = [player_states[(season, abbr, pid)].projection(len(rows))
                       for pid in team_players[key] if (season, abbr, pid) in player_states]
        projections.sort(key=lambda p: p["expected_minutes"], reverse=True)
        rotation = projections[:12]
        minute_total = sum(p["expected_minutes"] for p in rotation)
        scale = min(1.0, 240 / minute_total) if minute_total else 0
        for player in rotation:
            player["expected_minutes"] *= scale
        expected_lineup = sum(p["expected_minutes"] * p["impact_proxy"] for p in rotation) / 240 if rotation else 0
        baseline = statistics.fmean(lineup_history[key][-10:]) if lineup_history[key] else expected_lineup
        continuity = sum(p["expected_minutes"] for p in rotation if p["missed_team_games"] == 0) / 240
        result = {"as_of": date, "games": len(rows), "rest_days": rest,
                "information_cutoff_utc": cutoff.isoformat(), "chronology_policy": POLICY,
                "max_result_available_at_utc": latest_availability[season].isoformat() if season in latest_availability else None,
                "prior": prior, "last5": summarise(rows, 5),
                "last10": summarise(rows, 10), "season": summarise(rows),
                "league_ortg": statistics.fmean(league_history[season]) if league_history[season]
                    else finite(prior.get("ortg"), 112),
                "player_delta": expected_lineup - baseline,
                "rotation_continuity": clipped(continuity, 0, 1),
                "rotation_confidence": "established" if len(rows) >= 15 and minute_total >= 180 else "limited",
                "availability_source": "inferred from prior appearances; no official pregame injury archive"}
        if include_rotation:
            result["rotation"] = rotation
        return result

    def pregame_value(snap: dict, key: str) -> float:
        current, prior = snap["season"], snap["prior"]
        n, pseudo = int(current.get("games") or 0), 12
        a, b = finite(current.get(key)), finite(prior.get(key))
        if a is not None and b is not None:
            return (n * a + pseudo * b) / (n + pseudo)
        return a if a is not None else (b if b is not None else 112.0)

    pending = []
    def target_time(item):
        return prediction_time(item[2]["date"] if item[2] else item[0]["game_date"])

    def ingest(home, away, date, home_metrics, away_metrics, available):
        season = home["season"]
        latest_availability[season] = max(latest_availability.get(season, available), available)
        for row, metrics in ((home, home_metrics), (away, away_metrics)):
            abbr, key = row["nba_abbrev"], (season, row["nba_abbrev"])
            actual_lineup_total = 0.0
            for p_row in players_by_game[(season, row["game_id"], row["team_id"])]:
                p_key = (season, abbr, p_row["player_id"])
                state = player_states.get(p_key)
                if state is None:
                    state = PlayerState(p_row["player_id"], p_row["name"],
                                        prior_player.get((season, abbr, p_row["player_id"]), []) if prior_ready.get(key, available) < available else [])
                    player_states[p_key] = state
                projected = state.projection(len(team_history[key]))
                actual = player_game(p_row)
                actual_lineup_total += actual["minutes"] * projected["impact_proxy"]
                state.games = (state.games + [actual])[-20:]
                state.team_games_last_played = len(team_history[key])
                state.last_date = date
                team_players[key].add(p_row["player_id"])
            lineup_history[key].append(actual_lineup_total / 240)
            team_history[key].append(metrics)
            team_last_date[key] = date
        league_history[season].extend((home_metrics["ortg"], away_metrics["ortg"]))

    ordered_games.sort(key=lambda x: (target_time(x), x[0]["game_id"]))
    for home, away, local_game in ordered_games:
        season, date = home["season"], home["game_date"]
        if season < 2022:
            continue
        cutoff = target_time((home, away, local_game))
        while pending and pending[0][0] < cutoff:
            _available, _id, update = heapq.heappop(pending)
            ingest(*update, _available)
        h_abbr, a_abbr = home["nba_abbrev"], away["nba_abbrev"]
        seed_prior_roster(season, h_abbr, cutoff)
        seed_prior_roster(season, a_abbr, cutoff)
        # Emit projections before any player box score from this game is ingested.
        # The historical audit is conditional on actual participation because
        # the upstream feed omits official DNP and pregame injury statuses.
        include = season in EVALUATED or season == 2027
        hs, ass = snapshot(season, h_abbr, date, include, cutoff), snapshot(season, a_abbr, date, include, cutoff)
        for snap in (hs, ass):
            snap["information_cutoff_utc"] = cutoff.isoformat()
            snap["chronology_policy"] = POLICY
        if include:
            # Save only compact, inferred PRE-game rotation IDs/minutes for
            # point-in-time roster continuity research. Do not include target
            # game participation or box-score values.
            rotation_history.append({
                "season": season, "date": date,
                "result_id": local_game["id"] if local_game else home["game_id"],
                "home": {"abbr": h_abbr, "rotation": [
                    {"player_id": p["player_id"], "expected_minutes": p["expected_minutes"]}
                    for p in hs.get("rotation", [])]},
                "away": {"abbr": a_abbr, "rotation": [
                    {"player_id": p["player_id"], "expected_minutes": p["expected_minutes"]}
                    for p in ass.get("rotation", [])]}})
            for team_row, snap in ((home, hs), (away, ass)):
                candidates = {p["player_id"]: p for p in snap.get("rotation", [])}
                for actual_row in players_by_game[(season, team_row["game_id"], team_row["team_id"])]:
                    if (finite(actual_row.get("min"), 0) or 0) < 1:
                        continue
                    participation[season]["actual_appearances"] += 1
                    projected = candidates.get(actual_row["player_id"])
                    if projected is None or projected["stats_if_play"]["points"] is None:
                        continue
                    participation[season]["matched_projections"] += 1
                    for stat in PLAYER_STATS:
                        value = player_game(actual_row)[stat]
                        estimate = projected["stats_if_play"][stat]
                        baseline = projected["baseline_last10"][stat]
                        if estimate is None or baseline is None:
                            continue
                        agg = stat_errors[season][stat]
                        agg["count"] += 1
                        agg["sum_abs_error"] += abs(estimate - value)
                        agg["baseline_abs_error"] += abs(baseline - value)
            # Keep the existing historical team-feature dataset compact.
            if season in EVALUATED:
                hs.pop("rotation", None)
                ass.pop("rotation", None)
        if season in EVALUATED or season == 2027:
            output_games.append({"nba_game_id": home["game_id"],
                **{k: local_game[k] for k in ("result_available_at_utc", "result_availability_source", "result_availability_verified") if local_game and k in local_game},
                "result_id": local_game["id"] if local_game else home["game_id"],
                "date": date, "season": season,
                "prediction_at_utc": cutoff.isoformat(),
                "prediction_timestamp_source": "archived_tip" if local_game else "date_only_00_utc",
                "home": {"abbr": h_abbr, "name": home["full_name"]},
                "away": {"abbr": a_abbr, "name": away["full_name"]},
                "home_score": home["pts"], "away_score": away["pts"],
                "pregame": {"home": hs, "away": ass}})

        home_metrics, away_metrics = box_metrics(home, away), box_metrics(away, home)
        league = statistics.fmean(league_history[season]) if league_history[season] else statistics.fmean((pregame_value(hs, "ortg"), pregame_value(ass, "ortg")))
        home_metrics["adj_ortg"] = home_metrics["ortg"] - pregame_value(ass, "drtg") + league
        home_metrics["adj_drtg"] = home_metrics["drtg"] - pregame_value(ass, "ortg") + league
        away_metrics["adj_ortg"] = away_metrics["ortg"] - pregame_value(hs, "drtg") + league
        away_metrics["adj_drtg"] = away_metrics["drtg"] - pregame_value(hs, "ortg") + league
        available = result_availability(local_game or {"date": date})
        heapq.heappush(pending, (available, home["game_id"],
                                (home, away, date, home_metrics, away_metrics)))

    now = prediction_time(as_of) if as_of else dt.datetime.now(dt.timezone.utc)
    while pending and pending[0][0] < now:
        _available, _id, update = heapq.heappop(pending)
        ingest(*update, _available)
    current_date = now.date().isoformat()
    current = [{"abbr": abbr, **snapshot(2027, abbr, current_date, True, now)}
               for abbr in sorted({abbr for season, abbr in team_history if season == 2027})]
    counts = collections.Counter(game["season"] for game in output_games)
    for season in EVALUATED:
        if counts[season] != expected_counts[season]:
            raise ValueError(f"Season {season} coverage differs from validated results")
    player_report = {"schema": 1, "chronology_policy": POLICY, "strict_no_future_data": True,
        "status": "experimental_not_promoted",
        "method": "Prior-game decayed per-36 rates multiplied by expected minutes if playing",
        "evaluation": "Conditional on actual participation, matched among pregame top-12 rotation; excludes unobserved DNPs",
        "limitations": ["No verified pregame injury status; participation probabilities unvalidated",
                        "Only appearing players are available in the game-log source",
                        "Matched-player evaluation is subject to selection bias",
                        "No player-stat model has been promoted to a validated betting projection"],
        "by_season": {
            str(season): {"participation": participation[season],
                "stats": {stat: {"count": agg["count"],
                     "mae": agg["sum_abs_error"] / agg["count"] if agg["count"] else None,
                     "naive_last10_mae": agg["baseline_abs_error"] / agg["count"] if agg["count"] else None}
                     for stat in PLAYER_STATS
                     for agg in (stat_errors[season][stat],)}}
            for season in (*EVALUATED, 2027)}}
    return round_tree({"schema": 1, "chronology_policy": POLICY,
        "player_report": player_report,
        "rotation_history": {"schema": 1, "chronology_policy": POLICY, "strict_no_future_data": True,
            "source": "Compact inferred pregame player IDs and expected minutes; no target-game results",
            "games": rotation_history},
        "built_at_utc": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "strict_no_future_data": True,
        "source": {"name": "llimllib/nba_data derived from stats.nba.com",
            "catalog": CATALOG, "metadata": METADATA,
            "documentation": "https://github.com/llimllib/nba_data/blob/main/docs/DATA_DICTIONARY.md",
            "upstream_license": "No license declared in the upstream GitHub repository as of build date",
            "redistribution": "Only derived pregame aggregates are published; raw parquet files are not vendored"},
        "coverage": {"evaluated_seasons": list(EVALUATED), "evaluated_games": expected_total,
            "fresh_2027_games": counts[2027], "score_crosschecks": score_matches,
            "player_rows": len(player_rows), "team_rows": len(team_rows)},
        "methodology": {"feature_timing": "Only results with availability strictly before prediction_at_utc enter state; unknown availability uses second UTC midnight",
            "team_windows": ["last 5 exponentially weighted", "last 10 exponentially weighted", "season", "prior completed season", "online opponent-adjusted efficiency residuals"],
            "player_minutes": "Prior appearances only; recent minutes decayed and discounted after missed team games",
            "availability": "Inferred only; DNPs and official historical pregame injury designations are absent",
            "impact": "Conservative proxy from prior on-court net rating, true shooting and usage; not EPM/RAPM"},
        "games": output_games, "current": current})


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=pathlib.Path)
    parser.add_argument("--rows-input", type=pathlib.Path, help="Frozen private raw rows for paired replay")
    parser.add_argument("--as-of", help="Explicit UTC current-snapshot cutoff")
    parser.add_argument("--review-dir", type=pathlib.Path)
    parser.add_argument("--current-output", type=pathlib.Path, default=CURRENT_OUTPUT)
    parser.add_argument("--player-report-output", type=pathlib.Path)
    parser.add_argument("--rotation-history-output", type=pathlib.Path, default=pathlib.Path("/tmp/v7-rotation-history.json"))
    parser.add_argument("--extension-dir", default="/tmp/nba-twin-duckdb-extensions")
    args = parser.parse_args()
    review_dir = args.review_dir or pathlib.Path(os.environ.get("NBA_REVIEW_OUTPUT_DIR") or
        ROOT / "research-reviews/chronology-v1/runs" / dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%S%fZ"))
    args.output = args.output or review_dir / "v7-intelligence.json"
    args.player_report_output = args.player_report_output or review_dir / "v9-player-report.json"
    for output in (args.output, args.player_report_output, args.rotation_history_output):
        if (ROOT / "data").resolve() in output.resolve().parents or output.exists():
            raise ValueError(f"Refusing to overwrite historical evidence: {output}")
    if args.rows_input:
        frozen = json.loads(args.rows_input.read_text())
        payload = build_payload(None, rows=(frozen["team_rows"], frozen["player_rows"]), as_of=args.as_of)
    else:
        connection = duckdb.connect()
        connection.execute(f"SET extension_directory='{args.extension_dir}'")
        connection.execute("INSTALL httpfs; LOAD httpfs")
        connection.execute(f"ATTACH '{CATALOG}' AS nba")
        payload = build_payload(connection, as_of=args.as_of)
    report = payload.pop("player_report")
    rotation_history = payload.pop("rotation_history")
    args.rotation_history_output.parent.mkdir(parents=True, exist_ok=True)
    rotation_tmp = args.rotation_history_output.with_suffix(".json.tmp")
    rotation_tmp.write_text(json.dumps(round_tree(rotation_history), ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    rotation_tmp.replace(args.rotation_history_output)
    report["built_at_utc"] = payload["built_at_utc"]
    args.player_report_output.parent.mkdir(parents=True, exist_ok=True)
    report_tmp = args.player_report_output.with_suffix(".json.tmp")
    report_tmp.write_text(json.dumps(round_tree(report), ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    report_tmp.replace(args.player_report_output)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    tmp = args.output.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    tmp.replace(args.output)
    current_payload = {"schema": 1, "chronology_policy": POLICY, "built_at_utc": payload["built_at_utc"],
        "strict_no_future_data": True, "source": payload["source"],
        "coverage": {"season": 2027, "completed_games": payload["coverage"]["fresh_2027_games"]},
        "availability": payload["methodology"]["availability"], "teams": payload["current"]}
    args.current_output.parent.mkdir(parents=True, exist_ok=True)
    current_tmp = args.current_output.with_suffix(".json.tmp")
    current_tmp.write_text(json.dumps(current_payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    current_tmp.replace(args.current_output)
    print(f"Validated {payload['coverage']['evaluated_games']} historical games and "
          f"{payload['coverage']['fresh_2027_games']} fresh-season games")


if __name__ == "__main__":
    try:
        main()
    except (duckdb.Error, OSError, ValueError) as exc:
        print(f"V7 intelligence build failed safely: {exc}", file=sys.stderr)
        raise SystemExit(1)
