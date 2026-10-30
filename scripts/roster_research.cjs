#!/usr/bin/env node
/* Cross-season roster-change research; never fit using the evaluated season.
 * Prior-season rotations are taken from historical PRE-game snapshots and
 * cannot contain target-season results. No official injury feed is assumed.
 */
'use strict';
const fs=require('node:fs'),path=require('node:path');
const V8=require('./v8_research.cjs'),S=require('./game_science.cjs'),R=require('../predict/roster.js');
const ROOT=path.join(__dirname,'..'),SEASONS=[2023,2024,2025,2026],FRESH=2027;
const read=p=>JSON.parse(fs.readFileSync(path.join(ROOT,'data',p),'utf8'));
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const MODE={
 elo:[],
 combined:['elo','player','team','rest','continuity'],
 roster_light:['elo','player','team','rest','continuity','rosterShock','eloUncertainty'],
 roster:['elo','player','team','rest','continuity','rosterShock','eloUncertainty','currentChange']
};
function buildRows(intel,baseRows){
 if(!intel.strict_no_future_data||intel.coverage?.evaluated_games!==6150)throw Error('Unverified historical feature set');
 const index=R.priorRotationIndex(intel.games);
 const byId=new Map(baseRows.map(r=>[String(r.id),r]));
 let complete=0,missing=0,earlyComplete=0;
 const rows=intel.games.map(f=>{
  const row=byId.get(String(f.result_id));
  if(!row||row.season!==f.season)throw Error('Mismatched historical pregame '+f.result_id);
  const home=f.pregame?.home,away=f.pregame?.away;
  if(!home||!away||home.as_of!==f.date||away.as_of!==f.date)throw Error('Pregame timestamp mismatch '+f.result_id);
  const pH=index.get((f.season-1)+'|'+R.canonical(f.home.abbr));
  const pA=index.get((f.season-1)+'|'+R.canonical(f.away.abbr));
  if((pH&&pH.date>=f.date)||(pA&&pA.date>=f.date))throw Error('Previous-season snapshot leaked future');
  const x=R.features(home,away,pH,pA,{homeWin:row.p,margin:0});
  if(x){complete++;if(Math.min(home.games,away.games)<10)earlyComplete++;}
  else missing++;
  return {...row,early:Math.min(home.games,away.games)<10,
   rosterCoverage:!!x,rosterUncertainty:x?.rosterUncertainty??null,
   features:{...row.features,rosterShock:x?.rosterShock??0,
    eloUncertainty:x?.eloUncertainty??0,currentChange:x?.currentChange??0}};
 });
 if(rows.length!==baseRows.length)throw Error('Unexpected unmatched baseline games');
 return {rows,index,coverage:{complete,missing,earlyComplete,total:rows.length}};
}
function evaluate(rows){
 const predictions=Object.fromEntries(Object.keys(MODE).map(k=>[k,[]]));
 const fits={};
 for(const season of [...SEASONS,FRESH]){
  const train=rows.filter(r=>r.season<season),test=rows.filter(r=>r.season===season);
  if(train.length<1000||test.length<30)throw Error('Insufficient rolling sample '+season);
  fits[season]={};
  for(const [name,features] of Object.entries(MODE)){
   const model=name==='elo'?null:V8.fit(train,features);
   fits[season][name]=model;
   predictions[name].push(...test.map(row=>({...row,p:model?V8.predict(row,model):row.p})));
  }
 }
 const report={
  schema:1,generated_at_utc:new Date().toISOString(),status:'research_only_not_promoted',
  strict_no_future_data:true,provenance:'Only pregame historical V7 snapshots and prior-season rotations, without future box scores',
  method:'Frozen-L2 logistic fit on earlier seasons; 2023–2026 rolling origin, 2027 previously inspected',
  feature_definitions:{
   rosterShock:'Early-season previous-net strength removed proportionally to last-season rotation minutes absent from current inferred rotation',
   eloUncertainty:'Elo logit times estimated fraction of prior-season rotation replaced, exponentially faded after current-season games',
   currentChange:'Opponent-adjusted current net change relative to prior net, with eight-game shrinkage',
   continuity:'Within-season inferred rotation continuity, NOT offseason roster retention',
   availability:'Inferred player appearances, NOT verified injury reports'
  },
  model_features:MODE,models:{},fits,comparisons:{},sample:{games:rows.length,rolling:4920,fresh:71},
  limits:['Rotation overlap can confuse injuries with trades; current-season player minutes are inferred, not confirmed.',
   'The historical rotation index uses the final pregame snapshot of the previous regular season; postseason and off-season transactions are not fully captured.',
   '2026–27 has been inspected already and is not a new holdout.',
   'No automatic promotion: require evidence over the established player-adjusted model, not just raw Elo.']
 };
 for(const [name,p] of Object.entries(predictions)){
  const rolling=p.filter(r=>SEASONS.includes(r.season)),fresh=p.filter(r=>r.season===FRESH);
  report.models[name]={rolling:S.metrics(rolling),fresh:S.metrics(fresh),
   early:S.metrics(rolling.filter(r=>r.early)),
   high_roster_change:S.metrics(rolling.filter(r=>r.rosterCoverage&&r.rosterUncertainty>=.25)),
   by_season:Object.fromEntries([...SEASONS,FRESH].map(season=>[season,S.metrics(p.filter(r=>r.season===season))]))};
 }
 for(const candidate of ['roster_light','roster']){
  for(const baseline of ['elo','combined']){
   const a=predictions[candidate].filter(r=>SEASONS.includes(r.season));
   const b=predictions[baseline].filter(r=>SEASONS.includes(r.season));
   report.comparisons[candidate+'_minus_'+baseline]=S.pairedDayBootstrap(a,b,600);
  }
 }
 report.decision='No automatic promotion; roster model must beat combined on Brier AND log loss across at least three evaluation seasons, and improve early-season performance.';
 return report;
}
function currentPriorRotations(index,season=FRESH){
 const teams={};
 for(const [key,value] of index){
  const [year,abbr]=key.split('|');
  if(Number(year)===season-1)teams[abbr]=value;
 }
 if(Object.keys(teams).length!==30)throw Error('Expected 30 prior-season team rotations, found '+Object.keys(teams).length);
 return {schema:1,strict_no_future_data:true,target_season:season,
  provenance:'Final pregame rotation snapshots of previous regular season, from V7 historical feature archive',
  availability:'Inferred; not an official transaction or injury report',teams};
}
if(require.main===module){
 const intel=read('v7-intelligence.json'),base=V8.buildRows();
 const {rows,index,coverage}=buildRows(intel,base);
 const report=evaluate(rows);
 report.coverage=coverage;
 fs.writeFileSync(path.join(ROOT,'data/roster-research-report.json'),JSON.stringify(report));
 fs.writeFileSync(path.join(ROOT,'data/roster-priors.json'),JSON.stringify(currentPriorRotations(index)));
 console.log('Rotation research coverage',coverage);
 for(const [name,model] of Object.entries(report.models))console.log(name,JSON.stringify({rolling:model.rolling,early:model.early,fresh:model.fresh}));
 console.log('Paired comparisons',JSON.stringify(report.comparisons));
}
module.exports={buildRows,evaluate,currentPriorRotations,MODE};
