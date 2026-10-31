# Controlled release checklist — Phase 1 / chronology review

No push, deployment, workflow dispatch, or settings change was performed.

## Verified through the authenticated GitHub connector

- Repository: `walkerxavier496-prog/nba-twin-lab`, public, default branch `main`.
- Authenticated account: `walkerxavier496-prog`; repository metadata reports admin.
- Observed remote main: `a78acc287c141184d24a716c9272c00fd0c1e1fe`, already newer
  than this workspace's audited base. Reconcile that remote revision before an
  approved push; do not overwrite its data updates.
- The branch response reports `protected: false`, status checks off; repository
  rulesets list is empty. The pipeline can validate a SHA, but cannot establish
  human code approval when main itself has no approval enforcement.
- The detailed protection endpoint returns 403 `Resource not accessible by
  integration`. Pages, Actions settings, and environment administration URLs are
  outside the connector's endpoint allowlist. CLI `gh` is not installed here.

These are observations, not permission to change repository settings. The owner
must explicitly accept the current main trust boundary or approve appropriate
branch controls compatible with the data-only bot publisher.

## Exact read-only manual checks

Use an authenticated GitHub CLI with permission to inspect repository settings:

```sh
gh auth status
gh repo view walkerxavier496-prog/nba-twin-lab --json nameWithOwner,defaultBranchRef,viewerPermission
gh api repos/walkerxavier496-prog/nba-twin-lab/pages
gh api repos/walkerxavier496-prog/nba-twin-lab/actions/permissions
gh api repos/walkerxavier496-prog/nba-twin-lab/actions/permissions/workflow
gh api repos/walkerxavier496-prog/nba-twin-lab/branches/main
gh api repos/walkerxavier496-prog/nba-twin-lab/branches/main/protection
gh api repos/walkerxavier496-prog/nba-twin-lab/rulesets
gh api repos/walkerxavier496-prog/nba-twin-lab/environments/github-pages
gh run list --repo walkerxavier496-prog/nba-twin-lab --workflow static.yml --limit 10
```

Alternatively inspect Settings → Pages (source must be GitHub Actions),
Settings → Actions → General (allowed actions and token permission policy),
Settings → Rules / Branches, and Settings → Environments → github-pages.
Retain the JSON responses/HTTP statuses or screenshots with repository and time.
Do not share credentials. A 403 means the setting remains unverified, not absent.

Required evidence: Actions can use the named official actions; producer jobs can
publish data commits; build jobs can read workflow artifacts; deployment jobs
can obtain Pages/OIDC permissions; the Pages environment admits the intended
branch and any required reviewer can approve. Do not disable safeguards merely
to make a workflow pass.

## First hosted run — only after explicit approval

1. Reconcile the current remote main with the local diff and review the exact
   source revision. Keep all original lock/result/report hashes unchanged.
2. Approve a controlled push. Observe the normal push checks; do not separately
   dispatch workflows without approval.
3. Observe a successful scheduled producer (or explicitly approve a manual run).
   Save its run/attempt, candidate SHA, validation results, publication receipt,
   and committed producer refresh record.
4. Confirm `workflow_run` starts Pages without relying on a bot-push trigger.
   Its selected SHA must equal the receipt SHA and current main. Superseded runs
   must skip; failed/untrusted/no-receipt runs must not deploy.
5. Verify the build checked out and validated that exact SHA. Confirm the Pages
   artifact and successful deployment refer to it, with no recursive producer
   runs caused by publication.
6. GET `https://walkerxavier496-prog.github.io/nba-twin-lab/deployment.json`
   after deployment. Confirm the revision and observation/validation/publication
   timestamps match the receipt and commit. Packaging time is not deployment
   completion; the latter remains null in the static JSON and is verified from
   GitHub's completed Pages deployment record.

Unattended production readiness remains NO-GO until the settings/approval trust
boundary and this hosted handoff are verified. Local tests do not prove hosted
event delivery, branch permissions, Pages environment policy, or CDN freshness.
