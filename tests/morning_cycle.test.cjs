'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const A = require('../scripts/audit-core.cjs');
const M = require('../scripts/morning_cycle.cjs');
const fixture = () => A.withIntegrity({locked_at_utc:'old',locked_at_melbourne:'old',scope:{melbourne_date:'2026-11-04',games:1,first_tip_utc:'2026-11-04T01:00:00Z'},forecasts:[{game_id:'123',tip_utc:'2026-11-04T01:00:00Z',home:{abbr:'BOS'},away:{abbr:'NYK'},primary_forecast:{home_win_probability:.7}}]});
test('06:00 Melbourne gate follows DST, including transition dates',()=>{
 for(const [before,after] of [['2026-06-01T19:59:59Z','2026-06-01T20:00:00Z'],['2026-11-03T18:59:59Z','2026-11-03T19:00:00Z'],['2026-04-04T19:59:59Z','2026-04-04T20:00:00Z'],['2026-10-03T18:59:59Z','2026-10-03T19:00:00Z']]) {
  assert.equal(M.morningDue(Date.parse(before)),false); assert.equal(M.morningDue(Date.parse(after)),true);
 }
});
test('initial snapshot is exclusive, never a lock, and late/posttip runs cannot fabricate history',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'morning-'));
 try {
  const now=Date.parse('2026-11-03T19:17:00Z'); let calls=0;
  const build=()=>{calls++;return fixture();};
  assert.equal(M.publishMorning({root,now:now-3600000,build}).status,'not_due');
  const first=M.publishMorning({root,now,build});
  assert.equal(first.status,'published'); const bytes=fs.readFileSync(first.file,'utf8');
  const value=JSON.parse(bytes); assert.equal(value.phase,'initial'); assert.equal(value.locked_at_utc,undefined); assert.equal(value.published_at_utc,new Date(now).toISOString()); assert.ok(A.verifyIntegrity(value));
  assert.equal(M.publishMorning({root,now:now+60000,build}).status,'existing'); assert.equal(calls,1); assert.equal(fs.readFileSync(first.file,'utf8'),bytes);
  assert.throws(()=>M.toInitial(fixture(),Date.parse('2026-11-04T01:00:00Z')),/tip/i);
 } finally {fs.rmSync(root,{recursive:true,force:true});}
});
test('critique is deterministic, separate by phase, reports pending coverage and small samples',()=>{
 const snap=M.toInitial(fixture(),Date.parse('2026-11-03T19:00:00Z'));
 const game={game_id:'123',models:{production_elo_v7:{p:.7,actual:1,score_mae_per_team:4}}};
 const report=M.critique(snap,[game],'initial');
 assert.deepEqual(report,M.critique(snap,[game],'initial')); assert.equal(report.status,'complete');
 assert.equal(report.models.production_elo_v7.count,1); assert.ok(Math.abs(report.models.production_elo_v7.brier-.09)<1e-12);
 assert.equal(report.models.production_elo_v7.calibration[0].count,1);
 assert.match(report.notes.join(' '),/sample/i); assert.equal(report.findings.length,1); assert.equal(report.findings[0].matchup,'NYK @ BOS'); assert.equal(M.critique(snap,[],'initial').pending_games,1);
 assert.throws(()=>M.critique(snap,[game,game],'initial'),/duplicate/i);
});

function finalPayload() {
 return {header:{competitions:[{id:'123',status:{type:{completed:true}},competitors:[
  {homeAway:'home',score:'110',team:{abbreviation:'BOS'}},{homeAway:'away',score:'100',team:{abbreviation:'NYK'}}]}]},
  boxscore:{players:['BOS','NYK'].map(team=>({team:{abbreviation:team},statistics:[{labels:['MIN','PTS','3PT','REB','AST'],athletes:Array.from({length:5},(_,i)=>({athlete:{id:`${team}${i}`,displayName:`Player ${team} ${i}`},stats:['20','10','1-2','4','3']}))}]}))}};
}
test('verified finals append once; live, incomplete, wrong-team and provider failures stay pending',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'morning-final-'));
 try {
  const {file}=M.publishMorning({root,now:Date.parse('2026-11-03T19:00:00Z'),build:fixture});
  const now=Date.parse('2026-11-04T06:00:00Z');
  for(const change of [raw=>raw.header.competitions[0].status.type.completed=false,raw=>raw.boxscore.players.pop(),raw=>raw.header.competitions[0].competitors[0].team.abbreviation='LAL']) {
   const raw=finalPayload();change(raw);const pending=await M.reviewMorning(file,now,{fetcher:async()=>({ok:true,json:async()=>raw})});assert.equal(pending.length,1);
  }
  assert.equal((await M.reviewMorning(file,now,{fetcher:async()=>{throw Error('offline');}})).length,1);
  await M.reviewMorning(file,now,{fetcher:async()=>({ok:true,json:async()=>finalPayload()})});
  let calls=0;await M.reviewMorning(file,now+1000,{fetcher:async()=>{calls++;throw Error('must not fetch');}});assert.equal(calls,0);
  M.verify(root); const reviews=M.verifiedReviews(file,JSON.parse(fs.readFileSync(file)));assert.equal(reviews.length,1);
  const target=path.join(path.dirname(file),'games','123.review.json'),review=JSON.parse(fs.readFileSync(target));review.games[0].models.production_elo_v7.p=.9;
  fs.writeFileSync(target,JSON.stringify(A.withIntegrity(review)));assert.throws(()=>M.verify(root),/grade mismatch/);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('missing or stale inputs retry without claiming an empty or completed slate',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'morning-missing-'));
 try {
  const now=Date.parse('2026-11-03T19:00:00Z');
  const result=await M.run({root,now,build:()=>{throw Error('No validated NBA games discovered');}});
  assert.equal(result.publication.status,'unavailable');assert.deepEqual(result.days,[]);
  assert.equal(M.publishMorning({root,now,build:fixture}).status,'published');
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('forecast construction or prior result fetches crossing tipoff cannot backdate an initial publication',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'morning-clock-'));
 try {
  const startup=Date.parse('2026-11-03T19:00:00Z'),afterTip=Date.parse('2026-11-04T01:00:01Z');
  assert.throws(()=>M.publishMorning({root,now:startup,build:fixture,clock:()=>afterTip}),/tip/i);
  const result=await M.run({root,now:startup,build:fixture,clock:()=>afterTip});
  assert.equal(result.publication.status,'unavailable');assert.deepEqual(result.days,[]);
  assert.equal(fs.existsSync(path.join(root,'audit/morning/2026-11-04/initial.json')),false);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
