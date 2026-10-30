import pytest
import build_preseason as p


def event(game_id="100", score="110", season_type=1, team_id="1"):
    return {"id": game_id, "date": "2026-10-10T22:00:00Z",
            "season": {"year": 2027, "type": season_type},
            "status": {"type": {"completed": True, "name": "STATUS_FINAL"}},
            "competitions": [{"competitors": [
                {"homeAway": "home", "team": {"id": team_id, "displayName": "Home", "abbreviation": "ATL"}, "score": score},
                {"homeAway": "away", "team": {"id": "2", "displayName": "Away", "abbreviation": "BOS"}, "score": "100"},
            ]}]}


def test_only_valid_2026_preseason_finals():
    result = p.parse_preseason({"events": [
        event("ok"), event("regular", season_type=2),
        event("allstar", team_id="132375"), event("tie", score="100")]})
    assert len(result) == 1
    assert result[0]["id"] == "ok"
    assert result[0]["season"] == 2027


def test_bad_feed_rejected():
    with pytest.raises(ValueError, match="Malformed"):
        p.parse_preseason({"message": "blocked"})
