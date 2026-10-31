# V19 — Concept 3 implementation

**Approved reference:** [Owner-selected Concept 3 design blueprint](approved-design-concept-3.md)  
**Status:** Implementation committed; awaiting visual comparison in an actual desktop/mobile browser and GitHub Actions verification.
**Date:** 31 October 2026 (Australia/Melbourne)

## Implemented

- One shared dark navy, electric-blue/cyan and restrained-violet visual system: `assets/v19-concept3.css`.
- Loaded *after* existing route-specific legacy styles on 15 routes: Home, Predictor, Daily Predictions, Model Rankings, Player Projections, Team Intelligence, Accuracy Ledger, League, Game Centre, Watchlist, Player Twins, Model Research and history/intelligence tools.
- Home: Concept 3 hero moved above live games, prominent differentiated typography, featured matchup preserved, four live-data-backed KPIs, a responsive athlete portrait that comes **only from a frozen player projection for the featured game** (or gracefully disappears), all original live score/box-score functions preserved.
- Predictor: true team-vs-team identity bar and three genuine comparable model cards (production Elo, inferred roster research, seeded possession simulation). Link to the **six immutable challenger-model predictions** on Daily Predictions. Preserves selection, score estimates, model validation, transparency, V18 roster audit and official availability warnings.
- Daily Predictions: immutable slate, source/freshness/accuracy summary, six-model game selection and player analysis moved above the separate live score desk. No results substituted for original pretip forecasts.
- Player Projections / Team Intelligence / Accuracy / League / Game Centre: unified panels, typographic scale, tab treatments, statistical tables, matchup displays and mobile layout rules; no domain-logic changes.
- Mobile: breakpoints at 1200, 950, 760 and 650 px; touch navigation retained, readable game cards and overflow-safe tables, reduced-motion support.
- Regression checks in `tests/v19_concept3.test.cjs` and the shared `.github/workflows/site-mobile.yml` include linked assets, expected page order, model input/output DOM IDs and immutable original forecast records.

## Design and data rules

All mockup metrics are *illustrative only*. Live site values must be sourced from the existing verified NBA feeds, pretip locks or historical audit. The primary Elo estimate remains historical and does not claim official injury integration. The V18 player strength indicator has not been promoted to winner probability. Genuine current game results and pretip model probabilities remain visually and methodologically separate.

## Remaining visual acceptance

1. Visually compare Home and Game Predictor against the original nine-panel Concept 3 image (desktop widths 1440 and 1280 px, tablets, and mobile widths 390 and 375 px).
2. Confirm hero artwork and team marks load where external CDN permits, with sensible fallback and no external-media blocking issues.
3. Check contrast, typography and cropped text in long team names and low-resolution screens.
4. Validate interaction focus, menus, table sorting, cards, team filters, roster warnings and header on all primary routes.
5. Review and merge any measured visual fixes into the same locked design system, *not* a competing new visual concept.
6. Confirm automated GitHub Actions checks and deployed GitHub Pages assets match the committed source.

**Design policy:** No wholesale re-theme. Any refinements must match approved Concept 3. Independent UX improvements can be reviewed, but should remain within its existing visual system.
