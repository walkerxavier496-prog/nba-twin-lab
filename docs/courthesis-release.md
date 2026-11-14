# Courthesis release candidate — 4 November 2026

Scope: PR #18, feature/morning-predictions-review. Main, the live site, immutable history and model weights remain unchanged. No paid infrastructure is introduced.

## Engineering changes

- Morning-only slate selection retains eligible later games when early games have started. Those earlier games are listed without invented initial predictions and excluded from forecast grading. The existing official pretip lock selection and window are unchanged.
- New initial snapshots require valid bounded probabilities, complementary away probabilities, unique game IDs, correct Melbourne dates and fresh pregame schedule/player evidence. Future-dated additional model provenance is rejected.
- Final-game grading requires unique player identities, valid minutes and complete numeric PTS/REB/AST/3PM rows. History collection can still preserve explicitly missing statistics as null; it cannot silently satisfy the stricter grading gate.
- Publication verification recomputes morning reports, displayed forecasts/results, locked reports and recurring observations from preserved source artifacts. Altering derived numbers or inserting fixture records fails validation.
- Daily critique now includes per-model winner observations, largest probability misses, predicted/actual scores, score bias and largest individual player errors. Recurring patterns require at least ten observations across two contributing completed dates for that model and metric. Initial and locked forecasts remain separate. Recommendations are validation experiments, never automatic weight changes or causal assertions.
- An archive URL now resolves the lock containing the requested game. Unknown IDs fail closed; a date parameter selects a specific saved daily slate.
- Concept 3 cards reuse existing team marks and accents, distinguish upcoming and verified-final status, expand model/player details, expose separate prediction/results views and archives, and show stale checks. Home limits its preview to three games and links to the full daily slate and performance dashboard. Existing live, team and player screens remain available.
- Marked synthetic JSON is rejected on public hosts and during ordinary local browsing. Explicit loopback-only preview mode displays a prominent synthetic or historical-preview warning. Release verification also rejects fixture-marked production indexes.
- PR checks and the refresh clock job explicitly use read-only repository permission. Existing producers and validated Pages receipts remain the publication/deployment path.

## Timing definitions

`captured_at_utc` records the actual pretip snapshot-save attempt, rechecked after forecast computation. The legacy `published_at_utc` field is retained as an alias for compatibility, with an explicit timing note. Neither timestamp claims that GitHub Pages deployed at that moment. Actual repository publication acceptance is recorded in the existing validated producer receipt; the site can show that data-release timestamp from deployment.json. Packaging time and successful deployment completion are separate; the static metadata does not invent a completed-deployment timestamp.

GitHub cron is best effort. The existing audit polls every 15 minutes, and the existing prediction producer has 19:00/20:00 UTC candidates gated to 06:00 Melbourne. DST tests include both transition dates. A delayed or skipped hosted run can delay delivery; stale or unavailable inputs cause honest unavailability, never a post-tip backfill.

## Release checks

Run the complete `scripts/validate_release.sh` gate on the PR merge candidate in the existing Linux PR workflow. It includes Python and Node suites, immutable lock/review/sidecar/ledger/anchor verification, and tracked JSON/script checks. The Windows environment cannot directly execute the Bash wrapper and has one existing fake-OpenTimestamps executable test failure; Linux CI is the authoritative complete wrapper check.

Real-browser coverage:

- Full-site acceptance at 1440, 1280, 390 and 375 px: navigation, overflow, five prediction tabs, archived audited results, injury exclusions, projections sorting/filtering, daily slate tabs, real accuracy metrics, outage states and Concept 3 styling.
- Morning-cycle acceptance at 1440 and 390 px: unavailable, explicitly labelled synthetic, archive and verified historical data; result filtering, expandable comparisons/player projections, refresh and fixture refusal.
- Images blocked in offline checks must fall back to text; these tests do not claim the upstream CDNs or live providers are available at deployment time.

## Safe deployment steps — only after owner approval

1. Review the desktop/mobile screenshots and the complete PR diff. Confirm the latest PR commit and merge-candidate release/browser checks are green. Keep the PR draft until this review is accepted.
2. Confirm the first controlled release has the existing Actions contents-write permission for producers, Pages enabled, and the expected github-pages environment. No new token, secret, service or paid infrastructure is needed by this change.
3. With explicit owner approval, mark PR #18 ready and merge into main. This is the first authorized production change. Merging triggers existing workflows; it must not be treated as a harmless preview action.
4. Observe the existing daily audit and prediction-refresh runs. If a controlled manual run is desired, use Daily immutable prediction and results ledger on main with the date blank; do not enter a historical date or override clocks to create a morning record. Before 06:00 it should report not due; after tip it must leave missed initial predictions unavailable.
5. Check the successful producer's publication receipt and the existing Pages run. Pages must select and validate the exact current-main revision. Verify deployment.json revision against that release and confirm its capture, publication and packaging timestamps are labelled correctly. Do not equate packaging with deployment completion.
6. At the next 06:00 Melbourne target, inspect the actual capture time, input freshness, every available forecast, explicit no-forecast games and separate final pretip locks. Confirm one initial snapshot per date despite repeat runs. Expect best-effort scheduling rather than exact-to-the-minute delivery.
7. After games finish, confirm only complete verified finals append reviews; live, incomplete and failed-provider games stay pending. Check source-linked errors, deterministic daily reports and updated site cards. Re-run immutable verification and confirm no original forecast bytes changed.
8. If a gate or provider fails, retain the new-artifact recovery upload and rerun the existing producer from fresh main after resolving the cause. Never rewrite a lock or fabricate an initial forecast after tip. For a site regression, approve a forward revert of code while preserving all immutable artifacts; validate and deploy that revision through the same path.

## Readiness and limits

This is a release candidate for owner review, not evidence of a completed production rollout. Original Concept 3 reference images are not in the repository, so exact visual fidelity and owner sign-off remain outstanding. The first live 06:00 cycle, live provider responses, publication receipt handoff and deployed user experience still require observation after approval. Results use ESPN public summaries, an unofficial provider, with structural verification; this is not independent official NBA corroboration. Small calibration samples and descriptive recurring patterns do not establish causal explanations or model superiority.
