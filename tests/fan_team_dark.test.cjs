'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const main=['index.html','predict/index.html','challenge/daily.html','challenge/index.html','audit/index.html','team-intelligence/index.html','twins/index.html','player-stats/index.html','history/index.html','research/index.html','models/index.html'];
test('all 11 website routes use the same accessible dark team-personalised theme',()=>{
 const theme=read('assets/dark-v13.css');
 assert.match(theme,/color-scheme:dark/);
 assert.match(theme,/--fan-accent/);
 assert.match(theme,/\.fan-picker/);
 assert.match(theme,/\.twin-faceoff/);
 assert.match(theme,/\.controls-fan/);
 assert.match(theme,/@media\(max-width:560px\)/);
 for(const p of main){
  const html=read(p);
  assert.match(html,/assets\/dark-v13\.css/,p+' missing dark theme');
  assert.match(html,/assets\/team-prefs\.js/,p+' missing persistent team picker');
  assert.match(html,/name="viewport"/);
 }
});
test('player twins only resolves IDs verified from the existing current-season NBA snapshot',()=>{
 const window={};
 vm.runInNewContext(read('assets/current-players.js'),{window});
 const map=window.TwinCurrentPlayers;
 assert.equal(map.count,350);
 assert.equal(map.asOf,'2026-10-30');
 assert.equal(map.lookup('Kevin Durant').id,'201142');
 assert.equal(map.lookup('Jayson Tatum').id,'1628369');
 assert.equal(map.lookup('LeBron James')?.id,'2544');
 assert.equal(map.lookup('Some historical player not in snapshot'),null);
 const html=read('twins/index.html');
 assert.match(html,/assets\/current-players\.js/);
 assert.match(html,/assets\/team-media\.js/);
 assert.match(html,/twin-faceoff/);
 assert.match(html,/headshot\(x.player,"small"\)/);
 assert.match(html,/No verified current player photo/);
});
test('team intelligence has independent favourite, opponent and venue controls',()=>{
 const html=read('team-intelligence/index.html');
 const app=read('team-intelligence/app.js');
 for(const id of ['my-team','opponent','fixture','venue-home','venue-away','home','away','matchup-identity','matchup-context']){
  assert.match(html,new RegExp('id="'+id+'"'));
 }
 assert.match(app,/prefs\?\.set\?\./);
 assert.match(app,/twinlab:teamchange/);
 assert.match(app,/fixtureChoices/);
 assert.match(app,/venue-'\+side/);
 assert.doesNotMatch(app,/BOS'\)\?'BOS'/);
 assert.doesNotThrow(()=>new vm.Script(app));
});
test('team preference canonicalises abbreviations and has a neutral fallback',()=>{
 const rootStyle={values:{},setProperty(k,v){this.values[k]=v}},events={},select={value:'',listeners:{},append(){},addEventListener(name,cb){this.listeners[name]=cb}};
 const label={textContent:''},header={children:[],append(el){this.children.push(el)},querySelector:()=>null};
 const document={readyState:'complete',documentElement:{style:rootStyle,dataset:{}},querySelector:q=>q==='.app-header .header-inner'?header:null,
  getElementById:id=>id==='fan-team-picker'?select:id==='fan-team-label'?label:null,
  createElement:tag=>({tag,children:[],setAttribute(){},addEventListener(){},append(...nodes){this.children.push(...nodes)},value:'',textContent:'',className:''}),
  dispatchEvent:e=>{events[e.type]=e.detail}};
 const storage={v:{},getItem:k=>storage.v[k]||null,setItem(k,v){storage.v[k]=v},removeItem(k){delete storage.v[k]}};
 const win={};
 class CustomEvent {constructor(type,options){this.type=type;this.detail=options.detail}}
 vm.runInNewContext(read('assets/team-prefs.js'),{window:win,document,localStorage:storage,CustomEvent});
 assert.equal(win.TwinTeamPrefs.set('LAL'),'LAL');
 assert.match(rootStyle.values['--fan-accent'],/^#/);
 assert.equal(storage.v['nba-twin-lab:my-team:v1'],'LAL');
 assert.equal(win.TwinTeamPrefs.set('GSW'),'GS');
 assert.equal(win.TwinTeamPrefs.set('NOT-A-TEAM'),'');
 assert.equal(storage.v['nba-twin-lab:my-team:v1'],undefined);
});

test('favourite controls compare actual upcoming venue and arbitrary manual opponents',async()=>{
 const snap=JSON.parse(read('data/v7-current.json'));
 const el=new Map(),get=id=>{
  if(!el.has(id))el.set(id,{id,value:'',innerHTML:'',textContent:'',disabled:false,handlers:{},attrs:{},
   classList:{add(){}},addEventListener(k,cb){this.handlers[k]=cb},setAttribute(k,v){this.attrs[k]=v}});
  return el.get(id);
 };
 const document={getElementById:get,addEventListener(){}};
 let stored='LAL';
 const window={
  TwinTeamPrefs:{get:()=>stored,set:t=>{stored=t},names:{LAL:'Los Angeles Lakers',BOS:'Boston Celtics'}},
  NbaMedia:{image:t=>'<i>'+t+'</i>'},
  TwinScience:{blended:(t,k)=>t?.season?.[k]??t?.prior?.[k]??null,
   net:()=>1,matchup:()=>({shooting:.54,threePointStyle:.12,turnovers:-.04,rebounding:.25,freeThrows:.15})}
 };
 const d=new Date(Date.now()+48*3600000).toISOString();
 const games=[{id:'lakers',status:'scheduled',date:d,season:2027,home:{abbr:'GS'},away:{abbr:'LAL'}},
  {id:'celtics',status:'scheduled',date:d,season:2027,home:{abbr:'BOS'},away:{abbr:'CHI'}}];
 const fetch=async url=>({ok:true,json:async()=>url.includes('v7-current')?snap:{games}});
 vm.runInNewContext(read('team-intelligence/app.js'),{window,document,fetch,Date,Intl,Promise,console});
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(get('my-team').value,'LAL');
 assert.equal(get('opponent').value,'GSW');
 assert.equal(get('fixture').value,'lakers');
 assert.equal(get('home').value,'GSW');
 assert.equal(get('away').value,'LAL');
 assert.match(get('metrics').innerHTML,/Adjusted offensive rating/);
 get('venue-home').handlers.click();
 assert.equal(get('fixture').value,'');
 assert.equal(get('home').value,'LAL');
 assert.equal(get('away').value,'GSW');
 get('venue-away').handlers.click();
 assert.equal(get('home').value,'GSW');
 assert.equal(get('away').value,'LAL');
 get('my-team').value='BOS';get('my-team').handlers.change();
 assert.equal(stored,'BOS');
 assert.equal(get('fixture').value,'celtics');
 assert.equal(get('home').value,'BOS');
 assert.equal(get('away').value,'CHI');
});
