# Unified engine challenger — 2026-11-10 baseline report

Status: **EXPERIMENTAL / DO NOT DEPLOY**. No verified live forward improvement.

## Reproduction
Commands: node --test tests/unified_engine.test.cjs and node scripts/evaluate_unified.cjs.
All 6,150 historical game IDs were evaluated with E.ratings(history.games, game.date).
Training: 2022–24 (3,690 games). Validation: 2025 (1,230). Previously inspected diagnostic: 2026 (1,230).
Historical lineups were unavailable; no injuries or minutes have been fabricated.

| Season | Elo accuracy | Unified accuracy | Elo Brier | Unified Brier | Recalibrated Elo accuracy |
|---|---:|---:|---:|---:|---:|
| 2025 validation | 66.34% | 66.83% | 0.21291 | 0.21092 | 66.99% |
| 2026 inspected | 68.78% | 68.94% | 0.20619 | 0.20586 | 69.02% |

## Paired game-bootstrap, unified minus Elo
- 2025 Brier difference −0.001986; approximate 95% CI [−0.004287,+0.000092].
- 2025 accuracy +0.49 percentage points; approximate CI [−0.41,+1.38] points.
- 2026 Brier difference −0.000328; approximate 95% CI [−0.002311,+0.001777].
- 2026 accuracy +0.16 percentage points; approximate CI [−0.65,+0.98] points.
- **All intervals include zero.** No statistically convincing gain. The 2026 season has been inspected and is not an untouched holdout.

## Findings
1. Recent margin/rest/prior-SRS features offer only tiny Brier gains over Elo recalibration; recalibrated Elo had higher winner accuracy.
2. Features are correlated with the Elo strength input.
3. The unified model's 2026 ECE was 0.0418 compared with Elo 0.0340 (worse).
4. The old October report listed 69.19% for 2026 Elo; current-code replay yielded 68.78%. Investigate version drift before cross-report comparisons.
5. Meaningful player/lineup tests require archived, timestamped, source-attributed pre-tip data.
6. Historical locks untouched. No changes to live model, predictions or probabilities.

## Goose reviewer assignment
Inspect model code and test suite read-only. Explain Elo version drift, identify hidden feature correlation and overfit, design leakage-safe player impact data with expected-minute uncertainty, and propose stronger rival architectures. Record findings separately; do not deploy or edit the same model files.
