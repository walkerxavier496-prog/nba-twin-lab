#!/usr/bin/env node
/* Print a strictly walk-forward scorecard for the latest completed NBA games. */
const fs=require('node:fs');
const path=require('node:path');
const E=require('../predict/engine.js');
const root=path.join(__dirname,'..');
const games=JSON.parse(fs.readFileSync(path.join(root,'data','games.json'),'utf8'));
if(games.schema!==1||!Array.isArray(games.games))throw Error('Missing validated scoreboard snapshot');
let context=null;
try{context=JSON.parse(fs.readFileSync(path.join(root,'data','context.json'),'utf8'))}catch(e){}
const season=games.coverage.current_season;
const prev=(context?.teams||[]).filter(t=>t.season===season-1);
const profiles=Object.fromEntries(prev.map(t=>[t.abbr,t]));
const alias={GS:'GSW',NY:'NYK',SA:'SAS',NO:'NOP',UTAH:'UTA',WSH:'WAS',PHX:'PHO',BKN:'BRK',CHA:'CHO'};
for(const [from,to] of Object.entries(alias))if(profiles[to])profiles[from]=profiles[to];
const score=E.evaluate(games.games,season,profiles);
console.log('NBA Twin Lab walk-forward scorecard');
console.log('Season: '+(season-1)+'–'+String(season).slice(2));
console.log('Pregame predictions evaluated: '+score.count);
if(score.count){
 console.log('Winner accuracy: '+(score.accuracy*100).toFixed(1)+'%');
 console.log('Brier score: '+score.brier.toFixed(4));
 console.log('Mean absolute score error per team: '+score.scoreMAE.toFixed(2)+' points');
 console.log('Baseline 50/50 Brier score: 0.2500');
}
if(score.count<20)console.log('Warning: small sample. Do not treat this as a validated predictive edge.');
