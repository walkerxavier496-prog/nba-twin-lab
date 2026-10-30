#!/usr/bin/env python3
"""Build a validated, versioned NBA regular-season history for V6 backtests.

ESPN's public scoreboard is an unofficial, undocumented result source. Every
season is therefore reconciled to the independently sourced Basketball
Reference team summaries already stored in data/context.json. A partial or
contaminated season is rejected and the published snapshot is left untouched.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import pathlib
import sys
import time

import requests

from build_predictions import ENDPOINT, HEADERS, fetch_range, months


OUTPUT = pathlib.Path(__file__).parent / "data" / "historical-games.json"
CONTEXT = pathlib.Path(__file__).parent / "data" / "context.json"
EVALUATION_SEASONS = (2022, 2023, 2024, 2025, 2026)
WARMUP_SEASON = 2021
EXPECTED_GAMES = {2021: 1080, 2022: 1230, 2023: 1230, 2024: 1230,
                  2025: 1230, 2026: 1230}
# Cup championship games are exhibitions for standings purposes even though
# ESPN labels them regular-season events. Earlier rounds do count.
NON_STANDINGS_CUP_FINALS = {"401607495", "401734908", "401809839"}
ALIASES = {"GS": "GSW", "NY": "NYK", "SA": "SAS", "NO": "NOP",
           "UTAH": "UTA", "WSH": "WAS", "PHX": "PHO",
           "BKN": "BRK", "CHA": "CHO"}


def season_window(season: int) -> tuple[dt.date, dt.date]:
    if season == 2021:  # pandemic-delayed 72-game season
        return dt.date(2020, 12, 1), dt.date(2021, 5, 31)
    return dt.date(season - 1, 10, 1), dt.date(season, 4, 30)


def record_tallies(games: list[dict]) -> dict[str, dict[str, int]]:
    out: dict[str, dict[str, int]] = {}
    for game in games:
        home = ALIASES.get(game["home"]["abbr"], game["home"]["abbr"])
        away = ALIASES.get(game["away"]["abbr"], game["away"]["abbr"])
        hwin = game["homeScore"] > game["awayScore"]
        for abbr, won in ((home, hwin), (away, not hwin)):
            row = out.setdefault(abbr, {"w": 0, "l": 0})
            row["w" if won else "l"] += 1
    return out


def validate_season(season: int, games: list[dict], context: dict) -> dict:
    expected_count = EXPECTED_GAMES[season]
    if len(games) != expected_count:
        raise ValueError(
            f"Season {season} has {len(games)} finals; expected {expected_count}"
        )
    if len({g["id"] for g in games}) != len(games):
        raise ValueError(f"Season {season} has duplicate game IDs")
    expected = {t["abbr"]: t for t in context.get("teams", [])
                if t.get("season") == season}
    if len(expected) != 30:
        raise ValueError(f"Season {season} has {len(expected)} independent team records")
    actual = record_tallies(games)
    mismatches = []
    for abbr, team in expected.items():
        got = actual.get(abbr)
        want = {"w": int(team["w"]), "l": int(team["l"])}
        if got != want:
            mismatches.append(f"{abbr}: {got} vs {want}")
    if mismatches:
        raise ValueError(f"Season {season} record mismatch: " + "; ".join(mismatches))
    return {"season": season, "games": len(games), "teams": 30,
            "record_crosscheck": "passed"}


def build(session: requests.Session) -> dict:
    context = json.loads(CONTEXT.read_text(encoding="utf-8"))
    by_id: dict[str, dict] = {}
    for season in (WARMUP_SEASON, *EVALUATION_SEASONS):
        start, finish = season_window(season)
        for first, last in months(start, finish):
            for game in fetch_range(session, first, last):
                if (game["season"] == season and game["status"] == "final"
                        and game["id"] not in NON_STANDINGS_CUP_FINALS):
                    by_id[game["id"]] = game
            print(f"Fetched {season}: {first:%Y-%m}")
            time.sleep(.08)
    ordered = sorted(by_id.values(), key=lambda g: (g["date"], g["id"]))
    validation = []
    for season in (WARMUP_SEASON, *EVALUATION_SEASONS):
        validation.append(validate_season(
            season, [g for g in ordered if g["season"] == season], context
        ))
    return {
        "schema": 1,
        "built_at_utc": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "source": {
            "results": {"name": "ESPN public scoreboard", "url": ENDPOINT,
                        "status": "unofficial and undocumented"},
            "validation": context["source"],
        },
        "coverage": {
            "warmup_season": WARMUP_SEASON,
            "evaluation_seasons": list(EVALUATION_SEASONS),
            "evaluation_games": sum(v["games"] for v in validation
                                    if v["season"] in EVALUATION_SEASONS),
            "total_games": len(ordered),
            "validation": validation,
        },
        "games": ordered,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=pathlib.Path, default=OUTPUT)
    args = parser.parse_args()
    with requests.Session() as session:
        session.headers.update({**HEADERS, "User-Agent": "NBA-Twin-Lab/6.0"})
        payload = build(session)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    tmp = args.output.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
                   encoding="utf-8")
    tmp.replace(args.output)
    print(f"Validated {payload['coverage']['evaluation_games']} held-out games "
          f"plus {payload['coverage']['total_games'] - payload['coverage']['evaluation_games']} warm-up games")


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError, requests.RequestException) as exc:
        print(f"Historical data update failed safely: {exc}", file=sys.stderr)
        sys.exit(1)
