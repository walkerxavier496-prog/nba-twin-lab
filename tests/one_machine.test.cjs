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
test('a single locked score model supplies coherent pick, scores and attribution',()=>{
 const f={home:{abbr:'CHA'},away:{abbr:'PHI'},research_score_machine:{available:true,model_id:'joint_score_margin_v1',home_win_probability:.49,
   display_score:{home:111,away:113},margin_range_80:[-20,18],explanation:{drivers:[{label:'Offensive rating difference',margin_points:-3}]}}};
 const r=readout(f,{});
 assert.equal(r.available,true);assert.equal(r.winner,'PHI');assert.equal(r.model,'joint_score_margin_v1');
 assert.equal(r.coherent_joint_forecast,true);assert.equal(r.margin,2);assert.deepEqual(r.score,{home:111,away:113});
 assert.equal(r.drivers[0].margin_points,-3);
});
test('a corrupted single-model score is never presented as coherent',()=>{
 const f={home:{abbr:'CHA'},away:{abbr:'PHI'},research_score_machine:{available:true,home_win_probability:.49,display_score:{home:115,away:110}}};
 const r=readout(f,{});assert.equal(r.coherent_joint_forecast,false);assert.equal(r.score_conflicts_with_pick,true);assert.equal(r.score,null);
});
