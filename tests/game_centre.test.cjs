'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const root=path.join(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const waitFor=async predicate=>{
 const limit=Date.now()+3000;
 while(Date.now()<limit){if(predicate())return;await new Promise(resolve=>setTimeout(resolve,5))}
 assert.ok(predicate(),'Timed out waiting for byte-verified forecast artifacts');
};
function node(id){
 return {id,innerHTML:'',textContent:'',hidden:false,tabIndex:0,className:'',attributes:{},
  listeners:{},setAttribute(k,v){this.attributes[k]=v},
  addEventListener(type,listener){this.listeners[type]=listener},querySelectorAll(){return[]},focus(){}};
}
function gameSummary({phase='live',awayScore='57',homeScore='51',boxscore={players:[],teams:[]},venue}={}){
 const type=phase==='final'?{completed:true,state:'post',name:'STATUS_FINAL'}:
  phase==='postponed'?{completed:false,state:'post',name:'STATUS_POSTPONED',shortDetail:'Postponed'}:
  phase==='live'||phase==='overtime'?{state:'in',name:'STATUS_IN_PROGRESS'}:{state:'pre',name:'STATUS_SCHEDULED'};
 return {header:{id:'401909277',competitions:[{id:'401909277',date:'2026-10-30T23:00:00Z',
  ...(venue?{venue:{fullName:venue}}:{}),status:{period:phase==='overtime'?6:2,displayClock:phase==='overtime'?'2:00':'5:21',type},competitors:[
   {homeAway:'away',team:{abbreviation:'CHA',displayName:'Charlotte Hornets'},score:['scheduled','postponed'].includes(phase)?undefined:awayScore},
   {homeAway:'home',team:{abbreviation:'WSH',displayName:'Washington Wizards'},score:['scheduled','postponed'].includes(phase)?undefined:homeScore}
  ]}]},...(boxscore?{boxscore}:{})};
}
function gamePageHarness(fetch,options={}){
 const elements=new Map(),get=id=>{if(!elements.has(id))elements.set(id,node(id));return elements.get(id)};
 const parserWindow={};vm.runInNewContext(read('assets/boxscore-plus.js'),{window:parserWindow});
 const window={TwinBoxscorePlus:parserWindow.TwinBoxscorePlus,
  NbaMedia:{image:team=>'<span>'+team.abbr+'</span>'},NbaLiveDesk:{extractPlays:()=>[]}};
 const document={getElementById:get,querySelectorAll:()=>[],visibilityState:'visible'};
 vm.runInNewContext(read('assets/game-page.js'),{
  window,document,location:{search:'?id=401909277'},URLSearchParams,fetch,Date:options.Date||Date,Intl,Promise,console,
  crypto:crypto.webcrypto,TextEncoder,
  ...(options.setTimeout?{setTimeout:options.setTimeout}:{}),
  ...(options.clearTimeout?{clearTimeout:options.clearTimeout}:{})
 },{filename:'assets/game-page.js'});
 return {get,window};
}
const flush=()=>new Promise(resolve=>setImmediate(resolve));
test('grouped header, live game links and four focused game centre tabs exist',()=>{
 for(const file of ['index.html','challenge/daily.html','game/index.html','league/index.html']){
  const html=read(file);
  assert.match(html,/assets\/site-nav\.js/,file+' missing grouped header');
  assert.match(html,/assets\/nav-v15\.css/);
 }
 const nav=read('assets/site-nav.js');
 for(const name of ["link('HOME'","link('PREDICT'","link('DAILY'","link('PLAYERS'","link('TEAMS'","link('STATS'","link('AUDIT'","link('MODELS'"])assert.ok(nav.includes(name));
 assert.match(read('assets/live-desk.js'),/OPEN GAME CENTRE/);
 assert.match(read('assets/home.js'),/\.\/game\/\?id=/);
 const html=read('game/index.html');
 for(const id of ['game-score','game-clock','game-periods','game-leaders','game-box-groups','game-play-list','game-team-stats','game-forecast']){
  assert.match(html,new RegExp('id="'+id+'"'));
 }
 assert.match(html,/id="game-freshness-details"/);
 for(const label of ['OVERVIEW','MATCHUP','BOX SCORE','MACHINES','TEAM TOTALS','Game leaders and notable performances'])assert.ok(html.includes(label));
 for(const tab of ['overview','matchup','box','machine']){
  assert.match(html,new RegExp('id="tab-'+tab+'" role="tab"'));
  assert.match(html,new RegExp('id="pane-'+tab+'" class="game-tab-panel" role="tabpanel"'));
 }
 const css=read('assets/game-page.css');
 assert.match(css,/@media\(max-width:760px\)[\s\S]*matchup-insight-grid/);
 assert.match(css,/@media\(max-width:760px\)[\s\S]*game-freshness-grid/);
 assert.match(css,/@media\(max-width:420px\)[\s\S]*matchup-stat-row/);
});
test('game centre parses ESPN actual score and switches accessible tabs',async()=>{
 const raw={header:{id:'401909277',competitions:[{id:'401909277',date:'2026-10-30T23:00:00Z',venue:{fullName:'Spectrum Center',address:{city:'Charlotte',state:'NC'}},
  status:{period:2,displayClock:'5:21',type:{state:'in',name:'STATUS_IN_PROGRESS'}},
  competitors:[
   {homeAway:'away',team:{abbreviation:'CHA',displayName:'Charlotte Hornets'},score:'57',
    linescores:[{value:30},{value:27}],records:[{type:'total',summary:'3-2'}]},
   {homeAway:'home',team:{abbreviation:'WSH',displayName:'Washington Wizards'},score:'51',
    linescores:[{value:26},{value:25}],records:[{type:'total',summary:'2-3'}]}
  ]}]},boxscore:{teams:[
  {team:{abbreviation:'CHA'},statistics:[{name:'fieldGoalPct',displayValue:'46%'},{name:'totalRebounds',displayValue:'23'}]},
  {team:{abbreviation:'WSH'},statistics:[{name:'fieldGoalPct',displayValue:'40%'},{name:'totalRebounds',displayValue:'19'}]}
 ]}};
 const elements=new Map(),get=id=>{if(!elements.has(id))elements.set(id,node(id));return elements.get(id)};
 const document={getElementById:get,querySelectorAll:()=>[],visibilityState:'visible'};
 const window={NbaMedia:{image:t=>'<span>'+t.abbr+'</span>'},NbaLiveDesk:{
  parseBoxscore:()=>[{name:'Brandon Miller',team:'CHA',id:'123',pts:24,reb:6,ast:3,three:4,minutes:'23'},
                      {name:'Trae Young',team:'WSH',id:'456',pts:20,reb:2,ast:8,three:2,minutes:'25'}],
  extractPlays:()=>[{id:'a',desc:'Brandon Miller makes three point jumper',period:2,clock:'5:21',away:57,home:51}],
  highlight:()=> 'THREE POINTER'}};
 const fetch=async()=>({ok:true,json:async()=>raw});
 const location={search:'?id=401909277'};
 vm.runInNewContext(read('assets/game-page.js'),{window,document,location,URLSearchParams,fetch,Date,Intl,Promise,encodeURIComponent,console});
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(get('game-score').textContent,'57 : 51');
 assert.match(get('game-state').textContent,/Q2/);
 assert.match(get('game-periods').innerHTML,/30/);
 assert.match(get('game-box-groups').innerHTML,/Brandon Miller/);
 assert.match(get('game-leaders').innerHTML,/Trae Young/);
 assert.match(get('game-team-stats').innerHTML,/Field Goal Pct/);
 assert.match(get('game-date').textContent,/Spectrum Center/);
 window.NbaGamePage.activate('overview');
 assert.equal(get('pane-overview').hidden,false);
 assert.equal(get('pane-box').hidden,true);
 assert.equal(get('tab-overview').attributes['aria-selected'],'true');
 assert.match(get('game-play-list').innerHTML,/Brandon Miller makes three point jumper/);
});
test('Game Centre distinguishes postponed games and overtime from upcoming or missing status',async()=>{
 const postponed=gamePageHarness(async()=>({ok:true,json:async()=>gameSummary({phase:'postponed',boxscore:null})}));
 await flush();
 assert.equal(postponed.get('game-clock').textContent,'POSTPONED');
 assert.match(postponed.get('game-overview-context').textContent,/Postponed game/);
 assert.match(postponed.get('game-overview-context').textContent,/No rescheduled tipoff reported/);
 assert.equal(postponed.get('game-score').textContent,'POSTPONED');
 assert.match(postponed.get('game-freshness-details').innerHTML,/Game postponed; no current player box score is expected/);
 const overtime=gamePageHarness(async()=>({ok:true,json:async()=>gameSummary({phase:'overtime'})}));
 await flush();
 assert.equal(overtime.get('game-clock').textContent,'OT 2 · 2:00 · LIVE');
 assert.equal(overtime.get('game-score').textContent,'57 : 51');
});
test('game box score renders provider team totals and keeps DNP and incomplete rows honest',async()=>{
 const labels=['MIN','FG','3PT','FT','OREB','DREB','REB','AST','STL','BLK','TO','PF','PTS','+/-'];
 const athlete=(name,id,stats,extra={})=>({athlete:{displayName:name,id},stats,...extra});
 const raw={header:{id:'401909277',competitions:[{id:'401909277',date:'2026-10-30T23:00:00Z',
  status:{type:{state:'in',name:'STATUS_IN_PROGRESS'}},competitors:[
   {homeAway:'away',team:{abbreviation:'CHA',displayName:'Charlotte Hornets'},score:'57'},
   {homeAway:'home',team:{abbreviation:'WSH',displayName:'Washington Wizards'},score:'51'}
  ]}]},boxscore:{
  teams:[{team:{abbreviation:'CHA'},statistics:[{name:'totalRebounds',label:'Rebounds',displayValue:'23'},{name:'fieldGoalPct',label:'Field Goal %',displayValue:'46%'}]},
   {team:{abbreviation:'WSH'},statistics:[{name:'totalRebounds',label:'Rebounds',displayValue:'19'}]}],
  players:[{team:{abbreviation:'CHA'},statistics:[{labels,athletes:[
   athlete('Active Player','1',['12:59','4-8','1-3','3-4','1','4','5','6','1','0','2','2','12','+3']),
   athlete('Did Not Play','2',['','','','','','','','','','','','','',''],{didNotPlay:true,reason:'Coach decision'}),
   athlete('Stats Pending','3',['','','','','','','','','','','','','',''])
  ]}]},{team:{abbreviation:'WSH'},statistics:[]}]
 }};
 const elements=new Map(),get=id=>{if(!elements.has(id))elements.set(id,node(id));return elements.get(id)};
 const parserWindow={};vm.runInNewContext(read('assets/boxscore-plus.js'),{window:parserWindow});
 const windowObject={TwinBoxscorePlus:parserWindow.TwinBoxscorePlus,NbaMedia:{image:t=>'<span>'+t.abbr+'</span>'}};
 const document={getElementById:get,querySelectorAll:()=>[],visibilityState:'visible'};
 const fetch=async()=>({ok:true,json:async()=>raw});
 vm.runInNewContext(read('assets/game-page.js'),{
  window:windowObject,document,location:{search:'?id=401909277'},URLSearchParams,fetch,Date,Intl,Promise,console
 });
 await new Promise(resolve=>setImmediate(resolve));
 const html=get('game-box-groups').innerHTML;
 assert.match(html,/12:59/);
 assert.match(html,/Coach decision/);
 assert.match(html,/game-player-dnp/);
 assert.match(html,/Stats Pending/);
 assert.match(html,/game-player-unavailable/);
 assert.match(html,/>DNP</);
 const unavailableRow=html.match(/class="game-player-unavailable">([\s\S]*?)<\/tr>/)?.[1]||'';
 assert.match(unavailableRow,/—/);
 assert.doesNotMatch(unavailableRow,/>0</,'missing statistics must not render as zero');
 assert.match(get('game-team-stats').innerHTML,/46%/);
 assert.match(get('game-team-stats').innerHTML,/23/);
});
test('standings derive 30 teams and wins equal losses from confirmed final games only',()=>{
 const window={TwinTeamPrefs:{canonical:t=>t,get:()=>''},NbaMedia:{image:()=>''}};
 const document={getElementById:()=>({innerHTML:'',textContent:''}),addEventListener(){}};
 const data=JSON.parse(read('data/games.json')),fetch=async()=>({ok:true,json:async()=>data});
 vm.runInNewContext(read('league/standings.js'),{window,document,fetch,Date,Intl,Promise,console});
 const result=window.NbaStandings.records(data);
 assert.equal(result.east.length,15);assert.equal(result.west.length,15);
 assert.equal(result.season,2027);
 const all=[...result.east,...result.west];
 assert.ok(result.completed>0);
 assert.equal(all.reduce((n,t)=>n+t.w,0),all.reduce((n,t)=>n+t.l,0));
});
test('game detail does not touch immutable forecasts and requires real score feed',()=>{
 const ledger=JSON.parse(read('data/audit-ledger.json'));
 const entry=ledger.entries.find(e=>e.melbourne_date==='2026-10-31');
 assert.ok(entry);
 const data=fs.readFileSync(path.join(root,entry.lock_path));
 assert.equal(crypto.createHash('sha256').update(data).digest('hex'),entry.lock_sha256);
 const app=read('assets/game-page.js');
 assert.match(app,/No verified data is available/);
 assert.match(app,/No verified immutable pregame forecast/);
 assert.match(app,/No forecast is recalculated|locked_at_utc/);
});

test('matchup research is pre-tip only, cites measured samples, and is not a forecast',async()=>{
 const fixture=JSON.parse(read('tests/fixtures/v7-current-2026-10-30.json'));
 const raw={header:{id:'401909277',competitions:[{id:'401909277',date:'2026-10-30T23:00:00Z',
  status:{type:{state:'pre',name:'STATUS_SCHEDULED'}},
  competitors:[
   {homeAway:'away',team:{abbreviation:'CHA',displayName:'Charlotte Hornets'}},
   {homeAway:'home',team:{abbreviation:'WSH',displayName:'Washington Wizards'}}
  ]}]}};
 const elements=new Map(),get=id=>{if(!elements.has(id))elements.set(id,node(id));return elements.get(id)};
 const recentButton=node('recent-view');recentButton.dataset={matchupView:'last5'};
 get('game-matchup').querySelectorAll=()=>[recentButton];
 const window={NbaMedia:{image:t=>'<span>'+t.abbr+'</span>'}};
 const fetch=async url=>{
  const data=url.includes('site.api.espn.com')?raw:fixture;
  return {ok:true,json:async()=>data};
 };
 const document={getElementById:get,querySelectorAll:()=>[],visibilityState:'visible'};
 vm.runInNewContext(read('assets/game-page.js'),{
  window,document,location:{search:'?id=401909277'},URLSearchParams,fetch,Date,Intl,Promise,encodeURIComponent,console
 });
 await new Promise(resolve=>setImmediate(resolve));
 const target=window.NbaGamePage.parseSummary(raw);
 const analysis=window.NbaGamePage.analyzeMatchup(fixture,target);
 assert.ok(analysis);
 assert.equal(analysis.away.season.games,5);
 const html=window.NbaGamePage.renderMatchup(fixture,target);
 assert.match(html,/RESEARCH MATCHUP CONTEXT · NOT A FORECAST/);
 assert.match(html,/attempted 49\.7% of its field goals from three across 5 games/);
 assert.match(html,/opponents recorded a 41\.4% three-point attempt rate across 5 games/);
 assert.match(html,/8\.3 percentage points/);
 assert.match(html,/not shot quality or expected makes/);
 assert.match(html,/Source: Frozen two-team pre-tip fixture/);
 assert.match(html,/Prior-season figures are shown separately and are not blended/);
 assert.match(html,/VIEW IMMUTABLE PRODUCTION FORECAST/);
 window.NbaGamePage.activate('matchup');
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(get('pane-matchup').hidden,false);
 assert.match(get('game-matchup').innerHTML,/CURRENT SEASON/);
 recentButton.listeners.click();
 assert.match(get('game-matchup').innerHTML,/RECENT · LAST 5/);
 assert.match(get('game-matchup').innerHTML,/Fewer than three games are available/);
 assert.equal(window.NbaGamePage.analyzeMatchup({
  ...fixture,built_at_utc:'2026-10-30T23:00:00Z'
 },target),null,'a snapshot built at tipoff is not pre-tip evidence');
 assert.equal(window.NbaGamePage.analyzeMatchup({
  ...fixture,built_at_utc:'2026-10-30T23:00:01Z'
 },target),null,'post-tip data cannot support a reconstructed pregame claim');
 assert.equal(window.NbaGamePage.analyzeMatchup({
  ...fixture,strict_no_future_data:false
 },target),null,'snapshots without the chronology guarantee are rejected');
 assert.match(window.NbaGamePage.renderMatchup({
  ...fixture,built_at_utc:'2026-10-31T00:00:00Z'
 },target),/Timestamp-eligible pre-tip team evidence is unavailable/);
});

test('matchup snapshot request failures are visible and do not produce claims',async()=>{
 const raw={header:{id:'401909897',competitions:[{id:'401909897',date:'2026-11-01T22:00:00Z',
  status:{type:{state:'pre',name:'STATUS_SCHEDULED'}},
  competitors:[
   {homeAway:'away',team:{abbreviation:'PHI',displayName:'Philadelphia 76ers'}},
   {homeAway:'home',team:{abbreviation:'CHA',displayName:'Charlotte Hornets'}}
  ]}]}};
 const elements=new Map(),get=id=>{if(!elements.has(id))elements.set(id,node(id));return elements.get(id)};
 const fetch=async url=>url.includes('site.api.espn.com')
  ?{ok:true,json:async()=>raw}:{ok:false,status:503,json:async()=>({})};
 const document={getElementById:get,querySelectorAll:()=>[],visibilityState:'visible'};
 const window={NbaMedia:{image:t=>'<span>'+t.abbr+'</span>'}};
 vm.runInNewContext(read('assets/game-page.js'),{
  window,document,location:{search:'?id=401909897'},URLSearchParams,fetch,Date,Intl,Promise,encodeURIComponent,console
 });
 await new Promise(resolve=>setImmediate(resolve));
 window.NbaGamePage.activate('matchup');
 await new Promise(resolve=>setImmediate(resolve));
 assert.match(get('game-matchup').innerHTML,/HTTP 503/);
 assert.match(get('game-matchup').innerHTML,/No matchup claim was generated/);
 assert.doesNotMatch(get('game-matchup').innerHTML,/Perimeter volume/);
});

test('completed Game Centre grades the original production forecast separately from research machines',async()=>{
 const ledger=JSON.parse(read('data/audit-ledger.json'));
 const entry=ledger.entries.find(x=>x.melbourne_date==='2026-10-31');
 const lock=JSON.parse(read(entry.lock_path));
 const review=JSON.parse(read(entry.review_path));
 const final=review.games.find(game=>String(game.game_id)==='401909277');
 const production=final.models.production_elo_v7;
 const forecast=lock.forecasts.find(g=>String(g.game_id)==='401909277').primary_forecast;
 const elements=new Map(),get=id=>{if(!elements.has(id))elements.set(id,node(id));return elements.get(id)};
 const raw={header:{id:'401909277',competitions:[{id:'401909277',date:'2026-10-30T23:00:00Z',
  status:{type:{completed:true,state:'post'}},competitors:[
   {homeAway:'away',team:{abbreviation:'CHA',displayName:'Charlotte Hornets'},score:'79'},
   {homeAway:'home',team:{abbreviation:'WSH',displayName:'Washington Wizards'},score:'95'}
  ]}]}};
 const files={
  '../data/audit-ledger.json':ledger,
  ['../'+entry.lock_path]:lock,
  ['../'+entry.review_path]:review,
  '../audit/supplements/2026-10-31/challenge.lock.json':JSON.parse(read('audit/supplements/2026-10-31/challenge.lock.json'))
 };
 const artifactText={
  ['../'+entry.lock_path]:read(entry.lock_path),
  ['../'+entry.review_path]:read(entry.review_path)
 };
 const fetch=async url=>{
  const item=url.includes('site.api.espn.com')?raw:files[url];
  return {ok:item!==undefined,json:async()=>item,text:async()=>artifactText[url]??JSON.stringify(item)};
 };
 const windowObject={NbaMedia:{image:t=>'<span>'+t.abbr+'</span>'},NbaLiveDesk:{parseBoxscore:()=>[],extractPlays:()=>[]}};
 const document={getElementById:get,querySelectorAll:()=>[],visibilityState:'visible'};
 vm.runInNewContext(read('assets/game-page.js'),{
  window:windowObject,document,location:{search:'?id=401909277'},URLSearchParams,fetch,Date,Intl,Promise,console,
  crypto:crypto.webcrypto,TextEncoder
 });
 await new Promise(resolve=>setImmediate(resolve));
 windowObject.NbaGamePage.activate('machine');
 await waitFor(()=>get('game-forecast').innerHTML.includes('OFFICIAL PRODUCTION · IMMUTABLE'));
 const html=get('game-forecast').innerHTML;
 assert.match(html,/OFFICIAL PRODUCTION · IMMUTABLE/);
 assert.match(html,/Archived winner probability: 79\.3%/);
 assert.match(html,/VERIFIED WINNER GRADE/);
 assert.match(html,/26\.9 points per team/);
 assert.match(html,/RESEARCH \/ EXPERIMENTAL · NOT PRODUCTION/);
 assert.equal(production.p,forecast.home_win_probability);
 assert.equal(production.correct,false);
 assert.match(html,/Original forecast lock time: 2026-\d\d-\d\d .* UTC/);
 assert.match(html,/Verified grading review created: 2026-\d\d-\d\d .* UTC/);
 assert.match(html,/never recomputed from live or final results/);
 assert.doesNotMatch(html,/PRODUCTION · IMMUTABLE[\s\S]{0,800}0\.0%/);
});


test('Game Centre does not grade a standalone per-game review without a ledger-bound daily review',async()=>{
 const ledger=JSON.parse(read('data/audit-ledger.json'));
 const entry={...ledger.entries.find(x=>x.melbourne_date==='2026-10-31'),review_path:null,status:'partial'};
 const lock=JSON.parse(read(entry.lock_path));
 const perGame=JSON.parse(read('audit/reviews/2026-10-31/games/401909277.review.json'));
 const supplement=JSON.parse(read('audit/supplements/2026-10-31/challenge.lock.json'));
 const data=JSON.parse(read('data/games.json'));
 assert.equal(perGame.source_lock_integrity_sha256,entry.lock_integrity_sha256);
 const raw={header:{id:'401909277',competitions:[{
  id:'401909277',date:'2026-10-30T23:00:00Z',status:{type:{completed:true,state:'post'}},
  competitors:[
   {homeAway:'away',team:{abbreviation:'CHA',displayName:'Charlotte Hornets'},score:'79'},
   {homeAway:'home',team:{abbreviation:'WSH',displayName:'Washington Wizards'},score:'95'}
  ]}]},boxscore:{teams:[],players:[]}};
 const files={
  '../data/audit-ledger.json':{...ledger,entries:[entry]},
  ['../'+entry.lock_path]:lock,
  '../audit/supplements/2026-10-31/challenge.lock.json':supplement,
  '../audit/reviews/2026-10-31/games/401909277.review.json':perGame
 };
 const run=async()=>{
  const elements=new Map(),get=id=>{if(!elements.has(id))elements.set(id,node(id));return elements.get(id)};
  const win={NbaMedia:{image:t=>'<span>'+t.abbr+'</span>'},NbaLiveDesk:{parseBoxscore:()=>[],extractPlays:()=>[]}};
  const fetch=async url=>{
   const item=url.includes('site.api.espn.com')?raw:
    files[url];
   return {ok:item!==undefined,status:item===undefined?404:200,json:async()=>item,
    text:async()=>url==='../'+entry.lock_path?read(entry.lock_path):JSON.stringify(item)};
  };
  const document={getElementById:get,querySelectorAll:()=>[],visibilityState:'visible'};
  vm.runInNewContext(read('assets/game-page.js'),{
   window:win,document,location:{search:'?id=401909277'},URLSearchParams,fetch,Date,Intl,Promise,console,
   crypto:crypto.webcrypto,TextEncoder
  },{filename:'assets/game-page.js'});
  await new Promise(resolve=>setImmediate(resolve));
  win.NbaGamePage.activate('machine');
  await waitFor(()=>get('game-forecast').innerHTML.includes('FINAL · REVIEW PENDING'));
  return get('game-forecast').innerHTML;
 };
 const rejected=await run();
 assert.match(rejected,/FINAL · REVIEW PENDING/);
 assert.match(rejected,/No ledger-bound postgame review is available/);
 assert.doesNotMatch(rejected,/CHALLENGER MACHINES VS REALITY/);
 assert.doesNotMatch(rejected,/PLAYER FORECASTS VS ACTUALS/);
 assert.equal(lock.forecasts[0].primary_forecast.home_win_probability,0.20674107431349767);
});

test('Game Centre rejects lock and postgame-review bytes that disagree with ledger hashes',async()=>{
 const ledger=JSON.parse(read('data/audit-ledger.json'));
 const entry=ledger.entries.find(x=>x.melbourne_date==='2026-10-31');
 const lock=JSON.parse(read(entry.lock_path));
 const review=JSON.parse(read(entry.review_path));
 const gameReview=review.games.find(item=>String(item.game_id)==='401909277');
 const raw=gameSummary({phase:'final',awayScore:'79',homeScore:'95'});
 const run=async({tamperLock=false,tamperReview=false}={})=>{
  const elements=new Map(),get=id=>{if(!elements.has(id))elements.set(id,node(id));return elements.get(id)};
  const lockValue=JSON.parse(JSON.stringify(lock)),reviewValue=JSON.parse(JSON.stringify(review));
  if(tamperLock)lockValue.forecasts[0].primary_forecast.home_win_probability-=0.01;
  if(tamperReview)reviewValue.games[0].home.score+=1;
  const files={
   '../data/audit-ledger.json':ledger,
   ['../'+entry.lock_path]:lockValue,
   ['../'+entry.review_path]:reviewValue
  };
  const originalText={
   ['../'+entry.lock_path]:read(entry.lock_path),
   ['../'+entry.review_path]:read(entry.review_path)
  };
  const fetch=async url=>{
   const item=url.includes('site.api.espn.com')?raw:files[url];
   return {ok:item!==undefined,status:item===undefined?404:200,json:async()=>item,
    text:async()=>url==='site.api.espn.com'?JSON.stringify(item):
     tamperLock&&url==='../'+entry.lock_path?JSON.stringify(lockValue):
     tamperReview&&url==='../'+entry.review_path?JSON.stringify(reviewValue):originalText[url]};
  };
  const win={NbaMedia:{image:t=>'<span>'+t.abbr+'</span>'},NbaLiveDesk:{parseBoxscore:()=>[],extractPlays:()=>[]}};
  const document={getElementById:get,querySelectorAll:()=>[],visibilityState:'visible'};
  vm.runInNewContext(read('assets/game-page.js'),{
   window:win,document,location:{search:'?id=401909277'},URLSearchParams,fetch,Date,Intl,Promise,console,
   crypto:crypto.webcrypto,TextEncoder
  });
  await flush();win.NbaGamePage.activate('machine');
  await waitFor(()=>get('game-forecast').innerHTML.includes(tamperLock?'SHA-256':'FINAL · REVIEW PENDING'));
  return get('game-forecast').innerHTML;
 };
 const changedLock=await run({tamperLock:true});
 assert.match(changedLock,/Original forecast lock SHA-256 does not match the audit ledger/);
 assert.doesNotMatch(changedLock,/OFFICIAL PRODUCTION · IMMUTABLE/);
 const changedReview=await run({tamperReview:true});
 assert.match(changedReview,/FINAL · REVIEW PENDING/);
 assert.match(changedReview,/Postgame review SHA-256 does not match the audit ledger/);
 assert.doesNotMatch(changedReview,/VERIFIED WINNER GRADE/);
 assert.equal(gameReview.models.production_elo_v7.p,lock.forecasts.find(g=>String(g.game_id)==='401909277').primary_forecast.home_win_probability);
});

test('a slower older ESPN response cannot overwrite a newer accepted score',async()=>{
 const pending=[];
 const harness=gamePageHarness(()=>new Promise(resolve=>pending.push(resolve)));
 await flush();
 const older=harness.window.NbaGamePage.refresh();
 const newer=harness.window.NbaGamePage.refresh();
 assert.equal(pending.length,3);
 pending[2]({ok:true,json:async()=>gameSummary({awayScore:'62',homeScore:'59'})});
 await newer;
 pending[1]({ok:true,json:async()=>gameSummary({awayScore:'58',homeScore:'52'})});
 await older;
 pending[0]({ok:true,json:async()=>gameSummary({awayScore:'57',homeScore:'51'})});
 await flush();
 assert.equal(harness.get('game-score').textContent,'62 : 59');
 assert.match(harness.get('game-updated').textContent,/last checked locally/);
});

test('live-to-final status advances while a partial final payload preserves verified box-score data',async()=>{
 const labels=['MIN','FG','3PT','FT','OREB','DREB','REB','AST','STL','BLK','TO','PF','PTS','+/-'];
 const boxscore={players:[
  {team:{abbreviation:'CHA'},statistics:[{labels,athletes:[{
   athlete:{displayName:'Brandon Miller',id:'123'},
   stats:['23:10','8-16','3-7','2-2','1','4','5','3','1','0','2','2','21','+4']
  }]}]},
  {team:{abbreviation:'WSH'},statistics:[{labels,athletes:[{
   athlete:{displayName:'Home Player',id:'456'},
   stats:['23:10','8-16','3-7','2-2','1','4','5','3','1','0','2','2','21','+4']
  }]}]}
 ],teams:[
  {team:{abbreviation:'CHA'},statistics:[{name:'totalRebounds',displayName:'Rebounds',displayValue:'42'}]},
  {team:{abbreviation:'WSH'},statistics:[{name:'totalRebounds',displayName:'Rebounds',displayValue:'44'}]}
 ]};
 let calls=0;
 const harness=gamePageHarness(async()=>{
  calls++;
  return {ok:true,json:async()=>calls===1?gameSummary({boxscore}):
   gameSummary({phase:'final',awayScore:'101',homeScore:'99',boxscore:null})};
 });
 await flush();
 assert.match(harness.get('game-state').textContent,/LIVE/);
 assert.match(harness.get('game-box-groups').innerHTML,/Brandon Miller/);
 const originalTeamStats=harness.get('game-team-stats').innerHTML;
 await harness.window.NbaGamePage.refresh();
 assert.equal(harness.get('game-state').textContent,'FINAL');
 assert.equal(harness.get('game-score').textContent,'101 : 99');
 assert.match(harness.get('game-box-groups').innerHTML,/Brandon Miller/);
 assert.equal(harness.get('game-team-stats').innerHTML,originalTeamStats);
 assert.match(harness.get('game-freshness-details').innerHTML,/>Player box score<\/b><span>Last complete ESPN box score · retrieved locally/);
 assert.match(harness.get('game-freshness-details').innerHTML,/>CHA team statistics<\/b><span>ESPN summary · retrieved locally/);
});

test('a provider status regression cannot roll a final game back to live or replace its final score',async()=>{
 let calls=0;
 const harness=gamePageHarness(async()=>{
  calls++;
  return {ok:true,json:async()=>calls===1?
   gameSummary({phase:'final',awayScore:'101',homeScore:'99'}):
   gameSummary({phase:'live',awayScore:'92',homeScore:'90'})};
 });
 await flush();
 await harness.window.NbaGamePage.refresh();
 assert.equal(harness.get('game-state').textContent,'FINAL');
 assert.equal(harness.get('game-score').textContent,'101 : 99');
 assert.match(harness.get('game-freshness-details').innerHTML,/status older than the latest accepted state/);
});

test('header score and supplied team points are compared without silently reconciling mismatches',async()=>{
 const harness=gamePageHarness(async()=>({ok:true,json:async()=>gameSummary({boxscore:{
  players:[],teams:[
   {team:{abbreviation:'CHA'},statistics:[{name:'points',displayName:'Points',displayValue:'56'}]},
   {team:{abbreviation:'WSH'},statistics:[{name:'points',displayName:'Points',displayValue:'51'}]}
  ]
 }})}));
 await flush();
 assert.equal(harness.get('game-score').textContent,'57 : 51');
 assert.match(harness.get('game-freshness-details').innerHTML,/header score and team box-score points disagree for CHA \(header 57, team total 56\)/);
});

test('partial team/player updates preserve per-team retrieval times and disclose incomplete coverage',async()=>{
 let now=Date.now(),calls=0;
 class ControlledDate extends Date{
  constructor(...args){super(...(args.length?args:[now]))}
  static now(){return now}
 }
 const labels=['MIN','FG','3PT','FT','OREB','DREB','REB','AST','STL','BLK','TO','PF','PTS','+/-'];
 const player=(name,id)=>({athlete:{displayName:name,id},stats:['20:00','4-8','1-3','2-2','1','3','4','2','1','0','1','2','11','+2']});
 const teams=[{abbr:'CHA',name:'Charlotte',player:'Away Player',id:'1'},{abbr:'WSH',name:'Washington',player:'Home Player',id:'2'}];
 const full={players:teams.map(team=>({team:{abbreviation:team.abbr},statistics:[{labels,athletes:[player(team.player,team.id)]}]})),
  teams:teams.map(team=>({team:{abbreviation:team.abbr},statistics:[
   {name:'totalRebounds',displayName:'Rebounds',displayValue:team.abbr==='CHA'?'40':'42'}
  ]}))};
 const partial={players:[{team:{abbreviation:'CHA'},statistics:[{labels,athletes:[player('Away Player','1')]}]}],
  teams:[{team:{abbreviation:'CHA'},statistics:[{name:'totalRebounds',displayName:'Rebounds',displayValue:'41'}]}]};
 const harness=gamePageHarness(async()=>{
  calls++;
  return {ok:true,json:async()=>calls===1?gameSummary({boxscore:full}):
   gameSummary({awayScore:null,homeScore:null,boxscore:partial})};
 },{Date:ControlledDate});
 await flush();
 const firstTime=harness.get('game-freshness-details').innerHTML.match(/<b>WSH team statistics<\/b><span>ESPN summary · retrieved locally ([^<]+)/)?.[1];
 assert.ok(firstTime);
 now+=60000;
 await harness.window.NbaGamePage.refresh();
 const html=harness.get('game-freshness-details').innerHTML;
 const homeTime=html.match(/<b>WSH team statistics<\/b><span>ESPN summary · retrieved locally ([^<]+)/)?.[1];
 const awayTime=html.match(/<b>CHA team statistics<\/b><span>ESPN summary · retrieved locally ([^<]+)/)?.[1];
 assert.equal(homeTime,firstTime,'the unrefreshed team keeps its original retrieval timestamp');
 assert.notEqual(awayTime,firstTime,'the refreshed team receives the new retrieval timestamp');
 assert.match(html,/Last complete ESPN box score · retrieved locally/);
 assert.match(html,/Latest summary had incomplete player coverage/);
 assert.match(harness.get('game-box-groups').innerHTML,/Home Player/,'previously verified player rows remain visible');
 now+=61000;
 await harness.window.NbaGamePage.refresh();
 const staleHtml=harness.get('game-freshness-details').innerHTML;
 assert.match(staleHtml,/>Score \/ game status · STALE<\/b>/,'partial responses do not make an old score look fresh');
 assert.match(staleHtml,/>WSH team statistics · STALE<\/b>/,'each team retains and ages its own observation');
 assert.match(staleHtml,/STALE SECTION DATA/);
 assert.doesNotMatch(staleHtml,/STALE DATA: last successful ESPN summary retrieval/,'the latest summary itself was just retrieved');
});

test('missing provider timestamps and unavailable coverage are stated without invented observation times',async()=>{
 const harness=gamePageHarness(async()=>({ok:true,json:async()=>({
  ...gameSummary({boxscore:null}),injuries:[{status:'OUT'}],
  leaders:[{team:{logos:[{lastUpdated:'2024-06-25T21:17Z'}]}}]
 })}));
 await flush();
 const details=harness.get('game-freshness-details').innerHTML;
 assert.match(details,/Game-data observation time/);
 assert.match(details,/Not supplied for scores or statistics/);
 assert.match(details,/Official injury designations are not displayed/);
 assert.match(details,/Player box score not supplied in the latest summary/);
 assert.match(details,/Latest summary did not supply team statistics for CHA, WSH/);
 assert.match(details,/Venue not supplied by ESPN/);
 assert.match(harness.get('game-updated').textContent,/last checked locally 20/);
 assert.doesNotMatch(details,/Game-data observation time[^<]*20/);
 assert.doesNotMatch(details,/2024-06-25/,'logo asset timestamps are not game observations');
});

test('failed refresh identifies old game data as stale and schedules a bounded retry',async()=>{
 let now=Date.now(),calls=0,scheduledDelay=null;
 class ControlledDate extends Date{
  constructor(...args){super(...(args.length?args:[now]))}
  static now(){return now}
 }
 const harness=gamePageHarness(async()=>{
  calls++;
  if(calls===1)return {ok:true,json:async()=>gameSummary()};
  throw Error('HTTP 503');
 },{Date:ControlledDate,setTimeout:(callback,delay)=>{scheduledDelay=delay;return 7},clearTimeout:()=>{}});
 await flush();
 now+=121000;
 await harness.window.NbaGamePage.refresh();
 const details=harness.get('game-freshness-details').innerHTML;
 assert.match(details,/STALE DATA/);
 assert.match(details,/Latest refresh failed: HTTP 503/);
 assert.match(details,/currentness is unverified/);
 assert.equal(scheduledDelay,10000);
 assert.equal(harness.get('game-score').textContent,'57 : 51');
});
