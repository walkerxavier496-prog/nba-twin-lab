# NBA Twin Lab — instructions for Claude

Static GitHub Pages site plus data pipelines. Python (pytest) and Node (node --test). The site's credibility rests on an honest, tamper-evident record of pre-tip forecasts.

## Hard rules
- NEVER edit, delete or regenerate existing files under `practice/`, `audit/snapshots/`, `audit/supplements/` or `audit/reviews/*/games/`. They are immutable locks and reviews. New files may be added only by the pipeline scripts.
- NEVER backfill or alter a forecast after tip-off. Never fabricate data, scores, rosters or probabilities. Missing data must show as missing.
- Do not promote research models to production automatically. `production_elo_v7` stays production until the owner says otherwise.
- Do not hand-edit generated data in `data/`; change the generator and rerun it.
- Do not push, force-push, change repo settings or run GitHub workflows unless asked.
- Logos and headshots are third-party (see MEDIA_CREDITS.md). Do not add new ones.

## Commands
- Full release check: `bash scripts/validate_release.sh` (pytest, node tests, lock verification, JSON checks). Run before saying a change is done.
- Python tests: `python -m pytest -q` (needs `pip install -r requirements.txt -r requirements-test.txt`; duckdb is required).
- JS tests: `node --test tests/*.test.cjs`
- Verify locks/ledger: `node scripts/daily_tracker.cjs verify` and `node scripts/challenge_supplement.cjs verify`

## Working style
- Explain a plan before large changes. Keep changes small and tested.
- Report model results with sample size. Small samples (the ledger started 2026-10-31) are noise; say so instead of ranking models confidently.
- Default timezone for users is Australia/Melbourne; cron is UTC.
- Read PRODUCT_VISION_V17.md and docs/data-publication.md before changing the pipeline or UI direction.
