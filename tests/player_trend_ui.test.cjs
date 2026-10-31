'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

function harness() {
  const elements = new Map();
  const document = {
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, { innerHTML: '', textContent: '' });
      return elements.get(id);
    },
    addEventListener() {},
  };
  const window = {};
  vm.runInNewContext(read('assets/home.js'), {
    window, document, Date, Intl, Promise, console,
    fetch: async () => ({ ok: false, status: 404 }),
  });
  return { window, element: id => document.getElementById(id) };
}

const snapshot = {
  schema: 'nba-twin-lab-player-trends-v1',
  generated_at_utc: '2026-10-31T12:00:00Z',
  as_of_utc: '2026-10-31T12:00:00Z',
  methodology: {
    source: 'ESPN public summary (unofficial)',
    minimum_games: 5,
    window_days: 30,
  },
  identity_conflicts: [],
  players: [{
    name: 'Verified Player',
    last_recorded_team: { abbr: 'AAA' },
    sample_size: 5,
    date_range: { start_utc: '2026-10-20T12:00:00Z', end_utc: '2026-10-30T12:00:00Z' },
    metrics: {
      points: { available: true, average: 22.4, sample_size: 5, required_games: 5 },
      rebounds: { available: false, average: null, sample_size: 4, required_games: 5 },
      assists: { available: true, average: 6, sample_size: 5, required_games: 5 },
      three_pointers: { available: true, average: 2.2, sample_size: 5, required_games: 5 },
      fantasy_points: { available: true, average: 35.8, sample_size: 5, required_games: 5 },
    },
    recent_form: { available: true, points_change: 2.4, fantasy_points_change: -1.2 },
  }],
};

test('player-form panel displays verified sample windows, missing metrics and ESPN provenance', () => {
  const page = harness();
  page.window.NbaHome.renderPlayerTrends(snapshot, Date.parse(snapshot.as_of_utc));
  const html = page.element('home-player-trends').innerHTML;
  assert.match(html, /Verified Player/);
  assert.match(html, /5 verified appearances/);
  assert.match(html, /PTS<\/b> 22\.4 <small>n=5/);
  assert.match(html, /REB<\/b> Unavailable <small>n=4\/5/);
  assert.match(html, /Last five vs prior five/);
  assert.match(html, /ESPN public summary \(unofficial\)/);
  assert.match(html, /as of 2026-10-31T12:00:00Z/);
  assert.doesNotMatch(html, /season.best|career.high/i);
});

test('player-form panel clearly labels stale or insufficient coverage without inventing trends', () => {
  const page = harness();
  page.window.NbaHome.renderPlayerTrends(JSON.parse(read('data/player-game-history/trends.json')));
  assert.match(page.element('home-player-trends').innerHTML, /collection has not run yet/);

  page.window.NbaHome.renderPlayerTrends(snapshot, Date.parse(snapshot.generated_at_utc) + 49 * 60 * 60 * 1000);
  assert.match(page.element('home-player-trends').innerHTML, /STALE SNAPSHOT/);

  page.window.NbaHome.renderPlayerTrends({ ...snapshot, players: [] }, Date.parse(snapshot.as_of_utc));
  assert.match(page.element('home-player-trends').innerHTML, /No player has at least 5 verified appearances/);

  page.window.NbaHome.renderPlayerTrends(snapshot, Date.parse(snapshot.as_of_utc) - 1);
  assert.match(page.element('home-player-trends').innerHTML, /future-dated/);

  page.window.NbaHome.renderPlayerTrends(null, Date.now(), 'HTTP 404');
  assert.match(page.element('home-player-trends').innerHTML, /HTTP 404/);
  assert.match(page.element('home-player-trends').innerHTML, /No recent-form claims are displayed/);
});

test('player form is reachable in the command-centre layout and collapses responsively', () => {
  const html = read('index.html');
  const css = read('assets/v19-concept3.css');
  assert.match(html, /id="home-player-trends"/);
  assert.match(css, /\.home-player-trend-cards\{display:grid/);
  assert.ok(css.includes('@media(max-width:760px){body.v12.home .home-command-panels{grid-template-columns:1fr}}'));
  assert.ok(css.includes('@media(max-width:760px){body.v12.home .home-player-trend-cards{grid-template-columns:1fr}}'));
});
