# NBA Twin Lab — Product Direction (V17 onward)
Status: approved product direction, 31 October 2026, Australia/Melbourne.

## North star
**Live basketball first, deep evidence-backed intelligence one click away.**
Build a premium independent NBA platform: **NBA broadcast meets F1 telemetry.**
Take design *inspiration* from Real Sports (live, socially relevant player moments), ESPN (gamecentre hierarchy and navigable box scores), Dunks & Threes (transparent, efficient sortable analytics), and StatMuse (explorable natural-language statistical questions), without copying intellectual property.

## Non-negotiables
- The user sees **Live**, **The Machine**, **Player Stats**, **League** as the top-level destinations; player and team watchlists become a first-class preference.
- Real live scores and actual stats are separate from immutable, timestamped, **pre-tip** forecasts. Never backfill a pregame lock after tipoff.
- Models are evaluated using win-rate, Brier, log loss, calibration, score and player-stat MAE, **sample size** and leakage-free as-of splits. Model confidence is not evidence of model accuracy.
- Every displayed derived number has definitions, source, checked/as-of date and clear missing-data behavior. No fabricated video highlights, standings ties, bracket seeds, current rosters or probabilities.
- Lists/tables with comparable metrics should support accessible column sorting, including player boxscores, league standings, Cup standings, model and audit tables; deliberate excluded tables must explain why.
- Dark arena palette, restrained club accents, real *relevant* team logos/headshots when IDs match, responsive mobile layout, fast data loads, fail closed on CORS/outages, avoid ungrounded decorative imagery.
- Accessibility: keyboard-operable controls, focus outlines, readable contrast, stable dimensions, mobile sticky first column where useful and reduced-motion consideration.

## Delivery streams
1. **League and NBA Cup:** Complete conference standings with home/road, last 10, streak, GB, PF/PA, NET proxy, and explicit official-tiebreak caveat; 2026 Cup's six five-team groups, standings, wild-card race, genuine only-on-confirmation knockout bracket. The 2026 group draw and Cup-night schedule must match official NBA publications. Cup OT scoring rules require period breakdown: do not silently apply regular scoring to official Cup point-differential or points-scored tiebreaks.
2. **Shared stats UI:** sortable and filterable data tables, sane nulls, source metadata and as-of; per-model player comparisons and score data with unified conventions.
3. **The Machine:** sortable 6-model challenges and diagnostics, first-class model disagreement, calibration and untouched-forecast validation.
4. **Visual/performance:** polished dark 'broadcast x telemetry' design, prioritised game content, compact live score cards, skeleton/status states, lazy media and low-overhead updates.
5. **My Teams/Players:** user-selected teams and followed-player IDs, local device preferences as a first stage (not cloud sync or closed-app push). Verified repeated player game logs before labelling anything a *streak*.

## Verified references
- https://www.nba.com/nba-cup/2026
- https://www.nba.com/nba-cup/2026/standings
- https://www.nba.com/news/nba-cup-101
- https://www.nba.com/news/emirates-nba-cup-2026-groups-announced
- https://www.espn.com/nba/scoreboard
- https://www.realapp.com/
- https://dunksandthrees.com/
- https://www.statmuse.com/nba

## Rollout and validity
Ship progressively, test with Node and actual browser/provider where possible, check GitHub Actions and Pages. A green CI run proves the tests passed, not that external ESPN APIs or all user browsers can access them. Track unavailable dependencies explicitly; never imply a complete integration when partial.
