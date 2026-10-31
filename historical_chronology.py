"""Explicit historical availability; final status alone is not a timestamp.

Without verified evidence, release results at the second UTC midnight following
their date. Date-only targets predict at 00:00 UTC, before an assumed local tip.
Suspensions require evidence. All cutoffs use strict inequality.
"""
from datetime import datetime, timedelta, timezone
import hashlib
import json

POLICY = "result-availability-v1"
UNKNOWN = datetime.max.replace(tzinfo=timezone.utc)


def load_evidence(path):
    if not path.exists():
        return {}
    payload = json.loads(path.read_text())
    integrity = payload.pop("integrity", {})
    digest = hashlib.sha256(json.dumps(payload, sort_keys=True, ensure_ascii=False, separators=(",", ":")).encode()).hexdigest()
    if integrity.get("algorithm") != "sha256" or integrity.get("canonical_payload_without_integrity") != digest:
        raise ValueError("Invalid result-availability evidence integrity")
    return payload.get("games", {})


def prediction_time(value):
    if len(value) == 10:
        return datetime.fromisoformat(value).replace(tzinfo=timezone.utc)
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        raise ValueError("Prediction timestamp must include timezone")
    return parsed.astimezone(timezone.utc)


def result_availability(game):
    try:
        tip = prediction_time(game["date"])
        if "result_available_at_utc" in game:
            stamp = prediction_time(game["result_available_at_utc"])
            if (game.get("result_availability_verified") is True and
                    game.get("result_availability_source") and stamp > tip and
                    len(game["result_available_at_utc"]) > 10):
                return stamp
            return UNKNOWN
        if game.get("status") in ("suspended", "postponed"):
            return UNKNOWN
        return tip.replace(hour=0, minute=0, second=0, microsecond=0) + timedelta(days=2)
    except (KeyError, TypeError, ValueError, OverflowError):
        return UNKNOWN
