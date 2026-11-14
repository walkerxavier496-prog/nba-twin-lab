#!/usr/bin/env node
'use strict';
/** Read-only fixed-split evaluation; no writes to published data or locks. */
const fs=require('node:fs'),path=require('node:path');
const E=require('../predict/engine.js'),U=require('../predict/unified-engine.js');
const root=path.join(__dirname,'..');
const history=JSON.parse(fs.readFileSync(path.join(root,'data/historical-games.json')));
const context=JSON.parse(fs.readFileSync(path.join(root,'data/context.json')));
const aliases={GS:'GSW',NY:'NYK',SA:'SAS',NO:'NOP',UTAH:'UTA',WSH:'WAS',PHX:'PHO',BKN:'BRK',CHA:'CHO'};
const split=s=>s<=2024?'train':s===2025?'validation':'inspected_2026';
const profiles=new Map();
for(const season of [2022,2023,2024,2025,2026]){
 const rows=context.teams.filter(t=>t.season===season-1),p=Object.fromEntries(rows.map(t=>[t.abbr,t]));
 if(rows.length!==30)throw Error('Expected 30 prior-season profiles for '+season);
 for(const [from,to] of Object.entries(aliases))if(p[to])p[from]=p[to];
 profiles.set(season,p);
}
const limited=Number(process.argv.find(x=>x.startsWith('--limit='))?.split('=')[1]||0);
const games=history.games.filter(g=>g.status==='final'&&g.season>=2022&&g.season<=2026);
if(games.length!==6150)throw Error('Historical coverage incomplete');
const rows=[];
for(const g of limited?games.slice(0,limited):games){
 const s=E.ratings(history.games,g.date);
 const f=U.features(g,s,profiles.get(g.season));
 rows.push({id:g.id,season:g.season,x:f.x,y:g.homeScore>g.awayScore?1:0,
  base:f.base.homeWin,homeScore:f.base.homeScore,awayScore:f.base.awayScore,
  actualHome:g.homeScore,actualAway:g.awayScore});
 if(rows.length%500===0)console.log('Reconstructed '+rows.length+'/'+(limited||games.length));
}
const training=rows.filter(r=>r.season<=2024);
if(training.length<25)throw Error('Need complete training seasons');
const model=U.train(training);
const elogit=U.train(training.map(r=>({...r,x:r.x.map((v,i)=>i<=1?v:0)})));
function predictRow(r,m){return {id:r.id,season:r.season,y:r.y,p:1/(1+Math.exp(-r.x.reduce((sum,v,j)=>sum+v*m.weights[j],0)))}}
function ece(rows){
 if(!rows.length)return null;
 let total=0;
 for(let i=0;i<10;i++){
  const part=rows.filter(r=>r.p>=i/10&&(i===9?r.p<=1:r.p<(i+1)/10));
  if(part.length)total+=part.length/rows.length*Math.abs(
    part.reduce((s,r)=>s+r.p,0)/part.length-
    part.reduce((s,r)=>s+r.y,0)/part.length);
 }
 return total;
}
const bySplit={};
for(const part of ['train','validation','inspected_2026']){
 const sample=rows.filter(r=>split(r.season)===part);
 const base=sample.map(r=>({id:r.id,y:r.y,p:r.base}));
 const eloOnly=sample.map(r=>predictRow(r,elogit));
 const unified=sample.map(r=>predictRow(r,model));
 bySplit[part]=Object.fromEntries([['elo',base],['elo_recalibrated',eloOnly],['unified',unified]]
   .map(([name,values])=>[name,{...U.metric(values),ece:ece(values)}]));
}
function pairedIntervals(part,other){
 const sample=rows.filter(r=>split(r.season)===part);
 const items=sample.map(r=>({y:r.y,base:r.base,alt:predictRow(r,other).p}));
 const scores=items.map(r=>({brier:(r.alt-r.y)**2-(r.base-r.y)**2,
   accuracy:Number((r.alt>=.5)===(r.y===1))-Number((r.base>=.5)===(r.y===1))}));
 let seed=part==='validation'?481:482;
 const rand=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296};
 const bounds={};
 for(const key of ['brier','accuracy']){
   const observed=scores.reduce((s,x)=>s+x[key],0)/scores.length, draws=[];
   for(let b=0;b<1200;b++){let sum=0;for(let i=0;i<scores.length;i++)sum+=scores[Math.floor(rand()*scores.length)][key];draws.push(sum/scores.length)}
   draws.sort((a,b)=>a-b);bounds[key]={delta:observed,bootstrap_95:[draws[30],draws[1169]]};
 }
 return bounds;
}
const paired={validation:pairedIntervals('validation',model),inspected_2026:pairedIntervals('inspected_2026',model)};
const report={schema:1,source:'reconstructed strict historical fixture data',generated_at_utc:new Date().toISOString(),
  disclaimer:'2026 previously inspected; 2025 validation is not a new untouched forward season',
  dataset:{all:rows.length,train:training.length,validation:rows.filter(r=>r.season===2025).length,
    inspected_2026:rows.filter(r=>r.season===2026).length},
  model,elo_recalibrated:elogit,bySplit,paired};
const location=path.join(root,'unified-evaluation-local.json');
fs.writeFileSync(location,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({location,weights:model.weights,metrics:bySplit,paired},null,2));
