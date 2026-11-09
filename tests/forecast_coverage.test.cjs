'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const A=require('../scripts/audit-core.cjs');
const {examineDay,runAudit,parseArgs}=require('../scripts/forecast_coverage.cjs');
const date='2026-11-05',tip='2026-11-05T00:00:00.000Z',game=id=>({id,date:tip,season:2027,status:'final'});
const lock=(ids=['1'],at='2026-11-04T21:00:00Z')=>A.withIntegrity({schema:'nba-twin-lab-daily-forecast-v2',scope:{melbourne_date:date},
 locked_at_utc:at,forecasts:ids.map(game_id=>({game_id,tip_utc:tip}))});
const check=(games,locks,now='2026-11-05T01:00:00Z')=>examineDay({date,games,locks,nowMs:Date.parse(now)});
test('a valid pretip lock covers only its original game IDs',()=>{
 const x=check([game('1'),game('2')],[lock(['1'])]);
 assert.equal(x.known_games,2);assert.equal(x.locked_games,1);
 assert.deepEqual(x.missed_after_tip_ids,['2']);assert.deepEqual(x.unforecasted_game_ids,['2']);
 assert.equal(x.status,'missed');
});
test('a genuinely missed final remains unforecasted, never guessed',()=>{
 const x=check([game('1'),game('2')],[]);
 assert.equal(x.locked_games,0);assert.deepEqual(x.missed_after_tip_ids,['1','2']);
});
test('future fixtures are pending, not falsely classified as missed',()=>{
 const x=check([game('1')],[],'2026-11-04T22:00:00Z');
 assert.equal(x.status,'pending');assert.deepEqual(x.missed_after_tip_ids,[]);
 assert.deepEqual(x.upcoming_unlocked_ids,['1']);
});
test('a posttip lock is rejected and cannot repair a gap',()=>{
 const x=check([game('1')],[lock(['1'],'2026-11-05T00:10:00Z')]);
 assert.equal(x.status,'integrity_error');assert.deepEqual(x.missed_after_tip_ids,['1']);
 assert.match(x.integrity_errors.join(','),/not pre-tip/);
});
test('tampering with the cryptographic lock is detected',()=>{
 const altered=lock(['1']);altered.forecasts[0].game_id='2';
 const x=check([game('1')],[altered]);
 assert.equal(x.status,'integrity_error');assert.deepEqual(x.missed_after_tip_ids,['1']);
});
test('a completely locked date contains zero gaps',()=>{
 const x=check([game('1'),game('2')],[lock(['1','2'])]);
 assert.equal(x.status,'locked');assert.deepEqual(x.missed_after_tip_ids,[]);
});
test('duplicate provider game IDs fail closed',()=>{
 assert.throws(()=>check([game('1'),game('1')],[]),/Duplicate NBA game/);
});
test('read-only report never edits inputs, and marks a stale source',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'forecast-coverage-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 fs.mkdirSync(path.join(root,'data'),{recursive:true});
 const file=path.join(root,'data','games.json');
 const original=JSON.stringify({coverage:{current_season:2027},built_at_utc:'2026-11-03T00:00:00Z',games:[game('1'),game('2')]});
 fs.writeFileSync(file,original);
 const result=runAudit({root,now:new Date('2026-11-05T01:00:00Z'),date});
 assert.equal(result.schedule_feed_stale,true);assert.equal(result.totals.missed_forecasts_after_tip,2);
 assert.equal(fs.readFileSync(file,'utf8'),original);
});
test('argument parser rejects invalid unknown options and date formats',()=>{
 assert.throws(()=>parseArgs(['--recent','0']),/recent/);
 assert.throws(()=>parseArgs(['--nonsense']),/Unknown/);
 assert.throws(()=>runAudit({date:'2026-11-05/../../x'}),/ENOENT|Invalid/);
});
