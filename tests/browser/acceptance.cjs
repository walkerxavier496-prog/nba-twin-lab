#!/usr/bin/env node
'use strict';
/* Browser acceptance for the approved Concept 3 site (opt-in; not part of validate_release.sh).
 *
 *   PLAYWRIGHT_CORE=/path/to/node_modules/playwright-core \
 *   CHROME=/path/to/chrome  ACCEPTANCE_OUT=/tmp/nba-acceptance  node tests/browser/acceptance.cjs
 *
 * Serves the repository read-only on 127.0.0.1 and blocks every external request, so the
 * run also proves the honest "unavailable" states (no ESPN, no hotlinked photos).
 * Expected values are read from the immutable lock/review files, never from the page.
 */
const http = require('node:http'), fs = require('node:fs'), path = require('node:path');
const assert = require('node:assert/strict');
const ROOT = path.join(__dirname, '..', '..');
const { chromium } = require(process.env.PLAYWRIGHT_CORE || '/private/tmp/nba-playwright/node_modules/playwright-core');
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const OUT = process.env.ACCEPTANCE_OUT || '/tmp/nba-acceptance';
const VIEWPORTS = [[1440, 900], [1280, 800], [390, 844], [375, 812]];
const GAME = '401909277';
const json = file => JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8'));
const LOCK = json('practice/2026-10-31-melbourne/forecast.lock.json');
const SIDECAR = json('audit/supplements/2026-10-31/challenge.lock.json');
const REVIEW = json('audit/reviews/2026-10-31/games/' + GAME + '.review.json').games[0];
const LEDGER = json('data/audit-ledger.json');
const outNames = f => (f.v9_player_projections || []).filter(p => String(p.official_injury_report?.status).toLowerCase() === 'out').map(p => p.name);
const forecast = id => LOCK.forecasts.find(f => String(f.game_id) === String(id));

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  let file = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!file.startsWith(ROOT) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

const results = [];
async function check(vp, name, fn) {
  const label = `${vp}px ${name}`;
  try { await fn(); results.push({ label, ok: true }); }
  catch (error) { results.push({ label, ok: false, error: String(error.message).split('\n').slice(0, 3).join(' | ') }); }
}

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  fs.mkdirSync(OUT, { recursive: true });

  for (const [width, height] of VIEWPORTS) {
    const mobile = width <= 590;
    const context = await browser.newContext({ viewport: { width, height }, isMobile: mobile, hasTouch: mobile });
    await context.route(url => new URL(url).hostname !== '127.0.0.1', route => route.abort());
    const open = async (url, ready) => {
      const page = await context.newPage();
      page.errors = [];
      page.on('pageerror', error => page.errors.push(error.message));
      await page.goto(base + url, { waitUntil: 'networkidle' });
      if (ready) await page.waitForSelector(ready, { timeout: 8000 });
      return page;
    };
    const shot = async (page, name) => {
      const dir = path.join(OUT, String(width)); fs.mkdirSync(dir, { recursive: true });
      await page.screenshot({ path: path.join(dir, name + '.png'), fullPage: true });
    };
    const text = (page, selector) => page.locator(selector).innerText();
    // With external hosts blocked every portrait/logo fails: a failed image must disappear, never show a broken-image box.
    const brokenVisible = async page => {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); // trigger lazy images
      await page.waitForFunction(() => [...document.images].every(i => i.complete), null, { timeout: 8000 }).catch(() => {});
      return brokenVisibleNow(page);
    };
    const brokenVisibleNow = page => page.evaluate(() => [...document.images].filter(img => img.complete && img.naturalWidth === 0 && img.getAttribute('src'))
      .filter(img => { const r = img.getBoundingClientRect(), cs = getComputedStyle(img); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; })
      .map(img => img.src.slice(-60)));

    // ---------- navigation and layout on every primary page ----------
    const pages = [
      ['home', '/', 'HOME', 'Games'], ['predict', '/predict/', 'PREDICT', 'Predictions'],
      ['daily', '/challenge/daily.html', 'DAILY', 'Predictions'], ['players', '/player-stats/', 'PLAYERS', 'Players'],
      ['audit', '/audit/', 'AUDIT', 'Model Lab'], ['league', '/league/', 'TEAMS', 'League'],
    ];
    for (const [key, url, desktopLabel, mobileLabel] of pages) {
      await check(width, `navigation + no horizontal overflow: ${key}`, async () => {
        const page = await open(url);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        assert.ok(overflow <= 1, `page is ${overflow}px wider than the viewport`);
        assert.deepEqual(page.errors, [], 'uncaught page errors');
        if (!mobile) {
          const labels = await page.locator('.app-header nav .nav-main-link').allInnerTexts();
          assert.deepEqual(labels.map(s => s.trim()), ['HOME', 'PREDICT', 'DAILY', 'PLAYERS', 'TEAMS', 'STATS', 'AUDIT', 'MODELS']);
          assert.ok(await page.locator('.app-header nav summary').isVisible(), 'MORE menu visible');
          const active = await page.locator('.app-header nav .nav-main-link[aria-current="page"]').allInnerTexts();
          assert.deepEqual(active.map(s => s.trim()), [desktopLabel]);
        } else {
          assert.ok(await page.locator('.site-bottom-nav').isVisible(), 'bottom navigation visible');
          assert.equal(await page.locator('.site-bottom-nav a').count(), 5);
          const active = await page.locator('.site-bottom-nav a[aria-current="page"]').allInnerTexts();
          assert.deepEqual(active.map(s => s.trim()), [mobileLabel]);
        }
        await shot(page, key);
        await page.close();
      });
    }

    // ---------- Predictor ----------
    await check(width, 'predictor: five tabs switch and never stay on a loader', async () => {
      const page = await open('/predict/?game=' + GAME, '#c3-lab .c3-main-grid');
      const names = await page.locator('[data-c3-game-tab]').evaluateAll(els => els.map(e => e.dataset.c3GameTab));
      assert.equal(names.length, 5, names.join(','));
      for (const name of names) {
        await page.locator(`[data-c3-game-tab="${name}"]`).click();
        assert.equal(await page.locator(`[data-c3-game-tab="${name}"]`).getAttribute('aria-selected'), 'true', name);
        const body = await text(page, '#c3-lab');
        assert.ok(body.length > 200, name + ' panel is empty');
        assert.doesNotMatch(body, /Loading/i, name);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        assert.ok(overflow <= 1, `${name} tab is ${overflow}px wider than the viewport`);
        await shot(page, 'predict-tab-' + name);
      }
      await page.close();
    });
    await check(width, 'predictor: one headline, six engines in audit and honest key factors', async () => {
      const page = await open('/predict/?game=' + GAME, '#c3-lab .c3-main-grid');
      const body = await text(page, '#c3-lab');
      assert.equal(await page.locator('.c3-six-models').count(), 0, 'one headline prediction; no competing engine cards');
      const ml = SIDECAR.games.find(g => String(g.game_id) === GAME).predictions.m5_regularized_ml.home_win_probability;
      const chosenAway = Math.round(100 * (1 - ml)) + '%';
      assert.ok(body.includes(chosenAway), 'locked research challenger away probability ' + chosenAway);
      await page.locator('[data-c3-game-tab="models"]').click();
      const modelBody = await text(page, '#c3-lab');
      for (const engine of ['Elo', 'Basketball Science', 'Player / Roster', 'Monte Carlo', 'Machine Learning', 'Ensemble']) assert.ok(modelBody.includes(engine), engine);
      await page.locator('[data-c3-game-tab="prediction"]').click();
      const [a, h] = (await page.locator('.c3-prob-score strong').allInnerTexts()).map(s => parseInt(s, 10));
      assert.equal(a + h, 100);
      assert.equal(await page.locator('.c3-large-track i').count(), 2);
      const factors = await page.locator('.c3-panel', { hasText: 'Key Factors' }).innerText();
      assert.doesNotMatch(factors, /\+12%|missing 2 key rotation/, 'no mock-up factors');
      assert.ok(factors.replace(/Key Factors|PREGAME EVIDENCE/g, '').trim().length > 20, 'factors or an explicit unavailable sentence');
      await page.close();
    });
    await check(width, 'predictor: postgame grade matches the audited review', async () => {
      const page = await open('/predict/?game=' + GAME, '#c3-lab .c3-main-grid');
      const body = await text(page, '#c3-lab');
      assert.match(body, /CHA\s*79\s*[–-]\s*95\s*WSH/, 'audited final score');
      assert.match(body, REVIEW.models.m6_ensemble.correct ? /CORRECT/i : /MISSED PICK/i);
      assert.match(body, /Machines vs Reality/i);
      const grade = page.locator('#c3-postgame-audit');
      assert.ok(await grade.count() > 0, 'postgame detail present');
      const verdicts = await grade.locator('tbody tr td:nth-child(3)').allInnerTexts();
      const correct = ['m1_elo', 'm2_science', 'm3_player_roster', 'm4_monte_carlo', 'm5_regularized_ml', 'm6_ensemble'].filter(id => REVIEW.models[id]?.correct).length;
      assert.equal(verdicts.filter(v => /CORRECT/.test(v) && !/WRONG/.test(v)).length, correct, 'correct engines match review');
      await shot(page, 'predict-postgame');
      await page.close();
    });

    // ---------- lineups, exclusions, projections ----------
    const exclusionGames = width === 1440 || width === 375 ? LOCK.forecasts : LOCK.forecasts.slice(0, 3);
    await check(width, `lineups: officially OUT players excluded (${exclusionGames.length} games)`, async () => {
      for (const f of exclusionGames) {
        const page = await open('/predict/?game=' + f.game_id, '#c3-lab .c3-main-grid');
        await page.locator('[data-c3-game-tab="lineups"]').click();
        const rows = await page.locator('.c3-lineup-table tbody tr td:first-child').allInnerTexts();
        const absent = await page.locator('.c3-absences').allInnerTexts();
        const teams = page.locator('.c3-team-lineup');
        assert.equal(await teams.count(), 2);
        for (let i = 0; i < 2; i++) {
          const n = await teams.nth(i).locator('tbody tr').count();
          assert.ok(n >= 3 && n <= 7, `${f.game_id}: team ${i} lists ${n} players (a roster was dropped)`);
        }
        // every column (notably STATUS) must be visible without scrolling inside the card
        for (let i = 0; i < 2; i++) {
          const clipped = await teams.nth(i).evaluate(card => {
            const box = card.getBoundingClientRect();
            return [...card.querySelectorAll('thead th, tbody tr:first-child td')].filter(c => c.getBoundingClientRect().right > box.right + 1).map(c => c.textContent.trim().slice(0, 12));
          });
          assert.deepEqual(clipped, [], `${f.game_id}: lineup columns clipped by the card`);
        }
        for (const name of outNames(f)) {
          assert.ok(!rows.includes(name), `${f.game_id}: OUT player ${name} listed as available`);
          assert.ok(absent.join(' ').includes(name + ' · OUT'), `${f.game_id}: ${name} missing from absences`);
        }
        if (!outNames(f).length) assert.equal(absent.length, 0, f.game_id + ': invented absences');
        assert.match(await text(page, '#c3-lab'), /NOT confirmed starting five/i);
        if (f.game_id === GAME) await shot(page, 'predict-lineups');
        await page.close();
      }
    });
    await check(width, 'projections: OUT hidden by default, sort, search, team filter', async () => {
      const f = forecast(GAME), outs = outNames(f);
      const page = await open('/predict/?game=' + GAME, '#c3-lab .c3-main-grid');
      await page.locator('[data-c3-game-tab="players"]').click();
      const names = async () => page.locator('.c3-data-table tbody tr td:first-child').allInnerTexts();
      for (const n of await names()) assert.ok(!outs.includes(n.trim()), 'OUT player shown by default: ' + n);
      assert.match(await text(page, '#c3-show-out'), new RegExp(`Show officially OUT \\(${outs.length}\\)`));
      await page.locator('#c3-show-out').click();
      assert.equal(await page.locator('.c3-out-player').count(), outs.length);
      assert.match(await text(page, '.c3-out-player >> nth=0'), /OUT · not active/);
      await page.locator('#c3-show-out').click();
      const col = async header => { // numeric column by header text
        const heads = await page.locator('.c3-data-table thead th').allInnerTexts();
        const i = heads.findIndex(h => h.trim().startsWith(header));
        return (await page.locator(`.c3-data-table tbody tr td:nth-child(${i + 1})`).allInnerTexts()).map(Number);
      };
      for (const [key, header] of [['pts', 'PTS PROJ'], ['reb', 'REB PROJ'], ['ast', 'AST PROJ'], ['three_pm', '3PM PROJ']]) {
        await page.locator('#c3-player-sort').selectOption(key);
        const values = await col(header);
        assert.ok(values.length > 5, key + ' rows');
        assert.deepEqual(values, [...values].sort((x, y) => y - x), key + ' sorted descending');
      }
      const target = f.v9_player_projections.find(p => !outs.includes(p.name)).name, term = target.slice(0, 4).toLowerCase();
      await page.locator('#c3-player-search').fill(term);
      const found = await names();
      assert.ok(found.length >= 1 && found.every(n => n.toLowerCase().includes(term)), 'search results');
      await page.locator('#c3-player-search').fill('zzzzqq');
      assert.equal((await names()).length, 0, 'unmatched search shows no invented rows');
      await page.locator('#c3-player-search').fill('');
      const canon = x => ({ WSH: 'WAS', NY: 'NYK', GS: 'GSW', SA: 'SAS', NO: 'NOP', UTAH: 'UTA', PHO: 'PHX', BRK: 'BKN', CHO: 'CHA' }[x] || x);
      for (const side of ['away', 'home']) {
        await page.locator('#c3-player-team').selectOption(f[side].abbr);
        const teamNames = new Set(f.v9_player_projections.filter(p => canon(p.team) === canon(f[side].abbr) && !outs.includes(p.name)).map(p => p.name));
        const visible = (await names()).map(s => s.trim());
        assert.ok(teamNames.size > 0 && visible.length === teamNames.size && visible.every(n => teamNames.has(n)), `${side} ${f[side].abbr} team filter shows ${visible.length} of ${teamNames.size}`);
      }
      assert.deepEqual(await brokenVisible(page), [], 'broken player images are visible');
      await shot(page, 'predict-projections');
      await page.close();
    });

    // ---------- Daily predictions ----------
    await check(width, 'daily: slate rows, tabs, search and sorting match the lock', async () => {
      const page = await open('/challenge/daily.html', '#c3-slate .c3-data-table tbody tr');
      const matchups = async () => (await page.locator('#c3-slate .c3-data-table tbody tr td:nth-child(2)').allInnerTexts()).map(s => s.replace(/\s+/g, ' ').trim());
      const rows = await matchups();
      assert.equal(rows.length, LOCK.forecasts.length);
      LOCK.forecasts.forEach((f, i) => assert.ok(rows[i].includes(`${f.away.abbr} @ ${f.home.abbr}`), `row ${i}: ${rows[i]}`));
      await page.locator('#c3-slate-search').fill('BOS');
      assert.equal((await matchups()).length, 1);
      await page.locator('#c3-slate-search').fill('zzzzqq');
      assert.equal((await matchups()).length, 0);
      await page.locator('#c3-slate-search').fill('');
      const tabs = await page.locator('[data-c3-slate-tab]').evaluateAll(els => els.map(e => e.dataset.c3SlateTab));
      assert.equal(tabs.length, 4);
      for (const t of tabs) {
        await page.locator(`[data-c3-slate-tab="${t}"]`).click();
        const body = await text(page, '#c3-slate');
        assert.ok(body.length > 150, t + ' empty');
        assert.doesNotMatch(body, /Loading/i, t);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        assert.ok(overflow <= 1, `daily ${t} tab is ${overflow}px wider than the viewport`);
      }
      await page.locator(`[data-c3-slate-tab="${tabs[0]}"]`).click();
      const head = page.locator('#c3-slate th[aria-sort]', { hasText: /MATCHUP/i }).first();
      await head.click();
      const asc = await matchups();
      assert.deepEqual(asc, [...asc].sort((x, y) => x.localeCompare(y, undefined, { numeric: true })), 'matchup sort ascending');
      await head.click();
      assert.deepEqual((await matchups()).reverse(), asc, 'second click reverses');
      await shot(page, 'daily');
      await page.close();
    });

    // ---------- Player statistics ----------
    await check(width, 'player stats: projections table sorts, team toggle and views work', async () => {
      const page = await open('/player-stats/', 'table.projections tbody tr');
      const names = async () => page.locator('table.projections tbody tr td:first-child').allInnerTexts();
      const awayNames = await names();
      assert.ok(awayNames.length >= 5);
      await page.locator('#home').click();
      const homeNames = await names();
      assert.ok(homeNames.length >= 5 && homeNames.join() !== awayNames.join(), 'home/away toggle changes the table');
      const header = page.locator('table.projections thead th', { hasText: /^PTS/ });
      await header.click();
      const col = async () => (await page.locator('table.projections tbody tr td:nth-child(4)').allInnerTexts()).map(parseFloat).filter(Number.isFinite);
      const first = await col();
      assert.ok(first.length >= 5);
      const direction = await header.getAttribute('aria-sort');
      assert.ok(['ascending', 'descending'].includes(direction));
      assert.deepEqual(first, [...first].sort((x, y) => direction === 'ascending' ? x - y : y - x));
      await header.click();
      assert.notEqual(await header.getAttribute('aria-sort'), direction, 'second click flips direction');
      await page.locator('#mode').selectOption({ index: 1 });
      assert.ok((await names()).length >= 5, 'alternate projection view still has rows');
      assert.deepEqual(await brokenVisible(page), [], 'broken player images are visible');
      await shot(page, 'player-stats');
      await page.close();
    });

    // ---------- Audit ----------
    await check(width, 'audit: real KPIs, no mock-up values, honest empty trend', async () => {
      const page = await open('/audit/', '.c3-audit-kpis');
      const body = await text(page, '#c3-audit');
      const prod = LEDGER.longitudinal.models.production_elo_v7;
      assert.ok(body.includes((100 * prod.accuracy).toFixed(1) + '%'), 'ledger accuracy');
      assert.ok(body.includes(prod.brier.toFixed(3)), 'ledger Brier');
      for (const mock of ['67.3%', '0.189', '0.612']) assert.ok(!body.includes(mock), 'mock-up number ' + mock);
      assert.match(body, /At least two reviewed slates/);
      assert.equal(await page.locator('.c3-audit-kpis > div').count(), 4);
      const tabs = await page.locator('.c3-tab').allInnerTexts();
      assert.equal(tabs.length, 5);
      await page.locator('.c3-tab', { hasText: 'Model Comparison' }).click();
      assert.equal(await page.locator('.c3-data-table tbody tr').count(), Object.keys(LEDGER.longitudinal.models).length);
      await shot(page, 'audit-models');
      await page.close();
    });

    // ---------- honest unavailable states (all external feeds blocked) ----------
    await check(width, 'home: unavailable feeds are stated, never an endless loader or invented score', async () => {
      const page = await open('/', '#hero-live-status');
      await page.waitForTimeout(600);
      assert.match(await text(page, '#hero-live-status'), /UNAVAILABLE/i);
      for (const id of ['featured-game', 'c3-latest-results', 'feature-tip']) assert.doesNotMatch(await text(page, '#' + id), /Loading/i, id);
      assert.equal(await page.locator('.hero-live-status.is-live, .live-desk .is-live').count(), 0, 'no live indicator without a feed');
      assert.doesNotMatch(await text(page, '#hero-live-status'), /^LIVE NBA|IN PROGRESS/i);
      await shot(page, 'home-unavailable');
      await page.close();
    });
    await check(width, 'game page: provider outage is explained, not left as a loader', async () => {
      const page = await open('/game/?id=' + GAME + '&tab=machine', '#game-forecast');
      await page.waitForTimeout(800);
      const body = await text(page, '#game-forecast');
      assert.doesNotMatch(body, /Looking for an immutable|Checking immutable/i);
      assert.match(body, /unavailable|not shown|require/i);
      assert.match(await page.locator('main').innerText(), /DATA UNAVAILABLE/i);
      await shot(page, 'game-unavailable');
      await page.close();
    });

    // ---------- Concept 3 look (automated approximations of the reference) ----------
    await check(width, 'visual: dark navy canvas, blue active tab, blue/pink probability bar', async () => {
      const page = await open('/predict/?game=' + GAME, '#c3-lab .c3-main-grid');
      const rgb = value => value.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number);
      const luminance = ([r, g, b]) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
      const bg = rgb(await page.evaluate(() => getComputedStyle(document.body).backgroundColor === 'rgba(0, 0, 0, 0)' ? getComputedStyle(document.documentElement).backgroundColor : getComputedStyle(document.body).backgroundColor));
      assert.ok(luminance(bg) < 0.12, 'background luminance ' + luminance(bg).toFixed(3));
      assert.ok(bg[2] >= bg[0], 'background leans navy, not warm');
      const tab = await page.locator('[data-c3-game-tab][aria-selected="true"]').evaluate(el => getComputedStyle(el).backgroundImage + getComputedStyle(el).backgroundColor);
      const blues = (tab.match(/rgb\((\d+), (\d+), (\d+)\)/g) || []).map(rgb).filter(([r, g, b]) => b > 180 && b > r + 60);
      assert.ok(blues.length, 'active tab is electric blue: ' + tab);
      const [awayBar, homeBar] = await page.locator('.c3-large-track i').evaluateAll(els => els.map(e => getComputedStyle(e).backgroundColor + '|' + getComputedStyle(e).backgroundImage));
      assert.ok(/rgb/.test(awayBar) && /rgb/.test(homeBar) && awayBar !== homeBar, 'two distinct bar colours');
      await page.close();
    });

    await context.close();
  }
  await browser.close(); server.close();

  const failed = results.filter(r => !r.ok);
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({ total: results.length, failed: failed.length, results }, null, 1));
  for (const r of results) console.log((r.ok ? 'PASS ' : 'FAIL ') + r.label + (r.ok ? '' : '\n     ' + r.error));
  console.log(`\n${results.length - failed.length}/${results.length} browser checks passed; screenshots in ${OUT}`);
  process.exit(failed.length ? 1 : 0);
})().catch(error => { console.error(error); process.exit(2); });
