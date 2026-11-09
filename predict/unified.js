'use strict';
const Score = require('./score-machine.js');
const VERSION = 'unified-margin-v1';
const E = require('./engine.js');
const DAY = 86400000;
const names = ['constant','elo_margin','adjusted_net','matchup_scoring','pace','recent_net',
  'projected_rotation_impact','rotation_continuity','rest','venue_change','four_day_load'];
const dot = (x,beta) => x.reduce((sum,value,i) => sum + value*beta[i],0);

// Venue means the nominal home team. Neutral sites and exact miles are unknown.
function scheduleFeatures(game,games,cutoff) {
  const tip = Date.parse(game.date);
  const recent = games.filter(g => g.status === 'final' && g.season === game.season &&
    Date.parse(g.date) >= tip - 7*DAY && E.resultAvailability(g) < cutoff)
    .sort((a,b) => Date.parse(b.date)-Date.parse(a.date));
  function team(id) {
    const played = recent.filter(g => g.home.id === id || g.away.id === id);
    return {changed: played.length && played[0].home.id !== game.home.id ? 1 : 0,
      load: played.filter(g => tip - Date.parse(g.date) <= 4*DAY).length};
  }
  const home = team(game.home.id), away = team(game.away.id);
  return [away.changed-home.changed,away.load-home.load];
}
function vector(home,away,baseline,schedule) {
  const quality = Score.vector(home,away);
  if (!quality || !Number.isFinite(baseline?.margin) || !Number.isFinite(baseline?.total) ||
      !Array.isArray(schedule) || schedule.length !== 2 || !schedule.every(Number.isFinite))
    throw Error('Incomplete pregame features');
  return [1,baseline.margin/10,quality[1],quality[5]+quality[6],quality[4],quality[7],
    quality[8],quality[9],quality[10],...schedule];
}
const quantile = (sorted,q) => sorted[Math.round(q*(sorted.length-1))];
function fit(earlier,indices=names.map((_,i)=>i)) {
  const ordered = [...earlier].sort((a,b)=>Date.parse(a.date)-Date.parse(b.date));
  if (ordered.length < 1000) throw Error('At least 1,000 earlier observations required');
  // Reserve the latest quarter-season for forecast errors. All outcomes used to
  // fit coefficients must already have been available at the first calibration tip.
  const split = Date.parse(ordered[ordered.length-300].date);
  const training = ordered.filter(r=>r.available<split);
  const calibration = ordered.filter(r=>Date.parse(r.date)>=split);
  const project = r=>indices.map(i=>r.x[i]);
  const data = training.map(r=>({x:project(r),margin:r.hs-r.as-r.baseline.margin,
    total:r.hs+r.as-r.baseline.total}));
  const margin = Score.ridge(data,'margin'), total = Score.ridge(data,'total');
  const errors = calibration.map(r=>r.hs-r.as-r.baseline.margin-dot(project(r),margin)).sort((a,b)=>a-b);
  return {version:VERSION,indices,margin,total,errors,training_games:training.length,
    calibration_games:errors.length,max_available_utc:new Date(Math.max(...ordered.map(r=>r.available))).toISOString()};
}
function forecast(fit,x,baseline) {
  const v = fit.indices.map(i=>x[i]);
  const margin = baseline.margin+dot(v,fit.margin);
  const total = baseline.total+dot(v,fit.total);
  const errors = fit.errors;
  // Integrate the empirical residual distribution exactly (no simulation noise).
  const wins = errors.filter(e=>margin+e>0).length;
  const p = (wins+.5)/(errors.length+1);
  const contributions = fit.indices.map((index,j)=>({feature:names[index],
    points:v[j]*fit.margin[j]+(index===1?baseline.margin:0)}));
  return {home_win_probability:p,projected_score:{home:(total+margin)/2,away:(total-margin)/2},
    margin_range_80:[margin+quantile(errors,.1),margin+quantile(errors,.9)],
    margin_drivers:contributions.filter(x=>x.feature!=='constant').sort((a,b)=>Math.abs(b.points)-Math.abs(a.points)).slice(0,4)};
}
module.exports = {VERSION,names,scheduleFeatures,vector,fit,forecast};
