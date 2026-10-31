#!/usr/bin/env python3
"""Resolve a trusted publication receipt and package only a validated Git tree."""
from datetime import datetime, timezone
import fnmatch
import io
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tarfile
import zipfile


def git(*args):
    return subprocess.check_output(["git", *args], text=True).strip()


def timestamp(value):
    if not isinstance(value, str):
        raise ValueError("Timestamp must be an ISO string")
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        raise ValueError("Timestamp must include timezone")
    return parsed.astimezone(timezone.utc)


def read_receipt_archive(path):
    # Never extract or execute workflow artifacts. Only one bounded JSON member
    # is accepted, so traversal paths, symlinks and extra scripts are rejected.
    with zipfile.ZipFile(path) as archive:
        members = archive.infolist()
        if len(members) != 1 or members[0].filename != "receipt.json" or members[0].file_size > 32768:
            raise ValueError("Expected only a small receipt.json artifact")
        if (members[0].external_attr >> 16) & 0o170000 == 0o120000:
            raise ValueError("Receipt cannot be a symlink")
        receipt = json.loads(archive.read(members[0]))
        if not isinstance(receipt, dict):
            raise ValueError("Receipt must be an object")
        return receipt


def select_revision(event, receipt, default_revision, repository):
    if event.get("workflow_run"):
        run = event["workflow_run"]
        if (run["conclusion"] != "success" or run["head_branch"] != "main" or
                run.get("event") not in ("schedule", "push", "workflow_dispatch") or
                run["head_repository"]["full_name"] != repository):
            raise ValueError("Untrusted or unsuccessful refresh run")
        if receipt is None:
            return None
        if (receipt.get("repository") != repository or
                str(receipt.get("run_id")) != str(run["id"]) or
                str(receipt.get("run_attempt")) != str(run["run_attempt"])):
            raise ValueError("Receipt does not belong to the triggering run attempt")
        revision = receipt.get("revision", "")
    else:
        revision = default_revision
    if not isinstance(revision, str) or not re.fullmatch(r"[0-9a-f]{40}", revision):
        raise ValueError("Expected full immutable commit SHA")
    # Only current main may deploy. Superseded runs do not roll the site back.
    if revision != git("rev-parse", "origin/main"):
        return None
    if event.get("workflow_run"):
        config = json.loads(git("show", f"{revision}:scripts/publication.json"))
        producer = receipt.get("workflow")
        if (not isinstance(producer, str) or producer not in config or
                run.get("path", "").split("@", 1)[0] != f".github/workflows/{producer}.yml"):
            raise ValueError("Receipt producer does not match the triggering workflow")
        record = json.loads(git("show", f"{revision}:data/refresh-status/{producer}.json"))
        if (record.get("workflow") != producer or record.get("source_revision") != run.get("head_sha") or
                str(record.get("run_id")) != str(run["id"]) or
                str(record.get("run_attempt")) != str(run["run_attempt"])):
            raise ValueError("Receipt is not bound to the committed refresh record")
        source = run.get("head_sha", "")
        if not re.fullmatch(r"[0-9a-f]{40}", source):
            raise ValueError("Invalid source revision")
        subprocess.run(["git", "merge-base", "--is-ancestor", source, revision], check=True)
        delta = git("diff", "--name-only", "--no-renames", source, revision).splitlines()
        if any(not (p.startswith("data/refresh-status/") or
                    any(fnmatch.fnmatchcase(p, pattern) for pattern in config[producer])) for p in delta):
            raise ValueError("Receipt revision contains changes outside the producer outputs")
        observed = timestamp(record["generation_observed_at_utc"])
        validated = timestamp(receipt.get("validated_at_utc"))
        published = timestamp(receipt.get("published_at_utc"))
        if not observed <= validated <= published <= datetime.now(timezone.utc):
            raise ValueError("Invalid generation/validation/publication chronology")
    return revision


def package(revision, destination, receipt=None):
    if revision != git("rev-parse", "HEAD") or git("status", "--porcelain"):
        raise ValueError("Packaging requires the exact clean validated revision")
    archive = subprocess.check_output(["git", "archive", revision])
    destination.mkdir(parents=True, exist_ok=False)
    with tarfile.open(fileobj=io.BytesIO(archive)) as tar:
        if any(not (m.isfile() or m.isdir()) for m in tar.getmembers()):
            raise ValueError("Release tree must contain only files and directories")
        tar.extractall(destination)
    refreshes = {}
    for path in sorted((destination / "data/refresh-status").glob("*.json")):
        record = json.loads(path.read_text())
        timestamp(record["generation_observed_at_utc"])
        refreshes[path.stem] = record
    latest = max((r["generation_observed_at_utc"] for r in refreshes.values()), key=timestamp, default=None)
    if receipt is not None and receipt.get("revision") != revision:
        raise ValueError("Publication receipt must match packaged revision")
    metadata = {
        "schema": "nba-twin-lab-deployment-v1", "revision": revision,
        "packaged_at_utc": datetime.now(timezone.utc).isoformat(),
        "latest_successful_data_refresh_at_utc": latest,
        "publication": {key: receipt[key] for key in ("validated_at_utc", "published_at_utc")} if receipt else None,
        "deployment_completed_at_utc": None,
        "refreshes": refreshes,
        "note": "Observation time is not source generation or publication time. Publication time is known only for receipt-backed releases. Deployment completion is recorded by GitHub Pages, after this artifact is packaged.",
    }
    (destination / "deployment.json").write_text(json.dumps(metadata, indent=2) + "\n")
    return metadata


def main():
    if sys.argv[1] == "select":
        event = json.loads(Path(os.environ["GITHUB_EVENT_PATH"]).read_text())
        receipt = None
        if os.environ.get("HAS_RECEIPT") == "true":
            receipt = read_receipt_archive(Path(os.environ["RUNNER_TEMP"]) / "publication-receipt.zip")
        revision = select_revision(event, receipt, os.environ["GITHUB_SHA"], os.environ["GITHUB_REPOSITORY"])
        with open(os.environ["GITHUB_OUTPUT"], "a") as output:
            output.write(f"deploy={'true' if revision else 'false'}\n")
            if revision:
                output.write(f"revision={revision}\n")
    elif sys.argv[1] == "package":
        receipt = None
        if os.environ.get("HAS_RECEIPT") == "true":
            receipt = read_receipt_archive(Path(os.environ["RUNNER_TEMP"]) / "publication-receipt.zip")
        package(os.environ["RELEASE_REVISION"], Path(os.environ["RUNNER_TEMP"]) / "pages-site", receipt)
    else:
        raise ValueError("Expected select or package")


if __name__ == "__main__":
    main()
