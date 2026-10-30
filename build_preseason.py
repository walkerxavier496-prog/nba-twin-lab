#!/usr/bin/env python3
"""Import only verified 2026-27 NBA preseason games for weak early-season priors."""
import datetime as dt
import json
import pathlib
import sys
import requests

import build_predictions as base

OUT = pathlib.Path(__file__).parent / "data" / "preseason.json"


def parse_preseason(payload, season=2027):
    if not isinstance(payload, dict) or not isinstance(payload.get("events"), list):
        raise ValueError("Malformed ESPN preseason response")
    rows = []
    for event in payload["events"]:
        try:
            comp = event["competitions"][0]
            h = next(x for x in comp["competitors"] if x["homeAway"] == "home")
            a = next(x for x in comp["competitors"] if x["homeAway"] == "away")
            typ = event.get("status", {}).get("type", {})
            if not (typ.get("completed") is True or typ.get("name") == "STATUS_FINAL"):
                continue
            event_season = event.get("season") or {}
            if int(event_season.get("year") or season) != season:
                continue
            if int(event_season.get("type") or 1) != 1:
                continue
            def team(x):
                t = x["team"]
                return {"id": str(t["id"]), "abbr": str(t.get("abbreviation") or ""),
                        "name": str(t.get("displayName") or "")}
            home, away = team(h), team(a)
            if not all(x["id"].isdigit() and 1 <= int(x["id"]) <= 30 for x in (home, away)):
                continue
            hs, as_ = int(h["score"]), int(a["score"])
            if hs == as_ or hs < 40 or as_ < 40:
                continue
            when = str(event["date"])
            date = dt.datetime.fromisoformat(when.replace("Z", "+00:00"))
            if not (dt.datetime(2026, 9, 1, tzinfo=dt.timezone.utc) <= date <
                    dt.datetime(2026, 10, 21, tzinfo=dt.timezone.utc)):
                continue
            rows.append({"id": str(event["id"]), "date": when, "season": season,
                         "home": home, "away": away, "homeScore": hs, "awayScore": as_,
                         "status": "final"})
        except (KeyError, IndexError, ValueError, TypeError, StopIteration):
            continue
    return rows


def build(session):
    games = {}
    for month in ("202609", "202610"):
        r = session.get(base.ENDPOINT,
                        params={"dates": month, "seasontype": 1, "limit": 500},
                        headers=base.HEADERS, timeout=30)
        r.raise_for_status()
        parsed = parse_preseason(r.json())
        print(f"Preseason {month}: {len(parsed)} validated games")
        for g in parsed:
            games[g["id"]] = g
    out = sorted(games.values(), key=lambda x: (x["date"], x["id"]))
    teams = {t["id"] for g in out for t in (g["home"], g["away"])}
    if len(out) < 35 or len(teams) < 27:
        raise ValueError(f"Preseason coverage incomplete: {len(out)} games, {len(teams)} teams")
    return {"schema": 1, "season": 2027, "source": "ESPN NBA preseason scoreboard (unofficial)",
            "built_at_utc": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
            "games": out}


def main():
    with requests.Session() as session:
        result = build(session)
    if OUT.exists():
        old = json.loads(OUT.read_text(encoding="utf-8"))
        if old.get("games") == result["games"]:
            print("Preseason snapshot unchanged")
            return
    OUT.parent.mkdir(exist_ok=True)
    temp = OUT.with_suffix(".tmp")
    temp.write_text(json.dumps(result, separators=(",", ":")), encoding="utf-8")
    temp.replace(OUT)
    print(f"Saved {len(result['games'])} verified preseason games")


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError, requests.RequestException) as e:
        print(f"Preseason import failed safely: {e}", file=sys.stderr)
        sys.exit(1)
