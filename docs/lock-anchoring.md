# Independent lock anchoring

Every daily forecast lock is hashed (SHA-256 of the exact file bytes) and the hash
is timestamped with [OpenTimestamps](https://opentimestamps.org), which commits it
to the Bitcoin blockchain. Anyone can then verify the lock existed no later than
the proof's block time, without trusting this repository or its owner.

## What is stored
`audit/anchors/<melbourne_date>.json`, one per lock:
`lock_path`, `lock_sha256`, `anchor_recorded_at_utc` and `ots` (`status`:
`unstamped` → `pending` → `confirmed`, plus `proof_base64`). The lock itself is
never modified. Only the `ots` field of an anchor changes (pending → confirmed).

## Honest limits
- The proof shows the lock existed **by the proof's Bitcoin block time**, which
  can be hours after the lock. It proves "not changed since", and an upper bound
  on when it existed, not that it was written before tip-off. Pre-tip time is
  claimed by `locked_at_utc` and the 45–180 minute lock window, and is tightened
  by this anchor only as far as the proof's timestamp.
- A `pending` proof is not yet confirmed on Bitcoin. Confirmation normally takes
  hours; the workflow upgrades pending proofs on later runs.
- Anchoring never blocks locking: if the timestamp servers are down the step is
  skipped and retried.

## Verify a day yourself
```bash
pip install opentimestamps-client
DATE=2026-10-31
sha256sum practice/$DATE-melbourne/forecast.lock.json     # must equal lock_sha256
python3 - <<PY
import json,base64
a=json.load(open("audit/anchors/$DATE.json"))
open("lock.ots","wb").write(base64.b64decode(a["ots"]["proof_base64"]))
PY
cp practice/$DATE-melbourne/forecast.lock.json lock
ots verify lock.ots          # needs a Bitcoin node or explorer access
```
Repository-side check: `node scripts/anchor_locks.cjs verify`.
