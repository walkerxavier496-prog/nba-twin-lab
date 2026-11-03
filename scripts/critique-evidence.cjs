'use strict';
// Descriptive diagnostics only. This module never trains or selects a model.
const A=require('./audit-core.cjs');
const finite=v=>typeof v==='number'&&Number.isFinite(v);
const mean=rows=>rows.length?rows.reduce((a,b)=>a+b,0)/rows.length:null;
function evidence(games,forecasts=[]) {
 const models={},players=[],original=new Map(forecasts.map(f=>[String(f.game_id),f]));
 for(const game of [...games].sort((a,b)=>String(a.game_id).localeCompare(String(b.game_id)))){
  const f=original.get(String(game.game_id)),home=f?.home?.abbr||game.home?.abbr||'Home',away=f?.away?.abbr||game.away?.abbr||'Away';
  for(const [id,row] of Object.entries(game.models||{}).sort()){
   if(!finite(row.p)||row.p<0||row.p>1||![0,1].includes(row.actual))throw Error('Invalid probability in critique evidence');
   const correct=(row.p>=.5)===(row.actual===1),bias=finite(row.home_score)&&finite(row.away_score)&&finite(game.home?.score)&&finite(game.away?.score)?(row.home_score-game.home.score+row.away_score-game.away.score)/2:null;
   const item={game_id:String(game.game_id),matchup:`${away} @ ${home}`,correct,confidence:Math.max(row.p,1-row.p),home_win_probability:row.p,brier:(row.p-row.actual)**2,
    projected_score:{home:row.home_score??null,away:row.away_score??null},actual_score:{home:game.home?.score??null,away:game.away?.score??null},
    score_mae_per_team:row.score_mae_per_team??(bias===null?null:(Math.abs(row.home_score-game.home.score)+Math.abs(row.away_score-game.away.score))/2),score_bias_per_team:bias,
    observation:`${correct?'Winner matched':'Winner missed'} the verified result at ${(100*Math.max(row.p,1-row.p)).toFixed(1)}% confidence. ${bias===null?'Comparable score data is unavailable.':`Predicted minus actual score averaged ${bias.toFixed(1)} points per team.`} This is an observed error, not evidence of an injury, roster or tactical cause.`};
   (models[id]||=[]).push(item);
  }
  for(const player of game.player_results||[])if(player.disposition==='played_scored')for(const [stat,error] of Object.entries(player.absolute_errors||{})){
   if(!finite(error))continue;
   const projection=f?.v9_player_projections?.find(p=>String(p.player_id)===String(player.player_id)&&A.canonicalTeam(p.team)===A.canonicalTeam(player.team));
   const predicted=stat==='minutes'?projection?.expected_minutes_if_play:player.projection_if_play?.[stat],actual=player.actual?.[stat];
   players.push({game_id:String(game.game_id),name:player.name,team:player.team,stat,predicted:predicted??null,actual:actual??null,absolute_error:error,signed_error:finite(predicted)&&finite(actual)?predicted-actual:null});
  }
 }
 const order=(a,b)=>b.brier-a.brier||a.game_id.localeCompare(b.game_id);
 return {models:Object.fromEntries(Object.entries(models).sort().map(([id,rows])=>[id,{count:rows.length,correct:rows.filter(r=>r.correct).length,
  score_bias_per_team:mean(rows.map(r=>r.score_bias_per_team).filter(finite)),score_sample:rows.filter(r=>finite(r.score_bias_per_team)).length,
  largest_misses:[...rows].sort(order).slice(0,5),
  observation:`${rows.filter(r=>r.correct).length}/${rows.length} winner selections matched verified results. Probability and score errors remain separate measures.`}])),
 largest_player_misses:players.sort((a,b)=>b.absolute_error-a.absolute_error||a.game_id.localeCompare(b.game_id)||String(a.name).localeCompare(String(b.name))||a.stat.localeCompare(b.stat)).slice(0,10)};
}
function recurring(days) {
 const valid=days.filter(d=>d.complete!==false&&d.games?.length).sort((a,b)=>a.date.localeCompare(b.date)),dates=[...new Set(valid.map(d=>d.date))],games=valid.flatMap(d=>d.games),findings=[],models={};
 for(const day of valid)for(const game of day.games)for(const [id,row] of Object.entries(game.models||{}))(models[id]||=[]).push({...row,date:day.date,game_id:game.game_id,home:game.home,away:game.away});
 if(dates.length>=2)for(const [id,rows] of Object.entries(models).sort()){
  const modelDates=[...new Set(rows.map(r=>r.date))];
  if(rows.length<10||modelDates.length<2)continue;
  const metrics=A.probabilityMetrics(rows),confident=rows.filter(r=>Math.max(r.p,1-r.p)>=.7),misses=confident.filter(r=>(r.p>=.5)!==(r.actual===1));
  const datesOf=items=>[...new Set(items.map(r=>r.date))];
  const add=(kind,items,observed,recommendation)=>findings.push({model_id:id,kind,count:items.length,dates:datesOf(items),observed,recommendation,interpretation:'observed_pattern_not_causal'});
  if(confident.length>=10&&datesOf(confident).length>=2&&misses.length>=3&&metrics.confidence_gap>.05)add('high_confidence_misses',confident,`${misses.length}/${confident.length} forecasts at 70%+ confidence missed. Overall confidence minus accuracy: ${metrics.confidence_gap.toFixed(3)}.`, 'Evaluate probability recalibration on a separate chronological validation set; do not change production weights from this sample.');
  const scoreRows=rows.filter(r=>[r.home_score,r.away_score,r.home?.score,r.away?.score].every(finite)),bias=scoreRows.map(r=>(r.home_score-r.home.score+r.away_score-r.away.score)/2);
  if(bias.length>=10&&datesOf(scoreRows).length>=2&&Math.abs(mean(bias))>=3)add('score_bias',scoreRows,`Predicted minus actual score averages ${mean(bias).toFixed(2)} points per team.`, 'Test score intercept and pace assumptions on held-out earlier-to-later games; the cause is unverified.');
 }
 return {minimum_games:10,minimum_completed_dates:2,completed_dates:dates.length,reviewed_games:games.length,findings,
  caution:'Descriptive repeated patterns, not statistical significance or causal explanations. Initial and locked samples are evaluated separately.'};
}
module.exports={evidence,recurring};
