'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const A = require('../scripts/audit-core.cjs');
const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const near = (actual, expected, tolerance = 1e-6) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
const BANNER = 'Too early to rank models. Differences at this sample size are noise.';

const row = (id, p, actual) => ({ model_id: id, label: id, p, actual, correct: (p >= 0.5) === (actual === 1), brier: (p - actual) ** 2 });
const record = (date, games) => ({
  entry: { melbourne_date: date },
  review: { games: games.map(([gameId, models]) => ({ game_id: gameId, models })) },
});

test('Wilson 95% interval for win accuracy', () => {
  const ci = A.wilsonInterval(6, 10);
  near(ci.low, 0.3127, 5e-4); near(ci.high, 0.8318, 5e-4);
  const none = A.wilsonInterval(0, 10), all = A.wilsonInterval(10, 10);
  assert.equal(none.low, 0); assert.ok(none.high > 0 && none.high < 1);
  assert.equal(all.high, 1); assert.ok(all.low > 0 && all.low < 1);
  assert.equal(A.wilsonInterval(0, 0), null);
});

test('standard error uses the sample standard deviation divided by sqrt(n)', () => {
  near(A.sampleStandardError([0.1, 0.3, 0.2]), 0.1 / Math.sqrt(3));
  assert.equal(A.sampleStandardError([0.2]), null);
  assert.equal(A.sampleStandardError([]), null);
  near(A.sampleStandardError([0.2, 0.2, 0.2]), 0, 1e-12);
});

test('paired Brier comparison matches only shared games and reports model minus Elo', () => {
  const elo = [['d/1', 0.25], ['d/2', 0.16], ['d/3', 0.36]].map(([game_key, brier]) => ({ game_key, brier }));
  const model = [['d/1', 0.20], ['d/2', 0.16], ['d/3', 0.25], ['d/4', 0.5]].map(([game_key, brier]) => ({ game_key, brier }));
  const result = A.pairedBrierComparison(model, elo);
  assert.equal(result.games, 3);
  near(result.mean_brier_difference, -0.16 / 3, 1e-9);
  near(result.standard_error, 0.055076 / Math.sqrt(3), 1e-5);
  near(result.z, result.mean_brier_difference / result.standard_error, 1e-9);
  assert.equal(result.verdict, 'insufficient_sample', 'three games can never support a claim');
  assert.equal(A.pairedBrierComparison(model, []).games, 0);
  assert.equal(A.pairedBrierComparison(model, []).verdict, 'insufficient_sample');
});

test('a verdict needs both 300 games and a difference beyond two standard errors', () => {
  const games = n => Array.from({ length: n }, (_, i) => `d/${i}`);
  const make = (n, delta, noise) => {
    const elo = games(n).map(game_key => ({ game_key, brier: 0.25 }));
    const model = games(n).map((game_key, i) => ({ game_key, brier: 0.25 + delta + (i % 2 ? noise : -noise) }));
    return A.pairedBrierComparison(model, elo);
  };
  assert.equal(make(299, -0.05, 0.01).verdict, 'insufficient_sample');
  assert.equal(make(300, -0.05, 0.01).verdict, 'better_than_elo');
  assert.equal(make(300, 0.05, 0.01).verdict, 'worse_than_elo');
  assert.equal(make(300, 0, 0.05).verdict, 'not_distinguishable');
  assert.equal(make(300, -0.001, 0.05).verdict, 'not_distinguishable', 'a small gap inside the noise is not a win');
});

test('aggregateReviews adds uncertainty fields without touching existing ones', () => {
  const records = [
    record('2026-11-01', [
      ['1', { production_elo_v7: row('production_elo_v7', 0.8, 1), m1_elo: row('m1_elo', 0.6, 1) }],
      ['2', { production_elo_v7: row('production_elo_v7', 0.7, 0), m1_elo: row('m1_elo', 0.4, 0) }],
      ['3', { production_elo_v7: row('production_elo_v7', 0.3, 0) }],
    ]),
  ];
  const ledger = A.aggregateReviews(records, '2026-11-02T00:00:00Z');
  assert.equal(ledger.schema, 'nba-twin-lab-audit-ledger-v2');
  const elo = ledger.longitudinal.models.production_elo_v7, m1 = ledger.longitudinal.models.m1_elo;
  const eloRows = [row('x', 0.8, 1), row('x', 0.7, 0), row('x', 0.3, 0)];
  const base = A.probabilityMetrics(eloRows);
  for (const [key, value] of Object.entries(base)) assert.deepEqual(elo[key], value, key);
  assert.equal(elo.count, 3);
  const ci = A.wilsonInterval(2, 3);
  assert.deepEqual(elo.accuracy_ci95, { low: ci.low, high: ci.high, method: 'wilson' });
  near(elo.brier_se, A.sampleStandardError(eloRows.map(r => r.brier)));
  assert.equal(elo.paired_vs_production_elo_v7, null, 'Elo is the baseline and has no self-comparison');
  assert.equal(m1.paired_vs_production_elo_v7.games, 2, 'pairs only on games both models graded');
  near(m1.paired_vs_production_elo_v7.mean_brier_difference, -0.105, 1e-9); // (0.16-0.04 + 0.16-0.49) / 2
  assert.deepEqual(ledger.longitudinal.sample_policy, {
    min_games_to_rank: 300, models_below_minimum: ['production_elo_v7', 'm1_elo'], ranking_enabled: false,
  });
});

test('published ledger carries the new fields and its legacy metrics still match the stored per-game reviews', () => {
  const ledger = JSON.parse(read('data/audit-ledger.json'));
  assert.equal(ledger.schema, 'nba-twin-lab-audit-ledger-v2');
  const rows = {};
  for (const date of fs.readdirSync(path.join(root, 'audit/reviews'))) {
    const dir = path.join(root, 'audit/reviews', date, 'games');
    if (!fs.existsSync(dir)) continue;
    for (const file of fs.readdirSync(dir)) for (const game of JSON.parse(fs.readFileSync(path.join(dir, file))).games)
      for (const [id, model] of Object.entries(game.models)) (rows[id] ||= []).push(model);
  }
  assert.deepEqual(Object.keys(ledger.longitudinal.models).sort(), Object.keys(rows).sort());
  for (const [id, model] of Object.entries(ledger.longitudinal.models)) {
    for (const [key, value] of Object.entries(A.probabilityMetrics(rows[id]))) assert.deepEqual(model[key], value, id + '.' + key);
    assert.equal(model.accuracy_ci95.method, 'wilson', id);
    assert.ok(model.accuracy_ci95.low <= model.accuracy && model.accuracy <= model.accuracy_ci95.high, id);
    assert.ok(Number.isFinite(model.brier_se), id);
    if (id === 'production_elo_v7') assert.equal(model.paired_vs_production_elo_v7, null);
    else {
      assert.equal(model.paired_vs_production_elo_v7.games, model.count, id);
      assert.equal(model.paired_vs_production_elo_v7.verdict, 'insufficient_sample', id);
    }
  }
  assert.equal(ledger.longitudinal.sample_policy.ranking_enabled, false);
  assert.equal(ledger.longitudinal.sample_policy.min_games_to_rank, 300);
  assert.deepEqual(ledger.longitudinal.sample_policy.models_below_minimum.sort(), Object.keys(rows).sort());
});

function runAuditPage(ledger) {
  const els = new Map(), get = id => { if (!els.has(id)) els.set(id, { innerHTML: '', textContent: '', className: '', hidden: true }); return els.get(id); };
  const fetch = async () => ({ ok: true, json: async () => ledger });
  vm.runInNewContext(read('audit/app.js'), { document: { getElementById: get }, fetch, Date, Intl, console, Number, Object, Array, String, Math },
    { filename: 'audit/app.js' });
  return { get, ready: () => new Promise(resolve => setTimeout(resolve, 50)) };
}

function runConceptPage(ledger) {
  const el = { innerHTML: '' }, tab = { dataset: { c3AuditTab: 'models' }, onclick: null };
  const document = { readyState: 'complete', getElementById: id => id === 'c3-audit' ? el : null, querySelectorAll: () => [tab] };
  const fetch = async () => ({ ok: true, status: 200, json: async () => ledger });
  vm.runInNewContext(read('assets/concept3-audit.js'), { document, fetch, Date, Intl, console }, { filename: 'concept3-audit.js' });
  return { el, tab, ready: () => new Promise(resolve => setTimeout(resolve, 50)) };
}

test('audit page shows the intervals, ± standard error, paired column and banner; rows keep ledger order', async () => {
  const ledger = JSON.parse(read('data/audit-ledger.json'));
  const page = runAuditPage(ledger);
  await page.ready();
  const models = page.get('models').innerHTML, banner = page.get('sample-banner');
  assert.match(models, /60% \(95% CI 31–83%\)/);
  assert.match(models, /0\.249 ± 0\.07/);
  assert.match(read('audit/index.html'), /Δ Brier vs Elo/);
  assert.match(models, /−0\.011 ± 0\.04 \(n=10\) · insufficient sample/);
  assert.equal(banner.hidden, false);
  assert.ok(banner.textContent.includes(BANNER));
  const labels = [...models.matchAll(/<tr><td>([^<]+)/g)].map(m => m[1].trim());
  assert.deepEqual(labels, Object.values(ledger.longitudinal.models).map(m => m.label));
  assert.doesNotMatch(models, /best model|class="[^"]*\b(best|winner|leader)\b/i);
});

test('banner fails closed for a ledger without sample_policy and clears only when every model has 300 games', async () => {
  const ledger = JSON.parse(read('data/audit-ledger.json'));
  const legacy = structuredClone(ledger); delete legacy.longitudinal.sample_policy;
  let page = runAuditPage(legacy); await page.ready();
  assert.equal(page.get('sample-banner').hidden, false);
  const mature = structuredClone(ledger);
  mature.longitudinal.sample_policy = { min_games_to_rank: 300, models_below_minimum: [], ranking_enabled: false };
  page = runAuditPage(mature); await page.ready();
  assert.equal(page.get('sample-banner').hidden, true);
  assert.doesNotMatch(page.get('models').innerHTML, /best model/i);
});

test('Concept 3 audit workspace shows the same honest numbers and banner on both tabs', async () => {
  const ledger = JSON.parse(read('data/audit-ledger.json'));
  const page = runConceptPage(ledger);
  await page.ready();
  const overview = page.el.innerHTML;
  assert.ok(overview.includes(BANNER), 'overview banner');
  assert.match(overview, /60% \(95% CI 31–83%\)/);
  assert.match(overview, /0\.249 ± 0\.07/);
  page.tab.onclick();
  const models = page.el.innerHTML;
  assert.ok(models.includes(BANNER), 'models banner');
  assert.match(models, /60% \(95% CI 31–83%\)/);
  assert.match(models, /0\.249 ± 0\.07/);
  assert.match(models, /Δ Brier vs Elo/i);
  for (const html of [overview, models]) assert.doesNotMatch(html, /best model/i);
});

test('ledger is never edited by the browser code path and static page keeps its banner container', () => {
  assert.match(read('audit/index.html'), /id="sample-banner"/);
  assert.match(read('audit/index.html'), /role="note"/);
  for (const file of ['audit/app.js', 'assets/concept3-audit.js']) {
    assert.ok(read(file).includes('nba-twin-lab-audit-ledger-v2'), file + ' schema check kept');
    assert.doesNotMatch(read(file), /Math\.sqrt/, file + ' must not compute statistics in the browser');
  }
});
