# Unified NBA decision engine — Goose review brief

This is an **offline challenger**, not a proven improvement or a production switchover.

## Objective
Use ONE game-winner probability function informed by time-valid rating, recent margin, rest, previous-season strength and verified pre-tip lineup estimates. Do not average multiple published model picks.

## Data boundaries
- Current production Elo (predict/engine.js) remains the benchmark.
- Chronology-corrected 2025–26 Elo: 68.78% winner accuracy, 0.20618665 Brier over 1,230 retrospectively inspected games. The older legacy report listed 69.19%, but used different result-availability assumptions; see research-reviews/chronology-v1/evaluations/paired-v1/comparison.json. **Not an untouched holdout**.
- Never change forecast.lock.json, old anchors, audit ledger or any historical game outcomes.
- No feature observed after tip may enter a prediction.
- Missing historical lineups are **unavailable**, never invented.
- Any new weight fit must use only training seasons; preserve 2025 as validation and acknowledge 2026 is an inspected diagnostic set.

## Goose assignment (independent reviewer)
Read-only inspect predict/unified-engine.js and tests/unified_engine.test.cjs, compare with predict/engine.js and scripts/historical_backtest.cjs. Identify leakage, time issues, statistical overfit, correlation of features, baseline duplication, missing coverage and stronger alternatives. Save findings to a separate goose-review.md (never edit the model being reviewed). No paid APIs; no deployment. Work and Goose must not edit the same file simultaneously.

## Acceptance criteria
1. All existing integrity and prediction tests pass.
2. Challenger has an honest reproducible walk-forward evaluation.
3. Winner accuracy, Brier, log loss and calibration are all reported against Elo on identical game IDs.
4. No rollout or headline accuracy claim until sufficient truly forward locked forecasts show improvement.

## Local instructions
Run node --test tests/unified_engine.test.cjs to verify the new module.
