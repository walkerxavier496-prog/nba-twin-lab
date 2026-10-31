#!/usr/bin/env python3
"""Publish only declared generated outputs; never resolve conflicts by overwriting.

Called by the publication action, not by data builders. All tests run against the
candidate commit after each rebase, before an ordinary fast-forward push. The
receipt is created only after the server accepts that exact revision.
"""
import argparse
from datetime import datetime, timezone
import fnmatch
import json
import os
from pathlib import Path
import subprocess
import time


def git(*args, check=True):
    return subprocess.run(["git", *args], check=check, text=True, capture_output=True)


def paths_changed(base=None):
    if base:
        return git("diff", "--name-only", "--no-renames", "-z", base, "HEAD").stdout.split("\0")[:-1]
    tracked = git("diff", "HEAD", "--name-only", "--no-renames", "-z").stdout
    new = git("ls-files", "--others", "--exclude-standard", "-z").stdout
    return sorted(set((tracked + new).split("\0")) - {""})


def immutable(path):
    return (path.startswith("practice/") or
            path.startswith("research-reviews/") or
            path in ("data/v7-intelligence.json", "data/rotation-history.json") or
            (path.startswith("data/") and path.endswith("report.json")) or
            path.startswith("audit/snapshots/") or
            path.startswith("audit/supplements/") or
            (path.startswith("audit/reviews/") and "/games/" in path))


def guard_outputs(paths, allowed, base):
    for path in paths:
        if not any(fnmatch.fnmatchcase(path, pattern) for pattern in allowed):
            raise ValueError(f"Undeclared generated change: {path}")
        exists_before = git("cat-file", "-e", f"{base}:{path}", check=False).returncode == 0
        if immutable(path) and exists_before:
            raise ValueError(f"Existing immutable artifact cannot be changed or deleted: {path}")
        if not Path(path).is_file():
            raise ValueError(f"Generated artifact cannot be deleted: {path}")
        json.loads(Path(path).read_text())


def publish(workflow, receipt, validate):
    config = json.loads(Path("scripts/publication.json").read_text())
    allowed = config[workflow]
    base = git("rev-parse", "HEAD").stdout.strip()
    changed = paths_changed()
    guard_outputs(changed, allowed, base)
    # Per-producer files avoid metadata conflicts between otherwise disjoint runs.
    stamp = Path("data/refresh-status") / f"{workflow}.json"
    stamp.parent.mkdir(parents=True, exist_ok=True)
    generation_times = {}
    for name in changed:
        payload = json.loads(Path(name).read_text())
        if isinstance(payload, dict):
            times = {key: payload[key] for key in
                     ("built_at_utc", "generated_at_utc", "reviewed_at_utc", "locked_at_utc")
                     if isinstance(payload.get(key), str)}
            if times:
                generation_times[name] = times
    stamp.write_text(json.dumps({
        "workflow": workflow,
        "generation_observed_at_utc": datetime.now(timezone.utc).isoformat(),
        "artifact_generation_timestamps": generation_times,
        "source_revision": base,
        "run_id": os.environ.get("GITHUB_RUN_ID"),
        "run_attempt": os.environ.get("GITHUB_RUN_ATTEMPT"),
        "changed_artifacts": changed,
    }, indent=2) + "\n")
    git("add", "--", *changed, str(stamp))
    if paths_changed() != sorted(changed + [str(stamp)]):
        raise ValueError("Unexpected changes while staging publication")
    git("-c", "user.name=github-actions[bot]", "-c",
        "user.email=41898282+github-actions[bot]@users.noreply.github.com",
        "commit", "-m", f"Refresh validated NBA data ({workflow})")
    for attempt in range(5):
        git("fetch", "origin", "main")
        # A builder cannot safely reuse outputs after an upstream input/code
        # change. Metadata-only commits are safe to integrate. Other changes
        # require a fresh run from main; never reset/copy stale data over them.
        upstream = git("diff", "--name-only", "--no-renames", base, "origin/main").stdout.splitlines()
        unsafe = [p for p in upstream if not p.startswith("data/refresh-status/")]
        if unsafe:
            raise ValueError("Upstream inputs changed; rerun refresh from main: " + ", ".join(unsafe))
        rebased = git("rebase", "origin/main", check=False)
        if rebased.returncode:
            git("rebase", "--abort")
            raise ValueError("Publication conflict; preserved both versions, rerun from main")
        revision = git("rev-parse", "HEAD").stdout.strip()
        subprocess.run(validate, check=True)
        if git("status", "--porcelain").stdout or git("rev-parse", "HEAD").stdout.strip() != revision:
            raise ValueError("Validation changed the candidate working tree or revision")
        validated_at = datetime.now(timezone.utc).isoformat()
        pushed = git("push", "origin", "HEAD:main", check=False)
        if pushed.returncode == 0:
            receipt.parent.mkdir(parents=True, exist_ok=True)
            receipt.write_text(json.dumps({
                "revision": revision, "repository": os.environ.get("GITHUB_REPOSITORY"),
                "run_id": os.environ.get("GITHUB_RUN_ID"), "workflow": workflow,
                "run_attempt": os.environ.get("GITHUB_RUN_ATTEMPT"),
                "validated_at_utc": validated_at,
                "published_at_utc": datetime.now(timezone.utc).isoformat(),
            }) + "\n")
            print(f"Published and validated {revision}")
            return revision
        time.sleep(attempt + 1)
    raise RuntimeError("Publication push failed after five non-destructive attempts")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("workflow")
    parser.add_argument("--receipt", required=True, type=Path)
    args = parser.parse_args()
    publish(args.workflow, args.receipt, ["bash", "scripts/validate_release.sh"])


if __name__ == "__main__":
    main()
