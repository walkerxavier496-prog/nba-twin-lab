'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
function boot(){
 const window={TwinTeamPrefs:{get:()=>'',canonical:x=>x,names:{}},NbaMedia:{image:t=>'<i>'+t+'</i>'}};
 vm.runInNewContext(read('league/cup-2026.js'),{window,Intl,Date});
 return window;
}
test('NBA Cup 2026 official draw includes six unique groups of five and exactly seven Cup nights',()=>{
 const c=boot().TwinCup2026;
 assert.equal(Object.keys(c.groups).length,6);assert.equal(c.nights.length,7);
 const all=Object.values(c.groups).flat();assert.equal(all.length,30);assert.equal(new Set(all).size,30);
 assert.deepEqual([...c.groups['West B']],['OKC','MIN','LAC','NO','MEM']);
 assert.deepEqual([...c.groups['East C']],['BOS','ATL','CHA','CHI','WSH']);
 assert.equal(c.usDate('2026-10-31T01:00:00Z'),'2026-10-30');
});
test('Cup classification uses verified Cup nights and same-group opponents, not all regular games',()=>{
 const c=boot().TwinCup2026;
 const sample={id:'A',date:'2026-10-31T00:00:00Z',season:2027,status:'final',homeScore:110,awayScore:99,
  home:{abbr:'WSH'},away:{abbr:'CHA'}};
 assert.equal(c.isCupGame(sample),true);
 assert.equal(c.isCupGame({...sample,date:'2026-11-01T00:00:00Z'}),false);
 assert.equal(c.isCupGame({...sample,away:{abbr:'LAL'}}),false);
 const group=c.calculate([sample]).groups['East C'];
 assert.equal(group.find(r=>r.team==='WSH').w,1);
 assert.equal(group.find(r=>r.team==='CHA').l,1);
 assert.equal(group.find(r=>r.team==='WSH').remaining,3);
 assert.equal(group.find(r=>r.team==='WSH').rawPd,11);
 assert.equal(c.calculate([sample]).officialTiebreaksResolved,false);
});
test('Cup group fixtures are real and unverified bracket seeds are never fabricated',()=>{
 const w=boot(),data=JSON.parse(read('data/games.json'));
 const cup=w.TwinCup2026.calculate(data.games);
 assert.equal(cup.games.length,60,'2026 source data includes 60 scheduled Cup group games');
 assert.equal(Object.values(cup.groups).reduce((sum,g)=>sum+g.length,0),30);
 assert.ok(cup.confirmedFinals>=0&&cup.confirmedFinals<=60);
 const html=read('league/index.html');
 for(const id of ['cup-groups-grid','cup-wildcard-panels','cup-bracket-grid','league-east','league-west','league-team-search'])
  assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(html,/TO BE CONFIRMED/);
 assert.match(html,/Overtime scores are excluded/);
 assert.match(html,/assets\/sortable-tables\.js/);
});
test('season records reconcile games, split wins, last10, PF/PA and have 30 teams',()=>{
 const w=boot();
 const nodes=new Map(),get=id=>{
  if(!nodes.has(id))nodes.set(id,{innerHTML:'',textContent:'',value:'',addEventListener(){},setAttribute(){}});
  return nodes.get(id);
 };
 const document={readyState:'complete',getElementById:get,addEventListener(){},querySelectorAll:()=>[]};
 const data=JSON.parse(read('data/games.json')),fetch=async()=>({ok:true,json:async()=>data});
 vm.runInNewContext(read('league/standings.js'),{window:w,document,fetch,Intl,Date,Promise,console});
 const r=w.NbaStandings.records(data),all=[...r.east,...r.west];
 assert.equal(r.season,2027);assert.equal(all.length,30);assert.ok(r.completed>0);
 assert.equal(all.reduce((sum,t)=>sum+t.w,0),r.completed);
 assert.equal(all.reduce((sum,t)=>sum+t.l,0),r.completed);
 assert.equal(all.reduce((sum,t)=>sum+t.homeW+t.homeL,0),r.completed);
 assert.equal(all.reduce((sum,t)=>sum+t.awayW+t.awayL,0),r.completed);
 assert.ok(all.every(t=>t.last10.length<=10));
 assert.ok(all.filter(t=>t.played).every(t=>Number.isFinite(t.ppg)&&Number.isFinite(t.oppg)));
});
test('shared sorting is stable, accessible, places unavailable values last and protects pregame forecasts',()=>{
 const window={};
 const document={readyState:'loading',addEventListener(){}};
 vm.runInNewContext(read('assets/sortable-tables.js'),{window,document});
 const sort=window.TwinSort;
 assert.deepEqual(sort.sortData([{n:'A',v:12},{n:'B',v:4},{n:'C',v:null}], 'v',true).map(x=>x.n),['A','B','C']);
 assert.deepEqual(sort.sortData([{n:'A',v:12},{n:'B',v:4},{n:'C',v:null}], 'v',false).map(x=>x.n),['B','A','C']);
 assert.equal(sort.keyOf(' +7.5%'),7.5);
 assert.equal(sort.keyOf('—'),null);
 for(const p of ['index.html','challenge/daily.html','challenge/index.html','league/index.html'])
  assert.match(read(p),/assets\/sortable-tables\.js/);
 assert.doesNotMatch(read('league/standings.js'),/writeFile|updateForecast|locked_at_utc\s*=/);
});
