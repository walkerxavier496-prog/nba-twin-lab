'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {pregameFeatures,fit,predict,metrics,pairedBootstrap}=require('../scripts/v8_research.cjs');
const snap=(as_of,delta=0,rest=2)=>({as_of,games:12,player_delta:delta,rest_days:rest,rotation_continuity:.8,
  information_cutoff_utc:as_of+'T12:00:00Z',chronology_policy:'result-availability-v1',
  season:{adj_ortg:115,adj_drtg:110},prior:{adj_ortg:112,adj_drtg:110}});
test('Pregame features reject snapshots not dated to the target game',()=>{
  const item={feature:{date:'2026-10-20',pregame:{home:snap('2026-10-21'),away:snap('2026-10-20')}},
    game:{id:'test',season:2027,date:'2026-10-20T20:00:00Z',homeScore:100,awayScore:99}};
  assert.throws(()=>pregameFeatures(item,{homeWin:.6,margin:3}),/cutoff/);
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

test('V8 rejects max_result_available_at_utc at or after cutoff',()=>{
  const item={feature:{date:'2026-10-20',pregame:{home:snap('2026-10-20',0,2),away:snap('2026-10-20',0,2)}},
    game:{id:'test',season:2027,date:'2026-10-20T20:00:00Z',homeScore:100,awayScore:99}};
  item.feature.pregame.home.max_result_available_at_utc='2026-10-20T12:00:00Z';
  assert.throws(()=>pregameFeatures(item,{homeWin:.6,margin:3}),/cutoff/);
});
test('V8 accepts max_result_available_at_utc strictly before cutoff',()=>{
  const item={feature:{date:'2026-10-20',pregame:{home:snap('2026-10-20',0,2),away:snap('2026-10-20',0,2)}},
    game:{id:'test',season:2027,date:'2026-10-20T20:00:00Z',homeScore:100,awayScore:99}};
  item.feature.pregame.home.information_cutoff_utc='2026-10-20T12:00:00Z';
  item.feature.pregame.home.max_result_available_at_utc='2026-10-20T11:59:59Z';
  assert.doesNotThrow(()=>pregameFeatures(item,{homeWin:.6,margin:3}));
  item.feature.pregame.home.max_result_available_at_utc='2026-10-20T12:00:00Z';
  assert.throws(()=>pregameFeatures(item,{homeWin:.6,margin:3}),/cutoff/);
  item.feature.pregame.home.max_result_available_at_utc='2026-10-20T12:00:01Z';
  assert.throws(()=>pregameFeatures(item,{homeWin:.6,margin:3}),/cutoff/);
  item.feature.pregame.home.max_result_available_at_utc='not-a-date';
  assert.throws(()=>pregameFeatures(item,{homeWin:.6,margin:3}),/cutoff/);
});
test('V8 rejects missing cutoff, policy and malformed timestamps',()=>{
  const base={feature:{date:'2026-10-20',pregame:{home:snap('2026-10-20',0,2),away:snap('2026-10-20',0,2)}},
    game:{id:'test',season:2027,date:'2026-10-20T20:00:00Z',homeScore:100,awayScore:99}};
  delete base.feature.pregame.home.information_cutoff_utc;
  assert.throws(()=>pregameFeatures(base,{homeWin:.6,margin:3}),/cutoff/);
  const p2=JSON.parse(JSON.stringify(base));
  p2.feature.pregame.home.information_cutoff_utc='2026-10-20T12:00:00Z';
  p2.feature.pregame.home.chronology_policy='bad';
  assert.throws(()=>pregameFeatures(p2,{homeWin:.6,margin:3}),/Chronology policy/);
  const p3=JSON.parse(JSON.stringify(base));
  p3.feature.pregame.home.information_cutoff_utc='not-a-date';
  assert.throws(()=>pregameFeatures(p3,{homeWin:.6,margin:3}),/cutoff/);
});
