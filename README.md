# NBA Twin Lab V6 — Historical model audit

**Website:** https://walkerxavier496-prog.github.io/nba-twin-lab/

NBA Twin Lab is an independent, open-source basketball research platform hosted on GitHub Pages. It combines a statistical player twin finder, an explainable next-game prediction baseline, retrospective MVP analysis, and a verified NBA championship archive.

## Sections

| Lab | URL | Features |
|---|---|---|
| Game Predictor | [Open](https://walkerxavier496-prog.github.io/nba-twin-lab/predict/) | Up to 100,000 possession-by-possession simulations, projected score ranges, team strength, advanced context, recent form, rest and held-out model comparison |
| Historical Model Lab | [Open](https://walkerxavier496-prog.github.io/nba-twin-lab/history/) | Five complete seasons, 6,150 pre-tipoff predictions, Elo/Monte Carlo/blend comparisons, calibration, confidence intervals, ablations and condition splits |
| Season Test | [Open](https://walkerxavier496-prog.github.io/nba-twin-lab/season-test/) | Strict opening-night walk-forward backtest, first 1/3/5 games, predicted versus actual conference standings, 82-game strength projections and preseason A/B test |
| MVP Lab | [Open](https://walkerxavier496-prog.github.io/nba-twin-lab/mvp/) | Historical statistical MVP index, season breakdowns and actual award voting |
| Championship Lab | [Open](https://walkerxavier496-prog.github.io/nba-twin-lab/championship/) | NBA champions and Finals MVPs, playoff paths, championship team SRS and advanced statistics |
| Player Twins | [Open](https://walkerxavier496-prog.github.io/nba-twin-lab/) | 13-stat classic and 18-stat advanced player comparisons, careers, peaks and best seasons |

## Verified historical coverage

- **Five evaluated seasons:** all **6,150** regular-season games from 2021–22 through 2025–26, plus all **1,080** games from 2020–21 as Elo warm-up history.
- **Independent reconciliation:** every season's game count and all 30 team W–L records match the separately sourced Basketball Reference team summaries. The three non-standings NBA Cup title games are explicitly excluded; other Cup games count normally.
- **Strict chronology:** all 6,150 forecasts passed an automated check that every state input was timestamped before tipoff. Advanced profiles always come from the previous completed season.

- **2025–26 regular season:** exactly **1,230 final games**, with all 30 team W–L records independently cross-checked against the Basketball Reference team summaries. The importer excludes All-Star exhibitions, postponed 0–0 fixtures and the non-standings 2025 NBA Cup final.
- **2026–27:** current completed NBA games and upcoming schedule, refreshed daily from the ESPN scoreboard when available. Each page displays its data freshness.
- **Team advanced statistics:** Basketball Reference team summaries through **2025–26**. These are clearly labelled as *prior-season* matchup context, not current-season ratings.
- **Historical player advanced statistics:** 16,878 player-seasons; latest verified complete player season **2024–25**. The mirror's 2025–26 player data is incomplete and is not silently presented as final.
- **MVP awards:** historical voting through 2025, plus the 2026 MVP independently confirmed by the [NBA's official release](https://pr.nba.com/shai-gilgeous-alexander-2025-26-kia-nba-most-valuable-player/). Actual voting and model rankings are distinct.
- **Champions:** 58 title seasons and Finals MVPs from **1969 through 2026**, including the [2026 New York Knicks](https://www.nba.com/news/history-nba-champions). Player-by-player ring totals are not yet validated.

Coverage changes only when imports succeed. No missing scores, players, titles or awards are invented.

## Game prediction methodology

This is a **transparent simulation model**, not a trained neural network or betting-market model. The original Elo forecast remains intact as the comparison baseline.

1. Process regular-season games chronologically. Update each team's Elo rating using the opponent's strength and a margin-of-victory multiplier.
2. Regress team Elo 32% toward league average between seasons, including *before* the new season's first final.
3. Calculate pregame win probability using a fixed +65 Elo home-court adjustment and a ±26 Elo back-to-back rest adjustment.
4. If verified prior-season team SRS is available, start with **20% prior-year SRS / 80% Elo** and exponentially reduce the prior weight as regular-season games accumulate. A separately verified preseason sample gets only ~11% of a normal game's Elo update and decays rapidly. The previous-season context is never taken from a future game.
5. Build a matchup possession profile from validated prior-season pace, offensive/defensive rating, eFG%, opponent eFG%, turnover rate, opponent turnover rate, three-point attempt rate, free-throw rate, offensive rebound rate and defensive rebound rate. Current-season scoring is blended in only from earlier games.
6. Simulate each possession as a turnover, free-throw trip, 2-point or 3-point attempt, miss, and possible offensive rebound. Game pace varies stochastically; tied games play simulated overtime. The engine is seeded so identical inputs reproduce identical results and is capped at **100,000 games per matchup**.
7. Display mean scores, 10th–90th percentile score ranges, expected possessions and the underlying rates. Previous head-to-head games are context only, not a separate predictive weight.
8. Backtest every completed current-season game **strictly walk-forward**, using only games before tip-off and advanced profiles from seasons before the predicted game. Compare Monte Carlo with the same Elo baseline using winner accuracy, Brier score, expected calibration error (ECE) and score MAE.

### V6 historical result

The V6 audit trains the combined model only on 2021–22 through 2023–24, uses 2024–25 as validation, and keeps 2025–26 untouched for the final test. Historical Monte Carlo uses 1,000 seeded possession simulations per game; the live matchup simulator still supports 100,000.

| Model · untouched 2025–26 | Accuracy | Brier | Log loss | ECE | Score MAE / team |
|---|---:|---:|---:|---:|---:|
| Current Elo baseline | **69.2%** | 0.2056 | 0.5992 | 0.0366 | **9.59** points |
| V5 possession Monte Carlo | 67.7% | 0.2164 | 0.6237 | 0.0816 | 9.72 points |
| Trained combination | 68.9% | **0.2054** | **0.5980** | **0.0330** | **9.59** points |

The trained combination is 80% Elo / 20% Monte Carlo, with a calibration slope of 0.90 and bias of −0.05. It has the best point-estimate Brier, log loss and ECE, but its paired Brier improvement over Elo is only **0.0002** and the 95% bootstrap interval is **−0.0026 to +0.0018**. Because that interval crosses zero, **V6 keeps Elo as the production default**. Standalone V5 Monte Carlo is worse than Elo on the untouched season and is not promoted.

An ablation keeping SRS but replacing all advanced matchup tendencies with league-average fallbacks shows the full tendency model improves five-season Monte Carlo Brier by **0.0031**, log loss by **0.0068**, and score MAE by **0.04** points per team. Those inputs are useful, but not enough to make the overall Monte Carlo model superior.

**Not yet included:** verified injuries, expected starters/minutes, player availability, trades, travel distance, roster continuity, same-season possession event rates or betting markets. Previous-season style is leakage-safe but slow to reflect offseason changes. This is not betting or financial advice.

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
node --test tests/monte_carlo.test.cjs
node --check predict/engine.js
node --check predict/app.js

python build_data.py --no-current
python build_context.py
python build_predictions.py
python build_championships.py
node scripts/model_report.cjs
python build_historical.py
node scripts/historical_backtest.cjs --simulations 1000 --bootstrap 1000
python build_preseason.py
node scripts/season_backtest.cjs

python -m http.server 8000
# http://localhost:8000/predict/
# http://localhost:8000/history/
~~~

## Automated updates and hosting

- Historical player data: .github/workflows/update-data.yml (daily)
- Team stats and MVP votes: .github/workflows/update-context.yml (weekly)
- NBA schedule, results and model audit: .github/workflows/update-predictions.yml (daily)
- Champions and Finals MVPs: .github/workflows/update-championships.yml (weekly)
- Opening-night projected vs actual standings and preseason A/B test: .github/workflows/season-test.yml (daily)
- Static website deployment: .github/workflows/static.yml
- Historical five-season audit: .github/workflows/historical-audit.yml

GitHub Pages is configured under **Settings → Pages → GitHub Actions**, using the **Static HTML** workflow. A failed importer leaves the last valid published dataset unchanged. The page shows its actual refresh time rather than claiming to be current.

## Roadmap

Add timestamped injury/availability and expected-minutes snapshots; ingest leakage-safe same-season possession event rates; model travel and roster continuity; preserve a newly untouched season for every future model change; add playoff-bracket simulations and championship probabilities; match historical championship rosters for player ring counts; complete 2025–26 and 2026–27 player advanced-stat coverage.
