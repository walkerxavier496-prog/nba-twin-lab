import json
from pathlib import Path


ROOT = Path(__file__).parents[1]


def snapshot():
    return json.loads((ROOT / "data" / "v7-intelligence.json").read_text())


def test_v7_snapshot_is_complete_and_cross_validated():
    data = snapshot()
    assert data["schema"] == 1
    assert data["strict_no_future_data"] is True
    assert data["coverage"]["evaluated_games"] == 6150
    assert data["coverage"]["score_crosschecks"] == 6150
    assert data["coverage"]["fresh_2027_games"] == 71
    counts = {season: 0 for season in range(2022, 2028)}
    for game in data["games"]:
        counts[game["season"]] += 1
        assert game["pregame"]["home"]["as_of"] == game["date"]
        assert game["pregame"]["away"]["as_of"] == game["date"]
        assert "rotation" not in game["pregame"]["home"]
    assert all(counts[season] == 1230 for season in range(2022, 2027))
    assert counts[2027] == 71


def test_current_player_statuses_are_explicitly_inferred():
    data = snapshot()
    assert len(data["current"]) == 30
    for team in data["current"]:
        assert team["rotation"]
        assert team["availability_source"].startswith("inferred")
        for player in team["rotation"]:
            assert player["availability"] == "inferred"
            assert 0 <= player["expected_minutes"] <= 40
            assert 0 <= player["play_probability"] <= 1
