'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const R=require('../predict/roster.js');
const rot=(ids,as_of='2026-10-30',priorNet=6,seasonNet=-3)=>({
 as_of,games:5,player_delta:0,rotation_continuity:.8,
 prior:{adj_ortg:110+priorNet,adj_drtg:110},
 season:{adj_ortg:110+seasonNet,adj_drtg:110},
 rotation:ids.map((player_id,i)=>({player_id:String(player_id),expected_minutes:20+i}))
});
const previous=(ids,date='2026-04-10')=>({date,players:ids.map((id,i)=>({player_id:String(id),minutes:20+i}))});
const now=Date.parse('2026-10-30T12:00:00Z');
test('last pregame snapshot is indexed by season and team, never future-season results',()=>{
 const rows=[
  {season:2026,date:'2026-03-01',home:{abbr:'CHA'},away:{abbr:'WAS'},
   pregame:{home:rot([1,2,3,4,5],'2026-03-01'),away:rot([11,12,13,14,15],'2026-03-01')}},
  {season:2026,date:'2026-04-10',home:{abbr:'CHO'},away:{abbr:'WSH'},
   pregame:{home:rot([1,2,3,4,6],'2026-04-10'),away:rot([11,12,13,14,16],'2026-04-10')}},
  {season:2027,date:'2026-10-30',home:{abbr:'CHA'},away:{abbr:'WAS'},
   pregame:{home:rot([8,9,10,11,12]),away:rot([13,14,15,16,17])}}
 ];
 const idx=R.priorRotationIndex(rows);
 assert.equal(idx.get('2026|CHA').date,'2026-04-10');
 assert.equal(idx.get('2026|WAS').players[4].player_id,'16');
 assert.equal(idx.get('2027|CHA').date,'2026-10-30');
});
test('retention is weighted by last-season minutes and bounded',()=>{
 const p=previous([1,2,3,4,5]);
 assert.equal(R.retainedRotation(rot([6,7,8,9,10]),p),0);
 assert.equal(R.retainedRotation(rot([1,2,3,4,5]),p),1);
 assert.ok(R.retainedRotation(rot([1,2,6,7,8]),p)>0);
 assert.equal(R.retainedRotation(rot([1,2,3,4,5]),null),null);
});
test('roster shock removes departed players previous team strength, not an arbitrary win bonus',()=>{
 const home=rot([1,2,6,7,8],undefined,8,-2);
 const away=rot([11,12,13,14,15],undefined,-8,2);
 const f=R.features(home,away,previous([1,2,3,4,5]),previous([11,12,13,14,15]),{homeWin:.8,margin:8});
 assert.ok(f.rosterShock<0);
 assert.ok(f.eloUncertainty>0);
 assert.ok(f.currentChange<0);
});
test('future games require fresh point-in-time inputs and prior-year coefficients',()=>{
 const h=rot([1,2,6,7,8]),a=rot([11,12,13,14,15],undefined,-6,4);
 const snapshot={strict_no_future_data:true,built_at_utc:'2026-10-30T08:00:00Z',coverage:{season:2027},
  teams:[h,a,...Array.from({length:28},(_,i)=>({...rot([101,102,103,104,105]),abbr:'X'+i}))]};
 snapshot.teams[0].abbr='CHA';snapshot.teams[1].abbr='WAS';
 const priors={strict_no_future_data:true,target_season:2027,teams:{CHA:previous([1,2,3,4,5]),WAS:previous([11,12,13,14,15])}};
 const report={strict_no_future_data:true,status:'research_only_not_promoted',fits:{2027:{roster:{
  names:['elo','player','team','rest','continuity','rosterShock','eloUncertainty','currentChange'],
  coefficients:[0,1,0,0,0,0,0,-.4,0],training_games:6150}}}};
 const game={status:'scheduled',season:2027,date:'2026-10-30T23:00:00Z',home:{abbr:'CHA'},away:{abbr:'WAS'}};
 const baseline={homeWin:.8,margin:8,homeRest:2,awayRest:2};
 const args={game,baseline,snapshot,priorRotations:priors,report,now};
 const p=R.modelForecast(args);
 assert.ok(p.available);
 assert.ok(p.homeWin<baseline.homeWin);
 assert.ok(p.retentionHome<1);
 assert.equal(R.modelForecast({...args,game:{...game,status:'final'}}).available,false);
 assert.equal(R.modelForecast({...args,now:now+5*86400000}).available,false);
 assert.equal(R.modelForecast({...args,report:{...report,status:'unverified'}}).available,false);
 assert.equal(R.modelForecast({...args,game:{...game,season:2028}}).available,false);
});
