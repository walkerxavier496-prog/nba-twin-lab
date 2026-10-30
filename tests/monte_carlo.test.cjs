const {test}=require('node:test');
const assert=require('node:assert/strict');
const E=require('../predict/engine.js');

const A={id:'1',name:'Alpha',abbr:'ALP'},B={id:'2',name:'Beta',abbr:'BET'};
const iso=(y,m,d)=>new Date(Date.UTC(y,m-1,d,23)).toISOString();
const game=(id,date,hs,as,season=2026,status='final')=>({id:String(id),date,season,home:A,away:B,homeScore:hs,awayScore:as,status});
const profiles={
  ALP:{season:2025,srs:5,o_rtg:119,d_rtg:113,pace:101,e_fg_percent:.57,opp_e_fg_percent:.54,tov_percent:11.5,opp_tov_percent:14,orb_percent:28,drb_percent:76,x3p_ar:.44,f_tr:.25},
  BET:{season:2025,srs:-2,o_rtg:112,d_rtg:117,pace:98,e_fg_percent:.53,opp_e_fg_percent:.57,tov_percent:14,opp_tov_percent:12,orb_percent:23,drb_percent:72,x3p_ar:.37,f_tr:.2}
};

function history(){
  const games=[];
  for(let i=0;i<150;i++)games.push(game('h'+i,new Date(Date.UTC(2024,9,20+i)).toISOString(),i%3?118:104,106,2025));
  return games;
}

test('seeded possession simulator is reproducible and bounded',()=>{
  const games=history(),g=game('future',iso(2025,10,25),null,null,2026,'scheduled');
  const state=E.ratings(games,g.date);
  const a=E.monteCarlo(g,state,profiles,{simulations:2500,seed:'same'});
  const b=E.monteCarlo(g,state,profiles,{simulations:2500,seed:'same'});
  assert.deepEqual(a,b);
  assert.equal(a.simulations,2500);
  assert.ok(a.homeWin>0&&a.homeWin<1);
  assert.ok(a.possessions>=82&&a.possessions<=121);
  assert.ok(a.homeScore>70&&a.homeScore<160);
  assert.ok(a.homeRange[0]<a.homeRange[1]);
});

test('same-season or future profiles are rejected',()=>{
  const games=history(),g=game('future',iso(2025,10,25),null,null,2026,'scheduled');
  const state=E.ratings(games,g.date);
  const leaked={ALP:{...profiles.ALP,season:2026,srs:50,o_rtg:160},BET:{...profiles.BET,season:2026,srs:-50,d_rtg:160}};
  const clean=E.monteCarlo(g,state,{}, {simulations:500,seed:'leak-check'});
  const guarded=E.monteCarlo(g,state,leaked,{simulations:500,seed:'leak-check'});
  assert.equal(guarded.baseline.priorUsed,false);
  assert.equal(guarded.homeProfile.source,'league-average fallback');
  assert.equal(guarded.homeWin,clean.homeWin);
});

test('100,000 simulations complete and return exactly that sample size',()=>{
  const games=history(),g=game('large',iso(2025,10,25),null,null,2026,'scheduled');
  const state=E.ratings(games,g.date);
  const result=E.monteCarlo(g,state,profiles,{simulations:100000,seed:7});
  assert.equal(result.simulations,100000);
  assert.ok(Number.isFinite(result.homeWin));
  assert.ok(Number.isFinite(result.margin));
});

test('V7 independent simulator never needs an Elo state or target score',()=>{
  const snap=(ortg,drtg,delta=0)=>({games:20,rest_days:2,league_ortg:114,player_delta:delta,
    prior:{games:82,ortg:113,drtg:113,pace:99,efg:.55,opp_efg:.55,three_rate:.4,opp_three_rate:.4,tov_rate:.13,opp_tov_rate:.13,orb_rate:.25,drb_rate:.75,ftr:.25,opp_ftr:.25,two_pct:.55,three_pct:.36,ft_pct:.78},
    last10:{games:10,ortg,drtg,pace:101,efg:.57,opp_efg:.53,three_rate:.44,opp_three_rate:.38,tov_rate:.11,opp_tov_rate:.15,orb_rate:.29,drb_rate:.77,ftr:.27,opp_ftr:.21,two_pct:.57,three_pct:.38,ft_pct:.8},
    last5:{games:5,ortg,drtg,pace:101},season:{games:20,ortg,drtg,pace:100}});
  const g=game('v7',iso(2025,10,25),null,null,2026,'scheduled');
  const intel={home:snap(121,108,2),away:snap(109,118,-1)};
  const a=E.independentMonteCarlo(g,intel,{simulations:1000,seed:'v7-independent',playerWeight:.5});
  const b=E.independentMonteCarlo(g,intel,{simulations:1000,seed:'v7-independent',playerWeight:.5});
  assert.deepEqual(a,b);
  assert.equal(a.simulations,1000);
  assert.ok(a.homeWin>.5);
  assert.equal(a.expectation.config.playerWeight,.5);
  assert.equal(a.homeProfile.source,'pregame rolling team and matchup features');
});

test('model comparison is strictly walk-forward and reports every requested metric',()=>{
  const games=history();
  for(let i=0;i<8;i++)games.push(game('t'+i,new Date(Date.UTC(2025,9,21+i)).toISOString(),i%2?109:121,108,2026));
  const report=E.evaluateComparison(games,2026,profiles,{simulations:300});
  assert.equal(report.strictWalkForward,true);
  assert.equal(report.elo.count,8);
  assert.equal(report.monteCarlo.count,8);
  for(const model of [report.elo,report.monteCarlo]){
    assert.ok(model.accuracy>=0&&model.accuracy<=1);
    assert.ok(model.brier>=0&&model.brier<=1);
    assert.ok(model.logLoss>=0);
    assert.ok(model.ece>=0&&model.ece<=1);
    assert.ok(model.scoreMAE>=0);
    assert.ok(Array.isArray(model.calibration));
  }
});
