# NBA Twin Lab V20 — Exact Concept 3 Fidelity Implementation

**Approved reference:** [Concept 3](approved-design-concept-3.md), matching the user's nine-panel 1536×1024 board and individually uploaded panel screenshots (31 October 2026).

**Status:** Source implementation committed. Actual-browser desktop/mobile visual comparison, full GitHub Actions run and published Pages deployment remain unverified. Never claim pixel-perfect parity without screenshot testing.

## Why V19 missed the approved concept

V19 applied navy colours, gradients and cards but retained an oversized source-health dashboard above the actual predictor. The home page displayed a tall featured live-score card rather than the reference's compact frozen forecast and recent-results rail. Six models, lineups, game analysis and player tables lived on disconnected routes or below bulky content. Daily Predictions and Audit likewise remained long editorial dashboards rather than compact tabbed products.

V20 changes **page information architecture**, not just colour tokens.

## Panels implemented directly from the reference

| Reference panel | V20 implementation | Data integrity |
| --- | --- | --- |
| 1. Home Dashboard | `index.html`, `assets/home.js`, `assets/concept3-fidelity.css`: 2.04:0.94 hero/right rail; 4 metrics inside left hero; genuine credited LeBron NBA photo; compact pretip win probability matchup plus separate latest verified finals | The hero never uses a live score as the forecast; M6 ensemble preferred when genuinely locked, Elo otherwise |
| 2. Game Predictor | `predict/index.html` and `assets/concept3-hub.js`: head-to-head strip, selected game, five horizontal tabs, blue/red win-probability bar, six mini-engine cards and five evidence-based key factors | Uses original immutable game lock and optional separately locked model supplement, never a screenshot number |
| 3. Game Details | Matchup Analysis tab: opponent-adjusted pretip sources when timestamp is eligible, relevant projected players and uncertainty explanation | Missing original stats display em dash rather than postgame leak; no fabricated exact defensive matchups |
| 4. Expected Lineups | Lineups tab: each team's estimated minute leaders, formal injury flags, official OUT exclusions and uncertainty | Labelled **not confirmed starters**; does not imply inferred availability is official |
| 5. Player Projections | Player Projections tab: searchable, sortable, team-filtered NBA headshots and conditional PTS/REB/AST/3PM | All data from frozen V9 player projections; stats conditional on participation |
| 6. Daily Predictions Slate | `challenge/daily.html`: slim lock-status hero, full slate, final results, six-model comparison, projected player leaders, direct deep link to Predictor | Confidence replaced by measured engine disagreements; no hypothetical value bets without verified market odds |
| 7. Accuracy Audit | `audit/index.html`, `assets/concept3-audit.js`: compact KPI cards, five tabs, a trend only when at least two reviewed slates exist | Historical mockup values (67.3%, 0.189, 0.612, 2.8) **never invented** |
| 8. Mobile | Responsive breakpoints at 1150, 900 and 620 px; compact scorecard, tab scrolling, stacked lineups and safe table scroll | Scrollable dense tables retain all columns and accessible labels |
| 9. Design System | Single `assets/concept3-fidelity.css` layered after existing styles; reference-based nav, cyan-blue/pink probability bars, rounded dark analytical panels | Exact input/source caveats remain accessible |

## Navigation and source controls

Global header now follows the concept order: **HOME / PREDICT / DAILY / PLAYERS / TEAMS / STATS / AUDIT / MODELS / MORE**. My Watchlist remains accessible. Additional live scoreboards, advanced research, calibration, roster-integrity diagnostics and historical tables remain available in expandable sections instead of being deleted.

The home hero's real LeBron James pregame chalk photograph is a historical Cavaliers–Wizards photograph by Keith Allison (13 March 2008) under [CC BY-SA 2.0](https://creativecommons.org/licenses/by-sa/2.0/), credited in the footer. It is not represented as that day's game or as verified lineup evidence.

## Tests

`node --test tests/concept3_fidelity_v20.test.cjs`

The regression test uses the real stored lock and official injury sidecar to check home source integrity, six-model Game Lab, pretip injury exclusion, Daily table, no fabricated Audit trend, and original lock preservation. Integrated in `.github/workflows/site-mobile.yml`.

## Final browser acceptance still required

Compare the **published** site against the eight screenshot panels and the full original, especially at 1440×900, 1280×800, 390×844 and 375×812:

- [ ] Home 2-column composition with four KPI cards inside the hero; right latest-results rail does not overflow
- [ ] Historical NBA action photo crops correctly, no pixelated player headshot, meaningful photo credit present
- [ ] Header typography, basketball icon, navigation spacing and active underline match the reference
- [ ] Game Lab displays all 5 tabs and 6 model comparisons above the fold; accurate time and team logos
- [ ] Expected Lineups properly exclude OUT players without calling any presumed starter confirmed
- [ ] Player Projections sortable/filterable, with graceful player-image failures
- [ ] Daily slate 10-row grid retains blue/red bars and real source timestamps
- [ ] Audit accurately shows absent review metrics as unavailable (not sample mock values)
- [ ] All tabs, team/player drilldowns, mobile nav, box score and accessible keyboard controls work
- [ ] Automated test suite and GitHub Pages deployment independently green
- [ ] Original immutable forecast and challenger SHA values unchanged

**Do not restart the design system.** Future refinements should be measured against these exact panel screenshots, not against broad visual descriptions.
