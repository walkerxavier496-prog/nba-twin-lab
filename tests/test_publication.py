"""Publication tests use disposable local bare remotes; never contact GitHub."""
import copy
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import zipfile

import pytest
import yaml

ROOT = Path(__file__).resolve().parents[1]


def load(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / "scripts" / f"{name}.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


pub = load("publish_data")
deploy = load("deployment")


def git(cwd, *args):
    return subprocess.check_output(["git", "-C", str(cwd), *args], text=True).strip()


@pytest.fixture
def repository(tmp_path, monkeypatch):
    remote = tmp_path / "remote.git"
    subprocess.run(["git", "init", "--bare", "--initial-branch=main", str(remote)], check=True, capture_output=True)
    work = tmp_path / "work"
    subprocess.run(["git", "clone", str(remote), str(work)], check=True, capture_output=True)
    git(work, "config", "user.name", "Test")
    git(work, "config", "user.email", "test@example.invalid")
    for name, value in {
        "scripts/publication.json": {"test-refresh": ["data/current.json", "data/rotation.json", "practice/**/*.json", "audit/**/*.json"]},
        "data/current.json": {"value": 1},
        "data/rotation.json": {"value": 1},
        "practice/day/forecast.lock.json": {"original": True},
        "audit/reviews/day/games/1.review.json": {"original": True},
    }.items():
        path = work / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(value))
    git(work, "add", ".")
    git(work, "commit", "-m", "Initial")
    git(work, "push", "origin", "HEAD:main")
    monkeypatch.chdir(work)
    monkeypatch.setenv("GITHUB_REPOSITORY", "test/nba")
    monkeypatch.setenv("GITHUB_RUN_ID", "123")
    monkeypatch.setenv("GITHUB_RUN_ATTEMPT", "1")
    return work, remote, tmp_path / "receipt.json"


def refresh_event(work):
    record = json.loads((work / "data/refresh-status/test-refresh.json").read_text())
    return {"workflow_run": {"conclusion": "success", "head_branch": "main",
            "event": "schedule",
            "head_repository": {"full_name": "test/nba"}, "id": 123, "run_attempt": 1,
            "path": ".github/workflows/test-refresh.yml", "head_sha": record["source_revision"]}}


def test_all_generated_outputs_are_committed_validated_and_packaged(repository, tmp_path):
    work, remote, receipt_path = repository
    lock = (work / "practice/day/forecast.lock.json").read_bytes()
    (work / "data/current.json").write_text('{"value":2,"built_at_utc":"2026-10-30T00:00:00Z"}')
    (work / "data/rotation.json").write_text('{"value":3}')
    validation_log = tmp_path / "validated-sha"
    validate = [sys.executable, "-c", "import subprocess,pathlib; pathlib.Path(" + repr(str(validation_log)) + ").write_text(subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip())"]
    revision = pub.publish("test-refresh", receipt_path, validate)
    assert revision == validation_log.read_text() == git(remote, "rev-parse", "main")
    assert json.loads(receipt_path.read_text())["revision"] == revision
    assert git(work, "status", "--porcelain") == ""
    assert json.loads(git(remote, "show", "main:data/rotation.json"))["value"] == 3
    assert (work / "practice/day/forecast.lock.json").read_bytes() == lock
    event = refresh_event(work)
    git(work, "fetch", "origin", "main")
    assert deploy.select_revision(event, json.loads(receipt_path.read_text()), "wrong-trigger-sha", "test/nba") == revision
    receipt = json.loads(receipt_path.read_text())
    metadata = deploy.package(revision, tmp_path / "site", receipt)
    assert metadata["revision"] == revision
    assert metadata["latest_successful_data_refresh_at_utc"]
    assert metadata["deployment_completed_at_utc"] is None
    assert metadata["publication"]["published_at_utc"] == receipt["published_at_utc"]
    record = metadata["refreshes"]["test-refresh"]
    assert record["artifact_generation_timestamps"]["data/current.json"]["built_at_utc"] == "2026-10-30T00:00:00Z"
    assert (deploy.timestamp(record["generation_observed_at_utc"]) <=
            deploy.timestamp(receipt["validated_at_utc"]) <= deploy.timestamp(receipt["published_at_utc"]) <=
            deploy.timestamp(metadata["packaged_at_utc"]))
    assert (tmp_path / "site/practice/day/forecast.lock.json").read_bytes() == lock
    assert not (tmp_path / "site/.git").exists()


@pytest.mark.parametrize("name", ["practice/day/forecast.lock.json", "audit/reviews/day/games/1.review.json"])
@pytest.mark.parametrize("delete", [False, True])
def test_existing_immutable_artifacts_cannot_be_changed_or_deleted(repository, name, delete):
    work, remote, receipt = repository
    before = git(remote, "rev-parse", "main")
    if delete:
        (work / name).unlink()
    else:
        (work / name).write_text('{"tampered":true}')
    with pytest.raises(ValueError, match="immutable"):
        pub.publish("test-refresh", receipt, [sys.executable, "-c", "pass"])
    assert git(remote, "rev-parse", "main") == before
    assert not receipt.exists()


def test_new_immutable_artifact_is_append_only(repository):
    work, _, receipt = repository
    path = work / "audit/reviews/day/games/2.review.json"
    path.write_text('{"new":true}')
    pub.publish("test-refresh", receipt, [sys.executable, "-c", "pass"])
    assert path.read_text() == '{"new":true}'


def test_undeclared_output_fails_instead_of_leaving_dirty_rebase(repository):
    work, _, receipt = repository
    (work / "data/forgotten.json").write_text('{}')
    with pytest.raises(ValueError, match="Undeclared"):
        pub.publish("test-refresh", receipt, [sys.executable, "-c", "pass"])
    assert not receipt.exists()


def test_failed_validation_never_pushes_or_emits_receipt(repository):
    _, remote, receipt = repository
    before = git(remote, "rev-parse", "main")
    with pytest.raises(subprocess.CalledProcessError):
        pub.publish("test-refresh", receipt, [sys.executable, "-c", "raise SystemExit(9)"])
    assert git(remote, "rev-parse", "main") == before
    assert not receipt.exists()


def upstream_commit(work, remote, name):
    other = work.parent / "other"
    subprocess.run(["git", "clone", str(remote), str(other)], check=True, capture_output=True)
    path = other / name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text('{}')
    git(other, "add", ".")
    git(other, "-c", "user.name=Other", "-c", "user.email=other@example.invalid", "commit", "-m", "Concurrent update")
    git(other, "push", "origin", "main")
    return git(other, "rev-parse", "HEAD")


def test_new_upstream_inputs_fail_closed(repository):
    work, remote, receipt = repository
    revision = upstream_commit(work, remote, "data/new-input.json")
    with pytest.raises(ValueError, match="Upstream inputs changed"):
        pub.publish("test-refresh", receipt, [sys.executable, "-c", "pass"])
    assert git(remote, "rev-parse", "main") == revision
    assert not receipt.exists()


def test_push_race_rebases_and_revalidates_exact_new_sha(repository, monkeypatch, tmp_path):
    work, remote, receipt = repository
    original_git = pub.git
    validations = tmp_path / "validations"
    first_push = True

    def racing_git(*args, **kwargs):
        nonlocal first_push
        if args[0] == "push" and first_push:
            first_push = False
            upstream_commit(work, remote, "data/refresh-status/other.json")
        return original_git(*args, **kwargs)

    monkeypatch.setattr(pub, "git", racing_git)
    command = [sys.executable, "-c", "import subprocess; open(" + repr(str(validations)) + ",'a').write(subprocess.check_output(['git','rev-parse','HEAD'],text=True))"]
    revision = pub.publish("test-refresh", receipt, command)
    attempted = validations.read_text().splitlines()
    assert len(attempted) == 2 and attempted[0] != attempted[1]
    assert attempted[-1] == revision == git(remote, "rev-parse", "main")


def test_receipts_reject_wrong_runs_forks_failed_runs_and_obsolete_shas(repository):
    work, _, receipt_path = repository
    sha = pub.publish("test-refresh", receipt_path, [sys.executable, "-c", "pass"])
    event = refresh_event(work)
    receipt = json.loads(receipt_path.read_text())
    assert deploy.select_revision(event, receipt, "0" * 40, "test/nba") == sha
    assert deploy.select_revision(event, None, sha, "test/nba") is None
    for key, value in [("run_id", "124"), ("run_attempt", "2"), ("repository", "fork/nba"), ("revision", "main")]:
        with pytest.raises(ValueError):
            deploy.select_revision(event, {**receipt, key: value}, sha, "test/nba")
    for key, value in [("conclusion", "failure"), ("head_branch", "other"), ("event", "pull_request"), ("head_repository", {"full_name": "fork/nba"})]:
        bad = copy.deepcopy(event)
        bad["workflow_run"][key] = value
        with pytest.raises(ValueError):
            deploy.select_revision(bad, receipt, sha, "test/nba")
    assert deploy.select_revision(event, {**receipt, "revision": "0" * 40}, sha, "test/nba") is None


@pytest.mark.parametrize("key,value", [
    ("workflow", "../untrusted"), ("validated_at_utc", "2000-01-01T00:00:00Z"),
    ("published_at_utc", "2999-01-01T00:00:00Z"), ("validated_at_utc", "2026-10-31T00:00:00")])
def test_receipt_producer_and_timestamps_are_validated(repository, key, value):
    work, _, receipt_path = repository
    sha = pub.publish("test-refresh", receipt_path, [sys.executable, "-c", "pass"])
    receipt = json.loads(receipt_path.read_text())
    with pytest.raises(ValueError):
        deploy.select_revision(refresh_event(work), {**receipt, key: value}, sha, "test/nba")


@pytest.mark.parametrize("key,value", [
    ("path", ".github/workflows/other.yml"), ("head_sha", "0" * 40), ("id", 456)])
def test_receipt_is_bound_to_committed_producer_and_source_run(repository, key, value):
    work, _, receipt_path = repository
    sha = pub.publish("test-refresh", receipt_path, [sys.executable, "-c", "pass"])
    receipt = json.loads(receipt_path.read_text())
    event = refresh_event(work)
    event["workflow_run"][key] = value
    with pytest.raises(ValueError):
        deploy.select_revision(event, receipt, sha, "test/nba")


def test_receipt_cannot_select_unrelated_code_revision(repository):
    work, _, receipt_path = repository
    pub.publish("test-refresh", receipt_path, [sys.executable, "-c", "pass"])
    event = refresh_event(work)
    (work / "scripts/other.py").write_text('raise RuntimeError("must never execute")')
    git(work, "add", ".")
    git(work, "commit", "-m", "Unrelated code revision")
    git(work, "push", "origin", "HEAD:main")
    revision = git(work, "rev-parse", "HEAD")
    receipt = {**json.loads(receipt_path.read_text()), "revision": revision}
    with pytest.raises(ValueError, match="outside the producer outputs"):
        deploy.select_revision(event, receipt, revision, "test/nba")


@pytest.mark.parametrize("member", ["../receipt.json", "/receipt.json", "scripts/evil.py"])
def test_artifact_paths_are_never_extracted(tmp_path, member):
    archive = tmp_path / "artifact.zip"
    with zipfile.ZipFile(archive, "w") as zip:
        zip.writestr(member, '{}')
    with pytest.raises(ValueError):
        deploy.read_receipt_archive(archive)
    assert not (tmp_path / "receipt.json").exists()


def test_receipt_archive_rejects_extra_files_large_json_and_symlinks(tmp_path):
    archive = tmp_path / "artifact.zip"
    for kind in ("extra", "large", "symlink", "array"):
        with zipfile.ZipFile(archive, "w") as zip:
            if kind == "extra":
                zip.writestr("receipt.json", '{}')
                zip.writestr("evil.py", 'raise RuntimeError()')
            elif kind == "symlink":
                member = zipfile.ZipInfo("receipt.json")
                member.external_attr = 0o120777 << 16
                zip.writestr(member, '{}')
            else:
                zip.writestr("receipt.json", ' ' * 32769 if kind == "large" else '[]')
        with pytest.raises(ValueError):
            deploy.read_receipt_archive(archive)
    with zipfile.ZipFile(archive, "w") as zip:
        zip.writestr("receipt.json", '{"revision":"abc"}')
    assert deploy.read_receipt_archive(archive) == {"revision": "abc"}


def test_validation_cannot_change_the_candidate_revision(repository):
    _, remote, receipt = repository
    before = git(remote, "rev-parse", "main")
    command = ["git", "-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "--allow-empty", "-m", "Moved HEAD"]
    with pytest.raises(ValueError, match="revision"):
        pub.publish("test-refresh", receipt, command)
    assert git(remote, "rev-parse", "main") == before
    assert not receipt.exists()


def test_package_rejects_unvalidated_revision_and_dirty_tree(repository, tmp_path):
    work, _, _ = repository
    with pytest.raises(ValueError):
        deploy.package("0" * 40, tmp_path / "site")
    (work / "data/current.json").write_text('{}')
    with pytest.raises(ValueError):
        deploy.package(git(work, "rev-parse", "HEAD"), tmp_path / "site")


def workflow(path):
    # BaseLoader keeps YAML's `on` key a string (rather than YAML 1.1 boolean).
    return yaml.load(path.read_text(), Loader=yaml.BaseLoader)


def test_every_publisher_uses_shared_action_and_nonrecursive_pages_handoff():
    producers = json.loads((ROOT / "scripts/publication.json").read_text())
    pages = workflow(ROOT / ".github/workflows/static.yml")
    triggers = pages["on"]["workflow_run"]["workflows"]
    assert len(triggers) == len(producers) == 13
    for name in producers:
        path = ROOT / ".github/workflows" / f"{name}.yml"
        spec = workflow(path)
        assert spec["name"] in triggers
        job = next(iter(spec["jobs"].values()))
        assert job["if"] == "github.ref == 'refs/heads/main'"
        assert job["steps"][0]["with"]["fetch-depth"] == "0"
        action = job["steps"][-1]
        assert action["uses"] == "./.github/actions/publish-data"
        assert action["with"]["workflow"] == name
        assert "git reset --hard" not in path.read_text()
        assert "git pull --rebase" not in path.read_text()
    assert pages["name"] not in triggers
    assert pages["on"]["workflow_run"]["branches"] == ["main"]
    assert pages["on"]["workflow_run"]["types"] == ["completed"]
    build = pages["jobs"]["build"]
    assert "conclusion == 'success'" in build["if"]
    steps = build["steps"]
    validate = next(i for i, s in enumerate(steps) if s.get("run") == "bash scripts/validate_release.sh")
    pinned = next(i for i, s in enumerate(steps) if s.get("with", {}).get("ref") == "${{ steps.target.outputs.revision }}")
    package = next(i for i, s in enumerate(steps) if s.get("run") == "python scripts/deployment.py package")
    upload = next(i for i, s in enumerate(steps) if s.get("uses") == "actions/upload-pages-artifact@v3")
    assert pinned < validate < package < upload
    assert pages["jobs"]["deploy"]["needs"] == "build"
    assert pages["jobs"]["deploy"]["permissions"]["contents"] == "read"
    assert "data.commit.sha === process.env.RELEASE_REVISION" in pages["jobs"]["deploy"]["steps"][0]["with"]["script"]
    assert "node --test tests/*.test.cjs" in (ROOT / "scripts/validate_release.sh").read_text()
    assert "python -m pytest" in (ROOT / "scripts/validate_release.sh").read_text()


def test_v7_and_v9_declare_all_builder_outputs():
    config = json.loads((ROOT / "scripts/publication.json").read_text())
    expected = {"data/v7-current.json", "research-reviews/**/*.json"}
    assert set(config["v7-audit"]) == expected
    assert set(config["v9-player-stats"]) == expected


def test_all_workflows_parse_and_only_shared_publisher_writes_git():
    for path in (ROOT / ".github/workflows").glob("*.yml"):
        spec = workflow(path)
        assert "on" in spec and "jobs" in spec
        assert not any(command in path.read_text() for command in ("git push", "git commit", "git reset --hard"))
    action = workflow(ROOT / ".github/actions/publish-data/action.yml")
    assert action["runs"]["using"] == "composite"
    upload = action["runs"]["steps"][-1]
    assert upload["with"]["name"] == "publication-receipt-${{ github.run_attempt }}"
    assert upload["with"]["if-no-files-found"] == "error"


def test_deployment_uses_read_only_artifact_boundary_and_serial_deployments():
    pages = workflow(ROOT / ".github/workflows/static.yml")
    assert pages["permissions"] == {"contents": "read", "actions": "read"}
    assert pages["concurrency"] == {"group": "pages", "cancel-in-progress": "false"}
    build = pages["jobs"]["build"]
    assert build["permissions"]["contents"] == "read"
    assert build["permissions"]["actions"] == "read"
    assert "id-token" not in build["permissions"]
    assert '"schedule","push","workflow_dispatch"' in build["if"]
    for step in build["steps"]:
        if step.get("uses") == "actions/checkout@v4":
            assert step["with"]["persist-credentials"] == "false"
        assert not step.get("uses", "").startswith("actions/download-artifact")
    assert pages["jobs"]["deploy"]["permissions"] == {"contents": "read", "pages": "write", "id-token": "write"}
    assert "steps.current.outputs.deploy == 'true'" == pages["jobs"]["deploy"]["steps"][-1]["if"]
