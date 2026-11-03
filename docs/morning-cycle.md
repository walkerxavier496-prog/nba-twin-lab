# Morning publication and review

Scope authorized 3 November 2026: initial publication targeted at 06:00 Australia/Melbourne, separate from existing pretip locks, verified postgame updates, deterministic critique and visible integration. No model changes, paid services, main writes or deployment in this change.

Extend the existing daily audit rather than create another writer. Its 15-minute poll publishes once after 06:00 and strictly before the first tip; a delayed run records its actual publication time. GitHub schedules are best effort, so 06:00 is a target, not an exact delivery guarantee. Add summer/winter candidate refreshes to the existing prediction producer, with a Melbourne-hour gate. Existing source freshness and provenance checks remain mandatory. Missing/stale inputs are retried, never backfilled after tip.

Morning snapshots and per-game reviews live under audit/morning, separately protected from edits. The existing forecast builder supplies unchanged model outputs; the wrapper removes lock timestamps and uses an explicit initial schema/status. Official pretip locks and grading remain untouched. Morning reviews use the existing complete-final parser and scoring rules, and remain distinguishable from locked metrics.

Daily reports derive deterministically from hash-verified source snapshots/reviews, include coverage, probability metrics, calibration bins and sample-size cautions. Critique is descriptive, never automatic model training or promotion. Locked forecast reports are computed separately. The site exposes current morning forecasts, result coverage and reports using existing Concept 3 components, with explicit unavailable states.

## Implementation plan

1. Add isolated tests for DST boundaries, pre-06:00 refusal, delayed execution, no backfill, empty slates, idempotence, result verification and deterministic critique.
2. Add morning-cycle module; invoke it from daily_tracker without changing lock construction/selection. Extend publication immutable protection and output inventory.
3. Extend the existing prediction schedule; retain current refreshes, audit polling and Pages receipts. Add tests to the audit gate.
4. Add a shared site panel to Home, Daily and Audit with clear initial/locked separation. Reuse Concept 3 tokens; broad redesign and visual sign-off remain later work.
5. Run Node, Python, release validation and immutable hash checks; review diff; commit only this branch and open a draft PR. Record any environment or hosted verification gaps.

## UI contract

The maintained visual reference remains docs/approved-design-concept-3.md. The shared assets/daily-cycle.js and assets/daily-cycle.css own this read-only panel on Home, Daily and Audit. Existing Concept 3 typography, navy palette and document scrolling remain canonical; no new forms, selection, toasts or CRUD behavior. Native details/summary controls provide keyboard access. All paths are repository-relative; dates use Australia/Melbourne. The panel distinguishes loading, unavailable, prior-day, initial, partial and complete states; missing values remain missing. Full data and calibration bins are linked as JSON. Browser checks cover 1440px and 390px layouts. Original reference images remain absent from this repository, so broad visual sign-off is outstanding.

## Verification notes

An independent reviewer identified possible publication backdating if historical result fetching crossed tipoff. Publication now checks a fresh wall clock after forecast construction, immediately before the exclusive write; a regression test crosses tipoff and proves no snapshot is written. The reviewer rechecked the fix with no remaining findings.

Windows verification required restoring checkout line endings to exact committed bytes, using UTF-8 Python and installing timezone data in the isolated test environment. The publication path comparison now uses POSIX paths, matching Git on both Windows and Linux; existing publication integration tests exercise this.

The existing responsive PR workflow now runs the full release gate on Linux, replacing its smaller Node test subset. It remains read-only and never publishes or deploys. No additional pipeline was introduced.

## Final engineering pass

See [release candidate and safe deployment steps](courthesis-release.md). The final pass adds strict forecast/result defenses, source-derived display verification, model-specific and recurring critique, archive selection, conditional player details and preview isolation. Morning publication now selects only games that remain pregame; earlier games are listed without predictions. The unchanged official pretip lock path retains its full-slate policy. Snapshot capture and actual validated publication timestamps are labelled separately.

## Owner-requested UX follow-up (4 November 2026)

- The morning panel now renders a full initial game card for each available matchup: predicted winner, home/away probabilities, projected score when present, tip time, model comparison and separately verified final.
- The main homepage Concept 3 hero remains first; the morning game centre follows it rather than replacing the hero.
- A Melbourne-date selector exposes archived initial forecasts, their verified outcomes and phase-specific critique reports. Missing dates are not fabricated.
- Deterministic critique now includes the five largest production Brier errors with actual matchup identifiers and explicit observational language; it does not claim unverified causal explanations.
- Existing locked slate UI remains labelled as the latest locked slate, never silently converted into an initial snapshot. Production and research model statuses remain distinct.
- Browser screenshots of populated data, user visual approval, actual 06:00 hosted publication, live results and deployment are still required before release. Keep this PR draft until approved.
