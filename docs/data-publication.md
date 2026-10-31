# Data publication and Pages releases

All 13 data publishers use `.github/actions/publish-data`. The action installs
the release-check dependencies and calls `scripts/publish_data.py`. The declared
output inventory is `scripts/publication.json`:

| Producer workflow | Generated outputs |
| --- | --- |
| challenge-supplement-2026-10-31 | Independent immutable challenge sidecar |
| daily-audit | New audit JSON, derived ledger/performance centre, availability |
| five-model-challenge | Six-model comparison report |
| game-science | Basketball Science report |
| roster-research | Roster report, priors, rotation history |
| season-test | Preseason games, season backtest |
| update-championships | Championship history |
| update-context | Team context |
| update-data | Player-season data |
| update-predictions | Schedule/results and model report |
| v7-audit | Current intelligence, player report, rotation history |
| v8-research | Player-impact research report |
| v9-player-stats | Current intelligence, player report, rotation history |

`historical-audit.yml` is a read-only reproduction into `/tmp`; it does not
publish a replacement historical report. `site-mobile.yml` only checks the UI.
`static.yml` packages/deploys and never commits. Model algorithms and evaluation
figures are not changed by this publication implementation.

## Publication contract

1. Existing generator-specific checks and builders run on `main`.
2. The publisher rejects any changed file not in that producer's output list.
   Unexpected tracked outputs cannot remain hidden before a rebase.
3. Existing files in `practice/`, `audit/snapshots/`, `audit/supplements/`, and
   per-game `audit/reviews/*/games/` cannot be modified or deleted. New artifacts
   may be appended. Daily rollups and ledgers remain derived outputs.
   Official grading reads production probabilities from the original lock; a
   challenger sidecar is included only when its checksum, pregame time, slate,
   and hash link to that exact lock validate. Release verification compares each
   graded probability with its immutable source.
4. The publisher stages all declared changes and its own refresh-status record,
   creates a commit, fetches `main`, and rebases without force or reset/copy
   conflict resolution. Changes upstream outside refresh-status metadata fail
   closed: rerun that producer from current `main` to regenerate its inputs.
5. `scripts/validate_release.sh` runs the full Python and JavaScript suites,
   stored audit/sidecar verification, and syntax/JSON checks against the resulting
   candidate commit. A validation failure or dirty tree prevents a push.
6. An ordinary push must succeed before a run-attempt-specific receipt is
   uploaded. A push race against metadata-only updates is rebased and tested
   again. A conflict/input change requires regeneration, never silent overwrite.

Each successful refresh publishes `data/refresh-status/<producer>.json`, even
when the generator found no changed source data. `generation_observed_at_utc`
records when the publisher observed the generated outputs, before release
validation. Source-reported generation timestamps are copied separately into
`artifact_generation_timestamps`; unavailable source timestamps remain unknown.
Observation is not a claim that upstream data has just been generated or changed.

## Deployment handoff

The default Actions token cannot recursively trigger push workflows. Pages uses
`workflow_run` on an explicit list of the 13 producers, in addition to normal
human pushes and manual deployment. It does not listen to itself. This avoids
PATs, extra write permissions, dispatch loops, and relying on bot-push events.

Only successful same-repository `main` runs from schedule, push or manual
dispatch events qualify; pull-request events are rejected. Pages downloads a bounded
receipt ZIP from that run and attempt, reads only its `receipt.json` member, and
never extracts or executes artifact files. Extra members, traversal paths,
symlinks, oversized payloads and non-object JSON are rejected. The receipt must
match the producer workflow path, repository, run and attempt, and that identity
must match the committed refresh record. Its source SHA must match the triggering
run and be an ancestor of the published SHA. Only declared producer outputs and
refresh metadata may differ from that source. Generation observation, validation
and publication times must occur in order and cannot be future-dated.

Pages never uses `workflow_run.head_sha` as the data revision (that is the revision
*before* the producer's commit). Runs without a receipt request no deployment,
including V7's validation-only push runs. Artifacts are evidence to check, not
authority to choose arbitrary branches, revisions or executable code. Current
main and its branch protections remain the trust boundary.

The receipt SHA must be full-length and equal current `origin/main`. Pages checks
out that exact SHA, independently runs all release checks, and archives that
clean Git tree. Upload and deployment are separate jobs with a required `needs`
relationship. Immediately before deployment, the job rechecks the current main
SHA to skip superseded releases. Already running deployments are not cancelled;
the newer run deploys afterwards. No deploy job has repository write permission.

A failed refresh, expired/missing receipt, failing release check, branch
protection rejection, or Pages environment approval prevents automatic release.
Check the workflow logs and rerun from current main after resolving the cause.
If a push succeeded but receipt upload failed, rerunning the producer issues a
new validated refresh commit/receipt. No historical lock needs to be rewritten.

## Website freshness endpoint

The Pages artifact includes `/nba-twin-lab/deployment.json` (or `deployment.json`
relative to the site's root) with:

- `revision`: exact validated repository SHA in this artifact;
- `packaged_at_utc`: artifact creation time, not a claim of completed deployment;
- `latest_successful_data_refresh_at_utc`: latest successful producer observation
  time, not necessarily a new source-data generation;
- `refreshes`: individual producer records, source revisions and source-reported
  generation timestamps;
- `publication.validated_at_utc`: successful candidate validation completion;
- `publication.published_at_utc`: time after Git accepted the publication push;
- `deployment_completed_at_utc`: always `null` in the prepared static artifact.

Publication times come from the matching receipt; for human-push/manual releases
without a publication receipt the `publication` object is `null`. The package
cannot know when its subsequent Pages deployment will finish. GitHub's completed
Pages deployment record is authoritative for that time; packaging time must
never be shown as successful deployment time. No additional metadata-only deploy
is triggered to invent or backfill a completion timestamp.

Until the first producer publishes metadata, the latest-refresh field is `null`.
The endpoint is created in the staging directory, never committed into source,
and becomes visible only when its Pages artifact is deployed. A future UI can
fetch it with `cache: 'no-store'`; this change makes no UI redesign.

## Local verification

Install `requirements.txt` and `requirements-test.txt`, use Node 22 and Python
3.12 (the CI versions), then run `bash scripts/validate_release.sh`.
Publication regression tests create temporary local bare repositories and check
staging, immutable-file protection, failed validation, rebase races, receipts,
exact-revision packaging, and the workflow configuration. They do not push to
GitHub, dispatch workflows, or deploy Pages.

These workflows take effect only after an approved push to the default branch.
Repository branch protections, Actions permissions, Pages settings/environment
rules and the live endpoint must still be checked in the first approved hosted
run. Local tests cannot prove GitHub's hosted trigger or deployment behavior.
