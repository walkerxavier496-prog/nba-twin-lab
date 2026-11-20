# Candidate free historical NBA lineup-stint data

Research date: 21 November 2026 (Australia/Melbourne).

## Candidate
- [ramirobentes/nba_data](https://github.com/ramirobentes/nba_data): publicly documented season Parquet datasets for play-by-play, possessions and lineup_stats. The project's documentation says lineup_stats is one row per uninterrupted five-on-five stint, and covers seasons through 2025-26. **Not yet downloaded, schema-validated, or authenticated in this repository.**
- [NBA Stats V3 via nba_api](https://github.com/swar/nba_api/blob/master/docs/nba_api/stats/endpoint_guide.md): primary play-by-play and box-score endpoints. Reconstructing stints from events requires substitution, clock, starter, score and possession audits; GameRotation availability is intermittent.
- [NBA lineup model historical source coverage](https://evanz.github.io/nba-lineup-model/data/historical-source-coverage/): demonstrates historical NBA Stats V3-first provenance and source validation strategy; independent reference, not an input to this project.

## Data integration acceptance gate
1. Verify provider permission/licence and access; inspect exact Parquet schema and official player/game identity mapping. Do not assume precomputed season lineup aggregates are individual stints.
2. Preserve source URI, version, SHA-256, retrieval time, game date, game ID, stint ID, both exact five-player lineups, possessions and scoring margin.
3. **Historical leakage:** a file downloaded today cannot be presented as evidence it was available before a 2024 game. Use archived timestamped raw source or reconstruct prior-season-only training windows with explicit information-availability policy. Treat season-end aggregates as unavailable for in-season historical forecasts.
4. Audit all game and lineup scoring totals against verified final box scores, and document whether possession counts mean offensive, defensive, or averaged possessions.
5. Construct *independent* pregame box-score priors; never derive a prior from games played after the forecast cutoff.
6. Feed verified normalized stints to `predict/player-impact-fit-verified.js`, which calls the provenance gate and ridge estimator. It does not certify that metadata is genuine.
7. Add season-spanning walk-forward training/evaluation and compare to unchanged production Elo using paired Brier/log loss and calibration with confidence intervals. No production promotion without explicit approval.

## Status
Candidate source identified; no real NBA lineup dataset imported or backtested. The adapter is not connected to the live pipeline. No paid API keys authorized.
