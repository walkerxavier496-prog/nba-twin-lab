'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..');
const file=p=>fs.readFileSync(path.join(root,p),'utf8');

test('responsive shell loads on all primary website routes and scripts parse',()=>{
 for(const p of ['index.html','predict/index.html','challenge/index.html','challenge/daily.html','audit/index.html',
                   'models/index.html','twins/index.html','team-intelligence/index.html','player-stats/index.html']){
  const text=file(p);
  assert.match(text,/assets\/site-shell\.css/,p+' missing shared phone styles');
  assert.match(text,/assets\/site-shell\.js/,p+' missing mobile navigation');
  assert.match(text,/name="viewport"/,p+' missing viewport');
  if(['index.html','predict/index.html','challenge/index.html','challenge/daily.html','audit/index.html'].includes(p)) assert.match(text,/assets\/v12\.css/,p+' missing V12 sports UI');
 }
 for(const p of ['assets/site-shell.js','assets/home.js','challenge/daily.js','challenge/app.js']){
  assert.doesNotThrow(()=>new vm.Script(file(p),{filename:p}),p+' fails parse');
 }
 assert.match(file('assets/site-shell.css'),/safe-area-inset-bottom/);
 assert.match(file('assets/site-shell.css'),/focus-visible/);
});

function renderNavigation(pathname){
 const children=[];
 const document={
  body:{append:item=>children.push(item),prepend:()=>{}},
  currentScript:{src:'https://example.com/nba-twin-lab/assets/site-shell.js'},
  createElement:tag=>({
   tagName:tag,attributes:{},children:[],setAttribute(k,v){this.attributes[k]=v;},
   append(item){this.children.push(item);},className:'',innerHTML:'',href:''
  }),
  querySelector:q=>q==='main'?{id:'main'}:null
 };
 const location={href:'https://example.com'+pathname,pathname};
 vm.runInNewContext(file('assets/site-shell.js'),{document,location,URL},{filename:'assets/site-shell.js'});
 const nav=children.find(item=>item.className==='site-bottom-nav');
 assert.ok(nav,'mobile nav not created');
 return nav;
}
test('mobile bottom navigation has 5 valid links and the correct active route',()=>{
 const scenarios=[
  ['/nba-twin-lab/','Live'],
  ['/nba-twin-lab/predict/','Predict'],
  ['/nba-twin-lab/challenge/','Models'],
  ['/nba-twin-lab/team-intelligence/','My Team']
 ];
 for(const [route,active]of scenarios){
  const nav=renderNavigation(route);
  assert.equal(nav.children.length,5);
  assert.equal(nav.attributes['aria-label'],'Mobile navigation');
  const selected=nav.children.filter(a=>a.attributes['aria-current']==='page');
  assert.deepEqual(selected.map(a=>a.attributes['aria-label']),[active],route);
  assert.ok(nav.children.every(a=>a.href.startsWith('https://example.com/nba-twin-lab/')));
 }
});

test('mobile daily forecast has real, wired search/sort and accessible responsive cards',()=>{
 const html=file('challenge/daily.html'),js=file('challenge/daily.js');
 for(const id of ['stat-games','stat-models','stat-players','stat-review','disagreements','match-search',
                  'player-search','player-team','player-sort','player-cards','review-cards']){
  assert.ok(html.includes('id="'+id+'"'),id+' is missing');
 }
 assert.match(js,/matchupFilter/);
 assert.match(js,/match-search/);
 assert.match(js,/player-search/);
 assert.match(js,/player-sort/);
 assert.match(js,/model-card__bar/);
 assert.match(js,/aria-pressed/);
 assert.match(file('assets/v12.css'),/max-width:590px/);
 assert.match(html,/assets\/v12\.css/);
 assert.match(file('assets/site-shell.css'),/safe-area-inset-bottom/);
});

test('daily phone view renders real locked data and functioning matchup/player search',async()=>{
 const locked=JSON.parse(file('practice/2026-10-31-melbourne/forecast.lock.json'));
 const sidecar=JSON.parse(file('audit/supplements/2026-10-31/challenge.lock.json'));
 const ledger=JSON.parse(file('data/audit-ledger.json'));
 ledger.entries=ledger.entries.filter(e=>e.melbourne_date==='2026-10-31');
 assert.equal(ledger.entries.length,1);
 const content={
  '../data/audit-ledger.json':ledger,
  ['../'+ledger.entries[0].lock_path]:locked,
  '../audit/supplements/2026-10-31/challenge.lock.json':sidecar
 };
 const elements=new Map();
 const get=id=>{
  if(!elements.has(id))elements.set(id,{id,innerHTML:'',textContent:'',value:id==='player-team'?'all':'',
                                      onchange:null,oninput:null,className:''});
  return elements.get(id);
 };
 const document={getElementById:get,querySelectorAll:()=>[]};
 const fetch=async uri=>({ok:uri in content,status:uri in content?200:404,json:async()=>content[uri]});
 vm.runInNewContext(file('challenge/daily.js'),{document,fetch,Date,Intl,console,Promise},
    {filename:'challenge/daily.js'});
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(get('error').innerHTML,'');
 assert.equal(get('stat-games').textContent,'10');
 assert.equal(get('stat-models').textContent,'6');
 assert.equal(get('stat-players').textContent,'228');
 assert.match(get('game-detail').innerHTML,/M6 · Weighted Ensemble/);
 assert.match(get('player-cards').innerHTML,/Brandon Miller/);
 get('match-search').value='lakers';get('match-search').oninput();
 assert.match(get('game-count').textContent,/1 of 10/);
 assert.match(get('game-selector').innerHTML,/LAL/);
 get('match-search').value='';get('match-search').oninput();
 get('player-search').value='Brandon';get('player-search').oninput();
 assert.match(get('player-count').textContent,/1 of/);
 assert.equal((get('player-cards').innerHTML.match(/class="player-card"/g)||[]).length,1);
});

test('historical six-model page creates accessible mobile cards from audited report',async()=>{
 const report=JSON.parse(file('data/five-model-report.json'));
 const ledger=JSON.parse(file('data/audit-ledger.json'));
 const elements=new Map();
 const get=id=>{
  if(!elements.has(id))elements.set(id,{id,innerHTML:'',textContent:'',className:'',dataset:{}});
  return elements.get(id);
 };
 const document={getElementById:get,querySelectorAll:()=>[]};
 const fetch=async uri=>({ok:true,json:async()=>uri.includes('five-model-report')?report:ledger});
 vm.runInNewContext(file('challenge/app.js'),{document,fetch,Date,Intl,console,Promise},
  {filename:'challenge/app.js'});
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal((get('leaderboard-cards').innerHTML.match(/class="rank-card"/g)||[]).length,6);
 assert.match(get('leaderboard-cards').innerHTML,/aria-pressed/);
 assert.match(get('leaderboard-cards').innerHTML,/BRIER/);
});
