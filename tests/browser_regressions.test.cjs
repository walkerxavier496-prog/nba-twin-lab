'use strict';
// Fast guards for defects the browser acceptance suite (tests/browser/acceptance.cjs) found.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
test('locked projections match schedule rows across ESPN/NBA team codes (WSH/WAS, NY/NYK, GS/GSW)',()=>{
 const hub=read('assets/concept3-hub.js');
 assert.match(hub,/const sameTeam=\(a,b\)=>canonicalTeam\(a\)===canonicalTeam\(b\)/);
 assert.doesNotMatch(hub,/p\.team===(g\[side\]\.abbr|state\.playerTeam)/,'strict team-code equality drops whole rosters');
 const lock=JSON.parse(read('practice/2026-10-31-melbourne/forecast.lock.json'));
 const alias={WSH:'WAS',GSW:'GS',NYK:'NY',SAS:'SA',NOP:'NO',PHX:'PHO',BKN:'BRK',UTA:'UTAH',CHA:'CHO'},canon=x=>alias[String(x).toUpperCase()]||String(x).toUpperCase();
 for(const f of lock.forecasts)for(const side of ['away','home']){
  const n=f.v9_player_projections.filter(p=>canon(p.team)===canon(f[side].abbr)).length;
  assert.ok(n>=10,`${f.game_id} ${f[side].abbr} has ${n} projections after code canonicalisation`);
 }
});
test('sortable headers respond to a click anywhere in the header cell',()=>{
 const src=read('assets/sortable-tables.js');
 assert.match(src,/closest\?\.\('th'\)\?\.querySelector\?\.\('\.twin-sort-head'\)/);
});
test('failed player portraits are hidden instead of showing a broken-image box',()=>{
 const hub=read('assets/concept3-hub.js');
 const imgs=hub.match(/<img src="'\+portrait\(p\)\+'"[^>]*>/g)||[];
 assert.equal(imgs.length,3);
 for(const tag of imgs)assert.match(tag,/onerror="this\.style\.display=/);
});
test('lineup grid can shrink inside its container and the game page states provider outages',()=>{
 assert.match(read('assets/concept3-fidelity.css'),/\.c3-lineup-grid\{display:grid;grid-template-columns:minmax\(0,1fr\) minmax\(0,1fr\)/);
 assert.match(read('assets/game-page.js'),/Forecast and grading are unavailable until the game feed responds/);
});
test('edited assets carry a fresh cache-busting version on every page that loads them',()=>{
 for(const [asset,pages,version] of [['concept3-hub.js',['predict/index.html','challenge/daily.html'],'v28_0'],['game-page.js',['game/index.html'],'v27_1'],['home.js',['index.html'],'v27_1'],['concept3-fidelity.css',['predict/index.html','index.html'],'v27_2']])
  for(const page of pages)assert.match(read(page),new RegExp(asset.replace('.','\\.')+'\\?'+version),page+' '+asset);
});
test('lineup table overrides the global 690px table minimum so STATUS is never clipped',()=>{
 assert.match(read('assets/concept3-fidelity.css'),/\.c3-lineup-table\{width:100%;min-width:0;border-collapse:collapse;table-layout:fixed\}/);
});

test('headline predictions never silently fall back to Elo',()=>{
 const hub=read('assets/concept3-hub.js');
 assert.match(hub,/M5 · ML RESEARCH CHALLENGER/);
 assert.doesNotMatch(hub,/ELO · PRODUCTION/);
 assert.match(hub,/return numbers\(p\)\?\{home:p,label:'M5 · ML RESEARCH CHALLENGER'\}:null/);
});

test('headline score is labelled as a different Monte Carlo engine, never Elo',()=>{
 const hub=read('assets/concept3-hub.js');
 assert.match(hub,/const mc=models\(g\)\.m4_monte_carlo/);
 assert.match(hub,/Separate Monte Carlo score estimate:/);
 assert.doesNotMatch(hub,/Projected score \(Elo\):/);
});
