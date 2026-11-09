'use strict';
const fs = require('node:fs');
const path = require('node:path');
const U = require('../predict/unified.js');
const IO = require('./research_io.cjs');
const A = require('./audit-core.cjs');
const B = require('./player_engine_backtest.cjs');
const {pairedDayBootstrap} = require('./game_science.cjs');
const {historicalRows} = require('./unified_history.cjs');
const root = path.join(__dirname,'..');
const destination = path.join(root,'research-reviews','unified-v1');
const groups = {all:[],without_rotation:[6,7],without_schedule:[8,9,10],without_efficiency:[2,3,4,5]};
function observe(row,f) {
  const p = f.home_win_probability, hs=row.hs, as=row.as;
  const {home,away} = f.projected_score;
  return {id:row.id,date:row.date,season:row.season,y:Number(hs>as),p,hs,as,home,away,margin:home-away,total:home+away,
    covered:f.margin_range_80 ? Number(hs-as>=f.margin_range_80[0] && hs-as<=f.margin_range_80[1]) : null};
}
function compare(a,b) {
  const losses = {accuracy:r=>Number((r.p>=.5)===Boolean(r.y)),log_loss:r=>-Math.log(r.y?r.p:1-r.p),
    score_mae:r=>(Math.abs(r.hs-r.home)+Math.abs(r.as-r.away))/2};
  const out = {brier:pairedDayBootstrap(a,b)};
  // Sum paired differences within UTC game days before sampling day clusters.
  const days = new Map();
  for(let i=0;i<a.length;i++){
    const d=a[i].date.slice(0,10);
    if(!days.has(d)) days.set(d,[]);
    days.get(d).push(i);
  }
  for(const [key,loss] of Object.entries(losses)) {
    const blocks=[...days.values()].map(ids=>({n:ids.length,sum:ids.reduce((s,i)=>s+loss(a[i])-loss(b[i]),0)}));
    const draws=[],random=require('../predict/engine.js').seededRandom(711);
    for(let k=0;k<800;k++) {
      let sum=0,n=0;
      for(let j=0;j<blocks.length;j++) {const block=blocks[Math.floor(random()*blocks.length)];sum+=block.sum;n+=block.n;}
      draws.push(sum/n);
    }
    draws.sort((x,y)=>x-y);
    out[key]={delta:blocks.reduce((s,b)=>s+b.sum,0)/a.length,ci95:[draws[20],draws[779]]};
  }
  return out;
}
function evaluate(rows) {
  const seasons=[...new Set(rows.map(r=>r.season))].sort();
  const results={seasons:{},pooled:{},ablations:{},status:'shadow_only'};
  const full=[],elo=[],ablations={};
  for(const season of seasons.slice(1)) {
    const test=rows.filter(r=>r.season===season);
    const cutoff=Math.min(...test.map(r=>Date.parse(r.date)));
    const earlier=rows.filter(r=>r.season<season && r.available<cutoff);
    const base=test.map(r=>observe(r,{home_win_probability:r.baseline.homeWin,projected_score:{
      home:(r.baseline.total+r.baseline.margin)/2,away:(r.baseline.total-r.baseline.margin)/2}}));
    elo.push(...base);
    for(const [variant,omit] of Object.entries(groups)) {
      const fit=U.fit(earlier,U.names.map((_,i)=>i).filter(i=>!omit.includes(i)));
      const pred=test.map(r=>observe(r,U.forecast(fit,r.x,r.baseline)));
      if(variant==='all') {
        full.push(...pred);
        results.seasons[season]={elo:B.teamMetrics(base),unified:B.teamMetrics(pred),
          interval80_coverage:B.mean(pred.map(r=>r.covered)),fit_games:fit.training_games,calibration_games:fit.calibration_games};
      } else (ablations[variant]??=[]).push(...pred);
    }
  }
  results.pooled={elo:B.teamMetrics(elo),unified:B.teamMetrics(full),paired:compare(full,elo),
    interval80_coverage:B.mean(full.map(r=>r.covered))};
  for(const [k,v] of Object.entries(ablations)) results.ablations[k]={metrics:B.teamMetrics(v),minus_full:pairedDayBootstrap(v,full)};
  const fit=U.fit(rows.filter(r=>Number.isFinite(r.available)));
  const inputs = Object.fromEntries(['historical-games.json','context.json','v7-intelligence.json','result-availability.json']
    .map(name=>[name,sourceHash(IO.inputPath(name))]));
  return {report:results,artifact:A.withIntegrity({target_season:seasons.at(-1)+1,features:U.names,inputs,fit})};
}
function sourceHash(file) {
  const bytes=fs.readFileSync(file);
  return A.sha256(file.endsWith('.gz') ? bytes : bytes.toString('utf8').replace(/\r\n/g,'\n'));
}
function immutable(file,value) {
  const bytes=JSON.stringify(value,null,2)+'\n';
  try{fs.writeFileSync(file,bytes,{flag:'wx'});}catch(e){
    if(e.code!=='EEXIST'||fs.readFileSync(file,'utf8')!==bytes)throw Error('Version collision: '+file,{cause:e});
  }
}
if(require.main===module) {
  const {report,artifact}=evaluate(historicalRows());
  const output=process.argv[2]?path.resolve(process.argv[2]):destination;
  fs.mkdirSync(output,{recursive:true});
  immutable(path.join(output,'fit-'+artifact.target_season+'.json'),artifact);
  immutable(path.join(output,'walk-forward-'+artifact.target_season+'.json'),report);
  console.log(JSON.stringify(report.pooled));
}
module.exports={evaluate,observe,compare};
