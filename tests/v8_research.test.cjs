'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {pregameFeatures,fit,predict,metrics,pairedBootstrap}=require('../scripts/v8_research.cjs');
const snap=(as_of,delta=0,rest=2)=>({as_of,games:12,player_delta:delta,rest_days:rest,rotation_continuity:.8,
  season:{adj_ortg:115,adj_drtg:110},prior:{adj_ortg:112,adj_drtg:110}});
test('Pregame features reject snapshots not dated to the target game',()=>{
  const item={feature:{date:'2026-10-20',pregame:{home:snap('2026-10-21'),away:snap('2026-10-20')}},
    game:{id:'test',season:2027,date:'2026-10-20T20:00:00Z',homeScore:100,awayScore:99}};
  assert.throws(()=>pregameFeatures(item,{homeWin:.6,margin:3}),/timestamp/);
});
test('Player delta, rest and net rating are pregame-only, bounded features',()=>{
  const item={feature:{date:'2026-10-20',pregame:{home:snap('2026-10-20',3,0),away:snap('2026-10-20',-2,2)}},
    game:{id:'test',season:2027,date:'2026-10-20T20:00:00Z',homeScore:100,awayScore:99}};
  const x=pregameFeatures(item,{homeWin:.6,margin:3});
  assert.equal(x.features.player,1.25);
  assert.equal(x.features.rest,-1);
  assert.equal(x.y,1);
});
test('Regularized fit is finite and trained only on supplied rows',()=>{
  const rows=Array.from({length:80},(_,i)=>({y:i%3!==0?1:0,features:{elo:(i%7-3)/3,player:(i%5-2)/4,team:0,rest:0,continuity:0}}));
  const model=fit(rows,'player');
  assert.equal(model.training_games,80);
  assert.equal(model.coefficients.length,3);
  assert.ok(model.coefficients.every(Number.isFinite));
  const p=predict(rows[0],model);assert.ok(p>0&&p<1);
  assert.equal(metrics([{p:.8,y:1},{p:.4,y:0}]).accuracy,1);
  const d=pairedBootstrap([{p:.8,y:1},{p:.4,y:0}],[{p:.6,y:1},{p:.5,y:0}],100);
  assert.ok(d.delta_brier<0);
});
