'use strict';
/**
 * Unified probability challenger (offline). ONE logistic decision function with
 * Elo-based pretip strength and complementary, leakage-checked features.
 * No production switch until a later, genuinely unseen evaluation beats Elo.
 */
const E=require('./engine.js');
const NAMES=['bias','elo','recent_margin','rest','prior_srs','lineup'];
const DEFAULT=[0,1,0,0,0,0];
const clamp=(v,low,high)=>Math.max(low,Math.min(high,v));
const sigmoid=x=>1/(1+Math.exp(-clamp(x,-30,30)));
const logit=p=>Math.log(clamp(p,.000001,.999999)/(1-clamp(p,.000001,.999999)));
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const ms=s=>Date.parse(s);
function assertPregame(game,snapshot){
  if(snapshot==null)return false;
  const tip=ms(game.date),cutoff=ms(snapshot.as_of_utc);
  if(!finite(tip)||!finite(cutoff)||cutoff>tip||!snapshot.source||typeof snapshot.source!=='string')
    throw Error('Lineup snapshot requires sourced information available before tip');
  for(const side of ['home','away']){
    const p=snapshot[side];
    if(p==null)continue;
    if(!finite(p.player_net_points)||Math.abs(p.player_net_points)>30||!p.observed_at_utc)
      throw Error('Lineup impact requires bounded point estimate and observation timestamp');
    const observed=ms(p.observed_at_utc);
    if(!finite(observed)||observed>cutoff)
      throw Error('Lineup impact contains later or unverifiable information');
  }
  return true;
}
function rollingMargin(t){
  const rows=t?.recent||[];
  if(!rows.length)return 0;
  return rows.slice(-5).reduce((sum,g)=>sum+Number(g.margin||0),0)/Math.min(5,rows.length);
}
function features(game,state,profiles={},snapshot=null){
  assertPregame(game,snapshot);
  const base=E.forecast(game,state,profiles);
  const h=base.home,a=base.away;
  const recent=clamp((rollingMargin(h)-rollingMargin(a))/20,-2.5,2.5);
  const rest=base.homeRest==null||base.awayRest==null?0:clamp((base.homeRest-base.awayRest)/3,-2,2);
  const prior=base.priorUsed?clamp(((profiles[game.home.abbr]?.srs||0)-(profiles[game.away.abbr]?.srs||0))/10,-2,2):0;
  const hasLineup=!!(snapshot?.home&&snapshot?.away);
  const lineup=hasLineup?clamp((snapshot.home.player_net_points-snapshot.away.player_net_points)/10,-2.5,2.5):0;
  return {x:[1,logit(base.homeWin),recent,rest,prior,lineup],base,coverage:{
    historical_teams:state.finals,
    lineup_snapshot:hasLineup?'verified':'unavailable',
    lineup_source:hasLineup?snapshot.source:null,
    lineup_cutoff_utc:hasLineup?snapshot.as_of_utc:null
  }};
}
function predict(game,state,profiles={},snapshot=null,model=null){
  const {x,base,coverage}=features(game,state,profiles,snapshot);
  const w=model?.weights??DEFAULT;
  if(!Array.isArray(w)||w.length!==NAMES.length||!w.every(finite)||w[1]<0)
    throw Error('Invalid unified model weights');
  const z=x.reduce((sum,v,i)=>sum+v*w[i],0);
  const homeWin=clamp(sigmoid(z),.01,.99);
  return {model:'unified-challenger-v1',homeWin,awayWin:1-homeWin,
    homeScore:base.homeScore,awayScore:base.awayScore,
    explanation:Object.fromEntries(NAMES.map((name,i)=>[name,x[i]*w[i]])),
    coverage,training:model?.training??'untuned-baseline',baselineHomeWin:base.homeWin};
}
/** Train only explicit earlier-season rows; training set is never auto-expanded. */
function train(rows,{maxTrainSeason=2024,iterations=900,rate=.04,lambda=.025}={}){
  if(!Array.isArray(rows)||rows.length<25)throw Error('Insufficient rows');
  for(const r of rows){
    if(!Number.isInteger(r.season)||r.season>maxTrainSeason||r.season<2000)
      throw Error('Training attempted to use an unavailable future season');
    if(!Array.isArray(r.x)||r.x.length!==NAMES.length||!r.x.every(finite)||(r.y!==0&&r.y!==1))
      throw Error('Invalid training sample');
  }
  const w=[...DEFAULT],n=rows.length;
  for(let epoch=0;epoch<iterations;epoch++){
    const grad=new Array(w.length).fill(0);
    for(const r of rows){
      const p=sigmoid(r.x.reduce((s,x,i)=>s+x*w[i],0));
      const error=p-r.y;
      for(let j=0;j<w.length;j++)grad[j]+=error*r.x[j];
    }
    for(let j=0;j<w.length;j++){
      const regularize=j===0?0:lambda*(w[j]-DEFAULT[j]);
      w[j]-=rate*(grad[j]/n+regularize);
    }
    w[1]=Math.max(0,w[1]);
  }
  return {schema:1,weights:w,featureNames:NAMES,
    training:{last_season:maxTrainSeason,rows:n,source:'historical-final-outcomes'}};
}
function metric(rows){
  if(!rows.length)return {count:0,accuracy:null,brier:null,logLoss:null};
  const sum=rows.reduce((a,r)=>{const p=clamp(r.p,1e-9,1-1e-9);
    a.correct+=(p>=.5)===(r.y===1)?1:0;
    a.brier+=(p-r.y)**2;
    a.logLoss+=-(r.y*Math.log(p)+(1-r.y)*Math.log(1-p));return a;
  },{correct:0,brier:0,logLoss:0});
  return {count:rows.length,accuracy:sum.correct/rows.length,
    brier:sum.brier/rows.length,logLoss:sum.logLoss/rows.length};
}
module.exports={NAMES,DEFAULT,features,predict,train,metric,assertPregame};
