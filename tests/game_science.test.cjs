'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const S=require('../scripts/game_science.cjs');
const snap=(date,overrides={})=>({
  as_of:date,games:20,rest_days:1,
  prior:{adj_ortg:112,adj_drtg:110,three_rate:.4,opp_three_rate:.4,three_pct:.36,efg:.54,opp_efg:.54,
    tov_rate:.14,opp_tov_rate:.14,orb_rate:.27,drb_rate:.73,ftr:.25,opp_ftr:.25,pace:100},
  season:{adj_ortg:114,adj_drtg:110,three_rate:.42,opp_three_rate:.4,three_pct:.37,efg:.55,opp_efg:.54,
    tov_rate:.14,opp_tov_rate:.14,orb_rate:.27,drb_rate:.73,ftr:.25,opp_ftr:.25,pace:100},
  last5:{games:5,adj_ortg:118,adj_drtg:108},...overrides});
test('recent form is opponent-adjusted efficiency trend, not wins',()=>{
 const h=snap('2026-10-30'),a=snap('2026-10-30',{last5:{games:5,adj_ortg:109,adj_drtg:114}});
 const f=S.scienceFeatures(h,a);
 assert.ok(f.momentum>0);assert.ok(f.momentum<=2);
 assert.equal(f.restScience,0);
});
test('matchup factors change direction with offense and opponent tendencies',()=>{
 const h=snap('2026-10-30',{season:{...snap('2026-10-30').season,tov_rate:.08,orb_rate:.34,ftr:.36,three_pct:.42,efg:.61}});
 const a=snap('2026-10-30',{season:{...snap('2026-10-30').season,tov_rate:.20,orb_rate:.19,ftr:.14,three_pct:.31,efg:.48}});
 const f=S.scienceFeatures(h,a);
 assert.ok(f.shooting>0);assert.ok(f.threePointStyle>0);assert.ok(f.turnovers>0);assert.ok(f.rebounding>0);assert.ok(f.freeThrows>0);
 assert.ok(Object.values(f).every(Number.isFinite));
});
test('head-to-head excludes same-day and future outcomes, shrinks small samples',()=>{
 const h=new Map([['ATL|BOS',[
   {date:'2026-09-30',season:2027,winner:'ATL'},
   {date:'2026-10-30',season:2027,winner:'BOS'},
   {date:'2026-11-01',season:2027,winner:'BOS'}]]]);
 const r=S.headToHeadPrior(h,{date:'2026-10-30',season:2027,home:{abbr:'ATL'},away:{abbr:'BOS'}});
 assert.equal(r.meetings,1);assert.ok(r.value>0&&r.value<.2);
});
test('pregame feature remains unchanged if current result is flipped',()=>{
 const home=snap('2026-10-30'),away=snap('2026-10-30');
 const first={result_id:'1',date:'2026-10-30',season:2027,home:{abbr:'ATL'},away:{abbr:'BOS'},home_score:110,away_score:100,
   pregame:{home,away}};
 const second={...first,result_id:'2',date:'2026-11-01',home_score:90,away_score:120,
   pregame:{home:{...home,as_of:'2026-11-01'},away:{...away,as_of:'2026-11-01'}}};
 const baselines=[{id:'1',date:'2026-10-30',features:{elo:.4,team:.2}},
   {id:'2',date:'2026-11-01',features:{elo:.4,team:.2}}];
 const a=S.pregameScienceRows(baselines,[first,second]);
 const b=S.pregameScienceRows(baselines,[{...first,home_score:80,away_score:100},second]);
 assert.deepEqual(a[0].features,b[0].features);
 assert.notEqual(a[1].features.h2h,b[1].features.h2h);
});
test('snapshot mismatches and missing baselines fail closed',()=>{
 assert.throws(()=>S.scienceFeatures(snap('2026-10-30'),snap('2026-10-31')),/Mismatched/);
 assert.throws(()=>S.pregameScienceRows([], [{result_id:'1',date:'2026-10-30'}]),/Missing baseline/);
});
test('day-clustered paired Brier difference is zero for identical predictions',()=>{
 const a=[{id:'1',date:'2026-10-30',p:.65,y:1},{id:'2',date:'2026-10-30',p:.4,y:0},{id:'3',date:'2026-10-31',p:.6,y:0}];
 const d=S.pairedDayBootstrap(a,a,80);
 assert.equal(d.delta_brier,0);assert.deepEqual(d.ci95_day_clustered,[0,0]);
 assert.equal(d.days,2);
});
