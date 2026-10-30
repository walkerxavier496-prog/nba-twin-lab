#!/usr/bin/env node
/* V8 research audit: direct, regularized pregame features on top of Elo.
   Experimental only: never promote a model from the test season. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),E=require('../predict/engine.js');
const ROOT=path.join(__dirname,'..');
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const sigmoid=x=>1/(1+Math.exp(-clamp(x,-30,30)));
const logit=p=>Math.log(clamp(p,.000001,.999999)/(1-clamp(p,.000001,.999999)));
const mean=a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:null;
const SEASONS=[2023,2024,2025,2026],FRESH=2027;
const aliases={GS:'GSW',NY:'NYK',SA:'SAS',NO:'NOP',UTAH:'UTA',WSH:'WAS',PHO:'PHX',BRK:'BKN',CHO:'CHA'};
const canonical=x=>aliases[x]||x;
const modes={
  elo:[],
  calibrated:['elo'],
  player:['elo','player'],
  team:['elo','team','rest'],
  combined:['elo','player','team','rest','continuity']
};
function pregameFeatures(item,elo){
  const h=item.feature.pregame.home,a=item.feature.pregame.away;
  if(h.as_of!==item.feature.date||a.as_of!==item.feature.date)throw Error('Feature timestamp mismatch '+item.game.id);
  const net=s=>{
    const c=s.season||{},p=s.prior||{},n=Number(s.games)||0;
    const current=Number(c.adj_ortg)-Number(c.adj_drtg);
    const prior=Number(p.adj_ortg)-Number(p.adj_drtg);
    if(Number.isFinite(current)&&Number.isFinite(prior))return (n*current+18*prior)/(n+18);
    if(Number.isFinite(prior))return prior;
    return Number.isFinite(current)?current:0;
  };
  const b2b=s=>s.rest_days===0?1:0;
  const y=item.game.homeScore>item.game.awayScore?1:0;
  if(item.game.homeScore===item.game.awayScore)throw Error('Tied final');
  return {id:item.game.id,season:item.game.season,date:item.game.date,y,p:elo.homeWin,
    features:{
      elo:clamp(logit(elo.homeWin),-4,4),
      player:clamp((Number(h.player_delta||0)-Number(a.player_delta||0))/4,-2,2),
      team:clamp((net(h)-net(a)-elo.margin)/12,-2,2),
      rest:b2b(a)-b2b(h),
      continuity:clamp((Number(h.rotation_continuity||0)-Number(a.rotation_continuity||0))*2,-2,2)
    },
    early:Math.min(h.games,a.games)<10};
}
function solve(A,b){
  const n=b.length,M=A.map((row,i)=>[...row,b[i]]);
  for(let c=0;c<n;c++){
    let pivot=c;for(let r=c+1;r<n;r++)if(Math.abs(M[r][c])>Math.abs(M[pivot][c]))pivot=r;
    if(Math.abs(M[pivot][c])<1e-12)throw Error('Singular model fit');
    [M[c],M[pivot]]=[M[pivot],M[c]];
    const v=M[c][c];for(let k=c;k<=n;k++)M[c][k]/=v;
    for(let r=0;r<n;r++)if(r!==c){const f=M[r][c];for(let k=c;k<=n;k++)M[r][k]-=f*M[c][k];}
  }
  return M.map(r=>r[n]);
}
function fit(rows,mode){
  const names=Array.isArray(mode)?mode:modes[mode],d=names.length+1;
  // Fixed regularisation, no search on the evaluated or fresh season.
  const lambda=18,prior=Array(d).fill(0);
  if(names.includes('elo'))prior[names.indexOf('elo')+1]=1;
  const beta=prior.slice();
  for(let iter=0;iter<24;iter++){
    const H=Array.from({length:d},()=>Array(d).fill(0)),g=Array(d).fill(0);
    for(const row of rows){
      const x=[1,...names.map(n=>row.features[n])],z=x.reduce((s,v,j)=>s+v*beta[j],0),p=sigmoid(z),w=Math.max(p*(1-p),.00001);
      for(let j=0;j<d;j++){g[j]+=(p-row.y)*x[j];for(let k=0;k<d;k++)H[j][k]+=w*x[j]*x[k];}
    }
    for(let j=0;j<d;j++){const penalty=j===0?2:lambda;g[j]+=penalty*(beta[j]-prior[j]);H[j][j]+=penalty;}
    const delta=solve(H,g);
    for(let j=0;j<d;j++)beta[j]-=delta[j];
    if(Math.max(...delta.map(Math.abs))<1e-7)break;
  }
  return {names,coefficients:beta,training_games:rows.length,regularization:lambda};
}
function predict(row,model){return sigmoid(model.coefficients[0]+model.names.reduce((s,n,i)=>s+model.coefficients[i+1]*row.features[n],0));}
function metrics(rows){
  if(!rows.length)return {games:0,accuracy:null,brier:null,logLoss:null};
  return {games:rows.length,accuracy:mean(rows.map(r=>(r.p>=.5)===(r.y===1)?1:0)),
    brier:mean(rows.map(r=>(r.p-r.y)**2)),
    logLoss:mean(rows.map(r=>-r.y*Math.log(clamp(r.p,1e-8,1-1e-8))-(1-r.y)*Math.log(clamp(1-r.p,1e-8,1-1e-8))))};
}
function quantile(values,p){const a=values.slice().sort((x,y)=>x-y),i=(a.length-1)*p,lo=Math.floor(i),hi=Math.ceil(i);return a[lo]+(a[hi]-a[lo])*(i-lo);}
function pairedBootstrap(a,b,reps=800){
  let seed=0x81234567;const random=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return (seed>>>0)/4294967296;};
  const delta=mean(a.map((r,i)=>(r.p-r.y)**2-(b[i].p-b[i].y)**2)),draws=[];
  for(let j=0;j<reps;j++){let s=0;for(let k=0;k<a.length;k++){const i=Math.floor(random()*a.length);s+=(a[i].p-a[i].y)**2-(b[i].p-b[i].y)**2;}draws.push(s/a.length);}
  return {delta_brier:delta,ci95:[quantile(draws,.025),quantile(draws,.975)]};
}
function buildRows(){
  const intel=JSON.parse(fs.readFileSync(path.join(ROOT,'data/v7-intelligence.json'),'utf8'));
  const history=JSON.parse(fs.readFileSync(path.join(ROOT,'data/historical-games.json'),'utf8'));
  const context=JSON.parse(fs.readFileSync(path.join(ROOT,'data/context.json'),'utf8'));
  if(!intel.strict_no_future_data||intel.coverage.evaluated_games!==6150)throw Error('Invalid V7 pregame dataset');
  const historicalById=new Map(history.games.map(g=>[String(g.id),g]));
  const ids=new Map();for(const g of history.games)for(const t of [g.home,g.away])ids.set(canonical(t.abbr),String(t.id));
  const features=intel.games.map(f=>{
    const original=historicalById.get(String(f.result_id));
    const game={id:String(f.result_id),date:original?.date||f.date+'T23:00:00Z',season:f.season,status:'final',
      home:{id:ids.get(canonical(f.home.abbr)),abbr:canonical(f.home.abbr),name:f.home.name},
      away:{id:ids.get(canonical(f.away.abbr)),abbr:canonical(f.away.abbr),name:f.away.name},
      homeScore:f.home_score,awayScore:f.away_score};
    return {game,feature:f};
  });
  const allGames=[...history.games.map(g=>({...g,home:{...g.home,abbr:canonical(g.home.abbr)},away:{...g.away,abbr:canonical(g.away.abbr)}})),
    ...features.filter(x=>x.game.season===FRESH).map(x=>x.game)].sort((a,b)=>Date.parse(a.date)-Date.parse(b.date));
  const profileMap=new Map();
  const rows=[];
  for(let i=0;i<features.length;i++){
    const item=features[i],game=item.game;
    if(!profileMap.has(game.season)){
      const p={};for(const t of context.teams.filter(t=>t.season===game.season-1))p[canonical(t.abbr)]={...t,abbr:canonical(t.abbr)};
      profileMap.set(game.season,p);
    }
    const state=E.ratings(allGames,game.date);
    if(state.allGames.some(g=>Date.parse(g.date)>=Date.parse(game.date)))throw Error('Pregame leakage '+game.id);
    const elo=E.forecast(game,state,profileMap.get(game.season));
    rows.push(pregameFeatures(item,elo));
    if((i+1)%1000===0)console.log('Prepared '+(i+1)+' / '+features.length+' games');
  }
  if(rows.length!==6221)throw Error('Expected 6150 historical + 71 fresh games, got '+rows.length);
  return rows;
}
function audit(rows){
  const picks=Object.fromEntries(Object.keys(modes).map(k=>[k,[]]));
  const fits={};
  for(const season of [...SEASONS,FRESH]){
    const training=rows.filter(r=>r.season<season),test=rows.filter(r=>r.season===season);
    if(training.length<1000||!test.length)throw Error('Insufficient rolling data for '+season);
    fits[season]={};
    for(const mode of Object.keys(modes)){
      const model=mode==='elo'?null:fit(training,mode);
      fits[season][mode]=model;
      picks[mode].push(...test.map(r=>({...r,p:mode==='elo'?r.p:predict(r,model)})));
    }
  }
  const report={schema:1,generated_at_utc:new Date().toISOString(),status:'experimental_not_promoted',
    leakage_safe:true,decision_rule:'Evaluate rolling 2023-26 only; inspect 2027 separately. No automatic live promotion.',
    features:{player:'Inferred player availability and expected-minutes delta (not official injuries)',team:'Opponent-adjusted net rating relative to Elo-implied margin',rest:'Back-to-back indicator',continuity:'Inferred rotation continuity'},
    training:{method:'Regularized logistic regression; fixed L2 penalty 18; training only on seasons before evaluation',fits},
    models:{},comparisons:{},limits:['Player availability is inferred from prior appearances, not verified injury reports.','Historical model features are generated from pregame snapshots; roster data can lag trades.','Current 2027 sample is too small to establish improvement.','No model is deployed to live picks from this audit.']};
  for(const [name,p] of Object.entries(picks)){
    const rolling=p.filter(r=>SEASONS.includes(r.season)),fresh=p.filter(r=>r.season===FRESH);
    report.models[name]={rolling:metrics(rolling),fresh:metrics(fresh),
      by_season:Object.fromEntries([...SEASONS,FRESH].map(s=>[s,metrics(p.filter(r=>r.season===s))])),
      early:metrics(rolling.filter(r=>r.early)),established:metrics(rolling.filter(r=>!r.early))};
  }
  for(const name of Object.keys(modes).filter(x=>x!=='elo')){
    report.comparisons[name+'_minus_elo']=pairedBootstrap(picks[name].filter(r=>SEASONS.includes(r.season)),picks.elo.filter(r=>SEASONS.includes(r.season)));
  }
  return report;
}
if(require.main===module){
  const output=path.resolve(process.argv[2]||path.join(ROOT,'data/v8-research-report.json'));
  const report=audit(buildRows());
  fs.writeFileSync(output,JSON.stringify(report));
  console.log('Wrote '+output);
  for(const [k,v] of Object.entries(report.models))console.log(k,'rolling',v.rolling,'fresh',v.fresh);
}
module.exports={pregameFeatures,fit,predict,metrics,pairedBootstrap,buildRows,audit};
