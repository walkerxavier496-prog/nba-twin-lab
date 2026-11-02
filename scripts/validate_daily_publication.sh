#!/usr/bin/env bash
# The daily lock publisher must validate forecast integrity independently of
# unrelated homepage/UI acceptance tests. Pages retains its own full release gate.
set -euo pipefail
export PYTHONDONTWRITEBYTECODE=1

node --test \
  tests/challenge_daily.test.cjs \
  tests/daily_audit.test.cjs \
  tests/prediction_engine.test.cjs \
  tests/monte_carlo.test.cjs \
  tests/roster_integrity_v18.test.cjs \
  tests/roster_strength_v18.test.cjs
node scripts/daily_tracker.cjs verify
node scripts/challenge_supplement.cjs verify
node scripts/anchor_locks.cjs verify
python scripts/validate_release.py
