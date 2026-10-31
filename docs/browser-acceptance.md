# Browser acceptance (Concept 3)

`tests/browser/acceptance.cjs` drives the real site in Chrome through Playwright at 1440, 1280, 390 and 375 px
(68 checks). It is opt-in: the project has no `package.json`, so `scripts/validate_release.sh` does not need a browser.
Faster guards for each defect it found live in `tests/browser_regressions.test.cjs` and do run in the release gate.

```sh
mkdir -p /tmp/nba-playwright && cd /tmp/nba-playwright && npm init -y && npm install playwright-core
cd <repo>
PLAYWRIGHT_CORE=/tmp/nba-playwright/node_modules/playwright-core \
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
ACCEPTANCE_OUT=/tmp/nba-acceptance node tests/browser/acceptance.cjs
```

- The repository is served read-only on 127.0.0.1. Every external request (ESPN, photos, logos) is blocked, so the run
  also proves the honest "unavailable" states. It does not exercise live ESPN data.
- Expected values (OUT players, locked probabilities, final score, grade) are read from the immutable lock and review
  files, never from the page.
- Screenshots and `report.json` are written to `ACCEPTANCE_OUT/<width>/`.
