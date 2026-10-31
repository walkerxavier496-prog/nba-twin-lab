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

## Official feed contract

`data/availability-current.json` is deliberately checked in with `status: "unavailable"`.
Never change it to verified without authentic and correctly dated source information.
A future ingestion job must produce a point-in-time document with this shape:

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

1. Build and verify a scheduled official-roster and official-injury ingestion process, including source provenance, stable player-ID mapping, full game coverage, and missing-data handling. Use official roster API/records and time-stamped published injury reports; don't infer official availability from recent appearances.
2. Model expected minutes and replacement allocation while conserving approximately 240 team regulation minutes. Unresolved statuses must generate alternative scenarios rather than silently treating players as available. Confirmed starters can be incorporated only after timestamped verification.
3. Build true player-to-team strength aggregation using individual player impact, expected minutes, opponent matchups and current form. Trade histories follow players, not team identities. Avoid double-counting player and team effects.
4. Compare against incumbent Elo, prior V8/M3, M5 and M6 using **rolling-origin**, point-in-time pregame rosters/injuries from archived earlier seasons, and a new prospective immutable lock. Historical injury coverage is currently insufficient: absence of data is not a negative injury status.
5. Set predeclared promotion criteria (Brier primary, log loss, accuracy, calibration, early-season/high-turnover slices) and independently verify before replacing production.

### Leakage and uncertainty rules

- A source published after a game's forecast cutoff can never be joined into that historical forecast.
- A retrospective injury-input analysis may explain a game but cannot be substituted for the originally locked prediction.
- The official injury sidecar in `practice/2026-10-31-melbourne/forecast.lock.json` was pretip data **recorded but not used** by the models. No model can be scored as though it had consumed the sidecar.
- Unknown lineup information must remain unknown; an injury sidecar alone is not a confirmed starting lineup.
- Model confidence is not calibrated certainty; no probabilities are changed by undocumented heuristic overrides.

### Verification

`node --test tests/roster_integrity_v18.test.cjs`

CI: `.github/workflows/site-mobile.yml` also checks module syntax, regression cases and original immutable lock preservation.
