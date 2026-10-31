'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const read=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');

test('four-destination desktop and mobile navigation preserves deeper research routes',()=>{
 const desktop=read('assets/site-nav.js'),mobile=read('assets/site-shell.js');
 for(const route of ['LIVE','#live-games','THE MACHINE','predict/','PLAYERS','player-stats/','LEAGUE','league/'])
  assert.ok(desktop.includes(route),route+' missing');
 for(const route of ['challenge/daily.html','audit/','challenge/','watchlist/'])
  assert.ok(desktop.includes(route),route+' missing from More menu');
 for(const label of ['Live','Machine','Players','League'])
  assert.match(mobile,new RegExp('"'+label+'"'));
 const brand=read('assets/concept3-fidelity.css');
 assert.match(brand,/\.brand-icon:before\{content:none!important/);
});

test('performance hub has clear defensive definitions, complete fantasy rules and genuine missing data',()=>{
 const js=read('assets/live-desk.js');
 const html=read('index.html');
 const css=read('assets/live-desk.css');
 assert.match(js,/performance-leaderboard/);
 assert.match(js,/STL\+BLK/);
 assert.match(js,/Both must be available/);
 assert.match(js,/steals\+blocks|steals \+ blocks|steals \+ blocks/i);
 assert.match(js,/ESPN default points-league formula/);
 assert.match(js,/performanceShowAll/);
 assert.match(html,/Steals \+ blocks \(stocks\)/);
 assert.match(css,/performance-table-scroll/);
 assert.doesNotMatch(js,/'<div class="performance-category-grid"'/);
 assert.match(js,/steals===null\|\|blocks===null\?null/);
});

test('completed 31 Oct slate renders frozen picks, actual finals and six-model verdicts separately',async()=>{
 const ledger=JSON.parse(read('data/audit-ledger.json'));
 const entry=ledger.entries.find(e=>e.melbourne_date==='2026-10-31');
 assert.ok(entry?.review_path,'The audit fixture must contain a reviewed 31 Oct slate');
 const lock=JSON.parse(read(entry.lock_path));
 const reviews=JSON.parse(read(entry.review_path));
 const files={
  '../data/audit-ledger.json':{...ledger,entries:[entry]},
  ['../'+entry.lock_path]:lock,
  '../audit/supplements/2026-10-31/challenge.lock.json':JSON.parse(read('audit/supplements/2026-10-31/challenge.lock.json')),
  ['../'+entry.review_path]:reviews,
  '../data/v7-current.json':JSON.parse(read('data/v7-current.json')),
  '../data/games.json':JSON.parse(read('data/games.json'))
 };
 const markup={innerHTML:''};
 const tabs=['full','results','models','players'].map(s=>({dataset:{c3SlateTab:s},onclick:null}));
 const doc={
  readyState:'complete',visibilityState:'visible',
  getElementById:id=>id==='c3-slate'?markup:null,
  querySelectorAll:()=>tabs,
  addEventListener:()=>{}
 };
 const media={image:team=>'<span>'+(team?.abbr||team)+'</span>',headshot:()=>null};
 const fetch=async url=>({ok:Object.hasOwn(files,url),status:200,json:async()=>files[url]});
 vm.runInNewContext(read('assets/concept3-hub.js'),{
  document:doc,window:{NbaMedia:media},location:{search:''},fetch,
  URLSearchParams,Date,Intl,console
 },{filename:'assets/concept3-hub.js'});
 await new Promise(resolve=>setImmediate(resolve));
 assert.match(markup.innerHTML,/10 genuinely locked games/);
 const results=tabs.find(t=>t.dataset.c3SlateTab==='results');
 assert.equal(typeof results.onclick,'function');
 results.onclick();
 assert.match(markup.innerHTML,/PICK VS FINAL/);
 assert.match(markup.innerHTML,/SIX MACHINES/);
 assert.match(markup.innerHTML,/AUDIT PENDING|✓ HIT|✕ MISS/);
 assert.match(markup.innerHTML,/79 – 95/,'The real CHA–WSH final must be visible');
 assert.match(markup.innerHTML,/[0-6]\/6 correct/);
 assert.equal(lock.forecasts[0].primary_forecast.home_win_probability,0.20674107431349767);
});
