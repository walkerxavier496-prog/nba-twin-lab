import datetime as dt
import pytest

import build_predictions as pred
import build_context as ctx


def event(game_id="1", completed=True, season_type=2):
    return {
        "id": game_id, "date": "2026-10-26T23:00:00Z",
        "season": {"year": 2027, "type": season_type},
        "status": {"type": {"name": "STATUS_FINAL" if completed else "STATUS_SCHEDULED", "completed": completed}},
        "competitions": [{"competitors": [
            {"homeAway": "home", "team": {"id": "1", "displayName": "Home", "abbreviation": "H"}, "score": "120" if completed else ""},
            {"homeAway": "away", "team": {"id": "2", "displayName": "Away", "abbreviation": "A"}, "score": "115" if completed else ""},
        ]}],
    }


def test_espn_parser_accepts_only_verified_regular_season():
    result = pred.parse_events({"events": [event("1"), event("2", completed=False), event("3", season_type=3)]})
    assert len(result) == 2
    assert result[0]["homeScore"] == 120
    assert result[0]["season"] == 2027
    assert result[1]["status"] == "scheduled"
    assert result[1]["homeScore"] is None
    with pytest.raises(ValueError, match="events"):
        pred.parse_events({"message": "Access Denied"})


def test_month_windows_do_not_overlap():
    periods = list(pred.months(dt.date(2025, 12, 29), dt.date(2026, 2, 3)))
    assert len(periods) == 3
    assert periods[0] == (dt.date(2025, 12, 29), dt.date(2025, 12, 31))
    assert periods[-1] == (dt.date(2026, 2, 1), dt.date(2026, 2, 3))


def test_prediction_import_refuses_insufficient_historical_games(monkeypatch):
    monkeypatch.setattr(pred, "fetch_range", lambda *args: [])
    monkeypatch.setattr(pred.time, "sleep", lambda *args: None)
    with pytest.raises(ValueError, match="Historical coverage insufficient"):
        pred.build(None, dt.date(2026, 10, 31))


def test_team_context_requires_complete_coherent_season():
    rows = []
    for i in range(30):
        rows.append({"lg": "NBA", "season": "2026", "team": f"Team {i}",
                     "abbreviation": f"T{i}", "w": "41", "l": "41",
                     "srs": "2.3", "o_rtg": "115.2", "d_rtg": "112.9"})
    out = ctx.parse_teams(rows)
    assert len(out) == 30
    rows[0]["w"] = "3"
    with pytest.raises(ValueError, match="No recent complete"):
        ctx.parse_teams(rows)


def test_mvp_awards_need_exactly_one_winner():
    rows = [{"award": "nba mvp", "season": "2025", "player": "Player A",
             "winner": "TRUE", "share": "0.9", "player_id": "a"},
            {"award": "nba mvp", "season": "2025", "player": "Player B",
             "winner": "FALSE", "share": "0.1", "player_id": "b"}]
    result = ctx.parse_mvp(rows)
    assert len(result) == 2
    assert next(x for x in result if x["winner"])["player"] == "Player A"
    rows[1]["winner"] = "TRUE"
    with pytest.raises(ValueError, match="recent MVP"):
        ctx.parse_mvp(rows)
