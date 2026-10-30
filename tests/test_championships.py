import pytest
import build_championships as champ


def fixture():
    teams = []
    mvps = []
    for year in range(1969, 2027):
        name = "New York Knicks" if year == 2026 else f"Champion {year}"
        player = "Jalen Brunson" if year == 2026 else f"Finals MVP {year}"
        teams.append({"year": str(year), "season": f"{year-1}-{str(year)[2:]}",
                      "team": name, "abbrev": "NYK" if year == 2026 else "BOS",
                      "wins": "55", "losses": "27", "srs": "5.1",
                      "finals_opponent": "Opponent"})
        mvps.append({"Season": f"{year-1}-{str(year)[2:]}", "Lg": "NBA",
                     "Player": player, "PTS": "27.5"})
    return teams, mvps


def test_championships_require_complete_history_and_finals_mvp():
    teams, mvps = fixture()
    rows = champ.parse_champions(teams, mvps)
    assert len(rows) == 58
    assert rows[0]["team"] == "New York Knicks"
    assert rows[0]["finals_mvp"]["name"] == "Jalen Brunson"
    assert rows[-1]["year"] == 1969


def test_missing_mvp_fails_closed():
    teams, mvps = fixture()
    with pytest.raises(ValueError, match="Missing Finals MVP"):
        champ.parse_champions(teams, mvps[:-1])


def test_2026_champion_crosschecked_against_nba():
    teams, mvps = fixture()
    teams[-1]["team"] = "Unverified champion"
    with pytest.raises(ValueError, match="official NBA history"):
        champ.parse_champions(teams, mvps)


def test_duplicate_championship_season_fails():
    teams, mvps = fixture()
    with pytest.raises(ValueError, match="Duplicate"):
        champ.parse_champions(teams + [teams[0]], mvps)
