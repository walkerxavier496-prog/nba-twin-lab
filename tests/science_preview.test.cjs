'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const P=require('../predict/science-preview.js');
const date='2026-10-30';
const team=abbr=>({abbr,as_of:date,games:6,rest_days:1,
 season:{adj_ortg:115,adj_drtg:110},prior:{adj_ortg:112,adj_drtg:110},
 last5:{games:5,adj_ortg:117,adj_drtg:109}});
const snapshot={strict_no_future_data:true,built_at_utc:'2026-10-30T08:00:00Z',teams:[team('ATL'),team('BOS')]};
const report={strict_no_future_data:true,status:'research_only_not_promoted',
 fits:{2027:{form:{names:['elo','team','momentum','restScience'],coefficients:[0,1,.2,.1,.2]}}}};
const game={season:2027,status:'scheduled',date:'2026-10-31T23:00:00Z',home:{abbr:'ATL'},away:{abbr:'BOS'}};
const baseline={homeWin:.6,margin:3,homeRest:1,awayRest:0};
const now=Date.parse('2026-10-30T12:00:00Z');
test('research preview uses only pretipoff snapshots and frozen coefficients',()=>{
 const x=P.preview({game,baseline,snapshot,report,now});
 assert.ok(x.available);
 assert.ok(x.homeWin>0&&x.homeWin<1);
 assert.equal(x.features.restScience,.5);
 assert.equal(x.homeWin+x.awayWin,1);
});
test('final games, future-dated and stale snapshots are not forecast',()=>{
 assert.equal(P.preview({game:{...game,status:'final'},baseline,snapshot,report,now}).available,false);
 assert.equal(P.preview({game:{...game,date:'2026-10-29T23:00:00Z'},baseline,snapshot,report,now}).available,false);
 assert.equal(P.preview({game,baseline,snapshot,report,now:now+96*3600000}).available,false);
 assert.equal(P.preview({game,baseline,snapshot:{...snapshot,built_at_utc:'2026-11-02T00:00:00Z'},report,now}).available,false);
});
test('unknown season, invalid provenance and missing team fail closed',()=>{
 assert.equal(P.preview({game:{...game,season:2028},baseline,snapshot,report,now}).available,false);
 assert.equal(P.preview({game,baseline,snapshot,report:{...report,strict_no_future_data:false},now}).available,false);
 assert.equal(P.preview({game,baseline,snapshot:{...snapshot,teams:[team('ATL')]},report,now}).available,false);
});
