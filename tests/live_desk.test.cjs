'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const build=()=>{
 const doc={getElementById:()=>null,querySelectorAll:()=>[],addEventListener(){}};
 const win={};
 vm.runInNewContext(read('assets/live-desk.js'),{window:win,document:doc,Date,Intl,Promise,fetch:async()=>({ok:false,status:503}),encodeURIComponent,Notification:undefined});
 return win.NbaLiveDesk;
};
test('Live Games and Player Stats are the first section on desktop and phone',()=>{
 for(const page of ['index.html','challenge/daily.html']){
  const html=read(page);
  assert.ok(html.indexOf('id="live-games"')>=0);
  assert.ok(html.indexOf('id="live-games"')<html.indexOf('class="hero-grid"')||html.indexOf('id="live-games"')<html.indexOf('class="page-hero"'),page+' live desk hidden below model widgets');
  for(const id of ['live-game-list','live-player-stats','live-stats-rows','live-alerts-toggle','live-plays','live-alert-feed','live-sort']){
   assert.match(html,new RegExp('id="'+id+'"'),page+' missing '+id);
  }
  assert.match(html,/assets\/live-desk\.js/);
  assert.match(html,/assets\/live-desk\.css/);
 }
 const nav=read('assets/site-shell.js');
 assert.match(nav,/\["Live","#live-games"/);
 assert.match(nav,/\["Players","#live-player-stats"/);
 assert.match(read('assets/live-desk.css'),/@media\(max-width:590px\)/);
});
test('ESPN boxscore maps genuine NBA game statistics instead of player predictions',()=>{
 const desk=build();
 const fixture={boxscore:{players:[
  {team:{abbreviation:'CHA'},statistics:[{labels:['MIN','FG','3PT','FT','REB','AST','PTS'],athletes:[
    {athlete:{id:'4428975',displayName:'Sample Guard'},stats:['27','8-14','3-8','1-2','6','7','20']},
    {athlete:{id:'4428976',displayName:'Unavailable Player'},didNotPlay:true,stats:['0','0-0','0-0','0-0','0','0','0']}
  ]}]}
 ]}};
 const players=desk.parseBoxscore(fixture);
 assert.equal(players.length,1);
 assert.equal(players[0].name,'Sample Guard');
 assert.equal(players[0].pts,20);
 assert.equal(players[0].reb,6);
 assert.equal(players[0].ast,7);
 assert.equal(players[0].three,3);
 assert.equal(players[0].minutes,'27');
 assert.ok(!read('assets/live-desk.js').includes('v9_player_projections'),'No model forecasts allowed in actual boxscore UI');
});
test('play alerts only classify verified play text, not a made-up highlight video',()=>{
 const desk=build();
 const plays=desk.extractPlays({plays:[
  {id:'3',text:'A player makes 27-foot three point jumper',period:{number:2},clock:{displayValue:'6:05'},homeScore:42,awayScore:47,scoringPlay:true},
  {id:'4',text:'A player misses layup',period:{number:2},clock:{displayValue:'6:02'}},
  {id:'5',text:'A player blocks another player\'s shot',period:{number:2},clock:{displayValue:'6:01'}}
 ]});
 assert.equal(plays.length,3);
 assert.equal(desk.highlight(plays[0]),'THREE POINTER');
 assert.equal(desk.highlight(plays[1]),null);
 assert.equal(desk.highlight(plays[2]),'BLOCK');
 assert.equal(desk.highlight({desc:'Thunderous dunk'}),'DUNK');
 assert.match(read('assets/live-desk.js'),/Notification\.requestPermission/);
 assert.match(read('assets/live-desk.js'),/page is open/);
 assert.doesNotMatch(read('assets/live-desk.js'),/video thumbnail|automatic push/i);
});
test('ESPN game summary fails closed on invalid IDs and failed provider replies',async()=>{
 const desk=build();
 await assert.rejects(()=>desk.fetchSummary('invalid'),/Invalid game ID/);
 await assert.rejects(()=>desk.fetchSummary('401909277',{fetchImpl:async()=>({ok:false,status:429})}),/HTTP 429/);
 const sample=await desk.fetchSummary('401909277',{fetchImpl:async()=>({ok:true,json:async()=>({boxscore:{players:[]},plays:[]})})});
 assert.equal(sample.players.length,0);
 assert.equal(sample.plays.length,0);
 assert.match(sample.source,/ESPN/);
});

test('highlight notifications fire only for newly observed qualifying plays after opt-in',async()=>{
 const els=new Map(),el=id=>{
  if(!els.has(id))els.set(id,{id,value:'',innerHTML:'',textContent:'',listeners:{},querySelectorAll:()=>[],
   addEventListener(event,handler){this.listeners[event]=handler},setAttribute(){}});
  return els.get(id);
 };
 const document={getElementById:el,querySelectorAll:()=>[],addEventListener(){}};
 const notices=[];
 class Notification{static permission='granted';constructor(title,body){notices.push({title,body})}}
 let generation=0;
 const box=()=>({boxscore:{players:[]},plays:[
  {id:'original',text:'First quarter 2 point layup',period:{number:1},clock:{displayValue:'4:00'}},
  ...(generation?[
   {id:'new-three',text:'Shooter makes 29-foot three point jumper',period:{number:2},clock:{displayValue:'6:20'}},
   {id:'new-miss',text:'Shooter misses jump shot',period:{number:2},clock:{displayValue:'6:16'}}]:[])
 ]});
 const fetch=async()=>({ok:true,json:async()=>box()});
 const window={NbaScores:{label:()=> 'Q2 · 6:20 · LIVE'},NbaMedia:{image:t=>t},TwinTeamPrefs:{get:()=>''}};
 vm.runInNewContext(read('assets/live-desk.js'),{window,document,fetch,Date,Intl,Promise,Notification,encodeURIComponent});
 const game={id:'401909277',date:'2026-10-30T23:00:00Z',phase:'live',period:2,clock:'6:20',
  away:{abbr:'CHA',score:47},home:{abbr:'WSH',score:42}};
 window.NbaLiveDesk.setFeed({games:[game],fetched_at_utc:'2026-10-31T00:00:00Z'});
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(notices.length,0,'Never notify an existing play when first opening a game');
 await el('live-alerts-toggle').listeners.click();
 generation=1;
 window.NbaLiveDesk.setFeed({games:[game],fetched_at_utc:'2026-10-31T00:01:00Z'});
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(notices.length,1,'New made three should produce exactly one notification');
 assert.match(notices[0].title,/THREE POINTER/);
 assert.match(el('live-alert-feed').innerHTML,/THREE POINTER/);
 window.NbaLiveDesk.setFeed({games:[game],fetched_at_utc:'2026-10-31T00:02:00Z'});
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(notices.length,1,'Replaying the same play must not re-alert');
});
