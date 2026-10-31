import copy
import json
from pathlib import Path

import pytest
import build_v7_intelligence as B
from historical_chronology import prediction_time, result_availability, UNKNOWN


@pytest.mark.parametrize("value,expected", [
    ("2026-01-01", "2026-01-03T00:00:00Z"),
    ("2026-10-31T10:00:00+11:00", "2026-11-01T00:00:00Z"),
    ("2026-03-08T23:30:00-04:00", "2026-03-11T00:00:00Z"),
])
def test_conservative_availability_uses_utc(value, expected):
    assert result_availability({"date": value}) == prediction_time(expected)


def test_missing_invalid_or_unverified_timestamps_fail_closed():
    assert result_availability({}) == UNKNOWN
    assert result_availability({"date": "2026-01-01", "status": "suspended"}) == UNKNOWN
    for stamp in ["broken", "2026-01-01T10:00:00", "2025-01-01T10:00:00Z"]:
        assert result_availability({"date": "2026-01-01T12:00:00Z", "result_available_at_utc": stamp,
                                    "result_availability_verified": True, "result_availability_source": "fixture"}) == UNKNOWN
    with pytest.raises(ValueError):
        prediction_time("2026-01-01T10:00:00")


def build(monkeypatch, tmp_path, games):
    (tmp_path / "data").mkdir(exist_ok=True)
    (tmp_path / "data/games.json").write_text(json.dumps({"games": games})) # duplicate feed coverage is intentional
    history = tmp_path / "history.json"
    history.write_text(json.dumps({"games": games}))
    monkeypatch.setattr(B, "ROOT", tmp_path)
    monkeypatch.setattr(B, "HISTORY", history)
    monkeypatch.setattr(B, "EVALUATED", (2022,))
    rows = []
    players = []
    for g in games:
        for side, other in [("home", "away"), ("away", "home")]:
            t = g[side]
            r = {"game_id": g["id"], "game_date": g["date"][:10], "season": 2022,
                 "team_id": t["id"], "opp_team_id": g[other]["id"],
                 "home_team_id": g["home"]["id"], "away_team_id": g["away"]["id"],
                 "nba_abbrev": t["abbr"], "opp_abbrev": g[other]["abbr"], "full_name": t["abbr"],
                 "pts": g[side+"Score"], "poss": 100, "fgm": 40, "fga": 80}
            rows.append(r)
            players.append({**r, "player_id": t["id"], "name": t["abbr"], "min": 30})
    return B.build_payload(None, rows=(rows, players), as_of="2022-01-10T00:00:00Z")


def game(id, date, home="ATL", away="BOS", ids=("1", "2"), **extra):
    return {"id": id, "date": date, "season": 2022, "status": "final",
            "home": {"id": ids[0], "abbr": home}, "away": {"id": ids[1], "abbr": away},
            "homeScore": 120+int(id), "awayScore": 90, **extra}


def test_builder_same_date_league_and_player_state_is_frozen(monkeypatch, tmp_path):
    first = game("1", "2022-01-01T23:00:00Z")
    simultaneous = game("2", "2022-01-01T23:00:00Z", "CHI", "DET", ("3", "4"))
    overlap = game("3", "2022-01-01T23:30:00Z")
    later = game("4", "2022-01-03T00:00:01Z")
    result = build(monkeypatch, tmp_path, [first, simultaneous, overlap, later])
    by_id = {g["result_id"]: g for g in result["games"]}
    for id in ["1", "2", "3"]:
        for snap in by_id[id]["pregame"].values():
            assert snap["games"] == 0
            assert snap["league_ortg"] == 112
            assert snap["max_result_available_at_utc"] is None
    assert by_id["4"]["pregame"]["home"]["games"] == 2
    rotations = {g["result_id"]: g for g in result["rotation_history"]["games"]}
    assert rotations["3"]["home"]["rotation"] == []
    assert rotations["4"]["home"]["rotation"]
    changed = copy.deepcopy(first)
    changed["homeScore"] = 180
    perturbed = build(monkeypatch, tmp_path, [changed, simultaneous, overlap, later])
    assert perturbed["games"][1]["pregame"] == result["games"][1]["pregame"]
    assert perturbed["games"][2]["pregame"] == result["games"][2]["pregame"]


def test_builder_doubleheader_uses_only_verified_available_first_result(monkeypatch, tmp_path):
    first = game("1", "2022-01-01T10:00:00Z", result_available_at_utc="2022-01-01T13:00:00Z",
                 result_availability_verified=True, result_availability_source="fixture final observation")
    boundary = game("2", "2022-01-01T13:00:00Z")
    later = game("3", "2022-01-01T15:00:00Z")
    result = build(monkeypatch, tmp_path, [first, boundary, later])
    by_id = {g["result_id"]: g for g in result["games"]}
    assert by_id["2"]["pregame"]["home"]["games"] == 0
    snap = by_id["3"]["pregame"]["home"]
    assert snap["games"] == 1
    assert prediction_time(snap["max_result_available_at_utc"]) < prediction_time(snap["information_cutoff_utc"])


def test_final_observation_is_retained_without_backdating_archive_results():
    from build_predictions import record_final_observations
    prior = {"games": [{"id": "1", "status": "live"}, {"id": "2", "status": "final", "homeScore": 100, "awayScore": 90, "date": "2026-01-01T12:00:00Z"}]}
    payload = {"built_at_utc": "2026-01-01T15:00:00Z", "games": [
        {"id": "1", "date": "2026-01-01T12:00:00Z", "status": "final", "homeScore": 100, "awayScore": 90},
        {"id": "2", "date": "2026-01-01T12:00:00Z", "status": "final", "homeScore": 100, "awayScore": 90},
        {"id": "3", "date": "2025-01-01T12:00:00Z", "status": "final", "homeScore": 100, "awayScore": 90}]}
    record_final_observations(payload, prior)
    assert payload["games"][0]["result_available_at_utc"] == payload["built_at_utc"]
    assert "result_available_at_utc" not in payload["games"][1]
    assert "result_available_at_utc" not in payload["games"][2]
    later = copy.deepcopy(payload)
    later["built_at_utc"] = "2026-01-02T00:00:00Z"
    record_final_observations(later, payload)
    assert later["games"][0]["result_available_at_utc"] == "2026-01-01T15:00:00Z"
    later["games"][0]["homeScore"] += 1
    record_final_observations(later, payload)
    assert later["games"][0]["result_available_at_utc"] == later["built_at_utc"]


def test_verified_review_availability_evidence_is_intact():
    from historical_chronology import load_evidence
    evidence = load_evidence(Path(__file__).parents[1] / "research-reviews/chronology-v1/inputs/result-availability.json")
    assert len(evidence) == 10
    assert all(e["result_availability_verified"] for e in evidence.values())
