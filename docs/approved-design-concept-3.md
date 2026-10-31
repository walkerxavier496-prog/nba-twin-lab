# NBA Twin Lab — APPROVED WEBSITE DESIGN: CONCEPT 3

**Design decision:** APPROVED / VISUAL DIRECTION LOCKED  
**Approved by:** Project owner, 31 October 2026 (Australia/Melbourne)  
**Status:** V19 implementation committed and applied across primary routes; final visual QA still pending. This document remains the controlling design reference, not permission for unrelated future redesigns.

## Original reference

The approved visual is **the THIRD generated concept board** from the 31 October 2026 design discussion: the 9-panel image headed by “1. HOME DASHBOARD (CONCEPT)” and “2. GAME PREDICTOR (CONCEPT)”, with the remaining panels “3. GAME DETAILS & ANALYSIS”, “4. EXPECTED LINEUPS”, “5. PLAYER PROJECTIONS”, “6. DAILY PREDICTIONS SLATE”, “7. ACCURACY AUDIT”, “8. MOBILE VIEW” and “9. DESIGN SYSTEM”.

**Exact original reference PNG:** `nba-twin-lab-approved-concept-3.png`, preserved as a conversation file with SHA-256 `ba031a2f0c1ec523c98e14416afc346217ff307686a3ad76f77645ca836a88a2`. The reference image is **not currently committed to this repository**. Retain that PNG when implementing. This specification describes, but does not replace, the visual.

**Priority:** Match Concept 3 rather than Concepts 1 or 2. Never restart the aesthetic from scratch for each page.

## Approved design character

- Premium dark NBA analytics / game-day broadcast interface, with elements of F1 telemetry and modern professional trading-style dashboards.
- Near-black midnight navy background, restrained electric-cyan/electric-blue/violet gradients, high-contrast white typography. Use saturated colour for evidence-driven highlights rather than coating every panel in neon.
- Crisp, athletic condensed/bold large headings; smaller, clean, legible data typography; strong numeric alignment.
- Soft card boundaries, subtle 1-pixel navy/blue borders, understated glows, 8–14 px radii, sophisticated hover and active-tab states.
- Tight, efficient top navigation; logical hierarchy and space for real-time data. The hero can be cinematic but content views should remain dense, usable and fast.
- Real NBA team marks, genuine player media where correctly licensed and available. **All figures, teams, status pills and player names in concept imagery are placeholders, not verified NBA facts or model results.**
- Layout should remain visually cohesive between desktop and mobile. No horizontal overflowing box-score tables without an intentional responsive scroll container; touch-friendly buttons and accessible contrast.

## Core page wireframes to build, in order

1. **Home / Dashboard** — wide hero with blue/violet athletic imagery, large “Smarter NBA Predictions” typographic treatment, Today's Featured Matchup on right, four compact KPI tiles, live results and direct access to today's predictions. No redundant clutter.
2. **Game Predictor** — dedicated head-to-head hero with both teams and tip time, primary win-probability visualization with source/model labeling, model comparison cards, and a side rail for verified key factors. If roster/injury inputs are missing, the visual must label historical-only probability, never imply live verified certainty.
3. **Game Details & Analysis** — tabbed sections for Prediction, Lineups, Player Projections, Matchup Analysis and Model Breakdown; team Four Factors / efficiency comparison, individual matchup context, calibrated model uncertainty and explainable game script.
4. **Expected Lineups** — two-team lineup/bench comparison with expected minutes and official OUT/QUESTIONABLE labels. Never call inferred expected starters “confirmed”; show actual verification status and source timestamps.
5. **Player Projections** — compact, sortable, filterable table with player image/name, team, position, minutes, PTS, REB, AST, 3PM, fantasy and combo stats, injury/DNP uncertainty, player-specific trend/sparkline details and quick drill-down.
6. **Daily Predictions Slate** — one clean sortable table or compact matchup-row presentation for all games with time, projected winner, model probability, score, disagreement/confidence, immutable lock time and later audited final outcome. Distinguish verified live scores from archived pre-tip predictions.
7. **Accuracy Audit** — clear KPI scorecard for accuracy, Brier, log loss, calibration and score/player-stat MAE; longitudinal trend chart, game winners, model comparisons and documented provenance. Never fabricate performance metrics.
8. **Mobile Experience** — narrow responsive equivalent with readable head-to-head score/probability bars, stacked panels, disciplined bottom/compact navigation, dense but finger-friendly tables.
9. **Design System** — standardized colours, typography, badges, chart palette, gradients, buttons, cards, panels, sorting controls, tabs, section title and loading states. Consistency is more important than dozens of individual page exceptions.

## Design tokens (initial matching targets; tune to match reference PNG)

| Token | Suggested value |
| --- | --- |
| App background | `#060E1B` |
| Top bar | `#071225` |
| Panel background | `#0C1B30` |
| Raised cards | `#10223A` |
| Hairline borders | `#19334C` |
| Primary text | `#F4F8FF` |
| Secondary text | `#8BA7C2` |
| Bright cyan | `#20CAFF` |
| Electric blue | `#1879FF` |
| Violet | `#8A58F6` |
| Positive evidence | `#23C991` |
| Unavailable/warning | `#F45A76` |
| Card radius | `12px` |
| Content width | Fluid desktop max width around `1440px` |

Palette is a starting implementation approximation, **not exact sampled colours from the image**. Preserve contrast, spacing and visual hierarchy above pixel-perfect colour matching.

## Navigation intent

The reference uses a minimal horizontal header with Home / Predict / Daily / Players / Teams / Stats / Audit / Models / About. On narrower widths, consolidate rather than wrap. The functional live game centre, standings/NBA Cup, following players/teams, model comparison and historical test pages must remain reachable even if grouped under menus. Do not remove existing capabilities to match a mockup.

## Implementation/change-control rules

1. **Freeze this approved direction.** Do not generate new competing whole-site aesthetics or rewrite every page without asking.
2. Make a single **high-fidelity prototype** of Home and Game Predictor, using real existing data contracts and nonfabricated values. Review desktop and mobile mockups before shipping.
3. First implement shared foundation (tokens, top bar, spacing, typography, cards, table system, tabs, charts); then migrate one route at a time.
4. Maintain all predictive, audit and live-feed logic. UI redesign must never rewrite immutable forecasts, retroactively alter probabilities or imply unverified injury data.
5. Prefer small PRs or preview deployments with before/after screenshots; run accessibility, responsive, regression and model audit tests.
6. Do not claim the live website matches this design until the full visual implementation is complete and visually reviewed.

**Implementation record:** [V19 Concept 3 implementation and remaining visual QA](v19-concept3-implementation.md). Original visual concept remains the benchmark for screenshot review.

## Review acceptance checklist

- [ ] Desktop Home matches Concept 3 mood and information hierarchy
- [ ] Game Predictor matches Concept 3 head-to-head visualization and six-model layout
- [ ] Matching nav, cards, controls, typography across pages
- [ ] Deep game detail, lineups, sortable player table and accuracy dashboard included
- [ ] Mobile layout matches Concept 3 density and usability
- [ ] All displayed values are genuinely sourced, labeled and time-correct
- [ ] No removed site features, no broken links, no regression in forecast audits
- [ ] User approves visual screenshot comparison before replacing the current site

**Do not silently deviate from Concept 3 in future builds.**
