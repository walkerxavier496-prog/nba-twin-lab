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
test('homepage shows genuine sourced score separately from frozen pregame predictions',async()=>{
 const scores=adapter();
 const ledger=JSON.parse(read('data/audit-ledger.json'));
 const entry=ledger.entries.find(e=>e.melbourne_date==='2026-10-31');
 assert.ok(entry);
 ledger.entries=[entry];
 const original=JSON.parse(read(entry.lock_path));
 const elements=new Map(),get=id=>{
  if(!elements.has(id))elements.set(id,{textContent:'',innerHTML:''});
  return elements.get(id);
 };
 const document={getElementById:get};
 const window={NbaScores:{...scores,fetchDate:async()=>({date:'20261030',games:scores.parse(sample('live')),fetched_at_utc:'2026-10-31T00:02:00Z'})}};
 const payloads={'./data/audit-ledger.json':ledger,
  './data/five-model-report.json':{common_evaluation:{games:3643}},
  ['./'+entry.lock_path]:original};
 const fetch=async url=>({ok:!!payloads[url],json:async()=>payloads[url]});
 vm.runInNewContext(read('assets/home.js'),{window,document,fetch,Date,Intl,Promise,console,encodeURIComponent});
 await new Promise(resolve=>setImmediate(resolve));
 const card=get('home-games').innerHTML;
 assert.match(card,/Q2/);
 assert.match(card,/47/);assert.match(card,/42/);
 assert.match(card,/ELO PICK/);
 assert.match(get('scoreboard-source').textContent,/ESPN game scores/);
 assert.match(get('feature-detail').textContent,/NOT A PREDICTION/);
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
 assert.match(s,/ESPN score feed unavailable/);
});
