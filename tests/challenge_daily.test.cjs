'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const A=require('../scripts/audit-core.cjs');
const C=require('../scripts/five_model_challenge.cjs');
const ROOT=path.join(__dirname,'..');
const originalPath=path.join(ROOT,'practice/2026-10-31-melbourne/forecast.lock.json');
const sidecarPath=path.join(ROOT,'audit/supplements/2026-10-31/challenge.lock.json');

test('31 October research sidecar exists before all tipoffs and leaves the original untouched',()=>{
 const source=fs.readFileSync(originalPath),original=JSON.parse(source);
 assert.ok(A.verifyIntegrity(original));
 const challenge=JSON.parse(fs.readFileSync(sidecarPath));
 assert.ok(A.verifyIntegrity(challenge));
 assert.equal(challenge.original_forecast_sha256,A.sha256(source));
 assert.equal(challenge.original_forecast_path,'practice/2026-10-31-melbourne/forecast.lock.json');
 assert.equal(challenge.melbourne_date,'2026-10-31');
 assert.equal(challenge.schema,'nba-twin-lab-challenge-sidecar-v1');
 assert.ok(Date.parse(challenge.locked_at_utc)<Date.parse(original.scope.first_tip_utc));
 assert.equal(challenge.games.length,original.forecasts.length);
 for(const [index,g]of challenge.games.entries()){
  const baseline=original.forecasts[index];
  assert.equal(g.game_id,baseline.game_id);
  assert.equal(g.tip_utc,new Date(baseline.tip_utc).toISOString());
  assert.deepEqual(Object.keys(g.predictions),C.ALL_IDS);
  for(const [id,prediction]of Object.entries(g.predictions)){
   assert.equal(typeof prediction.available,'boolean');
   if(prediction.available){
    assert.ok(Number.isFinite(prediction.home_win_probability),id+' missing probability');
    assert.ok(prediction.home_win_probability>=0&&prediction.home_win_probability<=1);
   }else assert.ok(prediction.reason);
  }
 }
});
test('daily dashboard links same-day experimental snapshot and player projections without modifying model data',()=>{
 const html=fs.readFileSync(path.join(ROOT,'challenge/daily.html'),'utf8');
 const script=fs.readFileSync(path.join(ROOT,'challenge/daily.js'),'utf8');
 assert.match(html,/\.\/daily\.js/);
 assert.match(script,/challenge\.lock\.json/);
 assert.match(script,/v9_player_projections/);
 assert.match(script,/No pregame six-model lock exists/);
 assert.match(script,/model-results/);
 assert.match(script,/drawDisagreements/);
 assert.match(script,/Brier/);
 assert.match(html,/id="disagreements"/);
});
