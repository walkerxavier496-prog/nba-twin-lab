#!/usr/bin/env node
/* Build a strictly walk-forward Elo vs possession Monte Carlo scorecard. */
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
const comparison=E.evaluateComparison(games.games,season,profiles,{simulations:10000});
const clean=model=>({count:model.count,accuracy:model.accuracy,brier:model.brier,
 logLoss:model.logLoss,scoreMAE:model.scoreMAE,ece:model.ece,calibration:model.calibration});
const report={schema:1,generated_at_utc:new Date().toISOString(),season,
 source_games_built_at_utc:games.built_at_utc,held_out_games:comparison.elo.count,
 simulations_per_game:comparison.simulationsPerGame,strict_no_future_data:true,
 methodology:'Each held-out game is reconstructed immediately before tip-off. Team ratings and current-season scoring include only earlier finals; advanced team profiles are from the previous season.',
 elo:clean(comparison.elo),monte_carlo:clean(comparison.monteCarlo)};
fs.writeFileSync(path.join(root,'data','model-report.json'),JSON.stringify(report));
console.log('NBA Twin Lab strict walk-forward model comparison');
console.log('Season: '+(season-1)+'–'+String(season).slice(2));
console.log('Held-out pregame predictions: '+report.held_out_games);
console.log('Possession simulations per held-out game: '+report.simulations_per_game.toLocaleString());
for(const [name,model] of [['Current Elo',report.elo],['Possession Monte Carlo',report.monte_carlo]]){
 console.log('\n'+name);
 console.log('  Winner accuracy: '+(model.accuracy*100).toFixed(1)+'%');
 console.log('  Brier score: '+model.brier.toFixed(4));
 console.log('  Calibration error (ECE): '+model.ece.toFixed(4));
 console.log('  Mean absolute score error per team: '+model.scoreMAE.toFixed(2)+' points');
}
console.log('\nBaseline 50/50 Brier score: 0.2500');
if(report.held_out_games<200)console.log('Warning: small held-out sample. Do not treat this as a validated predictive edge.');
