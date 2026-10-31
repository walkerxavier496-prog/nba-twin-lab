# V18 — Roster-first prediction integrity (research stage)

Implemented 31 October 2026. **Production Elo is NOT promoted or recalibrated by this feature.**
The immutable 31 October original lock and its separate six-model challenger lock remain unchanged.

## What ships now

- `predict/roster-integrity.js` checks snapshot chronology, coverage, the correct target season, official injury-report timing and game scope, provider-designated active roster IDs, and ambiguous availability.
- The predictor loads `data/availability-current.json` and shows both teams' estimated minutes, any official exclusions, unresolved status scenarios, and a conspicuous warning when game-day inputs cannot be trusted.
- An **official OUT** player is given **zero expected, minimum and maximum minutes** in the audited rotation. A player absent from a separately verified active roster is also excluded. A QUESTIONABLE, DOUBTFUL, or PROBABLE player receives a 0-to-if-playing minute scenario instead of a fabricated numeric availability probability.
- Previously observed player performance remains associated with player IDs. Current-team membership, if supplied, is matched by those IDs, so stale inferred rotation players cannot be mistaken for the verified active roster.
- There is **no claim that the top five by projected minutes are actual starters**.
- No unvalidated V18 probability is published. If official inputs are missing, the legacy probability is labelled explicitly as a **historical team estimate**, not a verified roster-aware forecast.

## Automated NBA.com roster and official injury intake (experimental)

`scripts/build_official_availability.py` now runs from the existing **hourly**
`.github/workflows/daily-audit.yml` before any eligible future pretip lock.
It reads NBA.com team roster pages by official NBA player ID and reads a
timestamped official league injury PDF. Official injury names are joined by
normalised **exact name within official team roster**, not by mixing ESPN athlete
IDs with NBA IDs. Missing, ambiguous, duplicated, unsubmitted or future-dated
records fail closed. Team list and report URI and its SHA-256 are preserved in
the feed. The official archive index is the primary lookup; an exact official
CDN filename fallback is permitted when the index fails. A caller may provide
`NBA_INJURY_REPORT_URL` to point at the exact official PDF for manual recovery,
but the source hostname, filename timestamp, pretip cutoff and report contents
still have to pass validation.

This ingestion has **not yet been verified end-to-end against the scheduled
GitHub Actions runtime**. It may write `status: unavailable` whenever NBA.com
or the official PDF is unreachable or a report has not been submitted; that
state is correct and must never be converted into fabricated player availability.

## Active-roster strength experiment (NOT a win probability)

`predict/roster-strength.js` uses only official-roster-matched players in the
V7 pregame player snapshot; old/franchise-removed player IDs are excluded.
An officially OUT player contributes zero minutes. For unresolved statuses it
runs both participation and absence scenarios when feasible. Remaining
eligible players share **240 regulation minutes** with bounded minutes and
explicit minimum rotation coverage. If there are fewer than eight eligible
players, too many uncertain cases, or missing impact proxies, this research
signal is unavailable rather than being filled with old-roster players.

The output is an uncalibrated **home minus away player-impact index range**.
It is not projected points, point spread, or a winner probability. Future
forecast locks preserve this diagnostic under `v18_roster_strength`, and the
postgame review grades only its decisive directional signals and coverage.
Its grades are **not mixed** with the six calibrated prediction-model Brier,
log loss or accuracy comparisons.

## Official feed contract

`data/availability-current.json` is deliberately checked in with `status: "unavailable"`.
Never change it to verified without authentic and correctly dated source information.
The automated ingestion job attempts to produce a point-in-time document with this shape:

```json
{
  "schema": "nba-twin-lab-availability-v18",
  "status": "verified",
  "strict_no_future_data": true,
  "published_at_utc": "2026-10-31T21:15:00Z",
  "source": {
    "type": "official",
    "url": "https://example.org/the-exact-official-report"
  },
  "games": [
    {
      "game_id": "real-game-id",
      "injury_report_verified": true,
      "teams": {
        "CHA": {
          "roster_verified": true,
          "roster_player_ids": ["real-nba-player-id-1", "real-nba-player-id-2"],
          "injuries": [
            {"player_id": "real-nba-player-id-1", "status": "OUT"}
          ]
        }
      }
    }
  ]
}
```

The example is a **schema illustration**, not real player identities or a real report. Each team needs at least five distinct numerical player IDs. Statuses allowed: OUT, DOUBTFUL, QUESTIONABLE, PROBABLE, AVAILABLE. Unlisted players are *not confirmed healthy*. Source URLs, timestamps, and identity mappings need an auditable original provider record.

A report timestamp must precede the forecast and tipoff; it must not be over 24 hours old. The V7 team/rotation snapshot must precede both cutoff and tipoff and be at most 36 hours old. The team snapshot must cover 30 teams in the correct season. Invalid, stale, absent or inconsistent inputs fail closed.

## Next requirements before V18 probabilities can replace Elo

1. Verify the scheduled official-source ingestion against real GitHub Actions runs and archived point-in-time reports. Expand coverage checks for traded and newly signed players, and preserve immutable evidence.
2. Validate the existing 240-minute replacement allocation and availability-scenario ranges on historical game-day rotation data. Confirmed starters can be incorporated only after timestamped verification.
3. Calibrate the existing current-player impact index into a full win-probability model using opponent matchups, lineups and current form, while preventing double counting against existing team Elo.
4. Compare against incumbent Elo, prior V8/M3, M5 and M6 using **rolling-origin**, point-in-time pregame rosters/injuries from archived earlier seasons, and a new prospective immutable lock. Historical injury coverage is currently insufficient: absence of data is not a negative injury status.
5. Set predeclared promotion criteria (Brier primary, log loss, accuracy, calibration, early-season/high-turnover slices) and independently verify before replacing production.

### Leakage and uncertainty rules

- A source published after a game's forecast cutoff can never be joined into that historical forecast.
- A retrospective injury-input analysis may explain a game but cannot be substituted for the originally locked prediction.
- The official injury sidecar in `practice/2026-10-31-melbourne/forecast.lock.json` was pretip data **recorded but not used** by the models. No model can be scored as though it had consumed the sidecar.
- Unknown lineup information must remain unknown; an injury sidecar alone is not a confirmed starting lineup.
- Model confidence is not calibrated certainty; no probabilities are changed by undocumented heuristic overrides.

### Verification

`node --test tests/roster_integrity_v18.test.cjs tests/roster_strength_v18.test.cjs`\n\n`python -m unittest discover -s tests -p test_official_availability.py -v`

CI: `.github/workflows/site-mobile.yml` also checks module syntax, regression cases and original immutable lock preservation.
