#!/usr/bin/env python3
"""Build verified NBA team context and MVP award voting from a public BRef mirror.

Regular-season team summaries and MVP votes are independent datasets. Incomplete
or inconsistent seasons are excluded. No title winners or missing votes are guessed.
"""
import csv
import datetime as dt
import io
import json
import pathlib
import sys

import requests

ROOT = "https://raw.githubusercontent.com/sumitrodatta/bball-reference-datasets/master/Data/"
FILES = {"teams": "Team%20Summaries.csv", "awards": "Player%20Award%20Shares.csv"}
OUT = pathlib.Path(__file__).parent / "data" / "context.json"


def csv_rows(text):
    rows = list(csv.DictReader(io.StringIO(text, newline="")))
    if not rows or not rows[0]:
        raise ValueError("Source CSV has no rows")
    return rows


def as_float(x):
    try:
        n = float(x)
        return n if -10000 < n < 10000 else None
    except (TypeError, ValueError):
        return None


def parse_teams(rows):
    seasons = {}
    for r in rows:
        if r.get("lg") != "NBA":
            continue
        try:
            year = int(r["season"])
        except (ValueError, TypeError):
            continue
        name = r.get("team", "").strip()
        abbr = r.get("abbreviation", "").strip()
        if not name or not abbr or name in ("League Average",):
            continue
        obj = {"season": year, "name": name, "abbr": abbr}
        for k in ("w", "l", "srs", "o_rtg", "d_rtg", "n_rtg", "pace",
                  "ts_percent", "e_fg_percent", "tov_percent", "orb_percent",
                  "x3p_ar", "f_tr", "opp_e_fg_percent", "opp_tov_percent",
                  "drb_percent"):
            obj[k] = as_float(r.get(k))
        seasons.setdefault(year, []).append(obj)
    valid = []
    for year, teams in sorted(seasons.items()):
        # Team regular season totals must be coherent; exclude partial seasons.
        unique = {t["abbr"]: t for t in teams}
        n = len(unique)
        wins = sum(t["w"] or 0 for t in unique.values())
        losses = sum(t["l"] or 0 for t in unique.values())
        if n < 22 or abs(wins - losses) > 5 or wins < n * 25:
            continue
        valid.extend(unique.values())
    if not any(x["season"] >= 2025 for x in valid):
        raise ValueError("No recent complete team-stat season")
    return valid


def parse_mvp(rows):
    by_season = {}
    for r in rows:
        if r.get("award") != "nba mvp":
            continue
        try:
            year = int(r["season"])
        except (ValueError, TypeError):
            continue
        player = r.get("player", "").strip()
        if not player:
            continue
        by_season.setdefault(year, []).append({
            "player": player, "player_id": r.get("player_id", ""),
            "share": as_float(r.get("share")),
            "winner": r.get("winner", "").strip().upper() == "TRUE",
        })
    valid = []
    for year, candidates in sorted(by_season.items()):
        winners = [c for c in candidates if c["winner"]]
        if len(winners) != 1:
            continue
        for c in candidates:
            valid.append({"season": year, **c})
    if not any(x["season"] >= 2025 and x["winner"] for x in valid):
        raise ValueError("No verified recent MVP award winner")
    return valid


def build(session):
    source = {}
    for k, path in FILES.items():
        url = ROOT + path
        r = session.get(url, timeout=35, headers={"User-Agent": "NBA-Twin-Lab/4.0"})
        r.raise_for_status()
        source[k] = csv_rows(r.text)
    teams = parse_teams(source["teams"])
    mvp = parse_mvp(source["awards"])
    return {
        "schema": 1,
        "built_at_utc": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "source": {"name": "Basketball Reference dataset mirror",
                   "url": "https://github.com/sumitrodatta/bball-reference-datasets",
                   "files": ["Team Summaries.csv", "Player Award Shares.csv"]},
        "latest_team_season": max(x["season"] for x in teams),
        "latest_mvp_season": max(x["season"] for x in mvp),
        "teams": teams,
        "mvp": mvp,
    }


def main():
    with requests.Session() as session:
        payload = build(session)
    if OUT.exists():
        try:
            old = json.loads(OUT.read_text(encoding="utf-8"))
            if old.get("teams") == payload["teams"] and old.get("mvp") == payload["mvp"]:
                print("No changes in team or MVP award data")
                return
        except (OSError, ValueError):
            pass
    OUT.parent.mkdir(parents=True, exist_ok=True)
    tmp = OUT.with_suffix(".tmp")
    tmp.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    tmp.replace(OUT)
    print(f"Verified {len(payload['teams'])} team-seasons and {len(payload['mvp'])} MVP vote records")


if __name__ == "__main__":
    try:
        main()
    except (requests.RequestException, ValueError, OSError) as exc:
        print(f"Context update failed safely: {exc}", file=sys.stderr)
        sys.exit(1)
