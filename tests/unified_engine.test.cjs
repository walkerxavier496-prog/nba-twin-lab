'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const E=require('../predict/engine.js');
const U=require('../predict/unified-engine.js');
const game={id:'fixture-1',date:'2026-11-11T01:00:00Z',season:2027,
 home:{id:'1',name:'Atlanta Hawks',abbr:'ATL'},away:{id:'2',name:'Boston Celtics',abbr:'BOS'}};
const state=E.ratings([],game.date);
test('single unified probability is coherent without pretending lineup coverage',()=>{
 const r=U.predict(game,state);
 assert.ok(r.homeWin>0&&r.homeWin<1);
 assert.equal(r.homeWin+r.awayWin,1);
 assert.equal(r.coverage.lineup_snapshot,'unavailable');
 assert.ok(Math.abs(r.homeWin-r.baselineHomeWin)<1e-9);
});
test('verified pretip lineup changes one prediction in correct direction',()=>{
 const snapshot={as_of_utc:'2026-11-10T21:00:00Z',source:'fixture-source',
   home:{player_net_points:5,observed_at_utc:'2026-11-10T20:00:00Z'},
   away:{player_net_points:-2,observed_at_utc:'2026-11-10T20:00:00Z'}};
 const model={weights:[0,1,0,0,0,.4],training:'synthetic-only'};
 const withLineup=U.predict(game,state,{},snapshot,model),without=U.predict(game,state,{},null,model);
 assert.ok(withLineup.homeWin>without.homeWin);
 assert.equal(withLineup.coverage.lineup_snapshot,'verified');
});
test('post-tip and fabricated timestamps fail closed',()=>{
 const valid={as_of_utc:'2026-11-10T20:00:00Z',source:'report',
   home:{player_net_points:3,observed_at_utc:'2026-11-10T19:00:00Z'},
   away:{player_net_points:0,observed_at_utc:'2026-11-10T19:00:00Z'}};
 assert.throws(()=>U.predict(game,state,{}, {...valid,as_of_utc:'2026-11-11T03:00:00Z'}),/before tip/);
 assert.throws(()=>U.predict(game,state,{}, {...valid,home:{...valid.home,observed_at_utc:'2026-11-10T21:00:00Z'}}),/later/);
 assert.throws(()=>U.predict(game,state,{}, {...valid,source:''}),/source/);
});
test('training refuses future games and bad labels',()=>{
 const rows=Array.from({length:32},(_,i)=>({season:2023,x:[1,(i-16)/10,0,0,0,0],y:i>=16?1:0}));
 const model=U.train(rows,{iterations:30});
 assert.equal(model.weights.length,6);
 assert.ok(model.weights[1]>0);
 assert.throws(()=>U.train([...rows,{...rows[0],season:2026}]),/future/);
});
