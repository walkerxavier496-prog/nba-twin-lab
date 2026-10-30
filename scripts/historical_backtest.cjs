#!/usr/bin/env node
/* NBA Twin Lab V6: reproducible, strictly pre-tipoff historical evaluation. */
'use strict';
const fs=require('node:fs');
const path=require('node:path');
const E=require('../predict/engine.js');
const root=path.join(__dirname,'..');
const history=JSON.parse(fs.readFileSync(path.join(root,'data','historical-games.json'),'utf8'));
const context=JSON.parse(fs.readFileSync(path.join(root,'data','context.json'),'utf8'));
const args=Object.fromEntries(process.argv.slice(2).map((x,i,a)=>x.startsWith('--')?[x.slice(2),a[i+1]]:null).filter(Boolean));
const simulations=Math.max(100,Math.min(100000,Number(args.simulations)||1000));
const bootstrapSamples=Math.max(100,Math.min(10000,Number(args.bootstrap)||1000));
const output=path.resolve(args.output||path.join(root,'data','historical-model-report.json'));
const EVAL=[2022,2023,2024,2025,2026],TRAIN=[2022,2023,2024],VALIDATION=[2025],TEST=[2026];
const aliases={GS:'GSW',NY:'NYK',SA:'SAS',NO:'NOP',UTAH:'UTA',WSH:'WAS',PHX:'PHO',BKN:'BRK',CHA:'CHO'};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const mean=a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:null;
const logit=p=>Math.log(clamp(p,1e-8,1-1e-8)/(1-clamp(p,1e-8,1-1e-8)));
const sigmoid=x=>1/(1+Math.exp(-x));
const quantile=(a,q)=>{if(!a.length)return null;const b=a.slice().sort((x,y)=>x-y),i=(b.length-1)*q,l=Math.floor(i),h=Math.ceil(i);return b[l]+(b[h]-b[l])*(i-l)};

function profilesFor(season,tendencies=true){
  const rows=context.teams.filter(t=>t.season===season-1).map(t=>tendencies?t:{season:t.season,abbr:t.abbr,srs:t.srs});
  const out=Object.fromEntries(rows.map(t=>[t.abbr,t]));
  for(const [from,to] of Object.entries(aliases))if(out[to])out[from]=out[to];
  if(new Set(rows.map(x=>x.abbr)).size!==30)throw Error(`Missing prior-season profiles for ${season}`);
  return out;
}
function row(game,p,hs,as,meta={}){
  const actual=game.homeScore>game.awayScore?1:0;
  return {id:game.id,date:game.date,season:game.season,p,actual,
    correct:(p>=.5)===(actual===1),brier:(p-actual)**2,
    scoreError:(Math.abs(hs-game.homeScore)+Math.abs(as-game.awayScore))/2,...meta};
}
function calibration(picks,bins=10){
  const rows=[];
  for(let i=0;i<bins;i++){
    const low=i/bins,high=(i+1)/bins,part=picks.filter(x=>x.p>=low&&(i===bins-1?x.p<=high:x.p<high));
    if(part.length)rows.push({low,high,count:part.length,confidence:mean(part.map(x=>x.p)),actual:mean(part.map(x=>x.actual))});
  }
  return {bins:rows,ece:picks.length?rows.reduce((s,b)=>s+b.count/picks.length*Math.abs(b.confidence-b.actual),0):null};
}
function metrics(picks,withCalibration=true){
  const c=withCalibration?calibration(picks):{bins:[],ece:null};
  return {count:picks.length,accuracy:mean(picks.map(x=>x.correct?1:0)),brier:mean(picks.map(x=>x.brier)),
    logLoss:mean(picks.map(x=>{const p=clamp(x.p,1e-9,1-1e-9);return -(x.actual*Math.log(p)+(1-x.actual)*Math.log(1-p))})),
    scoreMAE:mean(picks.map(x=>x.scoreError)),ece:c.ece,calibration:c.bins};
}
function applyCombo(elo,mc,cfg){
  const base=(1-cfg.blend)*elo.p+cfg.blend*mc.p,p=sigmoid(cfg.bias+cfg.slope*logit(base));
  const hs=(1-cfg.scoreBlend)*elo.homeScore+cfg.scoreBlend*mc.homeScore;
  const as=(1-cfg.scoreBlend)*elo.awayScore+cfg.scoreBlend*mc.awayScore;
  return row(elo.game,p,hs,as,{meta:elo.meta,homeScore:hs,awayScore:as,game:elo.game});
}
function tune(elo,mc){
  const train=elo.map((e,i)=>[e,mc[i]]).filter(([e])=>TRAIN.includes(e.season));
  let best=null;
  for(let wi=0;wi<=20;wi++)for(let si=6;si<=14;si++)for(let bi=-4;bi<=4;bi++){
    const cfg={blend:wi/20,slope:si/10,bias:bi*.05,scoreBlend:0};
    let loss=0;
    for(const [a,b] of train){const p=sigmoid(cfg.bias+cfg.slope*logit((1-cfg.blend)*a.p+cfg.blend*b.p));loss+=(p-a.actual)**2}
    loss/=train.length;
    if(!best||loss<best.brier)best={...cfg,brier:loss};
  }
  let score={weight:0,mae:Infinity};
  for(let wi=0;wi<=20;wi++){
    const w=wi/20,mae=mean(train.map(([a,b])=>{const hs=(1-w)*a.homeScore+w*b.homeScore,as=(1-w)*a.awayScore+w*b.awayScore;return (Math.abs(hs-a.game.homeScore)+Math.abs(as-a.game.awayScore))/2}));
    if(mae<score.mae)score={weight:w,mae};
  }
  return {...best,scoreBlend:score.weight,trainingScoreMAE:score.mae};
}
function rng(seed){let a=seed>>>0;return()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
function bootstrapCI(picks,reps,seed){
  const random=rng(seed),keys=['accuracy','brier','logLoss','scoreMAE','ece'],values=Object.fromEntries(keys.map(k=>[k,[]]));
  for(let r=0;r<reps;r++){
    const sample=new Array(picks.length);for(let i=0;i<picks.length;i++)sample[i]=picks[Math.floor(random()*picks.length)];
    const m=metrics(sample,true);for(const k of keys)values[k].push(m[k]);
  }
  return Object.fromEntries(keys.map(k=>[k,[quantile(values[k],.025),quantile(values[k],.975)]]));
}
function pairedDifference(a,b,reps,seed,key){
  const random=rng(seed),values=[];
  for(let r=0;r<reps;r++){let da=0,db=0;for(let i=0;i<a.length;i++){const j=Math.floor(random()*a.length);da+=a[j][key];db+=b[j][key]}values.push((da-db)/a.length)}
  return {estimate:mean(a.map((x,i)=>x[key]-b[i][key])),ci95:[quantile(values,.025),quantile(values,.975)]};
}
function splitMetrics(picks){return {training:metrics(picks.filter(x=>TRAIN.includes(x.season))),validation:metrics(picks.filter(x=>VALIDATION.includes(x.season))),test:metrics(picks.filter(x=>TEST.includes(x.season)))}}
function seasonMetrics(picks){return Object.fromEntries(EVAL.map(s=>[s,metrics(picks.filter(x=>x.season===s))]));}
function slices(picks){
  const groups={actual_home_win:x=>x.actual===1,actual_away_win:x=>x.actual===0,
    early_season:x=>x.meta.early,established:x=>!x.meta.early,
    back_to_back:x=>x.meta.b2b,not_back_to_back:x=>!x.meta.b2b,
    home_rest_edge:x=>x.meta.rest==='home',away_rest_edge:x=>x.meta.rest==='away',equal_or_unknown_rest:x=>x.meta.rest==='equal'};
  return Object.fromEntries(Object.entries(groups).map(([k,f])=>[k,metrics(picks.filter(f))]));
}

if(history.schema!==1||history.coverage.evaluation_games!==6150)throw Error('Historical snapshot is incomplete or unvalidated');
const games=history.games;
const elo=[],mc=[],mcNoTendencies=[];
let leakageViolations=0;
console.log(`Replaying ${history.coverage.evaluation_games} games with ${simulations} simulations per Monte Carlo model...`);
for(const game of games.filter(g=>EVAL.includes(g.season))){
  const state=E.ratings(games,game.date),profiles=profilesFor(game.season,true),srsOnly=profilesFor(game.season,false);
  if(state.allGames.some(g=>new Date(g.date)>=new Date(game.date)))leakageViolations++;
  const e=E.forecast(game,state,profiles);
  const meta={early:Math.min(e.home.games,e.away.games)<10,b2b:e.homeRest===0||e.awayRest===0,
    rest:e.homeRest==null||e.awayRest==null||e.homeRest===e.awayRest?'equal':e.homeRest>e.awayRest?'home':'away'};
  const a=row(game,e.homeWin,e.homeScore,e.awayScore,{meta,homeScore:e.homeScore,awayScore:e.awayScore,game});
  const m=E.monteCarlo(game,state,profiles,{simulations,seed:`v6|full|${game.id}`});
  const n=E.monteCarlo(game,state,srsOnly,{simulations,seed:`v6|full|${game.id}`});
  elo.push(a);
  mc.push(row(game,m.homeWin,m.homeScore,m.awayScore,{meta,homeScore:m.homeScore,awayScore:m.awayScore,game}));
  mcNoTendencies.push(row(game,n.homeWin,n.homeScore,n.awayScore,{meta,homeScore:n.homeScore,awayScore:n.awayScore,game}));
  if(elo.length%500===0)console.log(`  ${elo.length}/${history.coverage.evaluation_games}`);
}
if(leakageViolations)throw Error(`Detected ${leakageViolations} future-game state violations`);
const chosen=tune(elo,mc);
const combo=elo.map((e,i)=>applyCombo(e,mc[i],chosen));
const models={elo,monte_carlo:mc,combined:combo};
const summaries={};
for(const [name,picks] of Object.entries(models)){
  const test=picks.filter(x=>TEST.includes(x.season));
  summaries[name]={overall:metrics(picks),by_season:seasonMetrics(picks),by_split:splitMetrics(picks),
    slices:slices(picks),test_ci95:bootstrapCI(test,bootstrapSamples,0x600D+name.length)};
}
const test={elo:elo.filter(x=>TEST.includes(x.season)),monte_carlo:mc.filter(x=>TEST.includes(x.season)),combined:combo.filter(x=>TEST.includes(x.season))};
const full=metrics(mc),ablated=metrics(mcNoTendencies);
const report={schema:1,generated_at_utc:new Date().toISOString(),strict_no_future_data:true,
  methodology:{walk_forward:'Each game is reconstructed immediately before tipoff from earlier finals only.',
    profiles:'Only the previous completed season team profile is used; same-season and future profiles are rejected.',
    split:{training:TRAIN,validation:VALIDATION,test:TEST},
    optimization:'Blend, calibration slope/bias, and score weight selected on training seasons only; 2025 is validation and 2026 remains untouched test.',
    early_season:'Either team had played fewer than 10 current-season games before tipoff.',
    back_to_back:'At least one team had zero full rest days.',bootstrap_samples:bootstrapSamples},
  data:{...history.coverage,results_source:history.source.results,profile_source:history.source.validation,
    advanced_fields:['offensive rating','defensive rating','pace','effective FG%','turnover rate','offensive rebound rate','three-point attempt rate','free-throw rate','opponent eFG%','opponent turnover rate','defensive rebound rate']},
  simulations_per_game:simulations,leakage_checks:{games_checked:elo.length,violations:leakageViolations},
  optimization:{objective:'training Brier score',chosen},models:summaries,
  advanced_tendency_ablation:{description:'V5 Monte Carlo compared with the same SRS prior but all matchup tendency fields replaced by league-average fallbacks.',
    full:full,without_tendencies:ablated,difference_full_minus_ablated:{brier:full.brier-ablated.brier,logLoss:full.logLoss-ablated.logLoss,scoreMAE:full.scoreMAE-ablated.scoreMAE}},
  paired_test_differences:{combined_minus_elo_brier:pairedDifference(test.combined,test.elo,bootstrapSamples,601,'brier'),
    combined_minus_monte_carlo_brier:pairedDifference(test.combined,test.monte_carlo,bootstrapSamples,602,'brier'),
    combined_minus_elo_score_mae:pairedDifference(test.combined,test.elo,bootstrapSamples,603,'scoreError'),
    combined_minus_monte_carlo_score_mae:pairedDifference(test.combined,test.monte_carlo,bootstrapSamples,604,'scoreError')},
  limitations:['No injuries, projected lineups, travel distance, player availability, betting markets, or live tracking data.',
    'Historical results come from an unofficial ESPN endpoint; every season is independently reconciled to 30 Basketball Reference team records.',
    `Historical Monte Carlo uses ${simulations.toLocaleString()} draws per game for tractability; the live simulator supports up to 100,000.`,
    'Previous-season team tendencies are safe but intentionally slow to react to trades, coaching changes, and roster turnover.']};
fs.writeFileSync(output,JSON.stringify(report));
console.log(`Wrote ${path.relative(root,output)}`);
console.log(`Chosen blend: ${(chosen.blend*100).toFixed(0)}% Monte Carlo, slope ${chosen.slope.toFixed(2)}, bias ${chosen.bias.toFixed(2)}, score blend ${(chosen.scoreBlend*100).toFixed(0)}%`);
for(const [name,s] of Object.entries(summaries)){const m=s.by_split.test;console.log(`${name}: test n=${m.count}, acc=${(m.accuracy*100).toFixed(1)}%, Brier=${m.brier.toFixed(4)}, logloss=${m.logLoss.toFixed(4)}, score MAE=${m.scoreMAE.toFixed(2)}`)}
