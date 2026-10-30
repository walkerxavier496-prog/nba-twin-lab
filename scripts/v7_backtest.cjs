#!/usr/bin/env node
/* NBA Twin Lab V7: rolling-origin audit of independent team/player models. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),E=require('../predict/engine.js');
const root=path.join(__dirname,'..');
const intelligence=JSON.parse(fs.readFileSync(path.join(root,'data','v7-intelligence.json'),'utf8'));
const historical=JSON.parse(fs.readFileSync(path.join(root,'data','historical-games.json'),'utf8'));
const context=JSON.parse(fs.readFileSync(path.join(root,'data','context.json'),'utf8'));
const args=Object.fromEntries(process.argv.slice(2).map((x,i,a)=>x.startsWith('--')?[x.slice(2),a[i+1]]:null).filter(Boolean));
const simulations=Math.max(100,Math.min(100000,Number(args.simulations)||300));
const bootstrapSamples=Math.max(100,Math.min(5000,Number(args.bootstrap)||800));
const output=path.resolve(args.output||path.join(root,'data','v7-model-report.json'));
const ORIGINS=[2023,2024,2025,2026],FRESH=2027;
const aliases={GS:'GSW',NY:'NYK',SA:'SAS',NO:'NOP',UTAH:'UTA',WSH:'WAS',PHO:'PHX',BRK:'BKN',CHO:'CHA'};
const canonical=x=>aliases[x]||x;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const mean=a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:null;
const logit=p=>Math.log(clamp(p,1e-8,1-1e-8)/(1-clamp(p,1e-8,1-1e-8)));
const sigmoid=x=>1/(1+Math.exp(-x));
const quantile=(a,q)=>{if(!a.length)return null;const b=a.slice().sort((x,y)=>x-y),i=(b.length-1)*q,l=Math.floor(i),h=Math.ceil(i);return b[l]+(b[h]-b[l])*(i-l)};
const gameById=new Map(historical.games.map(g=>[String(g.id),g]));
const teamIds=new Map();
for(const g of historical.games)for(const t of [g.home,g.away])teamIds.set(canonical(t.abbr),String(t.id));

function gameFromFeature(feature){
  const original=gameById.get(String(feature.result_id));
  const date=original?.date||feature.date+'T23:00:00Z';
  return {id:String(feature.result_id),date,season:feature.season,status:'final',
    home:{id:teamIds.get(canonical(feature.home.abbr)),abbr:canonical(feature.home.abbr),name:feature.home.name},
    away:{id:teamIds.get(canonical(feature.away.abbr)),abbr:canonical(feature.away.abbr),name:feature.away.name},
    homeScore:feature.home_score,awayScore:feature.away_score};
}
function canonicalGame(g){return {...g,home:{...g.home,abbr:canonical(g.home.abbr)},away:{...g.away,abbr:canonical(g.away.abbr)}}}
const featureGames=intelligence.games.map(f=>({feature:f,game:gameFromFeature(f)}));
const allGames=[...historical.games.map(canonicalGame),...featureGames.filter(x=>x.game.season===2027).map(x=>x.game)]
  .sort((a,b)=>new Date(a.date)-new Date(b.date)||String(a.id).localeCompare(String(b.id)));

function profilesFor(season){
  const rows=context.teams.filter(t=>t.season===season-1),out={};
  for(const t of rows)out[canonical(t.abbr)]={...t,abbr:canonical(t.abbr)};
  return out;
}
function row(game,p,hs,as,meta={}){
  const actual=game.homeScore>game.awayScore?1:0;
  return {id:game.id,date:game.date,season:game.season,p,actual,correct:(p>=.5)===(actual===1),
    brier:(p-actual)**2,logLoss:-(actual*Math.log(clamp(p,1e-9,1-1e-9))+(1-actual)*Math.log(clamp(1-p,1e-9,1-1e-9))),
    scoreError:(Math.abs(hs-game.homeScore)+Math.abs(as-game.awayScore))/2,homeScore:hs,awayScore:as,
    actualHomeScore:game.homeScore,actualAwayScore:game.awayScore,meta};
}
function calibration(picks,bins=10){
  const rows=[];for(let i=0;i<bins;i++){const low=i/bins,high=(i+1)/bins,part=picks.filter(x=>x.p>=low&&(i===bins-1?x.p<=high:x.p<high));if(part.length)rows.push({low,high,count:part.length,confidence:mean(part.map(x=>x.p)),actual:mean(part.map(x=>x.actual))})}
  return {bins:rows,ece:picks.length?rows.reduce((s,b)=>s+b.count/picks.length*Math.abs(b.confidence-b.actual),0):null};
}
function metrics(picks){const c=calibration(picks);return {count:picks.length,accuracy:mean(picks.map(x=>x.correct?1:0)),brier:mean(picks.map(x=>x.brier)),logLoss:mean(picks.map(x=>x.logLoss)),ece:c.ece,scoreMAE:mean(picks.map(x=>x.scoreError)),calibration:c.bins}}
function bySeason(picks){return Object.fromEntries([2022,2023,2024,2025,2026,2027].map(s=>[s,metrics(picks.filter(x=>x.season===s))]));}
function slices(picks){const groups={home_wins:x=>x.actual===1,away_wins:x=>x.actual===0,early_season:x=>x.meta.early,established:x=>!x.meta.early,back_to_back:x=>x.meta.b2b,rested:x=>!x.meta.b2b,low_rotation_confidence:x=>x.meta.rotation==='limited',established_rotation:x=>x.meta.rotation==='established'};return Object.fromEntries(Object.entries(groups).map(([k,f])=>[k,metrics(picks.filter(f))]));}
function rng(seed){let a=seed>>>0;return()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
function bootstrapCI(picks,reps,seed){const random=rng(seed),keys=['accuracy','brier','logLoss','ece','scoreMAE'],values=Object.fromEntries(keys.map(k=>[k,[]]));for(let r=0;r<reps;r++){const sample=Array.from({length:picks.length},()=>picks[Math.floor(random()*picks.length)]),m=metrics(sample);for(const k of keys)values[k].push(m[k])}return Object.fromEntries(keys.map(k=>[k,[quantile(values[k],.025),quantile(values[k],.975)]]));}
function paired(a,b,key,reps,seed){const random=rng(seed),values=[];for(let r=0;r<reps;r++){let d=0;for(let i=0;i<a.length;i++){const j=Math.floor(random()*a.length);d+=a[j][key]-b[j][key]}values.push(d/a.length)}return {estimate:mean(a.map((x,i)=>x[key]-b[i][key])),ci95:[quantile(values,.025),quantile(values,.975)]}}

const candidates=[];
for(const window of ['last5','last10','season'])for(const priorGames of [6,12,20])candidates.push({window,priorGames,playerWeight:0});
function analyticPick(item,cfg){const x=E.independentExpectation(item.game,item.feature.pregame,cfg);return row(item.game,x.homeWin,x.homeScore,x.awayScore)}
function tune(origin,player=false){
  const train=featureGames.filter(x=>x.game.season>=2022&&x.game.season<origin);
  let best=null;
  for(const base of candidates)for(const playerWeight of (player?[.25,.5,1]:[0])){
    const cfg={...base,playerWeight},picks=train.map(x=>analyticPick(x,cfg)),m=metrics(picks);
    if(!best||m.brier<best.training_brier)best={...cfg,training_brier:m.brier,training_games:picks.length};
  }
  return best;
}
const configs={team:{},player:{}};
for(const season of [2022,...ORIGINS,FRESH]){
  configs.team[season]=season===2022?{window:'last10',priorGames:12,playerWeight:0,training_games:0}:tune(season,false);
  configs.player[season]=season===2022?{window:'last10',priorGames:12,playerWeight:.5,training_games:0}:tune(season,true);
}

if(intelligence.schema!==1||!intelligence.strict_no_future_data||intelligence.coverage.evaluated_games!==6150)throw Error('V7 intelligence snapshot failed validation');
let leakageViolations=0;
const models={elo:[],v5_monte_carlo:[],v6_locked_blend:[],independent_team:[],player_adjusted:[],v7_combined:[]};
const playerUncombined=[];
console.log(`Replaying ${featureGames.length} games at ${simulations} possession simulations/model/game...`);
for(let index=0;index<featureGames.length;index++){
  const item=featureGames[index],{game,feature}=item,profiles=profilesFor(game.season);
  if(feature.pregame.home.as_of!==feature.date||feature.pregame.away.as_of!==feature.date)leakageViolations++;
  const state=E.ratings(allGames,game.date),elo=E.forecast(game,state,profiles);
  if(state.allGames.some(g=>new Date(g.date)>=new Date(game.date)))leakageViolations++;
  const v5=E.monteCarlo(game,state,profiles,{simulations,seed:`v7|v5|${game.id}`});
  const independent=E.independentMonteCarlo(game,feature.pregame,{...configs.team[game.season],simulations,seed:`v7|team|${game.id}`});
  const player=E.independentMonteCarlo(game,feature.pregame,{...configs.player[game.season],simulations,seed:`v7|player|${game.id}`});
  const meta={early:Math.min(feature.pregame.home.games,feature.pregame.away.games)<10,
    b2b:feature.pregame.home.rest_days===0||feature.pregame.away.rest_days===0,
    rotation:feature.pregame.home.rotation_confidence==='established'&&feature.pregame.away.rotation_confidence==='established'?'established':'limited'};
  const er=row(game,elo.homeWin,elo.homeScore,elo.awayScore,meta),vr=row(game,v5.homeWin,v5.homeScore,v5.awayScore,meta);
  const locked=sigmoid(-.05+.9*logit(.8*er.p+.2*vr.p));
  models.elo.push(er);models.v5_monte_carlo.push(vr);
  models.v6_locked_blend.push(row(game,locked,elo.homeScore,elo.awayScore,meta));
  models.independent_team.push(row(game,independent.homeWin,independent.homeScore,independent.awayScore,meta));
  playerUncombined.push(row(game,player.homeWin,player.homeScore,player.awayScore,meta));
  if((index+1)%500===0)console.log(`  ${index+1}/${featureGames.length}`);
}
if(leakageViolations)throw Error(`Detected ${leakageViolations} leakage/timestamp violations`);

const combinationWeights={};
for(const season of [2022,...ORIGINS,FRESH]){
  if(season===2022){combinationWeights[season]=.5;continue}
  const e=models.elo.filter(x=>x.season<season),p=playerUncombined.filter(x=>x.season<season);let best={weight:0,brier:Infinity};
  for(const weight of [0,.25,.5,.75,1]){const b=mean(e.map((x,i)=>{const q=(1-weight)*x.p+weight*p[i].p;return(q-x.actual)**2}));if(b<best.brier)best={weight,brier:b}}
  combinationWeights[season]=best.weight;
}
for(let i=0;i<playerUncombined.length;i++){
  const p=playerUncombined[i],e=models.elo[i],w=combinationWeights[p.season],q=(1-w)*e.p+w*p.p;
  models.player_adjusted.push(p);
  models.v7_combined.push({...p,p:q,homeScore:(1-w)*e.homeScore+w*p.homeScore,awayScore:(1-w)*e.awayScore+w*p.awayScore,
    correct:(q>=.5)===(p.actual===1),brier:(q-p.actual)**2,
    logLoss:-(p.actual*Math.log(clamp(q,1e-9,1-1e-9))+(1-p.actual)*Math.log(clamp(1-q,1e-9,1-1e-9))),
    scoreError:(Math.abs(((1-w)*e.homeScore+w*p.homeScore)-p.actualHomeScore)+Math.abs(((1-w)*e.awayScore+w*p.awayScore)-p.actualAwayScore))/2});
}

const rollingFilter=x=>ORIGINS.includes(x.season),freshFilter=x=>x.season===FRESH;
const summaries={};
for(const [name,picks] of Object.entries(models)){
  const rolling=picks.filter(rollingFilter),fresh=picks.filter(freshFilter);
  summaries[name]={rolling_origin:metrics(rolling),rolling_ci95:bootstrapCI(rolling,bootstrapSamples,0x7000+name.length),fresh_2027:metrics(fresh),fresh_ci95:fresh.length?bootstrapCI(fresh,bootstrapSamples,0x7100+name.length):null,by_season:bySeason(picks),slices:slices(rolling)};
}
const base=models.elo.filter(rollingFilter);
const differences={};
for(const name of ['v5_monte_carlo','v6_locked_blend','independent_team','player_adjusted','v7_combined'])differences[`${name}_minus_elo_brier`]=paired(models[name].filter(rollingFilter),base,'brier',bootstrapSamples,0x7200+name.length);
differences.player_adjusted_minus_independent_team_brier=paired(models.player_adjusted.filter(rollingFilter),models.independent_team.filter(rollingFilter),'brier',bootstrapSamples,0x7301);
differences.v7_combined_minus_v6_locked_blend_brier=paired(models.v7_combined.filter(rollingFilter),models.v6_locked_blend.filter(rollingFilter),'brier',bootstrapSamples,0x7302);

const windowAudit={};
for(const cfg of candidates){const key=`${cfg.window}_prior${cfg.priorGames}`,picks=featureGames.filter(x=>ORIGINS.includes(x.game.season)).map(x=>analyticPick(x,cfg));windowAudit[key]=metrics(picks)}
const report={schema:1,generated_at_utc:new Date().toISOString(),strict_no_future_data:true,simulations_per_game:simulations,
  decision_basis:'Rolling-origin seasons 2023-2026. The previously published 2026 result is not relabelled untouched.',
  data:intelligence.coverage,source:intelligence.source,
  methodology:{evaluation_seasons:ORIGINS,initial_tuning_season:2022,fresh_check_season:FRESH,
    rolling_origin:'For each season, team/player configuration and Elo-combination weight use only earlier seasons.',
    fresh_check:'The 71-game 2026-27 check is frozen from 2022-26 parameters but was not preregistered; treat it as small-sample corroboration, not a pristine untouched test.',
    models:{elo:'Existing V6 Elo baseline',v5_monte_carlo:'Existing Elo-targeted V5 possession simulator',v6_locked_blend:'Previously fixed 80% Elo / 20% V5, slope .90, bias -.05',independent_team:'No Elo score target; rolling pregame efficiencies and event rates',player_adjusted:'Independent model plus prior-appearance expected-minutes impact proxy',v7_combined:'Rolling past-season weight between Elo and player-adjusted model'},
    availability:'Historical official pregame injury status was unavailable. Every displayed player status is inferred and target-game minutes/participation are never used.',
    bootstrap_samples:bootstrapSamples},
  leakage_checks:{games_checked:featureGames.length,violations:leakageViolations,target_game_minutes_used:false,target_game_box_score_used_in_features:false},
  rolling_configs:configs,combination_weights:combinationWeights,models:summaries,paired_differences:differences,
  ablations:{window_and_shrinkage_analytic:windowAudit,
    player_value:{team_only:summaries.independent_team.rolling_origin,with_player_proxy:summaries.player_adjusted.rolling_origin}},
  limitations:['No reliable archive of timestamped official pregame injury reports was found; availability is inferred from prior appearances and is not an injury diagnosis.','Player impact is a transparent, heavily clipped on-court/box proxy—not EPM, RAPM or causal player value.','NBA player logs omit DNP rows, so missed games can mean injury, rest, coach decision or roster movement.','Shot-location and tracking fields were not added because the validated game-log source did not provide a complete five-season pregame-safe series.','The upstream nba_data repository declares no license; only derived factual aggregates are published, not raw parquet files.',`Historical possession models use ${simulations} seeded simulations per game for tractability; the live engine supports 100,000.`]};
fs.writeFileSync(output,JSON.stringify(report));
console.log(`Wrote ${path.relative(root,output)}`);
for(const [name,s] of Object.entries(summaries)){const m=s.rolling_origin,f=s.fresh_2027;console.log(`${name}: rolling n=${m.count} acc=${(m.accuracy*100).toFixed(1)}% Brier=${m.brier.toFixed(4)} logloss=${m.logLoss.toFixed(4)} MAE=${m.scoreMAE.toFixed(2)} | 2027 n=${f.count} acc=${(f.accuracy*100).toFixed(1)}% Brier=${f.brier.toFixed(4)}`)}
