'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
function adapter(){
 const window={};vm.runInNewContext(read('assets/live-scoreboard.js'),{window,URL,Intl,Date,Number,Object});
 return window.NbaScores;
}
const sample=(kind='live')=>{
 const type=kind==='live'?{state:'in',name:'STATUS_IN_PROGRESS',shortDetail:'Q2 8:12'}:
    kind==='final'?{state:'post',completed:true,name:'STATUS_FINAL',shortDetail:'Final'}:{state:'pre',name:'STATUS_SCHEDULED'};
 return {events:[{id:'401909277',date:'2026-10-30T23:00:00Z',status:{type,period:2,displayClock:'8:12'},
 competitions:[{competitors:[
 {homeAway:'home',score:'42',team:{abbreviation:'WSH',displayName:'Washington Wizards'}},
 {homeAway:'away',score:'47',team:{abbreviation:'CHA',displayName:'Charlotte Hornets'}}
 ]}]}]};
};
test('ESPN live scoreboard adapter distinguishes scheduled, in-game, and final results',()=>{
 const scores=adapter();
 const scheduled=scores.parse(sample('scheduled'))[0],live=scores.parse(sample('live'))[0],final=scores.parse(sample('final'))[0];
 assert.equal(scheduled.phase,'scheduled');assert.equal(scheduled.home.score,null);assert.equal(scheduled.away.score,null);
 assert.equal(live.phase,'live');assert.equal(live.away.score,47);assert.equal(live.home.score,42);
 assert.match(scores.label(live),/Q2/);assert.match(scores.label(live),/8:12/);
 assert.equal(final.phase,'final');assert.equal(scores.label(final),'FINAL');
 assert.equal(scores.usDate('2026-10-30T23:00:00Z'),'20261030');
 assert.throws(()=>scores.parse({}),/events array/);
});
test('fresh ESPN score is never guessed and requires a valid provider response',async()=>{
 const scores=adapter();
 const data=await scores.fetchDate('20261030',{fetchImpl:async (url,opts)=>{
  assert.match(url,/dates=20261030/);assert.equal(opts.cache,'no-store');
  return {ok:true,json:async()=>sample('live')};
 }});
 assert.equal(data.games[0].away.score,47);
 assert.match(data.source,/ESPN/);
 await assert.rejects(()=>scores.fetchDate('20261030',{fetchImpl:async()=>({ok:false,status:503})}),/HTTP 503/);
 await assert.rejects(()=>scores.fetchDate('20261030',{fetchImpl:async()=>({ok:true,json:async()=>({noEvents:true})})}),/events array/);
});
test('Melbourne game day merges the adjacent ESPN US dates and excludes the next local day',async()=>{
 const scores=adapter(),requested=[];
 const event=(id,date,kind)=>{const fixture=sample(kind);fixture.events[0].id=id;fixture.events[0].date=date;return fixture.events[0]};
 const payloads={
  20261030:{events:[event('401909277','2026-10-30T23:00:00Z','final')]},
  20261031:{events:[
   event('401909288','2026-10-31T10:00:00Z','scheduled'),
   event('401909896','2026-10-31T19:00:00Z','scheduled')
  ]}
 };
 const feed=await scores.fetchMelbourneDate('20261031',{fetchImpl:async url=>{
  const key=new URL(url).searchParams.get('dates');requested.push(key);
  return {ok:true,json:async()=>payloads[key]};
 }});
 assert.deepEqual(requested,['20261030','20261031']);
 assert.equal(scores.melbourneDate('2026-10-30T23:00:00Z'),'20261031');
 assert.equal(scores.melbourneDate('2026-10-31T19:00:00Z'),'20261101');
 assert.equal(scores.shiftDateKey('20261031',-1),'20261030');
 assert.deepEqual(Array.from(feed.games,g=>g.id),['401909277','401909288']);
 assert.equal(feed.games[0].phase,'final','Prior US date final must remain visible on the Melbourne day');
 assert.equal(feed.games[1].phase,'scheduled','Same-day upcoming game remains visible when its Melbourne tip date matches');
 assert.deepEqual(Array.from(feed.espn_dates),['20261030','20261031']);
 assert.equal(feed.partial,false);
});
test('Melbourne scoreboard fails closed only when both ESPN date buckets fail',async()=>{
 const scores=adapter();
 const partial=await scores.fetchMelbourneDate('20261031',{fetchImpl:async url=>{
  const key=new URL(url).searchParams.get('dates');
  if(key==='20261031')return {ok:false,status:503};
  return {ok:true,json:async()=>sample('final')};
 }});
 assert.equal(partial.games.length,1);assert.equal(partial.partial,true);
 await assert.rejects(()=>scores.fetchMelbourneDate('20261031',{fetchImpl:async()=>({ok:false,status:503})}),/Melbourne scoreboard unavailable/);
});
test('homepage shows genuine sourced score separately from frozen pregame predictions',async()=>{
 const scores=adapter();
 const ledger=JSON.parse(read('data/audit-ledger.json'));
 const entry=ledger.entries.find(e=>e.melbourne_date==='2026-10-31');
 assert.ok(entry);
 ledger.entries=[entry];
 const original=JSON.parse(read(entry.lock_path));
 const sidecar=JSON.parse(read('audit/supplements/2026-10-31/challenge.lock.json'));
 assert.equal(sidecar.original_forecast_sha256,entry.lock_sha256);
 const elements=new Map(),get=id=>{
  if(!elements.has(id))elements.set(id,{textContent:'',innerHTML:''});
  return elements.get(id);
 };
 const document={getElementById:get};
 let latestFeed=null;
 const liveResult={date:'20261031',melbourne_date:'20261031',games:scores.parse(sample('live')),fetched_at_utc:'2026-10-31T00:02:00Z',espn_dates:['20261030','20261031']};
 const window={NbaLiveDesk:{setFeed:v=>{latestFeed=v},unavailable:()=>{}},NbaScores:{...scores,melbourneDate:()=> '20261031',fetchDate:async()=>liveResult,fetchMelbourneDate:async()=>liveResult}};
 const payloads={'./data/audit-ledger.json':ledger,
  './data/five-model-report.json':{common_evaluation:{games:3643}},
  ['./'+entry.lock_path]:original,
  './audit/supplements/2026-10-31/challenge.lock.json':sidecar};
 const fetch=async url=>({ok:!!payloads[url],json:async()=>payloads[url]});
 vm.runInNewContext(read('assets/home.js'),{window,document,fetch,Date,Intl,Promise,console,encodeURIComponent});
 await new Promise(resolve=>setImmediate(resolve));
 const card=get('home-games').innerHTML;
 assert.doesNotMatch(card,/47–42|47<\/b>|42<\/b>/,'Archived prediction cards must not pretend to be a live scoreboard');
 assert.match(card,/ELO PICK/);
 assert.match(get('scoreboard-source').textContent,/ARCHIVED PREGAME FORECASTS/);
 assert.ok(latestFeed&&latestFeed.games[0].away.score===47,'Real scores must reach the independent live desk');
 assert.match(get('feature-detail').textContent,/Archived pretip forecast/);
 assert.match(get('feature-confidence').innerHTML,/MODELS DISAGREE/);
 assert.match(get('feature-confidence').innerHTML,/25\.1 PERCENTAGE POINTS/);
 const untouched=original.forecasts.find(g=>g.game_id==='401909277');
 assert.ok(untouched);
 assert.equal(untouched.primary_forecast.winner_probability,0.7932589256865024);
});
test('daily mismatch warning exposes different techniques rather than implying consensus',()=>{
 const s=read('challenge/daily.js');
 assert.match(s,/HIGH MODEL DISAGREEMENT/);
 assert.match(s,/spanPoints>=20/);
 assert.match(s,/No pregame sidecar|high confidence when other techniques disagree this much|Do not treat the biggest percentage as the consensus/);
 assert.match(s,/scoreAdapter\.fetchDate/);
 assert.match(s,/Current ESPN scoreboard unavailable/);
});

test('predictor receives live game clock/score from separate adapter and keeps model caution visible',()=>{
 const html=read('predict/index.html'),app=read('predict/app.js');
 assert.match(html,/assets\/live-scoreboard\.js/);
 assert.match(app,/refreshLiveScores/);
 assert.match(app,/scoreState\(seen\)/);
 assert.match(app,/real-score-banner/);
 assert.match(app,/MODEL UNCERTAINTY/);
 assert.match(app,/No pregame|frozen six-model challenge/);
 assert.match(app,/RESEARCH ESTIMATE · NOT ARCHIVED/);
 assert.match(app,/not archived pregame forecasts, and are not used for official grading/);
 assert.doesNotMatch(app,/g\.status==='final'\?'ARCHIVED PREGAME'/);
 assert.match(app,/setInterval\(refreshLiveScores,60000\)/);
});
