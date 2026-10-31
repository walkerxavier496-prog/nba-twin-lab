# NBA Twin Lab — Evidence-led basketball predictions

**Website:** https://walkerxavier496-prog.github.io/nba-twin-lab/

NBA Twin Lab is an independent, open-source basketball research platform hosted on GitHub Pages. It combines a statistical player twin finder, an explainable next-game prediction baseline, retrospective MVP analysis, and a verified NBA championship archive.

**Approved future design:** [Concept 3 — locked visual design reference](docs/approved-design-concept-3.md). The project owner selected the third 9-panel dark NBA/F1 analytics concept on 31 October 2026. This is a **design direction only**, not a deployed redesign; future visual work must use that reference and preserve existing prediction and audit functions.

## Primary website

| Section | URL | Purpose |
|---|---|---|
| **Game Predictor** | [Open](https://walkerxavier496-prog.github.io/nba-twin-lab/predict/) | Live Elo baseline, alternative simulation, score projections and historical validation |
| **Team Intelligence** | [Open](https://walkerxavier496-prog.github.io/nba-twin-lab/team-intelligence/) | Real opponent-adjusted team strength, recent efficiency momentum, eFG, shooting styles, turnovers, offensive rebounds, free-throw rate and pace |
| **Five Model Challenge** | [Open](https://walkerxavier496-prog.github.io/nba-twin-lab/challenge/) | Common-game leaderboard for five pregame methods plus a nested earlier-season weighted ensemble |
| **Daily Predictions** | [Open](https://walkerxavier496-prog.github.io/nba-twin-lab/challenge/daily.html) | Locked six-model forecasts for each game, V9 player projections and postgame accuracy |
| **Model Research** | [Open](https://walkerxavier496-prog.github.io/nba-twin-lab/models/) | All historical backtests and experiments, including the basketball-science walk-forward audit |
| **Accuracy Ledger** | [Open](https://walkerxavier496-prog.github.io/nba-twin-lab/audit/) | Immutable daily pregame locks, separate final-result reviews, calibration and longitudinal model/player metrics |
| **Player Twins** | [Open](https://walkerxavier496-prog.github.io/nba-twin-lab/twins/) | Original season-adjusted statistical twin finder, moved from the home page without deleting its features |

**Legacy experiments remain available under Model Research:** [V6 historical audit](https://walkerxavier496-prog.github.io/nba-twin-lab/history/), [V7 intelligence](https://walkerxavier496-prog.github.io/nba-twin-lab/intelligence/), [V8 research](https://walkerxavier496-prog.github.io/nba-twin-lab/research/), [V9 player stats](https://walkerxavier496-prog.github.io/nba-twin-lab/player-stats/), [Season Test](https://walkerxavier496-prog.github.io/nba-twin-lab/season-test/), [MVP Lab](https://walkerxavier496-prog.github.io/nba-twin-lab/mvp/) and [Championship Archive](https://walkerxavier496-prog.github.io/nba-twin-lab/championship/).

## V18 roster integrity gate (research stage)

The Game Predictor now exposes a **roster/injury integrity audit** with per-player expected minutes and exclusions. A player is removed from the audited expected rotation if an authentic, timely and ID-matched official report marks them **OUT** or if they are not on a separately verified active roster. Questionable/probable/doubtful statuses create unresolved minute scenarios; unavailable official feeds produce an explicit warning, never a fictional lineup. Projected minute leaders are **not confirmed starters**.

The daily-audit workflow now **attempts to ingest NBA.com active rosters and the NBA official injury PDF** into `data/availability-current.json` before future eligible tipoffs. It fails closed when the source is missing or cannot be matched; actual live success is not yet independently verified. No V18 roster-first win probability is promoted. Existing Elo probabilities are visibly labelled **historical team estimates** rather than verified game-day lineup probabilities. V18 also produces a **current-player-only impact index** with 240-minute allocation and availability scenarios; its directional signal is saved and later graded separately, not passed off as calibrated win odds. Future daily immutable locks include a V18 input-audit record; the original 31 October 2026 locks are unchanged. See [V18 integration and remaining validation requirements](docs/v18-roster-integrity.md).

## Early-season roster turnover correction (experimental)

The original Elo baseline still carries last season's team quality into the new season. This can overstate confidence after trades and injuries. The `predict/roster.js` module compares **prior-season rotation minutes** against the players in a strictly pregame current-season inferred rotation. It provides three research features: departed-prior-quality shock, Elo uncertainty when prior rotations changed, and early current-season opponent-adjusted net-rating change. Their coefficients are **learned from earlier seasons**, not manually set to match an individual game.

`build_v7_intelligence.py` now separately exports a compact `data/rotation-history.json` of historical pregame player IDs and expected minutes (no target-game results). `scripts/roster_research.cjs` runs a 2023–2026 rolling-origin comparison against both Elo and the previously tested V8 combined player-adjusted model; it publishes `data/roster-priors.json` and `data/roster-research-report.json`. The browser shows an explicitly experimental roster forecast when verified inputs are available and otherwise fails closed to the unchanged Elo baseline.

**Important:** rotation membership is inferred from earlier appearances, not verified transactions, official injuries or confirmed lineups. A missing player may be injured rather than traded; an early-season roster with few games is particularly uncertain. No roster model is promoted automatically.

## Five Model Challenge

`scripts/five_model_challenge.cjs` evaluates five separately specified pregame game-winner models and a sixth weighted ensemble: M1 Elo, M2 Basketball Science, M3 Player / Roster, M4 seeded possession Monte Carlo, M5 fixed-L2 regularized logistic machine learning, and M6 nested weighted ensemble. The models overlap in inputs and are not described as statistically independent.

The primary leaderboard uses only games where all six predictions are available. Every fitted base model trains only on seasons earlier than its evaluation season. For evaluation season `S`, ensemble weights are selected exclusively from complete out-of-fold predictions in seasons earlier than `S`; the games being scored never choose their own weights. Brier score is primary, with accuracy, log loss, ECE, confidence intervals and score MAE where the model actually produces scores. Player PTS/REB/AST/3PM MAE remains a separate daily-ledger evaluation.

Future daily locks store every available challenge probability, supported score, Monte Carlo seed, ensemble weights, model version and source cutoff. Unavailable models are recorded explicitly. The original 31 October 2026 pretip lock is immutable and is not regenerated or rewritten.

## Basketball-science research

The new `scripts/game_science.cjs` uses exactly the same `predict/science.js` feature definitions as the Team Intelligence dashboard. It tests opponent-adjusted team strength, recent efficiency momentum (last five versus season, shrunk), rest, **Four Factors** (effective field-goal percentage, turnovers, offensive rebounding and free-throw rate), three-point shot style, pace and strictly earlier head-to-head meetings.

Each candidate is a fixed-regularization logistic model trained only on seasons **earlier than the predicted season**. Four rolling-origin evaluation seasons (2022–23 to 2025–26; 4,920 games) are scored on Brier, log loss, winner accuracy and calibration, with day-clustered paired bootstrap confidence intervals. The already inspected 71 games in 2026–27 are shown separately, **not** as a new untouched test. Comparisons against *calibrated Elo* and *adjusted-strength Elo* distinguish actual incremental basketball information from merely rescaling win probabilities.

The historical audit is generated by `.github/workflows/game-science.yml` into `data/game-science-report.json`. The live forecast stays on Elo until genuinely new, prospective, preregistered results justify promotion. **Head-to-head is not an emotional rivalry bonus**, and the system does not claim access to verified injuries, travel mileage, coaching strategy or lineups.

## V9 player stat forecasting

The player stat lab forecasts seven individual box-score categories for upcoming NBA games, based on verified historical NBA Stats-derived player logs. The V7 player importer now computes a pregame-only, exponentially weighted recent per-36 rate for each statistic and multiplies it by expected minutes **conditional on playing**. The dashboard offers both conditional projections and projections discounted by an **inferred** play probability. Matchup pace and opponent defensive efficiency add modest, capped heuristic adjustments; these are not yet statistically validated.

The new `data/v9-player-report.json` evaluates the historical conditional **unadjusted base-rate** point estimates against a naive recent per-game average on matched appearances. Live opponent and pace adjustments have not yet been backtested. Because official DNP and pregame injury archives are absent, **only actual participating players are scored**; this is a selected sample and cannot validate the model's play probabilities. The player forecast does not yet have calibrated intervals, correlated full-game box-score simulation, official starting lineups or validated injuries. Historical accuracy is shown only after the audited report is generated successfully.

V9 is a research-only feature. It does not modify the live game predictor or establish an edge in betting markets. The later **Twin League** franchise simulator will maintain an entirely separate fictional league state, never mixed with real prediction training data.

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

## V7 rolling-origin result

V7 does **not** relabel the already examined 2025–26 season as untouched. It uses rolling origins: each of 2022–23, 2023–24, 2024–25 and 2025–26 is predicted with model settings chosen only from earlier seasons. That produces 4,920 scored games. A separate 71-game 2026–27 check uses parameters frozen from 2021–22 through 2025–26, but is described as small-sample corroboration rather than a preregistered holdout.

| Model · rolling origin (4,920 games) | Accuracy | Brier | Log loss | ECE | Score MAE / team |
|---|---:|---:|---:|---:|---:|
| Elo baseline | 65.7% | 0.2152 | 0.6197 | 0.0348 | **9.38** |
| V5 possession Monte Carlo | 65.7% | 0.2224 | 0.6360 | 0.0640 | 9.51 |
| V6 locked blend | 65.4% | 0.2139 | 0.6160 | **0.0151** | **9.38** |
| Independent rolling team model | 62.1% | 0.2254 | 0.6418 | 0.0793 | 9.54 |
| Player-adjusted independent model | 63.2% | 0.2244 | 0.6399 | 0.0710 | 9.53 |
| V7 rolling combination | **65.7%** | **0.2139** | **0.6160** | 0.0247 | 9.39 |

The V7 combination's paired Brier difference versus Elo is **−0.0014** (95% bootstrap interval **−0.0022 to −0.0006**), but its difference versus the already-fixed V6 blend is effectively zero (**−0.00004**, interval **−0.0009 to +0.0007**). The player proxy's **−0.0009** Brier point estimate versus its independent team base is inconclusive (interval **−0.0020 to +0.0002**), and both independent variants still trail Elo standalone. The fresh 71-game check is 60.6% / 0.2187 for V7 versus 62.0% / 0.2200 for Elo—far too small and mixed for a strong deployment claim. Therefore V7 is exposed as a research model while Elo remains the simple live default. No model reaches a credible 70% out-of-sample accuracy threshold.

V7's source feed has all 1,230 games and NBA Stats-derived player logs for each evaluated season. It publishes derived pregame aggregates only. The upstream `llimllib/nba_data` repository did not declare a license at build time, so raw parquet files are not vendored. Historical official pregame injury reports were not available as a reproducible archive; every player availability label is explicitly **inferred**, and target-game minutes or participation never enter a forecast.

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
- Player stat forecasts and historical audit: .github/workflows/v9-player-stats.yml (daily)
- Immutable pregame locks and nightly final-result reviews: .github/workflows/daily-audit.yml (hourly trigger, Melbourne-time safe windows)
- Static website deployment: .github/workflows/static.yml
- Historical five-season audit: .github/workflows/historical-audit.yml

GitHub Pages is configured under **Settings → Pages → GitHub Actions**, using the **Static HTML** workflow. A failed importer leaves the last valid published dataset unchanged. The page shows its actual refresh time rather than claiming to be current.

### Daily accuracy ledger

The hourly trigger is deliberate: GitHub cron uses UTC and does not follow Australian daylight saving. `scripts/daily_tracker.cjs` converts every timestamp with the `Australia/Melbourne` IANA timezone, discovers that local date's slate, and writes exactly one lock only 45–180 minutes before the first tip. A lock is refused when schedule or V9 data is stale, future-dated, incomplete, already live or post-tip. Existing locks are never overwritten.

From 6 p.m. Melbourne time, and only at least four hours after the last scheduled tip, the same workflow retries the ESPN public summary feed until every game is final and each team has a valid player table. Results are written to a separate review artifact. Player MAE includes only provider-listed players with minutes greater than zero; explicit DNPs and absent box-score rows are excluded rather than scored as zero. `data/audit-ledger.json` is a reproducible derived index with per-model win accuracy, Brier, log loss, score MAE, calibration and PTS/REB/AST/3PM MAE. Production remains `production_elo_v7`; research models are versioned comparisons and cannot promote themselves.

## Roadmap

Add an automated, timestamped official injury feed (daily V9 locks currently state that availability is inferred and projections are conditional on playing); ingest leakage-safe same-season possession event rates; model travel and roster continuity; preserve a newly untouched season for every future model change; add playoff-bracket simulations and championship probabilities; match historical championship rosters for player ring counts; complete 2025–26 and 2026–27 player advanced-stat coverage.
