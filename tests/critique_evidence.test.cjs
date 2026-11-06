'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const C=require('../scripts/critique-evidence.cjs');
const rows=()=>Array.from({length:12},(_,i)=>({game_id:String(i),home:{abbr:'BOS',score:100},away:{abbr:'NYK',score:110},
 models:{production_elo_v7:{p:.8,actual:0,home_score:115,away_score:112},research:{p:.3,actual:0,home_score:102,away_score:108}},
 player_results:[{name:'Player',team:'BOS',disposition:'played_scored',projection_if_play:{pts:25},actual:{pts:10},absolute_errors:{pts:15}}]}));
test('model findings identify actual misses, score bias and high-confidence errors without causal claims',()=>{
 const games=rows(),result=C.evidence(games);
 assert.equal(result.models.production_elo_v7.correct,0);assert.equal(result.models.research.correct,12);
 assert.ok(Math.abs(result.models.production_elo_v7.largest_misses[0].brier-.64)<1e-12);
 assert.equal(result.models.production_elo_v7.score_bias_per_team,8.5);
 assert.equal(result.largest_player_misses[0].absolute_error,15);
 const weak=C.recurring([{date:'2026-11-01',games:games.slice(0,6)},{date:'2026-11-02',games:games.slice(6)}]);
 assert.ok(weak.findings.some(f=>f.model_id==='production_elo_v7'&&f.kind==='high_confidence_misses'&&f.count===12));
 assert.ok(weak.findings.every(f=>f.interpretation==='observed_pattern_not_causal'));
 assert.deepEqual(C.evidence(games.reverse()),result);
});
test('a single slate or insufficient samples cannot establish a recurring weakness',()=>{
 assert.deepEqual(C.recurring([{date:'2026-11-01',games:rows()}]).findings,[]);
 assert.deepEqual(C.recurring([{date:'2026-11-01',games:rows().slice(0,1)},{date:'2026-11-02',games:rows().slice(1,2)}]).findings,[]);
});
test('each model needs observations on two contributing dates',()=>{
 const other={...rows()[0],game_id:'999',models:{other:{p:.8,actual:0}}};
 const result=C.recurring([{date:'2026-11-01',games:rows()},{date:'2026-11-02',games:[other]}]);
 assert.deepEqual(result.findings,[]);
 const lowConfidence={...other,models:{production_elo_v7:{p:.6,actual:1}}};
 assert.deepEqual(C.recurring([{date:'2026-11-01',games:rows()},{date:'2026-11-02',games:[lowConfidence]}]).findings,[]);
});
test('minute misses preserve the original conditional minutes from actual scored player rows',()=>{
 const A=require('../scripts/audit-core.cjs');
 const forecast={game_id:'1',v9_player_projections:[{player_id:'p',name:'Player One',team:'BOS',expected_minutes_if_play:35,projection_if_play:{pts:20}}]};
 const actual={teams:{BOS:[{name:'Player One',normalized_name:A.normalizeName('Player One'),played:true,minutes:20,pts:10}]}};
 const game={game_id:'1',player_results:A.scorePlayers(forecast,actual)};
 const miss=C.evidence([game],[forecast]).largest_player_misses.find(p=>p.stat==='minutes');
 assert.equal(miss.predicted,35);assert.equal(miss.actual,20);assert.equal(miss.absolute_error,15);
});
