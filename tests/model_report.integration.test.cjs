const {test}=require('node:test');
const assert=require('node:assert/strict');
const games=require('../data/games.json');
const context=require('../data/context.json');
const E=require('../predict/engine.js');

test('validated repository snapshot produces a complete strict held-out comparison',()=>{
  const season=games.coverage.current_season;
  const profiles=Object.fromEntries(context.teams.filter(t=>t.season===season-1).map(t=>[t.abbr,t]));
  const alias={GS:'GSW',NY:'NYK',SA:'SAS',NO:'NOP',UTAH:'UTA',WSH:'WAS',PHX:'PHO',BKN:'BRK',CHA:'CHO'};
  for(const [from,to] of Object.entries(alias))if(profiles[to])profiles[from]=profiles[to];
  const report=E.evaluateComparison(games.games,season,profiles,{simulations:100});
  assert.equal(report.strictWalkForward,true);
  assert.equal(report.elo.count,games.coverage.current_final_games);
  assert.equal(report.monteCarlo.count,games.coverage.current_final_games);
  assert.equal(Object.values(profiles).every(p=>p.season<season),true);
  for(const model of [report.elo,report.monteCarlo]){
    assert.ok(Number.isFinite(model.accuracy));
    assert.ok(Number.isFinite(model.brier));
    assert.ok(Number.isFinite(model.ece));
    assert.ok(Number.isFinite(model.scoreMAE));
  }
});
