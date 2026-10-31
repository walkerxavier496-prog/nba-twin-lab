# One Machine — joint score and margin research V1

## Product contract
One headline forecast must show one winner, one win probability, a coherent projected final score, an implied margin, uncertainty and source-backed reasons. Six existing engines remain **audit benchmarks only**, never six competing headline predictions. All pre-tip estimates are immutable; grading happens after independently verified finals.

## Implemented architecture

- `predict/score-machine.js`: zero-Elo ridge-regression model trained jointly for **total points** and **home margin** on strictly historical pregame snapshots. Home and away scores are `(total ± margin)/2`. Winner probability is the logistic transformation of the *same* margin, with its scale fitted on training games only. Rounded score ties are resolved in the continuous margin's direction and clearly understood as display rounding.
- `scripts/score_machine_audit.cjs`: walks forward by NBA season; each year is evaluated only using earlier-season training data. The default audit is read-only. `--preview` emits provisional slate predictions, `--model` includes the frozen trained coefficients in stdout.
- `scripts/daily_tracker.cjs`: **only for new eligible pre-tip locks**, trains on previous-season features, attaches a `research_score_machine` output with data SHA256, raw scores, display scores, margin, probability, top numeric contributing factors and explicit non-production status. The locked baseline remains intact.
- `scripts/audit-core.cjs`: postgame review scores `joint_score_margin_v1` on the frozen value for win accuracy, Brier, log loss, score MAE and margin error, alongside the benchmarks.
- `predict/one-machine.js` and `assets/concept3-hub.js`: display one locked research pick with scores, margin and explanations when available; older locks retain their recorded research challenger view. Six benchmark engine comparisons are in the Model Breakdown tab.

## Walk-forward audit (2024–2026)

3,690 games. Winner accuracy **67.05%**, Brier **0.20940**, average team-score MAE **9.57 points**, margin MAE **11.16 points**. The training-derived 10–90th percentile margin residual band contained **78.08%** of held-out results. The legacy M5 common-game Brier **0.20732** (3,643 games) is on a *different coverage set*; this is not a fair same-game superiority claim. Score Machine V1 has NOT passed production promotion.

## Open blockers

1. Historic player availability in this dataset is inferred; official game-day injuries and verified current rotation are **not inputs** to the score model. `official_game_day_availability_used:false` is locked explicitly. A prospective roster-first model needs a verified historical injury/roster archive and chronological feature building.
2. Train and compare the full replacement against all incumbent models on **identical games** with error bars and prospective sealed locks; test major offseason roster turnovers and the Charlotte/Philadelphia diagnostic without fitting to that result.
3. Calibrate interval coverage prospectively and add score/total quantile evaluation; display uncertainty instead of claiming exact-score certainty.
4. Show factors as *numerical regression contributions, not causal basketball explanations*. Validate tactical interaction and line-up scenarios before attributing causation.
5. Keep `production_elo_v7` in the immutable ledger until the owner explicitly reviews a valid replacement. No automatic promotion, backfill, force-push or deployment.
