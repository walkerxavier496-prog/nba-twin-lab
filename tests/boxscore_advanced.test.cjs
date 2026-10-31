'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..'),read=x=>fs.readFileSync(path.join(root,x),'utf8');
function parser(){
 const window={};vm.runInNewContext(read('assets/boxscore-plus.js'),{window});
 return window.TwinBoxscorePlus;
}
const columns=['MIN','FG','3PT','FT','REB','AST','STL','BLK','TO','PTS','+/-','OREB','DREB','PF'];
const player=(name,id,pts,team)=>({athlete:{displayName:name,id},stats:['33','11-21','4-9','5-6','12','7','2','1','4',String(pts),'+9','4','8','2']});
const raw=(name,id,pts,team)=>({boxscore:{players:[{team:{abbreviation:team},statistics:[{labels:columns,athletes:[player(name,id,pts,team)]}]}]},plays:[]});
function gamePage(){
 const elements=new Map(),get=id=>{
  if(!elements.has(id))elements.set(id,{id,innerHTML:'',textContent:'',hidden:false,tabIndex:0,
   setAttribute(){},addEventListener(){},focus(){}});
  return elements.get(id);
 };
 const window={NbaMedia:{image:()=>''}};
 const document={getElementById:get,querySelectorAll:()=>[],visibilityState:'visible'};
 vm.runInNewContext(read('assets/game-page.js'),{
  window,document,location:{search:'?id=invalid'},URLSearchParams,Date,Intl,Promise,console
 });
 return window.NbaGamePage;
}
test('player statistics, DNP states and ESPN fantasy formula are complete',()=>{
 const p=parser(),rows=p.parseBoxscore(raw('Test Forward','123',31,'CHA'));
 assert.equal(rows.length,1);
 const x=rows[0];
 assert.equal(x.pts,31);assert.equal(x.fgm,11);assert.equal(x.fga,21);
 assert.equal(x.three,4);assert.equal(x.threeA,9);
 assert.equal(x.ftm,5);assert.equal(x.fta,6);
 assert.equal(x.stl,2);assert.equal(x.blk,1);assert.equal(x.tov,4);
 assert.equal(x.oreb,4);assert.equal(x.dreb,8);assert.equal(x.pf,2);
 assert.equal(x.fgPct,52.4);assert.equal(x.threePct,44.4);assert.equal(x.ftPct,83.3);
 assert.equal(x.fpts,65);
 assert.equal(x.doubleDouble,true);
 assert.equal(p.performanceTag(x),'DOUBLE-DOUBLE');
 const sparse=p.parseBoxscore({boxscore:{players:[{team:{abbreviation:'CHA'},statistics:[{labels:['PTS','REB','AST'],athletes:[{athlete:{displayName:'Incomplete'},stats:['20','7','4']}]}]}]}})[0];
 assert.equal(sparse.fpts,null,'Do not compute partial fantasy totals');
 const dnp=p.parseBoxscore({boxscore:{players:[{team:{abbreviation:'CHA'},statistics:[{labels:columns,athletes:[{...player('DNP','999',0,'CHA'),didNotPlay:true,reason:'Coach decision'}]}]}]}});
 assert.equal(dnp.length,1);
 assert.equal(dnp[0].dnp,true);
 assert.equal(dnp[0].minutes,'DNP');
 assert.equal(dnp[0].minuteValue,null);
 assert.equal(dnp[0].pts,null);
 assert.equal(dnp[0].fpts,null);
 assert.equal(dnp[0].dnpReason,'Coach decision');
 const unavailable=p.parseBoxscore({boxscore:{players:[{team:{abbreviation:'CHA'},statistics:[{labels:['PTS','REB','AST'],athletes:[{athlete:{displayName:'Stats pending'},stats:['','','']}]}]}]}})[0];
 assert.equal(unavailable.unavailable,true);
 assert.equal(unavailable.fpts,null);
});
test('player sort is numerical and missing values never outrank verified values',()=>{
 const p=parser(),rows=[{name:'A',pts:12},{name:'B',pts:34},{name:'C',pts:null}];
 assert.deepEqual(p.sort(rows,'pts').map(x=>x.name),['B','A','C']);
 assert.deepEqual(p.sort(rows,'pts',false).map(x=>x.name),['A','B','C']);
 assert.equal(p.fantasyPoints({pts:23,reb:8,ast:7}),null);
});
test('minute parsing preserves seconds and numeric box-score sorting covers every statistic',()=>{
 const p=parser(),api=gamePage();
 const timed={boxscore:{players:[{team:{abbreviation:'CHA'},statistics:[{labels:columns,athletes:[
  {...player('Twelve Fifty-Nine','1',12,'CHA'),stats:['12:59','4-8','1-3','3-4','5','6','1','0','2','12','+3','1','4','2']},
  {...player('Twelve Oh-One','2',11,'CHA'),stats:['12:01','4-8','1-3','3-4','5','6','1','0','2','11','+2','1','4','2']}
 ]}]}]}};
 const parsed=p.parseBoxscore(timed);
 assert.equal(parsed.find(x=>x.name==='Twelve Fifty-Nine').minuteValue,779);
 assert.equal(parsed.find(x=>x.name==='Twelve Oh-One').minuteValue,721);
 assert.deepEqual(Array.from(p.sort(parsed,'minuteValue'),x=>x.name),['Twelve Fifty-Nine','Twelve Oh-One']);
 const keys=Array.from(api.boxColumns,([key])=>key).filter(key=>key!=='name');
 const rows=[{name:'A'},{name:'B'},{name:'C'}];
 for(let index=0;index<keys.length;index++){
  for(const [rowIndex,row] of rows.entries())row[keys[index]]=[1,3,2][rowIndex];
  rows[2][keys[index]]=null;
  assert.deepEqual(api.orderPlayers(rows,keys[index],true).map(row=>row.name),['B','A','C'],keys[index]);
 }
 assert.deepEqual(keys,['minuteValue','pts','fgm','fga','fgPct','three','threeA','threePct','ftm','fta','ftPct',
  'oreb','dreb','reb','ast','stl','blk','tov','pf','plusMinus','fpts']);
});
test('game leaders select verified scoring, rebounding, assists, fantasy and notable lines',()=>{
 const api=gamePage();
 const roster=[
  {name:'Scorer',team:'AWY',pts:40,reb:4,ast:3,fpts:50,doubleDouble:false,tripleDouble:false},
  {name:'All-around',team:'HME',pts:24,reb:12,ast:11,fpts:64,doubleDouble:true,tripleDouble:true},
  {name:'DNP',team:'HME',pts:null,reb:null,ast:null,fpts:null,dnp:true,doubleDouble:false,tripleDouble:false},
  {name:'Unavailable',team:'AWY',pts:null,reb:null,ast:null,fpts:null,unavailable:true}
 ];
 const leaders=api.selectPerformers(roster,[{abbr:'AWY'},{abbr:'HME'}]);
 assert.equal(leaders.awayScorer.name,'Scorer');
 assert.equal(leaders.homeScorer.name,'All-around');
 assert.equal(leaders.rebounder.name,'All-around');
 assert.equal(leaders.playmaker.name,'All-around');
 assert.equal(leaders.fantasy.name,'All-around');
 assert.deepEqual(leaders.notable.map(player=>player.name),['All-around']);
});
test('all games combines independently verified ESPN game summaries',async()=>{
 const plus=parser(),els=new Map(),get=id=>{
  if(!els.has(id))els.set(id,{innerHTML:'',textContent:'',value:id==='live-sort'?'pts':'',
   addEventListener(){},setAttribute(){},querySelectorAll:()=>[]});
  return els.get(id);
 };
 const document={getElementById:get,querySelectorAll:()=>[],addEventListener(){}};
 const window={location:{pathname:'/nba-twin-lab/'},TwinBoxscorePlus:plus,
  NbaMedia:{image:t=>t.abbr},NbaScores:{label:()=> 'Q2 LIVE'},TwinTeamPrefs:{get:()=>'',canonical:x=>x}};
 const games=[
  {id:'401909277',phase:'live',date:'2026-10-30T23:00:00Z',away:{abbr:'CHA',score:50},home:{abbr:'WSH',score:40}},
  {id:'401909278',phase:'live',date:'2026-10-30T23:30:00Z',away:{abbr:'BOS',score:60},home:{abbr:'CHI',score:49}}
 ];
 const payloads={'401909277':raw('Brandon Miller','123',31,'CHA'),'401909278':raw('Jayson Tatum','456',35,'BOS')};
 const fetch=async url=>({ok:true,json:async()=>payloads[String(url).split('event=')[1]]});
 vm.runInNewContext(read('assets/live-desk.js'),{window,document,fetch,Date,Intl,Promise,encodeURIComponent});
 window.NbaLiveDesk.setFeed({games,fetched_at_utc:'2026-10-31T00:00:00Z'});
 await new Promise(resolve=>setImmediate(resolve));
 assert.match(get('live-stats-rows').innerHTML,/Brandon Miller/);
 assert.match(get('live-stats-rows').innerHTML,/Jayson Tatum/);
 assert.match(get('desk-top-performers').innerHTML,/Jayson Tatum/);
 assert.match(get('live-stats-rows').innerHTML,/desk-fpts/);
 assert.match(get('live-desk-status').textContent,/2\/2 games/);
 assert.match(get('live-game-list').innerHTML,/game\/\?id=401909278/);
});
test('game-level box score has sortable numerical headings and documented fantasy scoring',()=>{
 const script=read('assets/game-page.js');
 assert.match(script,/data-game-sort/);
 assert.match(script,/minuteValue/);
 assert.match(script,/threePct/);
 assert.match(script,/formatNumber\(p\.fpts\)/);
 assert.match(read('game/index.html'),/boxscore-plus\.js\?v24_1/);
 assert.match(read('game/index.html'),/2 FGM/);
 assert.match(read('game/index.html'),/4 BLK/);
 for(const p of ['index.html','challenge/daily.html'])assert.match(read(p),/data-stat-sort="fpts"/);
});
