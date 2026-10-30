#!/usr/bin/env python3
"""Verified NBA champions and Finals MVP history (1969-present).

Source: nhford/finalsmvp GitHub dataset, cross-checked for the 2026 champion
against the NBA's official history. This is historical reporting, not prediction.
"""
import csv
import datetime as dt
import io
import json
import pathlib
import sys

import requests

ROOT = "https://raw.githubusercontent.com/nhford/finalsmvp/main/"
FILES = ("data/teams/champions_seasons.csv", "data/meta/finals_mvp.csv")
OUT = pathlib.Path(__file__).parent / "data" / "champions.json"


def num(x):
    try:
        return float(x)
    except (ValueError, TypeError):
        return None


def parse_champions(teams, mvps):
    winners = {}
    for r in mvps:
        try:
            yr = int(str(r["Season"]).split("-")[0]) + 1
        except (KeyError, ValueError, TypeError):
            continue
        if r.get("Lg") != "NBA" or not r.get("Player"):
            continue
        if yr in winners:
            raise ValueError(f"Multiple Finals MVPs for {yr}; review source")
        winners[yr] = {"name": r["Player"], "ppg": num(r.get("PTS")),
                       "rpg": num(r.get("TRB")), "apg": num(r.get("AST"))}
    out = []
    years = set()
    for r in teams:
        try:
            year = int(r["year"])
        except (KeyError, ValueError, TypeError):
            continue
        if year in years:
            raise ValueError(f"Duplicate NBA champion season {year}")
        years.add(year)
        if not r.get("team") or not r.get("abbrev"):
            raise ValueError(f"Missing champion identity for {year}")
        mvp = winners.get(year)
        if not mvp:
            raise ValueError(f"Missing Finals MVP for {year}")
        out.append({
            "year": year, "season": r.get("season", ""),
            "team": r["team"], "abbr": r["abbrev"],
            "wins": num(r.get("wins")), "losses": num(r.get("losses")),
            "srs": num(r.get("srs")), "net_rtg": num(r.get("net_rtg")),
            "off_rtg": num(r.get("off_rtg")), "def_rtg": num(r.get("def_rtg")),
            "pace": num(r.get("pace")), "coach": r.get("primary_coach", ""),
            "opponent": r.get("finals_opponent", ""),
            "playoff_path": r.get("playoff_path", ""),
            "finals_mvp": mvp,
        })
    out.sort(key=lambda x: x["year"], reverse=True)
    if len(out) < 55 or out[0]["year"] < 2026 or out[-1]["year"] > 1969:
        raise ValueError("Championship history is incomplete")
    # Cross-check most recent known result against the NBA's published history.
    if out[0]["year"] == 2026 and (
            out[0]["team"] != "New York Knicks" or out[0]["finals_mvp"]["name"] != "Jalen Brunson"):
        raise ValueError("2026 Finals result disagrees with official NBA history")
    return out


def build(session):
    rows = []
    for path in FILES:
        response = session.get(ROOT + path, timeout=35)
        response.raise_for_status()
        rows.append(list(csv.DictReader(io.StringIO(response.text, newline=""))))
    champions = parse_champions(*rows)
    return {
        "schema": 1,
        "built_at_utc": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "source": {"name": "nhford/finalsmvp historical Finals dataset",
                   "url": "https://github.com/nhford/finalsmvp",
                   "crosscheck": "https://www.nba.com/news/history-nba-champions"},
        "coverage": {"from": min(x["year"] for x in champions),
                     "through": max(x["year"] for x in champions),
                     "count": len(champions)},
        "champions": champions,
    }


def main():
    with requests.Session() as session:
        payload = build(session)
    if OUT.exists():
        try:
            old = json.loads(OUT.read_text(encoding="utf-8"))
            if old.get("champions") == payload["champions"]:
                print("No changes to verified NBA championship history")
                return
        except (ValueError, OSError):
            pass
    OUT.parent.mkdir(parents=True, exist_ok=True)
    tmp = OUT.with_suffix(".tmp")
    tmp.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    tmp.replace(OUT)
    print(f"Verified {len(payload['champions'])} NBA champions and Finals MVPs")


if __name__ == "__main__":
    try:
        main()
    except (requests.RequestException, ValueError, OSError) as exc:
        print(f"Championship import failed safely: {exc}", file=sys.stderr)
        sys.exit(1)
