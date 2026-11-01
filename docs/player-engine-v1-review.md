# Player Engine V1 — recovery checkpoint and independent review

Claude Code built an **uncommitted** player-first research prototype; this checkpoint preserves the working files and their saved walk-forward reports, without promoting the model or changing original immutable predictions.

## Working implementation
- `predict/player-engine.js`: 240-minute regulation player allocation, individual possession/shot budgets, scenario handling for doubtful/questionable players, and with/without-teammate redistribution; combined player projections yield the game score, margin and probability.
- `scripts/player_box_corpus.cjs`: historical compact player box corpus; `scripts/player_engine_backtest.cjs`: chronological backtests and paired comparison; `scripts/player_engine_forecast.cjs`: separate append-only, integrity-hashed research forecasts and grading; `scripts/player_engine_examples.cjs`: examples.
- `tests/player_engine.test.cjs`: 10/10 unit tests passed on 2026-11-01. Existing `scripts/validate_release.sh` passed 70 Python and 249 JavaScript tests (249/249), with untouched original lock hashes.

## Matched walk-forward performance

Source: `research-reviews/player-engine-v1/results/run-3/report.json`; n=3,678 matched 2024–26 historical games. Lower errors are better.

| Model and availability assumption | Winner accuracy | Brier | Team score MAE | Margin MAE |
|---|---:|---:|---:|---:|
| Player engine: participation known **oracle** | 66.50% | 0.20764 | 9.28 | 11.04 |
| Player engine: no availability (pregame knowable) | 66.50% | 0.21127 | 9.37 | 11.21 |
| Player engine: last-three-game absence carryforward | 66.26% | 0.21089 | 9.35 | 11.15 |
| Elo incumbent | 66.42% | 0.21148 | 9.48 | 11.17 |
| Joint Score Machine V1 | 66.99% | 0.20951 | 9.55 | 11.16 |

**Important:** The oracle is not a fair operational pretip forecast: it marks actual nonparticipants OUT using the final game box score. Although this provides an upper-bound diagnostic on injury modelling, it must never be published as live-proven accuracy. The no-availability engine's paired Brier difference against Elo has a 95% interval overlapping zero; its Brier is worse than Score Machine V1 on the matched sample. Both operational improvements and uncertainty about them must be reported.

## Incomplete requirements before promotion
1. Strict pretip NBA injury report mapping to **historical player IDs and active-roster memberships**; verified injury data must be available to the model at the saved cutoff.
2. Backtest with timestamped official injury reports rather than actual participation oracle. A player can be absent for reasons that were not publicly knowable.
3. Explicit age and development-feature study: age is not yet a demonstrated predictive input. Shot-location/tendency features beyond two/three volume are also incomplete.
4. Same-game comparison against strongest operational baseline and frozen prospective forecasting; monitor 5/10/20 form and injury-related subgroup calibration.
5. Website integration is incomplete; retain existing production lock and publication policy until checks pass.

Do not merge/deploy the unfinished research prototype automatically. No existing forecast lock, review, or ledger should be modified.
