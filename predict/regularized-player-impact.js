/* Research-only regularized adjusted plus-minus with box-score priors.
 * Inputs are pre-tip possession/shift observations. No winner probabilities.
 * A fitted impact is an estimate, NOT a licensed LEBRON/DARKO/RAPTOR rating.
 */
'use strict';
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const fail=reason=>({available:false,reason,validated_probability:false});
function solve(A,b){
 const n=b.length, M=A.map((row,i)=>[...row,b[i]]);
 for(let k=0;k<n;k++){
  let pivot=k;for(let i=k+1;i<n;i++)if(Math.abs(M[i][k])>Math.abs(M[pivot][k]))pivot=i;
  if(Math.abs(M[pivot][k])<1e-10)return null;
  [M[k],M[pivot]]=[M[pivot],M[k]];
  const d=M[k][k];for(let j=k;j<=n;j++)M[k][j]/=d;
  for(let i=0;i<n;i++)if(i!==k){const f=M[i][k];for(let j=k;j<=n;j++)M[i][j]-=f*M[k][j];}
 }
 return M.map(row=>row[n]);
}
function estimate({as_of_utc,observations,priors,lambda=100,half_life_days=45,min_observations=30}={}){
 const cutoff=Date.parse(as_of_utc);
 if(!Number.isFinite(cutoff)||!Array.isArray(observations)||!Array.isArray(priors))
  return fail('Missing valid cutoff, observations or priors');
 if(!finite(lambda)||lambda<=0||!finite(half_life_days)||half_life_days<=0)return fail('Invalid regularization');
 const ids=priors.map(p=>String(p.player_id||''));
 if(ids.some(id=>!/^\d+$/.test(id))||new Set(ids).size!==ids.length||!ids.length)return fail('Invalid or duplicate player IDs');
 if(priors.some(p=>!finite(p.box_prior)||!p.available_at_utc||Date.parse(p.available_at_utc)>=cutoff||!Number.isFinite(Date.parse(p.available_at_utc))))
  return fail('Invalid, unavailable or post-cutoff box-score prior');
 const idx=new Map(ids.map((id,i)=>[id,i])),n=ids.length;
 const X=[],Y=[],W=[];let maxObserved=-Infinity;
 for(const o of observations){
  const end=Date.parse(o.ended_at_utc),available=Date.parse(o.available_at_utc);
  if(!Number.isFinite(end)||!Number.isFinite(available)||end>=cutoff||available>=cutoff||available<end)
   return fail('Observation is missing provenance or is not available before cutoff');
  if(!finite(o.margin_per_100)||!finite(o.possessions)||o.possessions<=0)return fail('Invalid observation');
  if(!Array.isArray(o.home_player_ids)||!Array.isArray(o.away_player_ids)||o.home_player_ids.length!==5||o.away_player_ids.length!==5)
   return fail('Observation requires exactly five players on each side');
  const home=o.home_player_ids.map(String),away=o.away_player_ids.map(String);
  if(new Set([...home,...away]).size!==10||[...home,...away].some(id=>!idx.has(id)))
   return fail('Unknown or duplicated on-court player');
  const row=new Float64Array(n);
  for(const id of home)row[idx.get(id)]=1;
  for(const id of away)row[idx.get(id)]=-1;
  const age=(cutoff-end)/86400000;
  X.push(row);Y.push(o.margin_per_100);W.push(o.possessions*Math.pow(0.5,age/half_life_days));
  maxObserved=Math.max(maxObserved,end);
 }
 if(X.length<min_observations)return fail('Insufficient pre-tip lineup observations');
 const A=Array.from({length:n},()=>new Float64Array(n)),b=new Float64Array(n);
 for(let i=0;i<n;i++){A[i][i]=lambda;b[i]=lambda*priors[i].box_prior;}
 for(let r=0;r<X.length;r++){
  const row=X[r],w=W[r];
  for(let i=0;i<n;i++)if(row[i]){b[i]+=w*row[i]*Y[r];
   for(let j=0;j<n;j++)if(row[j])A[i][j]+=w*row[i]*row[j];}
 }
 const beta=solve(A,b);
 if(!beta||beta.some(v=>!finite(v)))return fail('Ill-conditioned model');
 return {available:true,validated_probability:false,production:false,
  label:'Experimental ridge adjusted plus-minus with box-score priors',
  units:'estimated points per 100 possessions; uncalibrated',
  as_of_utc,observations_used:X.length,lambda,half_life_days,
  last_observation_utc:new Date(maxObserved).toISOString(),
  player_impacts:ids.map((player_id,i)=>({player_id,impact_per_100:beta[i]})),
  limitation:'Lineup effects, substitution selection, opponent strength and uncertainty remain imperfect; no probability or Elo adjustment is authorized'};
}
module.exports={estimate};
