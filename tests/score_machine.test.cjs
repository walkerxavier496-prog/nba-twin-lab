'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const S=require('../predict/score-machine.js');
const stats={adj_ortg:113,adj_drtg:112,pace:100,efg:.55,three_rate:.4,tov_rate:.14,orb_rate:.26,ftr:.24};
const t={games:10,prior:stats,season:stats,last10:stats,player_delta:0,rotation_continuity:.7,rest_days:2};
function model(total=226,margin=0.1){return {schema:'research',names:S.names,margin_coefficients:[margin,...Array(S.names.length-1).fill(0)],total_coefficients:[total,...Array(S.names.length-1).fill(0)],probability_scale:10,margin_residual_p10:-17,margin_residual_p90:17}}
test('joint machine produces coherent score, margin and winning probability',()=>{
 const p=S.predict(model(226,.1),t,t);
 assert.equal(p.available,true);assert.equal(p.rounded_home_score-p.rounded_away_score,p.rounded_margin);
 assert.ok(p.rounded_margin>0);assert.ok(p.home_win_probability>.5);assert.notEqual(p.rounded_home_score,p.rounded_away_score);
});
test('negative margin means away winner with no rounded tie',()=>{
 const p=S.predict(model(226,-.1),t,t);assert.ok(p.home_win_probability<.5);assert.ok(p.rounded_margin<0);
});
test('missing pregame evidence fails closed',()=>{
 assert.equal(S.predict(model(),null,t).available,false);
 assert.equal(S.predict(model(),{season:stats},t).available,false);
});
test('training learns score and margin without passing target into feature vector',()=>{
 const rows=Array.from({length:1230},(_,i)=>({x:[1,...Array(S.names.length-1).fill(0)],total:220+(i%7),margin:(i%3)-1}));
 const fitted=S.train(rows);assert.equal(fitted.training_games,1230);assert.equal(fitted.schema,'nba-twin-score-machine-research-v1');
 const p=S.predict(fitted,t,t);assert.ok(p.available);assert.ok(Number.isFinite(p.projected_home_margin));
});

test('why-machine drivers sum to model margin and disclose non-causal attribution',()=>{
 const p=S.predict(model(226,4),t,t);
 const contributions=Object.values(p.explanation.impact_by_feature).reduce((sum,x)=>sum+x.margin_points,0);
 assert.ok(Math.abs(contributions+p.explanation.intercept_margin_points-p.projected_home_margin)<1e-8);
 assert.equal(p.explanation.drivers.length,5);
 assert.match(p.explanation.attribution_note,/not causal/);
});
