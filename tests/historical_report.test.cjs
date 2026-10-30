const {test}=require('node:test');
const assert=require('node:assert/strict');
const report=require('../data/historical-model-report.json');

test('historical report is complete, leakage-safe and split before scoring',()=>{
  assert.equal(report.strict_no_future_data,true);
  assert.deepEqual(report.methodology.split,{training:[2022,2023,2024],validation:[2025],test:[2026]});
  assert.equal(report.data.evaluation_games,6150);
  assert.equal(report.leakage_checks.games_checked,6150);
  assert.equal(report.leakage_checks.violations,0);
  for(const model of Object.values(report.models)){
    assert.equal(model.overall.count,6150);
    assert.equal(model.by_split.training.count,3690);
    assert.equal(model.by_split.validation.count,1230);
    assert.equal(model.by_split.test.count,1230);
    for(const key of ['accuracy','brier','logLoss','scoreMAE','ece']){
      assert.ok(Number.isFinite(model.by_split.test[key]));
      assert.equal(model.test_ci95[key].length,2);
    }
  }
});

test('deployment decision is evidence-based rather than assuming Monte Carlo wins',()=>{
  const elo=report.models.elo.by_split.test;
  const mc=report.models.monte_carlo.by_split.test;
  const combined=report.models.combined.by_split.test;
  assert.ok(mc.brier>elo.brier);
  assert.ok(mc.scoreMAE>elo.scoreMAE);
  assert.ok(combined.brier<elo.brier);
  const ci=report.paired_test_differences.combined_minus_elo_brier.ci95;
  assert.ok(ci[0]<0&&ci[1]>0,'combined vs Elo interval should cross zero');
});

test('advanced tendency ablation is reported separately from overall model quality',()=>{
  const a=report.advanced_tendency_ablation;
  assert.equal(a.full.count,6150);
  assert.equal(a.without_tendencies.count,6150);
  assert.ok(a.difference_full_minus_ablated.brier<0);
  assert.ok(a.difference_full_minus_ablated.logLoss<0);
});
