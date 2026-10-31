'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {readout}=require('../predict/one-machine.js');
const game={home:{abbr:'CHA'},away:{abbr:'PHI'}};
test('one machine gives one winner and explicitly attributes separate score model',()=>{
 const r=readout(game,{m5_regularized_ml:{available:true,home_win_probability:.48},m4_monte_carlo:{available:true,projected_score:{home:110.6,away:115.2}}});
 assert.equal(r.winner,'PHI');assert.equal(r.win_probability,.52);assert.equal(r.margin,5);assert.deepEqual(r.score,{home:111,away:115});assert.equal(r.coherent_joint_forecast,false);
});
test('opposing score and pick is flagged instead of concealed',()=>{
 const r=readout(game,{m5_regularized_ml:{available:true,home_win_probability:.48},m4_monte_carlo:{available:true,projected_score:{home:121,away:110}}});assert.equal(r.score_conflicts_with_pick,true);
});
test('missing or corrupt inputs fail closed',()=>{
 assert.equal(readout(game,{m4_monte_carlo:{available:true,projected_score:{home:110,away:103}}}).available,false);
 assert.equal(readout(game,{m5_regularized_ml:{available:true,home_win_probability:1.2}}).available,false);
 const r=readout(game,{m5_regularized_ml:{available:true,home_win_probability:.6}});assert.equal(r.score,null);assert.equal(r.margin,null);
});
