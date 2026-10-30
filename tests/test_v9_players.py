"""V9 pregame player projection unit tests; no remote source needed."""
from build_v7_intelligence import PlayerState, PLAYER_STATS, player_game

def row(**overrides):
    base={"min":30,"pts":20,"oreb":2,"dreb":5,"ast":6,"fg3m":3,"stl":1,
          "blk":2,"tov":2,"net_rating":4,"ts_pct":.60,"usg_pct":24}
    base.update(overrides)
    return base

def test_all_box_score_stats_and_per36_rates():
    g=player_game(row())
    assert g["rebounds"] == 7
    assert g["threes"] == 3
    assert g["steals"] == 1
    assert g["blocks"] == 2
    assert g["points_per36"] == 24
    assert set(PLAYER_STATS) == {"points","rebounds","assists","threes","steals","blocks","turnovers"}

def test_pregame_stats_use_only_observed_games():
    p=PlayerState("1","Sample",[player_game(row()) for _ in range(5)])
    p.team_games_last_played=4
    before=p.projection(5)
    assert before["observed_games"] == 5
    assert abs(before["stats_if_play"]["points"]-20)<1e-8
    assert abs(before["stats_if_play"]["rebounds"]-7)<1e-8
    assert abs(before["stats_if_play"]["assists"]-6)<1e-8
    assert abs(before["stats_if_play"]["threes"]-3)<1e-8
    assert abs(before["stats_unconditional"]["points"]-19.4)<1e-8
    # The target game's box score must not affect its own projection.
    p.games.append(player_game(row(pts=60,ast=15)))
    after=p.projection(5)
    assert after["stats_if_play"]["points"] > before["stats_if_play"]["points"]

def test_missing_minutes_and_insufficient_samples_fail_closed():
    p=PlayerState("2","Unknown",[player_game(row(min=1)) for _ in range(2)])
    p.team_games_last_played=1
    projection=p.projection(2)
    assert projection["stats_if_play"]["points"] is None
    assert projection["observed_games"] == 0

def test_missed_game_reduces_availability_not_conditional_production():
    p=PlayerState("3","Sample",[player_game(row()) for _ in range(5)])
    p.team_games_last_played=4
    active=p.projection(5)
    missed=p.projection(7)
    assert missed["play_probability"] < active["play_probability"]
    assert missed["stats_if_play"]["points"] == active["stats_if_play"]["points"]
    assert missed["stats_unconditional"]["points"] < active["stats_unconditional"]["points"]
