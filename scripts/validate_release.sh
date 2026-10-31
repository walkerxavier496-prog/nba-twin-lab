#!/usr/bin/env bash
set -euo pipefail
export PYTHONDONTWRITEBYTECODE=1
python -m pytest -q -p no:cacheprovider
node --test tests/*.test.cjs
node scripts/daily_tracker.cjs verify
node scripts/challenge_supplement.cjs verify
node scripts/anchor_locks.cjs verify
node scripts/lock_gaps.cjs verify
python scripts/validate_release.py
