const {test}=require('node:test');
const assert=require('node:assert/strict');
const report=require('../data/v7-model-report.json');

test('V7 report is rolling-origin, complete and leakage safe',()=>{
  assert.equal(report.schema,1);
  assert.equal(report.strict_no_future_data,true);
  assert.equal(report.leakage_checks.violations,0);
  assert.equal(report.leakage_checks.target_game_minutes_used,false);
  assert.equal(report.data.evaluated_games,6150);
  assert.equal(report.models.elo.rolling_origin.count,4920);
  assert.equal(report.models.elo.fresh_2027.count,71);
  assert.deepEqual(report.methodology.evaluation_seasons,[2023,2024,2025,2026]);
});

test('V7 decisions reflect measured evidence, including failed models',()=>{
  const m=report.models;
  assert.ok(m.independent_team.rolling_origin.brier>m.elo.rolling_origin.brier);
  assert.ok(m.player_adjusted.rolling_origin.brier>m.elo.rolling_origin.brier);
  assert.ok(m.v7_combined.rolling_origin.brier<m.elo.rolling_origin.brier);
  const vsV6=report.paired_differences.v7_combined_minus_v6_locked_blend_brier;
  assert.ok(vsV6.ci95[0]<0&&vsV6.ci95[1]>0,'V7 vs V6 uncertainty should cross zero');
  assert.ok(report.limitations.some(x=>x.includes('injury')));
});

test('every rolling configuration is trained only on earlier seasons',()=>{
  const expected={2023:1230,2024:2460,2025:3690,2026:4920,2027:6150};
  for(const family of ['team','player'])for(const [season,count] of Object.entries(expected)){
    assert.equal(report.rolling_configs[family][season].training_games,count);
  }
});
