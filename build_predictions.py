#!/usr/bin/env python3
"""NBA Twin Lab V5 scoreboard importer.

ESPN's unauthenticated scoreboard is an *unofficial, undocumented* source.
Never manufacture games, odds, injuries, advanced ratings, or future results.
On failed validation, exit non-zero and leave the last published file intact.
"""
from __future__ import annotations

import argparse
import calendar
import datetime as dt
import json
import os
import pathlib
import sys
import time
from typing import Any

import requests

ENDPOINT = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard"
OUTPUT = pathlib.Path(__file__).parent / "data" / "games.json"
HEADERS = {
    "Accept": "application/json",
}


def parse_events(payload: dict[str, Any]) -> list[dict[str, Any]]:
    if not isinstance(payload, dict) or not isinstance(payload.get("events"), list):
        raise ValueError("Unexpected ESPN response: missing events array")
    rows = []
    for event in payload["events"]:
        try:
            comp = event["competitions"][0]
            home = next(x for x in comp["competitors"] if x["homeAway"] == "home")
            away = next(x for x in comp["competitors"] if x["homeAway"] == "away")
            game_id = str(event["id"])
            date = str(event["date"])
            parsed_date = dt.datetime.fromisoformat(date.replace("Z", "+00:00"))
            if not game_id or not parsed_date.tzinfo:
                continue

            def team(x: dict) -> dict:
                raw = x["team"]
                return {
                    "id": str(raw["id"]),
                    "name": str(raw.get("displayName") or raw.get("name") or ""),
                    "abbr": str(raw.get("abbreviation") or ""),
                    "logo": str(raw.get("logo") or ""),
                }

            h, a = team(home), team(away)
            if not h["id"] or not a["id"] or h["id"] == a["id"]:
                continue
            # ESPN mixes All-Star exhibitions into some monthly NBA scoreboards.
            # Standard NBA franchise IDs are 1..30; exclude non-franchise teams.
            if not (h["id"].isdigit() and a["id"].isdigit()
                    and 1 <= int(h["id"]) <= 30 and 1 <= int(a["id"]) <= 30):
                continue
            typ = event.get("status", {}).get("type") or comp.get("status", {}).get("type") or {}
            final = typ.get("completed") is True or typ.get("name") == "STATUS_FINAL" or typ.get("state") == "post"
            live = not final and (typ.get("state") == "in" or str(typ.get("name", "")).startswith("STATUS_IN"))
            hs = float(home["score"]) if home.get("score") not in (None, "") else None
            as_ = float(away["score"]) if away.get("score") not in (None, "") else None
            # NBA games cannot finish tied. ESPN sometimes labels postponed 0–0
            # fixtures as completed; those are not actual results.
            if final and (hs is None or as_ is None or hs < 0 or as_ < 0 or hs == as_):
                continue
            # 2025 NBA Cup Final (NYK–SAS) did not count in the standings.
            # Do not broadly exclude other NBA Cup rounds: most ARE regular-season games.
            if game_id == "401809839":
                continue
            season_data = event.get("season") or {}
            league_season = ((payload.get("leagues") or [{}])[0].get("season") or {})
            season_type = int(season_data.get("type") or league_season.get("type") or 2)
            if season_type != 2:
                continue
            season = int(season_data.get("year") or league_season.get("year") or
                         (parsed_date.year + (parsed_date.month >= 7)))
            if season < 2000 or season > 2100:
                continue
            rows.append({
                "id": game_id, "date": date, "season": season,
                "home": h, "away": a,
                "status": "final" if final else "live" if live else "scheduled",
                "homeScore": hs, "awayScore": as_,
                "source": "ESPN scoreboard",
            })
        except (KeyError, IndexError, TypeError, ValueError, StopIteration):
            continue
    return rows


def months(start: dt.date, end: dt.date):
    year, month = start.year, start.month
    while (year, month) <= (end.year, end.month):
        first = max(start, dt.date(year, month, 1))
        last = min(end, dt.date(year, month, calendar.monthrange(year, month)[1]))
        if first <= last:
            yield first, last
        month += 1
        if month == 13:
            year, month = year + 1, 1


def fetch_range(session: requests.Session, start: dt.date, end: dt.date) -> list[dict]:
    params = {
        "dates": f"{start:%Y%m}",  # ESPN Site API stopped accepting date ranges in September 2026
        "seasontype": 2,
        "limit": 500,
    }
    response = session.get(ENDPOINT, params=params, timeout=24, headers=HEADERS)
    response.raise_for_status()
    return parse_events(response.json())


def build(session: requests.Session, today: dt.date) -> dict:
    current_end = today.year + 1 if today.month >= 7 else today.year
    previous_end = current_end - 1
    previous_start = dt.date(previous_end - 1, 10, 1)
    previous_finish = dt.date(previous_end, 4, 30)
    current_start = dt.date(current_end - 1, 10, 1)
    current_finish = max(today + dt.timedelta(days=16), current_start)
    games: dict[str, dict] = {}
    ranges = [(previous_start, previous_finish), (current_start, current_finish)]
    for start, finish in ranges:
        for first, last in months(start, finish):
            items = fetch_range(session, first, last)
            for g in items:
                old = games.get(g["id"])
                if old is None or g["status"] == "final" or old["status"] != "final":
                    games[g["id"]] = g
            print(f"{first} to {last}: {len(items)} games")
            time.sleep(.12)
    ordered = sorted(games.values(), key=lambda g: (g["date"], g["id"]))
    prev_final = [g for g in ordered if g["season"] == previous_end and g["status"] == "final"]
    if len(prev_final) < 800:
        raise ValueError(f"Historical coverage insufficient: {len(prev_final)} final games for {previous_end}; require >=800")
    # Standard 30-team, 82-game NBA seasons have exactly 1,230 results.
    # Reject stray All-Star, postponed or NBA Cup Final events.
    if previous_end >= 2026 and len(prev_final) != 1230:
        raise ValueError(f"Previous season {previous_end} has {len(prev_final)} finals, expected 1230; refusing a contaminated Elo baseline")
    # Cross-reference every team's 82-game W-L record against the separately
    # sourced Basketball Reference team summaries, when available.
    context_path = pathlib.Path(__file__).parent / "data" / "context.json"
    if context_path.exists():
        context = json.loads(context_path.read_text(encoding="utf-8"))
        expected = {t["abbr"]: t for t in context.get("teams", [])
                    if t.get("season") == previous_end}
        if len(expected) == 30:
            alias = {"GS": "GSW", "NY": "NYK", "SA": "SAS", "NO": "NOP",
                     "UTAH": "UTA", "WSH": "WAS", "PHX": "PHO",
                     "BKN": "BRK", "CHA": "CHO"}
            tallies = {}
            for g in prev_final:
                for side in ("home", "away"):
                    t = g[side]
                    abbr = alias.get(t["abbr"], t["abbr"])
                    rec = tallies.setdefault(abbr, {"w": 0, "l": 0})
                    win = (g["homeScore"] > g["awayScore"]) if side == "home" else (g["awayScore"] > g["homeScore"])
                    rec["w" if win else "l"] += 1
            for abbr, team in expected.items():
                record = tallies.get(abbr)
                if not record or record["w"] != team["w"] or record["l"] != team["l"]:
                    raise ValueError(f"ESPN / team-summary mismatch for {abbr}: {record} vs {team['w']}-{team['l']}")
            print(f"Cross-checked all 30 team records for {previous_end} against independent advanced team summaries")
    # Current-season data can legitimately be empty before opening night.
    if len(ordered) != len({g["id"] for g in ordered}):
        raise ValueError("Duplicate ESPN game IDs")
    return {
        "schema": 1,
        "built_at_utc": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "source": {"name": "ESPN public scoreboard (unofficial)",
                   "url": ENDPOINT, "status": "undocumented; may change or block automated requests"},
        "coverage": {"baseline_season": previous_end, "current_season": current_end,
                     "previous_final_games": len(prev_final),
                     "current_final_games": sum(g["season"] == current_end and g["status"] == "final" for g in ordered),
                     "last_game_date": max((g["date"] for g in ordered if g["status"] == "final"), default=None)},
        "games": ordered,
    }


def record_final_observations(payload, previous):
    """Retain first-observed finals without assigning invented past finish times.

    Backfilled archive finals keep the conservative historical policy. Only a
    witnessed transition from scheduled/live gets a new verified observation.
    """
    old = {str(g["id"]): g for g in previous.get("games", [])}
    keys = ("result_available_at_utc", "result_availability_source", "result_availability_verified")
    for game in payload["games"]:
        before = old.get(str(game["id"]))
        if game["status"] != "final" or not before:
            continue
        if before.get("status") in ("scheduled", "live") or (
                before.get("status") == "final" and any(game.get(k) != before.get(k) for k in ("homeScore", "awayScore", "date"))):
            game.update(result_available_at_utc=payload["built_at_utc"],
                        result_availability_verified=True,
                        result_availability_source=ENDPOINT + " first observed final transition")
        elif all(before.get(k) is not None for k in keys) and all(
                game.get(k) == before.get(k) for k in ("homeScore", "awayScore", "date")):
            game.update({k: before[k] for k in keys})
    return payload


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--output", type=pathlib.Path, default=OUTPUT)
    p.add_argument("--today", type=dt.date.fromisoformat, default=dt.datetime.now(dt.timezone.utc).date())
    args = p.parse_args()
    with requests.Session() as session:
        payload = build(session, args.today)
    if args.output.exists():
        try:
            old = json.loads(args.output.read_text(encoding="utf-8"))
            record_final_observations(payload, old)
            if (old.get("games") == payload["games"] and
                    old.get("coverage") == payload["coverage"] and
                    old.get("source") == payload["source"]):
                print("No changes in verified schedule or results; keeping existing file")
                return
        except (ValueError, OSError):
            pass
    args.output.parent.mkdir(parents=True, exist_ok=True)
    temp = args.output.with_suffix(".json.tmp")
    temp.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    temp.replace(args.output)
    print(f"Validated {len(payload['games'])} NBA games; baseline {payload['coverage']['baseline_season']}")


if __name__ == "__main__":
    try:
        main()
    except (ValueError, requests.RequestException, OSError) as exc:
        print(f"Prediction data update failed safely: {exc}", file=sys.stderr)
        sys.exit(1)
