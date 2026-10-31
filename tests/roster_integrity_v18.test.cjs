'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const R=require('../predict/roster-integrity.js');
const snapshotTime='2026-10-30T16:15:22Z',tip='2026-10-30T23:00:00Z',asOf='2026-10-30T22:00:00Z';
const players=(ids)=>ids.map((player_id,i)=>({player_id:String(player_id),name:'Player '+player_id,
  minutes_if_play:35-i*2,expected_minutes:(35-i*2)*.9,play_probability:.9}));
const snapshot=()=>({strict_no_future_data:true,built_at_utc:snapshotTime,coverage:{season:2027},
 teams:[{abbr:'CHA',rotation:players([11,12,13,14,15,16])},{abbr:'WAS',rotation:players([21,22,23,24,25,26])},
  ...Array.from({length:28},(_,i)=>({abbr:'X'+i,rotation:players([101,102,103,104,105])}))]});
const game=()=>({id:'401909277',status:'scheduled',date:tip,season:2027,home:{abbr:'WAS'},away:{abbr:'CHA'}});
const availability=()=>({schema:'nba-twin-lab-availability-v18',status:'verified',strict_no_future_data:true,
 published_at_utc:'2026-10-30T21:15:00Z',
 source:{type:'official',url:'https://nba.com/injury/official.pdf'},
 games:[{game_id:'401909277',injury_report_verified:true,teams:{
  CHA:{roster_verified:true,roster_player_ids:['11','12','13','14','15','16'],injuries:[
   {player_id:'11',status:'Out'},{player_id:'12',status:'Questionable'}]},
  WAS:{roster_verified:true,roster_player_ids:['21','22','23','24','25','26'],injuries:[]}
 }}]});
test('no official roster or injury feed means historical-only; no false verified lineup',()=>{
 const r=R.auditGame({game:game(),snapshot:snapshot(),now:asOf});
 assert.equal(r.source_checks_passed,false);
 assert.equal(r.usable_for_new_validated_forecast,false);
 assert.ok(r.issues.includes('official_availability_missing'));
 assert.ok(r.issues.includes('official_roster_unverified'));
 assert.equal(r.away.players.length,6);
});
test('official OUT is excluded and zeroed; questionable is a scenario, never assumed available',()=>{
 const r=R.auditGame({game:game(),snapshot:snapshot(),availability:availability(),now:asOf});
 const out=r.away.players.find(p=>p.player_id==='11');
 const uncertain=r.away.players.find(p=>p.player_id==='12');
 assert.equal(out.excluded,true);
 assert.equal(out.expected_minutes,0);
 assert.equal(out.max_minutes,0);
 assert.equal(uncertain.expected_minutes,null);
 assert.equal(uncertain.min_minutes,0);
 assert.equal(uncertain.max_minutes,33);
 assert.ok(!r.away.projected_leaders.some(p=>p.player_id==='11'));
 assert.ok(r.issues.includes('availability_scenario_required'));
 assert.equal(r.usable_for_new_validated_forecast,false);
});
test('verified complete pretip sources pass source checks but never self-promote probability model',()=>{
 const a=availability();
 a.games[0].teams.CHA.injuries=[{player_id:'11',status:'OUT'}];
 const r=R.auditGame({game:game(),snapshot:snapshot(),availability:a,now:asOf});
 assert.equal(r.source_checks_passed,true);
 assert.equal(r.usable_for_new_validated_forecast,false);
 assert.equal(r.away.excluded_players.length,1);
});
test('unverified roster, wrong game and timestamps fail closed',()=>{
 const base={game:game(),snapshot:snapshot(),availability:availability(),now:asOf};
 assert.ok(R.auditGame({...base,availability:{...base.availability,published_at_utc:'2026-10-30T23:01:00Z'}}).issues.includes('invalid_injury_cutoff'));
 assert.ok(R.auditGame({...base,availability:{...base.availability,games:[]}}).issues.includes('game_injury_report_unverified'));
 assert.ok(R.auditGame({...base,snapshot:{...base.snapshot,built_at_utc:'2026-10-31T12:00:00Z'}}).issues.includes('invalid_snapshot_cutoff'));
 assert.ok(R.auditGame({...base,now:'2026-11-02T22:00:00Z'}).issues.includes('stale_team_snapshot'));
 assert.ok(R.auditGame({...base,snapshot:{...base.snapshot,coverage:{season:2026}}}).issues.includes('season_mismatch'));
});
test('stale roster player IDs excluded from projected leaders when official roster contradicts inference',()=>{
 const a=availability();
 a.games[0].teams.CHA.roster_player_ids=['12','13','14','15','16','17'];
 a.games[0].teams.CHA.injuries=[];
 const r=R.auditGame({game:game(),snapshot:snapshot(),availability:a,now:asOf});
 assert.equal(r.away.players.find(p=>p.player_id==='11').status,'NOT_ON_ROSTER');
 assert.equal(r.away.players.find(p=>p.player_id==='11').expected_minutes,0);
 assert.ok(r.issues.includes('inferred_player_not_on_verified_roster'));
});
test('invalid duplicate injury designations fail closed',()=>{
 const a=availability();
 a.games[0].teams.CHA.injuries.push({player_id:'11',status:'Available'});
 const r=R.auditGame({game:game(),snapshot:snapshot(),availability:a,now:asOf});
 assert.ok(r.issues.includes('invalid_injury_entry'));
});
test('v18 frontend must display roster gate without rewriting original 31 October forecast',()=>{
 const src=fs.readFileSync(path.join(__dirname,'../predict/index.html'),'utf8');
 const app=fs.readFileSync(path.join(__dirname,'../predict/app.js'),'utf8');
 assert.ok(src.includes('roster-integrity.js'));
 assert.match(app,/rosterIntegrityPanel/);
 assert.match(app,/HISTORICAL TEAM PROBABILITY/);
 const locked=JSON.parse(fs.readFileSync(path.join(__dirname,'../practice/2026-10-31-melbourne/forecast.lock.json')));
 assert.equal(locked.scope.games,10);
 assert.equal(locked.forecasts[0].primary_forecast.winner,'CHA');
 const nextTracker=fs.readFileSync(path.join(__dirname,'../scripts/daily_tracker.cjs'),'utf8');
 assert.ok(nextTracker.includes('v18_roster_integrity: rosterIntegrity'));
 assert.ok(nextTracker.includes('RI.auditGame({game,snapshot,availability:officialAvailability,now})'));
 const feed=JSON.parse(fs.readFileSync(path.join(__dirname,'../data/availability-current.json')));
 assert.equal(feed.status,'unavailable','Do not fabricate a verified official live injury feed');
});
