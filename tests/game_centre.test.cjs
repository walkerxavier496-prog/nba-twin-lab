'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const root=path.join(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
function node(id){
 return {id,innerHTML:'',textContent:'',hidden:false,tabIndex:0,className:'',attributes:{},
  setAttribute(k,v){this.attributes[k]=v},addEventListener(){},focus(){}};
}
test('grouped header, live game links and four game centre tabs exist',()=>{
 for(const file of ['index.html','challenge/daily.html','game/index.html','league/index.html']){
  const html=read(file);
  assert.match(html,/assets\/site-nav\.js/,file+' missing grouped header');
  assert.match(html,/assets\/nav-v15\.css/);
 }
 const nav=read('assets/site-nav.js');
 for(const name of ["link('LIVE'","link('PREDICT'","link('PLAYERS'","link('TEAMS'"])assert.ok(nav.includes(name));
 assert.match(read('assets/live-desk.js'),/OPEN GAME CENTRE/);
 assert.match(read('assets/home.js'),/\.\/game\/\?id=/);
 const html=read('game/index.html');
 for(const id of ['game-score','game-clock','game-periods','game-leaders','game-box-groups','game-play-list','game-team-stats','game-forecast']){
  assert.match(html,new RegExp('id="'+id+'"'));
 }
 for(const label of ['BOX SCORE','PLAY-BY-PLAY','TEAM STATS','THE MACHINE'])assert.ok(html.includes(label));
});
test('game centre parses ESPN actual score and switches accessible tabs',async()=>{
 const raw={header:{id:'401909277',competitions:[{id:'401909277',date:'2026-10-30T23:00:00Z',
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
 assert.match(get('game-team-stats').innerHTML,/FIELD GOAL %/);
 window.NbaGamePage.activate('plays');
 assert.equal(get('pane-box').hidden,true);
 assert.equal(get('pane-plays').hidden,false);
 assert.equal(get('tab-plays').attributes['aria-selected'],'true');
 assert.match(get('game-play-list').innerHTML,/Brandon Miller makes three point jumper/);
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
