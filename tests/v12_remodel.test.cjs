'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const root=path.join(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const primary=['index.html','challenge/daily.html','challenge/index.html','predict/index.html','audit/index.html'];

test('V12 app pages use one navigation system and do not load the superseded dark theme',()=>{
 const css=read('assets/v12.css');
 for(const feature of ['.hero-grid','.live-games','.dashboard-grid','.model-cards','.mobile-leaderboard','.site-bottom-nav','.predictor-toolbar','.audit-grid']){
  assert.ok(css.includes(feature),feature+' not in V12 stylesheet');
 }
 assert.match(css,/@media\(max-width:590px\)/);
 for(const file of primary){
  const s=read(file);
  assert.match(s,/class="v12 /,file+' body not redesigned');
  assert.match(s,/assets\/v12\.css/,file+' stylesheet missing');
  assert.match(s,/assets\/site-shell\.js/,file+' phone navigation missing');
  assert.doesNotMatch(s,/assets\/courtside\.css/,file+' still uses rejected theme');
  assert.match(s,/class="app-header"/,file+' header not rebuilt');
 }
});

test('key data IDs are preserved across all model views',()=>{
 const requirements={
  'index.html':['home-ticker','home-games','featured-game','home-locked','home-backtest'],
  'challenge/daily.html':['game-selector','game-detail','daily-ticker','disagreements','stat-models','player-search','player-cards','review-cards','model-results'],
  'challenge/index.html':['status','scope','filters','leaderboard','leaderboard-cards','calibration','weights','model-cards','benchmarks','player-stats'],
  'predict/index.html':['notice','signal','games','detail','model-choice','simulations','range','team-search','validation-sample','teams','elo-brier'],
  'audit/index.html':['status','slates','games','models','player-stats','calibration','entries']
 };
 for(const [p,required]of Object.entries(requirements)){
  const found=[...read(p).matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
  assert.equal(found.length,new Set(found).size,p+' duplicate IDs');
  for(const id of required)assert.ok(found.includes(id),p+' lost '+id);
 }
});

test('new homepage dynamically builds clickable slate cards from only original locked forecasts',async()=>{
 const ledger=JSON.parse(read('data/audit-ledger.json'));
 const original=JSON.parse(read('practice/2026-10-31-melbourne/forecast.lock.json'));
 ledger.entries=ledger.entries.filter(e=>e.melbourne_date==='2026-10-31');
 assert.equal(ledger.entries.length,1);
 const elements=new Map(),get=id=>{
  if(!elements.has(id))elements.set(id,{innerHTML:'',textContent:''});
  return elements.get(id);
 };
 const document={getElementById:get};
 const sources={'./data/audit-ledger.json':ledger,'./data/five-model-report.json':{common_evaluation:{games:3643}},['./'+ledger.entries[0].lock_path]:original};
 const fetch=async url=>({ok:Object.hasOwn(sources,url),json:async()=>sources[url]});
 vm.runInNewContext(read('assets/home.js'),{document,fetch,Date,Intl,Promise,console},{filename:'assets/home.js'});
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal((get('home-games').innerHTML.match(/class="home-game"/g)||[]).length,10);
 assert.ok(get('home-games').innerHTML.includes('challenge/daily.html?game='));
 assert.ok(get('home-games').innerHTML.includes('ELO PICK'));
 assert.equal(get('home-locked').textContent,'1');
 assert.ok(!get('home-games').innerHTML.includes('LIVE SCORE'));
});

test('redesign does not mutate cryptographically locked pregame game/player data',()=>{
 const ledger=JSON.parse(read('data/audit-ledger.json'));
 const entry=ledger.entries.find(e=>e.melbourne_date==='2026-10-31');
 assert.ok(entry);
 const original=fs.readFileSync(path.join(root,entry.lock_path));
 assert.equal(crypto.createHash('sha256').update(original).digest('hex'),entry.lock_sha256);
 const sidecar=JSON.parse(read('audit/supplements/2026-10-31/challenge.lock.json'));
 assert.equal(sidecar.original_forecast_sha256,entry.lock_sha256);
 assert.equal(sidecar.games.length,10);
 assert.equal(Object.keys(sidecar.games[0].predictions).length,6);
});
