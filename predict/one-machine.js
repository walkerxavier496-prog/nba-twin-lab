/* One-machine research readout. Read-only projection derived from an immutable
 * pre-tip challenger and simulation; never overwrites original locks.
 * A probability and separately simulated score are NOT a calibrated joint model.
 */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.TwinOneMachine=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const valid=x=>typeof x==='number'&&Number.isFinite(x);
function readout(forecast,predictions){
 const one=forecast?.research_score_machine;
 if(one?.available===true && valid(one.home_win_probability)&&one.home_win_probability>=0&&one.home_win_probability<=1){
  const p=one.home_win_probability;
  const sc=one.display_score;
  const scoreValid=valid(sc?.home)&&valid(sc?.away)&&Number.isInteger(sc.home)&&Number.isInteger(sc.away);
  const hasMargin=scoreValid&&sc.home!==sc.away&&
   (sc.home>sc.away)===(p>=.5);
  return {available:true,model:'joint_score_margin_v1',winner:p>=.5?forecast.home?.abbr:forecast.away?.abbr,
   win_probability:Math.max(p,1-p),home_win_probability:p,
   score:hasMargin?{home:sc.home,away:sc.away}:null,
   margin:hasMargin?Math.abs(sc.home-sc.away):null,
   score_model:'joint_score_margin_v1',coherent_joint_forecast:hasMargin,
   score_conflicts_with_pick:scoreValid&&!hasMargin,
   model_spread:null,drivers:one.explanation?.drivers||[],margin_range_80:one.margin_range_80,
   reason:'Single historical walk-forward research model for winner, scores and margin. This is not yet prospectively validated and verified game-day injuries were not used.'};
 }
 const ml=predictions?.m5_regularized_ml;
 if(!ml?.available||!valid(ml.home_win_probability)||ml.home_win_probability<0||ml.home_win_probability>1)
  return {available:false,reason:'Verified pre-tip machine-learning probability unavailable'};
 const p=ml.home_win_probability;
 const winner=p>=.5?forecast.home?.abbr:forecast.away?.abbr;
 const sim=predictions?.m4_monte_carlo;
 const scores=sim?.available?sim.projected_score:null;
 const scoreValid=valid(scores?.home)&&valid(scores?.away)&&scores.home>=0&&scores.away>=0;
 const spread=Object.values(predictions||{}).filter(m=>m?.available&&valid(m.home_win_probability)).map(m=>m.home_win_probability);
 const disagreement=spread.length>=2?Math.max(...spread)-Math.min(...spread):null;
 const margin=scoreValid?Math.round(Math.abs(scores.home-scores.away)):null;
 const projectedWinner=scoreValid?(scores.home>=scores.away?forecast.home?.abbr:forecast.away?.abbr):null;
 return {available:true,model:'m5_regularized_ml',winner,win_probability:Math.max(p,1-p),home_win_probability:p,
  score:scoreValid?{home:Math.round(scores.home),away:Math.round(scores.away)}:null,margin,
  score_model:scoreValid?'m4_monte_carlo':null,
  coherent_joint_forecast:false,
  score_conflicts_with_pick:scoreValid&&projectedWinner!==winner,
  model_spread:disagreement,
  reason:'M5 estimates the winner using fitted pregame features; M4 separately estimates possessions and points. Neither model has yet passed prospective testing as a jointly calibrated score-and-margin engine.'};
}
return Object.freeze({readout});
});
