# Regularized player-impact research prototype

This branch introduces a **research-only** ridge adjusted plus-minus estimator in `predict/regularized-player-impact.js`. It does not import proprietary LEBRON, DARKO or RAPTOR data and does not claim to reproduce those systems.

## Input contract
- `as_of_utc`: timestamped prediction cutoff.
- `priors`: unique NBA player IDs, `box_prior` in points per 100 possessions, and a verified `available_at_utc` earlier than cutoff.
- `observations`: five player IDs per team, possession-weighted `margin_per_100`, `possessions`, `ended_at_utc` and `available_at_utc` earlier than cutoff.
- `lambda`: regularization strength (default 100); `half_life_days`: recency half-life (default 45).
- Any invalid or future input fails closed. At least 30 valid observations required.

## Method and limitations
Weighted ridge regression shrinks player coefficients toward pre-tip box-score priors and exponentially downweights older observations. Output is a **diagnostic player impact in points/100**, not a win probability. Current implementation has no intercept, home advantage, opponent/coaching covariates, uncertainty intervals, stint-dependence correction, or calibration. Correlated lineups may still make individual estimates unreliable. No injury, roster, or production pipeline is modified.

## Required next steps before integration
1. Obtain provenance-verified historical on-court five-man lineup stints and pre-tip box priors. **Do not fabricate or silently substitute box-score +/- for adjusted lineup stints.**
2. Add source-specific ingestion and identity/coverage checks; test chronological historical replay.
3. Evaluate regularization, half-life, uncertainty and lineup confounding on rolling-origin splits.
4. Compare incremental predictive value to production Elo, controlling for double counting. Record Brier, log loss, calibration, accuracy and sample sizes.
5. Only after independent validation and owner approval consider integrating into production.

## Tests
`node --test tests/regularized_player_impact.test.cjs`
Full release checks: `bash scripts/validate_release.sh`.

**Status:** prototype committed on a separate branch; tests have not been executed in the connected GitHub environment.
