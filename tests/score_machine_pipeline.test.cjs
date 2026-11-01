'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const A=require('../scripts/audit-core.cjs'),T=require('../scripts/daily_tracker.cjs'),S=require('../predict/score-machine.js');
test('current research model trains strictly on previous seasons and produces pretip outputs',()=>{
 const {fit,source_sha256}=T.trainedScoreMachine(2027);
 assert.equal(fit.training_games,6150);assert.match(source_sha256,/^[0-9a-f]{64}$/);
 const snap=require('../data/v7-current.json');const a=snap.teams.find(t=>t.abbr==='CHA'),b=snap.teams.find(t=>t.abbr==='PHI');
 const p=S.predict(fit,a,b);assert.equal(p.available,true);
 assert.ok(p.home_win_probability>=0&&p.home_win_probability<=1);
 assert.equal(p.rounded_margin,p.rounded_home_score-p.rounded_away_score);
});
test('research score and margin receive postgame grading from their immutable values',()=>{
 const forecast={research_score_machine:{available:true,model_id:'joint_score_margin_v1',home_win_probability:.45,
  projected_score:{home:111.2,away:115.5}}};
 const actual={home:{score:105},away:{score:120}};
 const row=A.modelRowsForGame(forecast,actual).find(m=>m.model_id==='joint_score_margin_v1');
 assert.ok(row);assert.equal(row.p,.45);assert.equal(row.actual,0);assert.equal(row.correct,true);
 assert.ok(Math.abs(row.projected_margin-(-4.3))<1e-8);assert.ok(row.score_mae_per_team>0);
});
