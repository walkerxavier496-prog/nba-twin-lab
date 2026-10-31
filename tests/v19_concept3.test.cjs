'use strict';
/* V19 owner-approved Concept 3 visual regression contracts.
 * Tests never fetch or substitute NBA scores, player stats or forecasts. */
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const routes=[
 'index.html','predict/index.html','challenge/daily.html','challenge/index.html',
 'player-stats/index.html','team-intelligence/index.html','audit/index.html',
 'league/index.html','game/index.html','watchlist/index.html','twins/index.html',
 'models/index.html','research/index.html','history/index.html','intelligence/index.html'
];
test('V19 approved Concept 3 stylesheet loads AFTER each existing dark stylesheet',()=>{
 for(const p of routes){
  const html=read(p);
  assert.ok(html.includes('v19-concept3.css'),p+' missing locked design');
  assert.ok(html.indexOf('v19-concept3.css')>html.indexOf('dark-v13.css'),p+' design must override legacy');
  assert.match(html,/<meta name="viewport"/,p+' missing responsive viewport');
 }
 const design=read('docs/approved-design-concept-3.md');
 assert.match(design,/APPROVED WEBSITE DESIGN: CONCEPT 3/);
});
test('homepage matches approved hierarchy without dropping verified live desk or sortable stats',()=>{
 const html=read('index.html');
 const order=['class="hero-grid"','class="metric-strip"','id="live-games"','id="home-games"'];
 const index=order.map(x=>html.indexOf(x));
 assert.ok(index.every(n=>n>0),JSON.stringify(index));
 assert.deepEqual([...index].sort((a,b)=>a-b),index,'Hero/metrics/live/slate layout is out of order');
 for(const id of ['featured-game','feature-tip','feature-confidence','feature-players','home-backtest','home-locked','home-projections',
  'live-player-stats','live-stats-rows','live-game-list','desk-top-performers','live-alerts-toggle']){
  assert.ok(html.includes('id="'+id+'"'),id+' was lost');
 }
 assert.ok(html.includes('Smarter<br><em>NBA Predictions.</em>'));
 assert.ok(html.includes('class="v19-hero-art"'));
 assert.ok(!html.includes('v19-hero-athlete'),'undersized portrait must not fill homepage');
 const js=read('assets/home.js');
 assert.match(js,/lock\.forecasts/);
 assert.match(js,/v9_player_projections/);
 assert.match(js,/home-projections/);
 assert.doesNotMatch(js,/media\.playerImage\(picks\[0\]\)/);
 assert.ok(js.includes('playerSpotlight'),'matchup-specific player projections remain');
 assert.doesNotMatch(html,/>82%[^<]*<\/strong>/,'Do not publish mockup metrics as fact');
});
test('Predictor keeps every engine, model selection and V18 provenance audit',()=>{
 const html=read('predict/index.html'),script=read('predict/app.js');
 for(const id of ['games','detail','model-choice','simulations','range','team-search','validation-sample','teams','elo-brier'])
  assert.ok(html.includes('id="'+id+'"'),id+' no longer wired');
 assert.match(html,/<option value="elo" selected>/);
 assert.match(script,/v19-versus-panel/);
 assert.match(script,/v19-model-comparison/);
 assert.match(script,/home_win_probability|homeWin/);
 assert.match(script,/rosterIntegrityPanel\(integrity\)/);
 assert.match(script,/rosterStrengthPanel\(strength\)/);
 assert.match(script,/mode==='mc'/);
 assert.match(script,/VIEW LOCKED SIX-MODEL AUDIT/);
});
test('Daily locks lead; complete live game centre remains and data is not fabricated',()=>{
 const html=read('challenge/daily.html');
 assert.ok(html.indexOf('class="page-hero"')<html.indexOf('id="live-games"'));
 for(const id of ['matchups','game-selector','game-detail','stat-games','stat-players','model-results',
 'live-player-stats','live-stats-rows','live-game-list'])assert.ok(html.includes('id="'+id+'"'),id);
 assert.match(html,/Today’s <em>NBA Predictions/);
 const app=read('challenge/daily.js');
 assert.match(app,/drawRosterEvidence/);
 assert.match(app,/sidecarReview/);
});
test('V19 CSS respects accessible mobile layouts and no motion preferences',()=>{
 const css=read('assets/v19-concept3.css');
 for(const token of ['--v19-bg','--v19-blue','--v19-cyan','--v19-violet','--v19-panel','--v19-gradient'])
  assert.ok(css.includes(token),'missing '+token);
 for(const selector of ['.v19-hero-art','.v19-versus-panel','.v19-model-cards',
   '.daily-stats','.live-desk','.game-scoreboard','.audit-grid'])
  assert.ok(css.includes(selector),'missing '+selector);
 assert.match(css,/@media\(max-width:650px\)/);
 assert.match(css,/prefers-reduced-motion:reduce/);
 assert.ok(css.includes(':focus-visible')||read('assets/site-shell.css').includes('focus-visible'));
});
test('Player Stats is a distinct route from live NBA box scores',()=>{
 const desktop=read('assets/site-nav.js');
 const mobile=read('assets/site-shell.js');
 const player=read('player-stats/index.html');
 const home=read('index.html');
 assert.ok(desktop.includes("link('PLAYERS','player-stats/',isStats)"));
 assert.ok(desktop.includes("link('STATS','#live-player-stats',"));
 assert.ok(!desktop.includes("link('PLAYERS','#live-player-stats'"));
 assert.ok(mobile.includes('"Players","player-stats/"'));
 assert.ok(player.includes('Pregame Projections'));
 assert.ok(player.includes('Live Box Scores'));
 assert.ok(home.includes('LIVE GAMES <em>& BOX SCORES.</em>'));
 const css=read('assets/v19-concept3.css');
 assert.ok(css.includes('LeBron_James%27_pregame_ritual.jpg'));
 assert.ok(home.includes('Photo by Keith Allison'));
 assert.ok(home.includes('creativecommons.org/licenses/by-sa/2.0/'));
 assert.ok(!css.includes('photo-1783826352825-d2bf5a0e302a'));
 assert.ok(!read('assets/team-prefs.js').includes('function render()'),'No useless header team selector');
 assert.ok(!css.includes('.v19-hero-athlete'));
});
test('Immutable original pregame files remain available; V19 is styling only',()=>{
 const original=JSON.parse(read('practice/2026-10-31-melbourne/forecast.lock.json'));
 const sidecar=JSON.parse(read('audit/supplements/2026-10-31/challenge.lock.json'));
 assert.equal(original.scope.games,10);
 assert.equal(original.forecasts[0].primary_forecast.winner,'CHA');
 assert.equal(sidecar.games.length,10);
 const css=read('assets/v19-concept3.css');
 assert.doesNotMatch(css,/fetch\(|XMLHttpRequest|localStorage|sessionStorage/);
});
