/* Score Machine V1 — single joint score / margin research model.
 * Fit targets: total points + home margin. Implied home/away scores and win
 * probability all derive from the same margin; never uses the target result as a feature.
 * Historical pregame snapshots have inferred rather than verified official rosters.
 * Not yet fit for production promotion or betting.
 */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.TwinScoreMachine=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const n=(x,f=0)=>finite(x)?x:f;
const blend=(t,k,priorWeight=14)=>{
 const season=t.season||{},prior=t.prior||{};const games=n(t.games,0);
 const s=season[k],p=prior[k];if(!finite(s)&&!finite(p))return null;
 if(!finite(s))return p;if(!finite(p))return s;
 return (games*s+priorWeight*p)/(games+priorWeight);
};
const net=t=>{const o=blend(t,'adj_ortg'),d=blend(t,'adj_drtg');return o===null||d===null?null:o-d;};
const names=['constant','net_gap','offense_gap','defense_gap','pace','home_attack','away_attack','recent_net_gap','player_gap','continuity_gap','rest_gap','three_rate_gap','efg_gap','turnover_gap','rebound_gap','free_throw_gap'];
function vector(home,away){
 if(!home||!away||!home.prior||!away.prior||!home.season||!away.season)return null;
 const hn=net(home),an=net(away),ho=blend(home,'adj_ortg'),ao=blend(away,'adj_ortg'),hd=blend(home,'adj_drtg'),ad=blend(away,'adj_drtg');
 if([hn,an,ho,ao,hd,ad].some(x=>x===null))return null;
 const pace=(n(blend(home,'pace'),100)+n(blend(away,'pace'),100))/2;
 const lastNet=t=>finite(t.last10?.adj_ortg)&&finite(t.last10?.adj_drtg)?t.last10.adj_ortg-t.last10.adj_drtg:net(t);
 const f=[1,(hn-an)/12,(ho-ao)/10,(ad-hd)/10,(pace-100)/6,
 ((ho+ad)/2-113)/12,((ao+hd)/2-113)/12,(lastNet(home)-lastNet(away))/15,
 (n(home.player_delta)-n(away.player_delta))/5,(n(home.rotation_continuity)-n(away.rotation_continuity)),
 ((away.rest_days===0?1:0)-(home.rest_days===0?1:0)),
 (n(blend(home,'three_rate'),.38)-n(blend(away,'three_rate'),.38))/.15,
 (n(blend(home,'efg'),.54)-n(blend(away,'efg'),.54))/.06,
 (n(blend(away,'tov_rate'),.13)-n(blend(home,'tov_rate'),.13))/.06,
 (n(blend(home,'orb_rate'),.26)-n(blend(away,'orb_rate'),.26))/.1,
 (n(blend(home,'ftr'),.25)-n(blend(away,'ftr'),.25))/.15];
 return f.every(finite)?f.map((v,i)=>i===0?v:clamp(v,-4,4)):null;
}
function solve(A,b){
 const k=b.length,M=A.map((r,i)=>[...r,b[i]]);
 for(let i=0;i<k;i++){let p=i;for(let j=i+1;j<k;j++)if(Math.abs(M[j][i])>Math.abs(M[p][i]))p=j;
  if(Math.abs(M[p][i])<1e-10)throw Error('Singular score regression');
  [M[p],M[i]]=[M[i],M[p]];const d=M[i][i];for(let c=i;c<=k;c++)M[i][c]/=d;
  for(let j=0;j<k;j++)if(j!==i){const v=M[j][i];for(let c=i;c<=k;c++)M[j][c]-=v*M[i][c];}
 }return M.map(x=>x[k]);
}
function ridge(rows,target,lambda=120){
 const d=names.length,A=Array.from({length:d},()=>Array(d).fill(0)),b=Array(d).fill(0);
 for(const row of rows){const x=row.x,y=row[target];for(let i=0;i<d;i++){b[i]+=x[i]*y;for(let j=0;j<d;j++)A[i][j]+=x[i]*x[j];}}
 for(let i=1;i<d;i++)A[i][i]+=lambda;
 return solve(A,b);
}
const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
const sigmoid=x=>1/(1+Math.exp(-clamp(x,-30,30)));
function train(rows){
 if(rows.length<1200)throw Error('Insufficient historical games to train');
 for(const row of rows)if(!row.x||row.x.length!==names.length||!finite(row.margin)||!finite(row.total))throw Error('Invalid historical training input');
 const total=ridge(rows,'total'),margin=ridge(rows,'margin');
 // Calibrate probability scale from the training distribution only.
 let best={scale:12,loss:Infinity};
 for(let scale=8;scale<=30;scale+=.5){let loss=0;for(const row of rows){const p=clamp(sigmoid(dot(margin,row.x)/scale),.001,.999),y=row.margin>0?1:0;loss+=(p-y)**2;}
  if(loss<best.loss)best={scale,loss};
 }
 const errors=rows.map(row=>row.margin-dot(margin,row.x)).sort((a,b)=>a-b);
 const q=p=>errors[Math.round((errors.length-1)*p)];
 return {schema:'nba-twin-score-machine-research-v1',training_games:rows.length,names,total_coefficients:total,margin_coefficients:margin,
  probability_scale:best.scale,margin_residual_p10:q(.1),margin_residual_p90:q(.9),historical_injury_coverage:'inferred_unverified'};
}
function predict(model,home,away){
 const x=vector(home,away);if(!x)return {available:false,reason:'Valid pregame team snapshots unavailable'};
 const total=dot(model.total_coefficients,x),margin=dot(model.margin_coefficients,x);
 if(!finite(total)||!finite(margin)||!finite(model.probability_scale)||model.probability_scale<=0)return {available:false,reason:'Model coefficients invalid'};
 const homePts=clamp((total+margin)/2,0,200),awayPts=clamp((total-margin)/2,0,200),p=sigmoid(margin/model.probability_scale);
 // Rounded NBA final scores cannot tie: break only display rounding ties,
 // not the underlying continuous model, in the projected winner direction.
 let displayHome=Math.round(homePts),displayAway=Math.round(awayPts);
 if(displayHome===displayAway){if(margin>=0)displayHome++;else displayAway++;}
 return {available:true,home_win_probability:p,projected_home_score:homePts,projected_away_score:awayPts,
  rounded_home_score:displayHome,rounded_away_score:displayAway,rounded_margin:displayHome-displayAway,
  projected_home_margin:homePts-awayPts,margin_range_80:[margin+model.margin_residual_p10,margin+model.margin_residual_p90],
  model_id:model.schema, explanation:{baseline_offense_home:blend(home,'adj_ortg'),baseline_offense_away:blend(away,'adj_ortg'),
  baseline_defense_home:blend(home,'adj_drtg'),baseline_defense_away:blend(away,'adj_drtg'),pace:(blend(home,'pace')+blend(away,'pace'))/2,
  home_current_games:home.games,away_current_games:away.games,impact_by_feature:Object.fromEntries(names.slice(1).map((name,i)=>[name,{margin_points:model.margin_coefficients[i+1]*x[i+1],total_points:model.total_coefficients[i+1]*x[i+1]}]))},
  warning:'Research estimate. Historical roster availability is inferred, official current injury/roster coverage must be verified before publication.'};
}
return Object.freeze({names,vector,train,predict,blend});
});
