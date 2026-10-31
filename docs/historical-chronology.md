# Historical reconstruction: information availability v1

The old engine admitted any archived final whose tip preceded the target tip.
The old feature builder emitted one game's forecast and immediately ingested
its result, ordered by source date/game ID. Neither rule established that a
result was knowable. Same-date league averages and adjusted efficiencies could
therefore leak, including into games involving other teams.

## Corrected policy

- The prediction cutoff is the archived timestamped tip where available. A
  date-only target uses 00:00 UTC of its source date, never an invented 23:00 tip.
- A result with an explicitly verified, timezone-aware availability timestamp
  and provenance can enter state only strictly *after* that timestamp.
- Without that evidence, availability is the second UTC midnight after the
  archived game date: a 24–48 hour embargo for timestamped games. Equality is
  excluded. This deliberately sacrifices recent information, including some
  back-to-backs; it is not an estimated actual finish time.
- Invalid/unverified supplied timestamps and unresolved suspensions fail closed.
  A suspension that an upstream archive silently erases cannot be detected from
  final scores alone; it remains a provenance risk.
- Date-only source dates can differ from UTC tips. Matching uses independently
  reconciled scores, team identities and dates, with duplicate feed IDs removed.
  Ambiguous/double-matched results fail instead of guessing an identity.
- Feature updates enter an availability-ordered queue. Before each prediction,
  only strictly eligible updates are released. Team/player state, online league
  averages and opponent-adjusted updates all use that state. Prior-season seeds
  also wait for availability. Snapshots record explicit cutoffs and the maximum
  ingested result timestamp.
- Model fits and nested ensemble training exclude outcomes unavailable at the
  first evaluation cutoff. Historical feature readers require the new policy
  tag; the old `strict_no_future_data` boolean is insufficient certification.
- Future scheduled locks use the locking time, rather than a future tip, as
  their rating cutoff. Existing locks are never regenerated or regraded.

The JS engine and Python helper share regression cases for overlaps, same-day
games, doubleheaders, missing/invalid timestamps, offsets and strict boundaries.
The schedule importer now retains first-observed final transitions and dates
score corrections when witnessed. It does not assign invented observation times
to backfilled archive finals. The ten verified existing game reviews provide a
separate availability evidence sidecar, with original artifact hashes.

## Evidence and comparison

`research-reviews/chronology-v1/` is separate from `data/`, `practice/`, and
`audit/`. Original evidence and reported accuracy remain unchanged. Corrected
derived features and rotations are gzip-compressed; raw source rows are frozen
privately in `/private/tmp/nba-chronology-fixed-rows.json` and not redistributed.
The input manifest records hashes and the fixed 6,150 historical / 71 inspected
fresh games. Availability evidence is derived from verified provider retrieval
times, not inferred completion times.

Legacy regeneration on the frozen source differs from 422 published feature
rows. A direct row comparison localizes these differences to inferred
player/rotation features: home/away `player_delta` differs on 185/167 rows,
`rotation_continuity` on 161/148, and rotations on 71/71. These counts overlap;
they are 422 distinct pregame rows, not 803. The 69 inspected 2027 games whose
feed IDs changed in the corrected snapshot reconcile on season, date, teams and
scores (NBA game IDs versus ESPN IDs); they are identity changes, not additional
feature mismatches. Available evidence cannot distinguish source revisions from
legacy player/rotation ordering or tie nondeterminism, so none of the 422
differences is attributed to chronology. Accordingly, the review preserves three
columns: originally published results, paired legacy replay, and corrected
replay. The paired runs use the same frozen raw-derived input cohort, model
specifications, seed formulas, simulation depth and earlier-season fitting rules.
Any changed fitted weights are consequences of rebuilding training features,
not optimization against evaluation outcomes.

Evaluation coverage is model-specific. Historical test and V7 rolling-origin
samples remain 1,230 and 4,920 games respectively. The five-model common sample
is 3,643 games for both publication and paired legacy replay, and 3,630 for the
corrected replay. That 13-game coverage change means the five-model aggregate
is not an exact same-game paired comparison; its metric differences cannot be
attributed to chronology alone.

Commands (run each stage in its own process if desired):

```sh
node scripts/chronology_review.cjs research-reviews/chronology-v1/evaluations/paired-v1 historical
node scripts/chronology_review.cjs research-reviews/chronology-v1/evaluations/paired-v1 v7
node scripts/chronology_review.cjs research-reviews/chronology-v1/evaluations/paired-v1 five
node scripts/chronology_review.cjs research-reviews/chronology-v1/evaluations/paired-v1 compare
```

Stages resume completed files without replacing them. Use a new directory for
a genuinely new evaluation. The review stores archived baseline source and input
hashes. MC depths match the publications: V6 1,000, V7 300, challenge 400 per game.
Inspect `comparison.json` for accuracy, Brier, log loss, ECE/calibration and score
MAE, including null score metrics for probability-only models. The 2027 sample
was previously inspected; it is not an untouched holdout. A lower corrected
error, if observed, is a methodological result, not proof of improved future
skill. No corrected model/report is automatically promoted to the live UI.

Historical report generators now append to per-run review paths. The publication
inventory permits these new files, while the publisher rejects changes to
existing review artifacts, historical feature snapshots and original reports.
Current live snapshots and schedule updates remain mutable operational data.

## Remaining limits

Archived final scores and retrospectively queried player logs are not a full
point-in-time source archive. Late stat corrections, unknown suspensions, identity
changes and upstream revisions can remain invisible. Inferred rotations and
conditional participant-only player MAE do not validate injuries or participation
probabilities. Some recent information is intentionally withheld by the fallback.
Review metrics cannot be used to retrospectively alter locked predictions or to
claim a new independent holdout. Reproducible evaluation uses the frozen derived
inputs; exact raw-source regeneration requires the private raw snapshot matching
the recorded hash.
