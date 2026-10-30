# NBA Twin Lab V4 — Independent NBA analytics

**Website:** https://walkerxavier496-prog.github.io/nba-twin-lab/

NBA Twin Lab is an independent, open-source basketball research platform hosted on GitHub Pages. It combines a statistical player twin finder, an explainable next-game prediction baseline, retrospective MVP analysis, and a verified NBA championship archive.

## Sections

| Lab | URL | Features |
|---|---|---|
| Game Predictor | [Open](https://walkerxavier496-prog.github.io/nba-twin-lab/predict/) | Upcoming matchups, win probabilities, projected scores, team strength, advanced team context, recent form, rest, historical matchups and accuracy tracking |
| MVP Lab | [Open](https://walkerxavier496-prog.github.io/nba-twin-lab/mvp/) | Historical statistical MVP index, season breakdowns and actual award voting |
| Championship Lab | [Open](https://walkerxavier496-prog.github.io/nba-twin-lab/championship/) | NBA champions and Finals MVPs, playoff paths, championship team SRS and advanced statistics |
| Player Twins | [Open](https://walkerxavier496-prog.github.io/nba-twin-lab/) | 13-stat classic and 18-stat advanced player comparisons, careers, peaks and best seasons |

## Verified coverage at V4 launch

- **2025–26 regular season:** exactly **1,230 final games**, with all 30 team W–L records independently cross-checked against the Basketball Reference team summaries. The importer excludes All-Star exhibitions, postponed 0–0 fixtures and the non-standings 2025 NBA Cup final.
- **2026–27:** current completed NBA games and upcoming schedule, refreshed daily from the ESPN scoreboard when available. Each page displays its data freshness.
- **Team advanced statistics:** Basketball Reference team summaries through **2025–26**. These are clearly labelled as *prior-season* matchup context, not current-season ratings.
- **Historical player advanced statistics:** 16,878 player-seasons; latest verified complete player season **2024–25**. The mirror's 2025–26 player data is incomplete and is not silently presented as final.
- **MVP awards:** historical voting through 2025, plus the 2026 MVP independently confirmed by the [NBA's official release](https://pr.nba.com/shai-gilgeous-alexander-2025-26-kia-nba-most-valuable-player/). Actual voting and model rankings are distinct.
- **Champions:** 58 title seasons and Finals MVPs from **1969 through 2026**, including the [2026 New York Knicks](https://www.nba.com/news/history-nba-champions). Player-by-player ring totals are not yet validated.

Coverage changes only when imports succeed. No missing scores, players, titles or awards are invented.

## Game prediction methodology

This is a **transparent heuristic baseline**, not a trained neural network or betting-market model.

1. Process regular-season games chronologically. Update each team's Elo rating using the opponent's strength and a margin-of-victory multiplier.
2. Regress team Elo 32% toward league average between seasons, including *before* the new season's first final.
3. Calculate pregame win probability using a fixed +65 Elo home-court adjustment and a ±26 Elo back-to-back rest adjustment.
4. If verified prior-season team SRS is available, blend **80% Elo edge + 20% SRS-derived edge** to stabilise early-season estimates. The previous-season context is never taken from a future game.
5. Project team scores using shrinkage-adjusted points scored and allowed, plus the projected Elo margin. These are **not possession-adjusted offensive or defensive ratings**.
6. Display team style context from the prior season: offensive/defensive/net rating, pace, three-point attempt rate, eFG%, turnover rate and offensive rebounding. Previous head-to-head games are shown for context, not used as an extra model weight.
7. Backtest every completed current-season game **walk-forward**, using only games before tip-off. Track winner accuracy, Brier score and projected-score error. Run the reproducible scorecard script.

**Not yet included:** verified injuries, expected starters, trades, minutes restrictions, current possession-based matchup data, travel distances or betting odds. Probabilities are not yet calibrated on a multi-season out-of-sample dataset. An early-season win percentage is not proof of a predictive edge. This is not betting or financial advice.

## MVP index

Within each complete NBA season, the retrospective statistical MVP index combines:

- 40% combined offensive + defensive BPM percentile
- 25% points per 100 possessions and true shooting percentile
- 20% assist, rebound and steal percentiles
- 10% minutes availability
- 5% team SRS percentile, when independently validated; otherwise the remaining weights are rescaled

The index is not the official MVP award and does not use vote shares to tune its weights. The 2026 actual MVP is shown separately while the player dataset's 2025–26 season remains incomplete.

## Player Twin model

The advanced model compares PTS/100, TS%, USG%, FTr, 3PAr, 3P%, 2P%, FT%, AST%, TOV%, TRB%, ORB%, DRB%, BLK%, STL%, DBPM, OBPM and height. The classic model uses 13 features. Metrics are converted to within-season percentiles and aggregated with minutes weighting. Missing features are never replaced with fabricated zeros. A statistical twin indicates similarity of playing style, not player greatness.

## Sources

- [Basketball Reference CSV mirror](https://github.com/sumitrodatta/bball-reference-datasets) — historical player and team advanced stats, MVP voting.
- [SpecCRA historical NBA data](https://github.com/SpecCRA/nba_data_scrapers) — cross-checks.
- [NBA Height/Weight](https://github.com/simonwarchol/NBA-Height-Weight) — height supplement.
- [ESPN NBA scoreboard](https://www.espn.com/nba/scoreboard) — **unofficial, undocumented** scoreboard endpoint. ESPN may change or restrict access.
- [Historical Finals dataset](https://github.com/nhford/finalsmvp) — championship seasons and Finals MVPs.
- [NBA official championship history](https://www.nba.com/news/history-nba-champions) — independent title validation.
- [NBA official 2026 MVP announcement](https://pr.nba.com/shai-gilgeous-alexander-2025-26-kia-nba-most-valuable-player/) — current award validation.

This project is independent and not affiliated with the NBA, ESPN or the data maintainers. Check each provider's licensing and reuse terms before commercial use or redistribution of large datasets.

## Test and run locally

Python 3.12+ and Node.js 22+ recommended:

~~~bash
python -m pip install -r requirements.txt pytest
python -m pytest -q
node --test tests/prediction_engine.test.cjs
node --check predict/engine.js
node --check predict/app.js

python build_data.py --no-current
python build_context.py
python build_predictions.py
python build_championships.py
node scripts/model_report.cjs

python -m http.server 8000
# http://localhost:8000/predict/
~~~

## Automated updates and hosting

- Historical player data: .github/workflows/update-data.yml (daily)
- Team stats and MVP votes: .github/workflows/update-context.yml (weekly)
- NBA schedule, results and model audit: .github/workflows/update-predictions.yml (daily)
- Champions and Finals MVPs: .github/workflows/update-championships.yml (weekly)
- Static website deployment: .github/workflows/static.yml

GitHub Pages is configured under **Settings → Pages → GitHub Actions**, using the **Static HTML** workflow. A failed importer leaves the last valid published dataset unchanged. The page shows its actual refresh time rather than claiming to be current.

## Roadmap

Validate injury and starting-lineup feeds; add minutes and player projections; train and calibrate the model across multiple out-of-sample seasons; add playoff-bracket simulations and championship probabilities; match historical championship rosters for player ring counts; complete 2025–26 and 2026–27 player advanced-stat coverage.
