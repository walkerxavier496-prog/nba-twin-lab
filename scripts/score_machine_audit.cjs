#!/usr/bin/env node
'use strict';
/* Walk-forward research audit. Emits report to stdout, never edits protected locks or data. */
const S=require('../predict/score-machine.js');
const IO=require('./research_io.cjs');
const fs=require('node:fs');
const intel=IO.read('v7-intelligence.json');
IO.requireChronology(intel);
if(!intel.strict_no_future_data||intel.coverage?.evaluated_games!==6150||intel.games.length!==6221)throw Error('Invalid historical pretip snapshot provenance');
const rows=intel.games.map(g=>{
 if(g.pregame?.home?.as_of!==g.date||g.pregame?.away?.as_of!==g.date)throw Error('Non-pretip input '+g.date);
 const x=S.vector(g.pregame.home,g.pregame.away);
 if(!x||!Number.isFinite(g.home_score)||!Number.isFinite(g.away_score)||g.home_score===g.away_score)throw Error('Invalid score model feature row');
 return {id:g.result_id,season:g.season,date:g.date,home:g.pregame.home,away:g.pregame.away,x,margin:g.home_score-g.away_score,total:g.home_score+g.away_score,actualHome:g.home_score,actualAway:g.away_score};
});
const average=a=>a.reduce((s,v)=>s+v,0)/a.length;
const report={schema:'nba-twin-score-machine-research-audit-v1',strict_no_future_data:true,seasons:{}};
for(const year of [2023,2024,2025,2026]){
 const train=rows.filter(r=>r.season<year),test=rows.filter(r=>r.season===year);
 const fitted=S.train(train);let brier=[],mae=[],marginMae=[],accuracy=[];
 for(const r of test){const p=S.predict(fitted,r.home,r.away);if(!p.available)throw Error('Missing output '+r.id);
  const y=r.margin>0?1:0;brier.push((p.home_win_probability-y)**2);
  accuracy.push((p.home_win_probability>=.5)===(y===1)?1:0);
  mae.push((Math.abs(p.projected_home_score-r.actualHome)+Math.abs(p.projected_away_score-r.actualAway))/2);
  marginMae.push(Math.abs(p.projected_home_margin-r.margin));
 }
 report.seasons[year]={games:test.length,training_games:train.length,accuracy:average(accuracy),brier:average(brier),score_mae:average(mae),margin_mae:average(marginMae),probability_scale:fitted.probability_scale};
}
const primary=Object.entries(report.seasons).filter(([y])=>Number(y)>=2024).map(([,r])=>r);
const weighted=k=>primary.reduce((s,r)=>s+r[k]*r.games,0)/primary.reduce((s,r)=>s+r.games,0);
report.primary={games:primary.reduce((s,r)=>s+r.games,0),accuracy:weighted('accuracy'),brier:weighted('brier'),score_mae:weighted('score_mae'),margin_mae:weighted('margin_mae')};
const fresh=S.train(rows.filter(r=>r.season<=2026));report.fresh_training_games=fresh.training_games;
if(process.argv.includes('--model'))report.model_2027=fresh;
if(process.argv.includes('--preview')){
 const j=IO.read('v7-current.json');const g=IO.read('games.json');const t=new Map(j.teams.map(team=>[String(team.abbr),team]));
 const ali={GS:'GSW',NY:'NYK',SA:'SAS',NO:'NOP',UTAH:'UTA',WSH:'WAS',PHO:'PHX',BRK:'BKN',CHO:'CHA'};
 report.preview=g.games.filter(game=>game.status==='scheduled'&&Date.parse(game.date)>Date.now()).slice(0,15).map(game=>{
  const h=t.get(ali[game.home.abbr]||game.home.abbr),a=t.get(ali[game.away.abbr]||game.away.abbr);
  const p=S.predict(fresh,h,a);
  return {home:game.home.abbr,away:game.away.abbr,tip:game.date,available:p.available,home_win_probability:p.home_win_probability,
   home_score:p.rounded_home_score,away_score:p.rounded_away_score,home_margin:p.rounded_margin,margin_range_80:p.margin_range_80};
 });
}
console.log(JSON.stringify(report,null,2));
