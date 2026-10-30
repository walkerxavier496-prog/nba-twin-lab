'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const crypto=require('node:crypto');
const root=path.join(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');

test('courtside design reaches main site routes without official NBA branding',()=>{
 const css=read('assets/courtside.css'),court=read('assets/court-lines.svg');
 assert.match(css,/\.club-mark/);
 assert.match(css,/\[data-team="BOS"\]/);
 assert.match(css,/\[data-team="LAL"\]/);
 assert.match(css,/sports-scorebug/);
 assert.match(css,/court-ticker/);
 assert.match(css,/court-lines\.svg/);
 assert.match(court,/<svg/);
 for(const file of ['index.html','predict/index.html','challenge/index.html','challenge/daily.html','audit/index.html']){
  const html=read(file);
  assert.match(html,/class="sports-theme sports-/);
  assert.match(html,/assets\/courtside\.css/);
  assert.match(html,/name="viewport"/);
 }
 assert.match(read('index.html'),/id="home-ticker"/);
 assert.match(read('index.html'),/id="featured-game"/);
 assert.match(read('challenge/daily.html'),/id="daily-ticker"/);
});

test('homepage sports desk uses the immutable original game predictions',async()=>{
 const ledger=JSON.parse(read('data/audit-ledger.json'));
 ledger.entries=ledger.entries.filter(e=>e.melbourne_date==='2026-10-31');
 assert.equal(ledger.entries.length,1,'Fixture pregame lock must remain available');
 const locked=JSON.parse(read('practice/2026-10-31-melbourne/forecast.lock.json'));
 const elements=new Map();
 const get=id=>{
  if(!elements.has(id))elements.set(id,{textContent:'',innerHTML:''});
  return elements.get(id);
 };
 const document={getElementById:get};
 const fetch=async uri=>{
  const data={
   './data/audit-ledger.json':ledger,
   './data/five-model-report.json':{common_evaluation:{games:3643}},
   ['./'+ledger.entries[0].lock_path]:locked
  };
  return {ok:Object.hasOwn(data,uri),json:async()=>data[uri]};
 };
 vm.runInNewContext(read('assets/home.js'),{document,fetch,Date,Intl,Promise,console});
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(get('home-locked').textContent,'1');
 assert.equal((get('home-ticker').innerHTML.match(/court-ticker__item/g)||[]).length,10);
 assert.equal((get('featured-game').innerHTML.match(/class="club-mark/g)||[]).length,2);
 assert.match(get('featured-game').innerHTML,/ELO PICK/);
 assert.doesNotMatch(get('featured-game').innerHTML,/LIVE SCORE/);
});

test('daily basketball scorebug and ticker preserve actual locked model comparisons',async()=>{
 const ledger=JSON.parse(read('data/audit-ledger.json'));
 ledger.entries=ledger.entries.filter(e=>e.melbourne_date==='2026-10-31');
 assert.equal(ledger.entries.length,1,'Fixture pregame lock must remain available');
 const locked=JSON.parse(read('practice/2026-10-31-melbourne/forecast.lock.json'));
 const sidecar=JSON.parse(read('audit/supplements/2026-10-31/challenge.lock.json'));
 const elements=new Map();
 const get=id=>{
  if(!elements.has(id))elements.set(id,{innerHTML:'',textContent:'',className:'',value:id==='player-team'?'all':'',oninput:null,onchange:null});
  return elements.get(id);
 };
 const document={getElementById:get,querySelectorAll:()=>[]};
 const response={
  '../data/audit-ledger.json':ledger,
  ['../'+ledger.entries[0].lock_path]:locked,
  '../audit/supplements/2026-10-31/challenge.lock.json':sidecar
 };
 const fetch=async uri=>({ok:Object.hasOwn(response,uri),json:async()=>response[uri]});
 vm.runInNewContext(read('challenge/daily.js'),{document,fetch,Date,Intl,Promise,console});
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(get('error').innerHTML,'');
 assert.equal(get('stat-games').textContent,'10');
 assert.equal(get('stat-models').textContent,'6');
 assert.equal(get('stat-players').textContent,'228');
 assert.match(get('game-detail').innerHTML,/sports-scorebug/);
 assert.match(get('game-detail').innerHTML,/ARCHIVED PREGAME PROJECTION|PREGAME · SNAPSHOT LOCKED/);
 assert.equal((get('daily-ticker').innerHTML.match(/court-ticker__item/g)||[]).length,10);
 assert.equal((get('game-detail').innerHTML.match(/<article class="model-card/g)||[]).length,6);
 assert.match(get('game-detail').innerHTML,/M6 · Weighted Ensemble/);
 assert.match(get('player-cards').innerHTML,/Brandon Miller/);
 const raw=fs.readFileSync(path.join(root,ledger.entries[0].lock_path));
 const digest=crypto.createHash('sha256').update(raw).digest('hex');
 assert.equal(digest,ledger.entries[0].lock_sha256,'UI refactor must not change original lock bytes');
});
