import datetime as dt
import json
from pathlib import Path

import build_historical as hist


ROOT = Path(__file__).parents[1]


def test_historical_snapshot_has_five_complete_evaluation_seasons():
    data = json.loads((ROOT / "data" / "historical-games.json").read_text())
    assert data["coverage"]["evaluation_seasons"] == [2022, 2023, 2024, 2025, 2026]
    assert data["coverage"]["evaluation_games"] == 6150
    assert data["coverage"]["total_games"] == 7230
    assert {x["record_crosscheck"] for x in data["coverage"]["validation"]} == {"passed"}
    assert len({x["id"] for x in data["games"]}) == 7230
    assert not hist.NON_STANDINGS_CUP_FINALS.intersection(x["id"] for x in data["games"])


def test_historical_windows_include_delayed_warmup_and_normal_seasons():
    assert hist.season_window(2021) == (dt.date(2020, 12, 1), dt.date(2021, 5, 31))
    assert hist.season_window(2026) == (dt.date(2025, 10, 1), dt.date(2026, 4, 30))


def test_record_validation_normalises_provider_abbreviations():
    game = {"home": {"abbr": "BKN"}, "away": {"abbr": "PHX"},
            "homeScore": 101, "awayScore": 99}
    assert hist.record_tallies([game]) == {
        "BRK": {"w": 1, "l": 0}, "PHO": {"w": 0, "l": 1}
    }
