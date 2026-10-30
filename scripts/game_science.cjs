#!/usr/bin/env node
/* Basketball-science research. Every feature is derived from a timestamped
 * pregame V7 snapshot or strictly earlier head-to-head final.
 * Experimental: never change the production predictor based on this report. */
'use strict';
const fs=require('node:fs'),path=require('node:path');
const V8=require('./v8_research.cjs');
const ROOT=path.join(__dirname,'..');
const SEASONS=[2023,2024,2025,2026],FRESH=2027;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const finite=x=>x===null||x===undefined||x===''?null:Number.isFinite(Number(x))?Number(x):null;
const mean=a=>a.length?a.reduce((s,v)=>s+v,0)/a.length:null;
const aliases={GS:'GSW',NY:'NYK',SA:'SAS',NO:'NOP',UTAH:'UTA',WSH:'WAS',PHO:'PHX',BRK:'BKN',CHO:'CHA'};
const canonical=x=>aliases[x]||x;
const modeFeatures={
  elo:[],
  calibrated:['elo'],
  strength:['elo','team'],
  form:['elo','team','momentum','restScience'],
  four_factors:['elo','team','shooting','turnovers','rebounding','freeThrows'],
  styles:['elo','team','shooting','threePointStyle','turnovers','rebounding','freeThrows','pace'],
  head_to_head:['elo','team','h2h'],
  full:['elo','team','momentum','restScience','shooting','threePointStyle','turnovers','rebounding','freeThrows','pace','h2h']
};
const {blended,matchup,scienceFeatures}=require('../predict/science.js');
function pairKey(a,b){return [canonical(a),canonical(b)].sort().join('|');}
function headToHeadPrior(history,game){
  const pair=pairKey(game.home.abbr,game.away.abbr);
  const meetings=(history.get(pair)||[]).filter(x=>x.date<game.date&&x.season>=game.season-2).slice(-8);
  if(!meetings.length)return {value:0,meetings:0};
  const home=canonical(game.home.abbr);
  let numerator=0,denominator=0;
  meetings.slice().reverse().forEach((x,i)=>{
    const weight=Math.pow(.85,i);
    numerator+=(x.winner===home?1:-1)*weight;
    denominator+=weight;
  });
  return {value:(numerator/denominator)*meetings.length/(meetings.length+6),meetings:meetings.length};
}
function pregameScienceRows(baselineRows,sourceGames){
  const byId=new Map(baselineRows.map(x=>[String(x.id),x]));
  if(byId.size!==baselineRows.length)throw Error('Duplicate baseline game IDs');
  const history=new Map(),out=[];
  const ordered=sourceGames.slice().sort((a,b)=>String(a.date).localeCompare(String(b.date))||String(a.result_id).localeCompare(String(b.result_id)));
  for(const f of ordered){
    const row=byId.get(String(f.result_id));
    if(!row)throw Error('Missing baseline for '+f.result_id);
    if(f.pregame?.home?.as_of!==f.date||f.pregame?.away?.as_of!==f.date)throw Error('Future or mismatched pregame snapshot '+f.result_id);
    const h2h=headToHeadPrior(history,f);
    out.push({...row,features:{...row.features,...scienceFeatures(f.pregame.home,f.pregame.away,h2h.value)},prior_meetings:h2h.meetings});
    const pair=pairKey(f.home.abbr,f.away.abbr),games=history.get(pair)||[];
    const winner=f.home_score>f.away_score?canonical(f.home.abbr):canonical(f.away.abbr);
    if(f.home_score===f.away_score)throw Error('Historical tie');
    games.push({date:f.date,season:f.season,winner});history.set(pair,games);
  }
  return out;
}
function buildRows(){
  const raw=JSON.parse(fs.readFileSync(path.join(ROOT,'data/v7-intelligence.json'),'utf8'));
  if(!raw.strict_no_future_data||raw.coverage?.evaluated_games!==6150)throw Error('Historical intelligence dataset not verified');
  const baseline=V8.buildRows();
  const rows=pregameScienceRows(baseline,raw.games);
  if(rows.length!==baseline.length)throw Error('Missing science predictions');
  return rows;
}
function logloss(row){
  const p=clamp(row.p,1e-9,1-1e-9);
  return -row.y*Math.log(p)-(1-row.y)*Math.log(1-p);
}
function metrics(rows){
  const m=V8.metrics(rows);
  const bins=Array.from({length:10},()=>[]);
  for(const row of rows)bins[Math.min(9,Math.floor(row.p*10))].push(row);
  const ece=rows.length?bins.reduce((s,b)=>s+(b.length/rows.length)*Math.abs((mean(b.map(x=>x.p))??0)-(mean(b.map(x=>x.y))??0)),0):null;
  return {...m,ece};
}
function quantile(values,p){
  const a=values.slice().sort((x,y)=>x-y),i=(a.length-1)*p,lo=Math.floor(i),hi=Math.ceil(i);
  return a[lo]+(a[hi]-a[lo])*(i-lo);
}
function pairedDayBootstrap(candidate,baseline,reps=800){
  if(candidate.length!==baseline.length||!candidate.length)throw Error('Invalid paired test');
  const groups=new Map();
  for(let i=0;i<candidate.length;i++){
    if(candidate[i].id!==baseline[i].id||candidate[i].y!==baseline[i].y)throw Error('Paired test ID mismatch');
    const date=String(candidate[i].date).slice(0,10);
    if(!groups.has(date))groups.set(date,[]);
    groups.get(date).push(i);
  }
  const days=[...groups.values()];
  let seed=0x89abcdef;
  const random=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return (seed>>>0)/4294967296;};
  const difference=i=>(candidate[i].p-candidate[i].y)**2-(baseline[i].p-baseline[i].y)**2;
  const observed=mean(candidate.map((_,i)=>difference(i))),samples=[];
  for(let j=0;j<reps;j++){
    let sum=0,n=0;
    for(let k=0;k<days.length;k++){
      const group=days[Math.floor(random()*days.length)];
      for(const i of group){sum+=difference(i);n++;}
    }
    samples.push(sum/n);
  }
  return {delta_brier:observed,ci95_day_clustered:[quantile(samples,.025),quantile(samples,.975)],days:days.length,repetitions:reps};
}
function evaluate(rows){
  const predictions=Object.fromEntries(Object.keys(modeFeatures).map(m=>[m,[]]));
  const fits={};
  for(const season of [...SEASONS,FRESH]){
    const train=rows.filter(r=>r.season<season),test=rows.filter(r=>r.season===season);
    if(train.length<1000||test.length<30)throw Error('Not enough training/test games '+season);
    fits[season]={};
    for(const [mode,names] of Object.entries(modeFeatures)){
      const model=mode==='elo'?null:V8.fit(train,names);
      fits[season][mode]=model;
      predictions[mode].push(...test.map(r=>({...r,p:mode==='elo'?r.p:V8.predict(r,model)})));
    }
  }
  const result={schema:1,generated_at_utc:new Date().toISOString(),status:'research_only_not_promoted',
    strict_no_future_data:true,headline:'Opponent-adjusted team quality, recent form, four-factor matchups, rest, pace and head-to-head',
    provenance:'Historical V7 pregame snapshots + prior-season profiles + completed games strictly before tipoff',
    model:'Fixed-L2 regularized logistic regression fitted exclusively on earlier seasons',
    validation:'Four rolling-origin seasons (2022-23 through 2025-26); 2026-27 reported separately, previously inspected',
    decision:'Do not automatically promote. Require robust lower Brier AND log loss in at least 3/4 seasons plus uncertainty review and new forward-only monitoring.',
    warnings:['Momentum is an opponent-adjusted short-term efficiency trend, not psychological momentum.',
      'Head-to-head is a prior-meetings residual signal, NOT an emotional rivalry bonus; sample is tiny and confounded by roster changes.',
      'Four-factor matchup adjustments and momentum may be redundant with Elo; comparisons versus calibrated Elo and adjusted strength are required.',
      'No verified historical injuries, travel mileage, coaching tactics or confirmed lineups. No fictional features are inserted.',
      'This research evaluates game winners, not margin accuracy or total score accuracy.',
      'This 2026-27 season is an inspected diagnostic sample, not a new untouched holdout.'],
    features:{
      momentum:'Shrunk difference between opponent-adjusted last-five and season net ratings',
      restScience:'Pregame days-rest advantage capped at three days',
      shooting:'Four Factors: expected eFG% from offense shooting and opponent eFG% allowed',
      threePointStyle:'Three-point attempt share × accuracy adjusted for opponent allowed 3PA share',
      turnovers:'Team turnover rate paired with opponent forced-turnover rate',
      rebounding:'Offensive rebound share paired with opponent defensive rebound share',
      freeThrows:'Team free-throw rate paired with opponent fouls allowed',
      pace:'Pregame pace contrast, not an assumed advantage',
      h2h:'Last eight strictly prior meetings in preceding two seasons, shrunk toward zero'},
    fits,models:{},comparisons:{},sample:{games:rows.length,rolling:rows.filter(r=>SEASONS.includes(r.season)).length,
      fresh:rows.filter(r=>r.season===FRESH).length,
      games_with_prior_meetings:rows.filter(r=>r.prior_meetings>0).length}};
  for(const [mode,picks] of Object.entries(predictions)){
    const rolling=picks.filter(r=>SEASONS.includes(r.season)),fresh=picks.filter(r=>r.season===FRESH);
    result.models[mode]={rolling:metrics(rolling),fresh:metrics(fresh),
      by_season:Object.fromEntries([...SEASONS,FRESH].map(s=>[s,metrics(picks.filter(r=>r.season===s))])),
      early:metrics(rolling.filter(r=>r.early)),established:metrics(rolling.filter(r=>!r.early))};
  }
  const elo=predictions.elo.filter(r=>SEASONS.includes(r.season));
  for(const mode of Object.keys(modeFeatures).filter(m=>m!=='elo')){
    const picks=predictions[mode].filter(r=>SEASONS.includes(r.season));
    const pair=pairedDayBootstrap(picks,elo);
    const seasonWins=SEASONS.filter(s=>{
      const c=result.models[mode].by_season[s],b=result.models.elo.by_season[s];
      return c.brier<b.brier&&c.logLoss<b.logLoss;
    });
    result.comparisons[mode+'_minus_elo']={...pair,season_wins:seasonWins,season_wins_count:seasonWins.length};
  }
  // These comparisons isolate whether basketball features add information
  // beyond simply calibrating Elo's probability scale.
  for(const [candidate,baseline] of [
    ['strength','calibrated'],['form','calibrated'],['four_factors','calibrated'],
    ['styles','calibrated'],['head_to_head','calibrated'],['full','calibrated'],
    ['form','strength'],['four_factors','strength'],['styles','strength'],
    ['head_to_head','strength'],['full','form']]){
    const c=predictions[candidate].filter(r=>SEASONS.includes(r.season));
    const b=predictions[baseline].filter(r=>SEASONS.includes(r.season));
    const pair=pairedDayBootstrap(c,b);
    const seasonsBetter=SEASONS.filter(season=>{
      const x=result.models[candidate].by_season[season],y=result.models[baseline].by_season[season];
      return x.brier<y.brier&&x.logLoss<y.logLoss;
    });
    result.comparisons[candidate+'_minus_'+baseline]={...pair,season_wins:seasonsBetter,season_wins_count:seasonsBetter.length};
  }
  return result;
}
if(require.main===module){
  const output=path.resolve(process.argv[2]||path.join(ROOT,'data/game-science-report.json'));
  const report=evaluate(buildRows());
  fs.writeFileSync(output,JSON.stringify(report));
  console.log('Saved '+output);
  for(const [name,x] of Object.entries(report.models))console.log(name,JSON.stringify({rolling:x.rolling,fresh:x.fresh}));
  console.log('Comparison:',JSON.stringify(report.comparisons));
}
module.exports={blended,matchup,scienceFeatures,headToHeadPrior,pregameScienceRows,pairedDayBootstrap,evaluate,metrics,modeFeatures};
