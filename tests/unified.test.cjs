'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const U = require('../predict/unified.js');
const Shadow = require('../scripts/unified_shadow.cjs');
const IO = require('../scripts/research_io.cjs');
const A = require('../scripts/audit-core.cjs');
const artifact = require('../research-reviews/unified-v1/fit-2027.json');
test('frozen fit and shadow operate through the same pregame feature function',()=>{
  const snap=IO.read('v7-current.json'),data=IO.read('games.json');
  const now=Math.max(Date.parse(snap.built_at_utc),Date.parse(data.built_at_utc))+1000;
  const game={status:'scheduled',season:2027,date:new Date(now+3600000).toISOString(),home:{id:'1',abbr:'ATL'},away:{id:'2',abbr:'BOS'}};
  // Fix only fixture publication times so the test stays independent of the feed refresh schedule.
  data.built_at_utc=new Date(now).toISOString();
  snap.built_at_utc=new Date(now).toISOString();
  snap.coverage.season=2027;
  const baseline={margin:2,total:222};
  assert.ok(A.verifyIntegrity(artifact));
  const lock=Shadow.forSlate(2027,snap,now,data)(game,baseline);
  assert.equal(lock.available,true,lock.reason);
  const teams=new Map(snap.teams.map(t=>[t.abbr,t]));
  const x=U.vector(teams.get('ATL'),teams.get('BOS'),baseline,U.scheduleFeatures(game,data.games,now));
  assert.deepEqual(lock.projected_score,U.forecast(artifact.fit,x,baseline).projected_score);
  assert.ok(lock.home_win_probability>0 && lock.home_win_probability<1);
  assert.equal(Shadow.forSlate(2027,snap,now,data)({...game,status:'final'},baseline).available,false);
  snap.teams.find(t=>t.abbr==='ATL').information_cutoff_utc=new Date(now+1).toISOString();
  assert.equal(Shadow.forSlate(2027,snap,now,data)(game,baseline).available,false);
  assert.equal(Shadow.forSlate(2027,snap,now+86400000,data)(game,baseline).available,false);
});
test('a suspended or unknown result cannot provide a travel or congestion signal',()=>{
  const home={id:'1'},away={id:'2'},target={date:'2026-11-08T19:00Z',season:2027,home,away};
  const cutoff=Date.parse(target.date)-60000;
  const recorded={season:2027,date:'2026-11-07T19:00Z',status:'final',home:{id:'3'},away:home};
  assert.deepEqual(U.scheduleFeatures(target,[recorded],cutoff),[0,0]);
  Object.assign(recorded,{result_available_at_utc:'2026-11-08T01:00Z',result_availability_verified:true,result_availability_source:'timestamped final'});
  assert.deepEqual(U.scheduleFeatures(target,[recorded],cutoff),[-1,-1]);
});

test('research CLI cannot mint forward forecasts for completed games or use a post-tip cutoff',()=>{
  const F=require('../scripts/player_engine_forecast.cjs');
  const date=new Date(Date.now()-86400000).toISOString();
  const game={season:2027,date,status:'final'};
  assert.throws(()=>F.buildForecast([],{},game,{}, {cutoffMs:Date.parse(date)-100}),/future scheduled/);
  assert.throws(()=>F.buildForecast([],{},game,{}, {cutoffMs:Date.parse(date),allowHistorical:true}),/strictly before tip/);
});
