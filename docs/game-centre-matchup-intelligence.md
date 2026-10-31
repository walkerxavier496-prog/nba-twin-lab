# Game Centre Matchup Intelligence

The Matchup Intelligence tab is a descriptive research view, not a prediction
engine. It does not calculate or replace production probabilities, archived
pregame forecasts, or official postgame grades. The Machines tab
continues to load production forecasts from their immutable locks.

## Evidence and chronology

The page reads `data/v7-current.json`. It uses that snapshot only when its
schema is supported, `strict_no_future_data` is `true`, both teams have a
current-season sample, and `built_at_utc` is strictly earlier than the game's
tip time. A missing, invalid, or post-tip snapshot produces an unavailable
state; later data is never substituted to reconstruct historical pregame
context.

The selected sample is either the current season or the latest available five
games. Each view shows its per-team game counts, the snapshot build time, and
the source name. Prior-season metrics are displayed separately for context;
they are not blended into this comparison. Matchup claims are withheld unless
both selected samples contain at least three games.

## Comparisons

The team table shows available offensive and defensive ratings, pace,
effective field-goal rates, three-point attempt rate and accuracy, opponent
three-point attempt rate, rebounding rates, turnover rate, and free-throw
attempt rate. Directional research notes compare:

- A team's three-point attempt rate with the opponent's observed opponent
  three-point attempt rate.
- Offensive rating with the opponent's defensive rating.
- Turnover and free-throw tendencies with the opponent's corresponding
  observed opponent rates.

These are raw, team-level historical comparisons—not opponent-adjusted
projections, rankings, shot-quality estimates, or expected game outcomes.
Every note includes the selected sample size; the source and snapshot time are
available in the methodology disclosure.

## Known limitations

The published aggregates do not provide shot-location tracking,
transition-specific scoring or defence, schedule-specific travel, or verified
historical pregame injury designations. Availability and rotation fields are
inferred from prior appearances and are explicitly identified as unverified.
The view does not turn these missing inputs into claims.

Focused regression coverage is in `tests/game_centre.test.cjs`.

## Game Centre details

The page groups information into Overview, Matchup, Box Score, and Machines.
Overview shows available player leaders and game milestones only from the
provider's current-game box score; it does not claim season records. Team
totals are displayed only when supplied in the game summary. Player-stat
columns sort independently, elapsed minutes are compared in seconds, and
explicit DNP and incomplete rows are not converted to numeric zeroes.

The Machines view puts the immutable production forecast first. Its winner
probabilities appear only after the lock's raw bytes match the audit ledger's
SHA-256 and its canonical integrity value matches the ledger. Official winner
grades and score errors require the daily review's raw bytes to match the
ledger's review SHA-256 and the review to bind to that original lock. A
standalone per-game review without a ledger-bound daily review is not treated
as official grading. Research challenger forecasts remain in a separate,
explicitly experimental section. Missing or mismatched artifacts, results, or
metrics stay unavailable rather than being reconstructed from the final score.
For postponed games, any surviving lock is identified as the original scheduled
tipoff's forecast, not a prediction for a rescheduled date.

## Live data freshness and coverage

The Game Centre requests the ESPN public game-summary endpoint (unofficial)
without relying on a provider observation timestamp. Each score, player-box,
and team-stat line shows when that data was retrieved locally, in UTC. The
current summary does not supply a provider observation time for scores or
statistics; logo-asset timestamps are not treated as game observations, and
local retrieval time is never presented as a provider timestamp. Team stats
carry separate retrieval times per team, and the player line distinguishes the
last complete box score from any partial response. Venue and missing
box-score/team-stat fields are disclosed rather than filled in; official
injury designations are explicitly unavailable because this page does not
display a verified injury feed.

Requests time out after 15 seconds and retry with a 10/20/40/60-second
backoff, capped at 60 seconds; normal polling is once per minute while the
page is visible. A failed refresh retains the last accepted data and shows the
failure and last successful summary retrieval. Each score, complete player
box, and per-team statistic is independently marked stale after two minutes
without a newer valid value; the page also warns when no successful summary
has arrived for more than two minutes. Responses are applied in request order:
a response from an earlier request cannot overwrite one from a later request.
Game status advances from scheduled through postponed/live to final and does
not regress. Postponed games are not presented as scheduled or assigned
zero-point scores. If a summary omits scores or box-score/team-stat data already
received, the last verified values remain visible with their original retrieval time.
When ESPN includes team points totals, the page compares them with the game
header score and flags disagreements without silently replacing either value.

The matchup disclosure separately identifies the research snapshot creation
time and its local retrieval time. The Machines view identifies the original
forecast lock time and, when available, the verified review creation time.
These timestamps represent distinct events and are not interchangeable.
