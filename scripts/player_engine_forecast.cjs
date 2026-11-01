#!/usr/bin/env node
'use strict';
/* Player Engine forecast artifacts and postgame grading (research namespace).
 *
 *   node scripts/player_engine_forecast.cjs forecast --game 401909897 [--availability file.json] [--out dir]
 *   node scripts/player_engine_forecast.cjs grade --forecast file.json --box game-record.json
 *
 * A forecast records the model version, parameter hash, code hash, every source timestamp, the availability state
 * of each player, the expected rotation, scores/margin/probability, player projections, quantitative explanatory
 * factors and an integrity hash. It is written with flag 'wx' and never rewritten. Grading re-verifies that hash
 * and scores exactly what was saved. Nothing here touches practice/, audit/ or data/.
 */
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),crypto=require('node:crypto');
const ROOT=path.join(__dirname,'..');
const A=require('./audit-core.cjs'),E=require('../predict/engine.js'),PE=require('../predict/player-engine.js'),B=require('./player_engine_backtest.cjs');
const CORPUS=path.join(ROOT,'research-reviews/player-engine-v1/corpus');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const PARAMS_FILE=path.join(ROOT,'research-reviews/player-engine-v1/tuning/params-2022-2023-v3.json');
const SCHEMA='nba-twin-lab-player-engine-forecast-v1';

function loadAllCorpus(){
 const games=[];
 for(const f of fs.readdirSync(CORPUS).filter(x=>/^\d{4}(-to-\d{8})?\.json\.gz$/.test(x)).sort())
  for(const g of JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(CORPUS,f)))).games){
   const pts=s=>g.players.filter(p=>p.tm===s).reduce((a,p)=>a+(p.pts||0),0);
   if(pts('H')!==g.hs||pts('A')!==g.as||g.hs===g.as)continue; // box must reconcile with the final score
   g.tip=Date.parse(g.date);g.avail=E.resultAvailability({date:g.date});games.push(g);
  }
 return games.sort((a,b)=>a.tip-b.tip||a.id.localeCompare(b.id));
}
const manifestHash=()=>sha(Buffer.concat(fs.readdirSync(CORPUS).filter(f=>f.endsWith('.json.gz')).sort().map(f=>fs.readFileSync(path.join(CORPUS,f)))));

// Calibration from every EARLIER out-of-sample prediction (naive variant: the only one knowable pregame).
let calCache=null;
function liveCalibration(corpus,params){
 if(calCache)return calCache;
 const hist=corpus.filter(g=>/^\d{4}$/.test(String(g.season))&&g.season>=2021&&g.season<=2026);
 const {rows}=B.runEngine(hist,params,'naive',[2022,2023,2024,2025,2026]);
 calCache=PE.fitCalibration(rows.map(r=>({raw_margin:r.raw.raw_margin,raw_total:r.raw.raw_total,margin:r.hs-r.as,total:r.hs+r.as,restDiff:r.restDiff,resid_diff:r.raw.resid_diff,resid_total_sum:r.raw.resid_total_sum,home:r.hs,away:r.as})));
 // player prediction bands from the same earlier predictions
 return calCache;
}

function stateAsOf(corpus,params,cutoffMs){
 const state=PE.createState(params);let last=null,observed=0;
 for(const g of corpus.slice().sort((a,b)=>a.avail-b.avail||a.tip-b.tip)){
  if(!(g.avail<cutoffMs))break;
  PE.observeGame(state,g);last=g;observed++;
 }
 return {state,last,observed};
}
const pct=v=>Math.round(v*1000)/10;
const r2=v=>Math.round(v*100)/100;

// availability file: {published_at_utc, source, games:{gameId:{home:{playerId:status},away:{...}}}} — only official sources.
function readAvailability(file,gameId){
 if(!file)return {state:'unverified',source:null,published_at_utc:null,home:{},away:{}};
 const a=JSON.parse(fs.readFileSync(file));
 const g=a.games?.[gameId];
 if(!g||!a.source||!a.published_at_utc)return {state:'unverified',source:a.source||null,published_at_utc:a.published_at_utc||null,home:{},away:{}};
 return {state:'official_report',source:a.source,published_at_utc:a.published_at_utc,home:g.home||{},away:g.away||{}};
}

function buildForecast(corpus,params,game,availability,opts={}){
 if(Number(game.season)<2027&&!opts.allowHistorical)throw new Error('live forecasts are for the current season; historical games are evaluated by the backtest');
 const tip=Date.parse(game.date),cutoff=opts.cutoffMs??tip;
 if(availability.published_at_utc&&!(Date.parse(availability.published_at_utc)<=cutoff))throw new Error('availability report published after the information cutoff');
 const {state,last,observed}=stateAsOf(corpus,params,cutoff);
 const input={date:game.date,home:{id:String(game.home.id),availability:availability.home||{}},away:{id:String(game.away.id),availability:availability.away||{}}};
 const raw=PE.forecastGame(state,input);
 const cal=liveCalibration(corpus.filter(g=>g.avail<cutoff),params);
 const prev=new Map();for(const g of corpus.filter(g=>g.tip<tip)){prev.set(g.home.id,g.tip);prev.set(g.away.id,g.tip);}
 const rest=t=>prev.has(String(t))?Math.min(3,Math.max(0,Math.floor((tip-prev.get(String(t)))/86400000))):null;
 const restDiff=rest(game.home.id)===null||rest(game.away.id)===null?0:Math.max(-3,Math.min(3,rest(game.home.id)-rest(game.away.id)));
 const f=PE.applyCalibration(raw,cal,restDiff);
 // components of the projected margin (additive, measured — not causal claims)
 const healthyIn={home:{...input.home,availability:{}},away:{...input.away,availability:{}}};
 const healthy=PE.forecastGame(state,healthyIn,{neutral:true}),availNeutral=PE.forecastGame(state,input,{neutral:true});
 const slope=cal.margin_slope??1;
 const components=[
  {factor:'home_court_and_league_baseline',margin_points:r2(cal.margin_intercept??cal.home_adv),basis:'fitted on earlier out-of-sample seasons'},
  {factor:'full_strength_player_matchup',margin_points:r2(slope*healthy.raw_margin),basis:'sum of player projections, everyone available, average opponent'},
  {factor:'player_availability',margin_points:r2(slope*(availNeutral.raw_margin-healthy.raw_margin)),basis:'minutes/shot redistribution from listed absences'},
  {factor:'opponent_specific_adjustment',margin_points:r2(slope*(raw.raw_margin-availNeutral.raw_margin)),basis:'opponent shooting/turnover/rebound profile as of the cutoff'},
  {factor:'rest',margin_points:r2((cal.margin_rest||0)*restDiff),basis:`schedule rest difference (${restDiff})`},
  {factor:'team_residual_prior',margin_points:r2((cal.margin_resid||0)*(raw.resid_diff||0)),basis:'decayed average of the engine\'s own past misses for each team (secondary prior)'}
 ];
 const explainedAll=PE.explainPlayers(state,input,f);
 const explainedById=new Map(explainedAll.map(e=>[e.side+'|'+e.id,e]));
 const spot=PE.spotlights(explainedAll,state,2,{fill:true});
 const defence={home:PE.defenceFactors(state,input.home.id),away:PE.defenceFactors(state,input.away.id)};
 const lr=PE.leagueRates(state.league);
 const teamTotals=side=>{const rows=f.players.filter(r=>r.side===side);const s=k=>rows.reduce((a,r)=>a+r[k],0);return {minutes:r2(s('expected_min')),fga:r2(s('fga')),fgm:r2(s('fgm')),fta:r2(s('fta')),tov:r2(s('tov')),rebounds:r2(s('reb')),assists:r2(s('ast')),threes:r2(s('tpm')),fg_pct:r2(s('fgm')/Math.max(s('fga'),1))};};
 const names=new Map();
 try{const players=JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(CORPUS,'players.json.gz'))));for(const [id,v] of Object.entries(players))names.set(id,v);}catch{}
 const playerRow=r=>{
  const e=explainedById.get(r.side+'|'+r.id),st=state.players.get(r.id);
  return {id:r.id,name:names.get(r.id)?.n||null,position:names.get(r.id)?.p||null,side:r.side,probability_plays:r2(r.prob_plays),
   baseline_minutes_if_plays:r2(r.base_minutes),
   expected:{minutes:r2(r.expected_min),points:r2(r.pts),rebounds:r2(r.reb),assists:r2(r.ast),threes:r2(r.tpm),steals:r2(r.stl),blocks:r2(r.blk),turnovers:r2(r.tov),fga:r2(r.fga),fantasy:r2(r.fantasy)},
   if_plays:{minutes:r2(r.min_if_plays),points:r2(r.pts_if_plays),rebounds:r2(r.reb_if_plays),assists:r2(r.ast_if_plays),threes:r2(r.tpm_if_plays),fantasy:r2(r.fantasy_if_plays)},
   normal:e?{minutes:r2(e.normal.min),fga:r2(e.normal.fga),points:r2(e.normal.pts),fantasy:r2(e.normal.fantasy)}:null,
   change_vs_normal:e?{minutes_from_availability:r2(e.delta_minutes_from_availability),fga_from_availability:r2(e.delta_fga_from_availability),points_from_availability:r2(e.delta_pts_from_availability),points_from_opponent:r2(e.delta_pts_from_opponent),points_total:r2(e.delta_pts_total),fantasy_total:r2(e.delta_fantasy_total)}:null,
   with_without_evidence:(r.evidence||[]).map(x=>({absent_teammate:x.absent,names:names.get(x.absent)?.n||null,games_without:x.games_without,games_with:x.games_with,minutes_with:r2(x.minutes_with),minutes_without:r2(x.minutes_without)})),
   recent_form:st?{points_ewma_5:r2(st.pts5),points_ewma_10:r2(st.pts10),points_ewma_20:r2(st.pts20),minutes_ewma:r2(st.mpg),appearances:st.apps}:null};
 };
 const players=f.players.map(playerRow).sort((a,b)=>b.expected.minutes-a.expected.minutes);
 const winner=f.margin>=0?game.home.abbr:game.away.abbr,winProb=f.margin>=0?f.home_win_probability:1-f.home_win_probability;
 const label=id=>names.get(id)?.n||id;
 const out=[...f.out.home,...f.out.away];
 const topAbsence=out.map(id=>({id,min:PE.baselineMinutes(state.players.get(id))})).sort((a,b)=>b.min-a.min).slice(0,3);
 const why={
  winner:[`${winner} favoured at ${pct(winProb)}%: projected margin ${r2(Math.abs(f.margin))} points (80% interval ${r2(f.intervals_80.margin[0])} to ${r2(f.intervals_80.margin[1])}).`,
   ...components.filter(c=>Math.abs(c.margin_points)>=0.3).map(c=>`${c.factor.replaceAll('_',' ')}: ${c.margin_points>0?'+':''}${c.margin_points} margin points to ${game.home.abbr} (${c.basis}).`),
   ...(topAbsence.length?[`Listed absences: ${topAbsence.map(a=>`${label(a.id)} (${r2(a.min)} baseline minutes)`).join(', ')}.`]:[`No absences were supplied (${availability.state}); no injury information is assumed.`])],
  score:[`Expected possessions ${r2(f.possessions)}; projected score ${game.away.abbr} ${r2(f.away_score)} – ${game.home.abbr} ${r2(f.home_score)} (total ${r2(f.total)}).`,
   `${game.home.abbr}: ${teamTotals('home').fga} FGA, ${pct(teamTotals('home').fg_pct)}% FG, ${teamTotals('home').fta} FTA, ${teamTotals('home').tov} turnovers.`,
   `${game.away.abbr}: ${teamTotals('away').fga} FGA, ${pct(teamTotals('away').fg_pct)}% FG, ${teamTotals('away').fta} FTA, ${teamTotals('away').tov} turnovers.`],
  players:spot.map(s=>{const p=players.find(x=>x.side===s.side&&x.id===s.id);const opp=s.side==='home'?'away':'home',d=defence[opp];
   return `${p.name||p.id}: normal ${p.normal.minutes} min / ${p.normal.fga} FGA / ${p.normal.points} pts → matchup-adjusted ${p.if_plays.minutes} min / ${r2(p.expected.fga)} FGA / ${p.expected.points} pts; ${p.change_vs_normal.minutes_from_availability>0.3?`+${p.change_vs_normal.minutes_from_availability} min from teammate absence; `:''}opponent profile (${d.games.toFixed(0)}-game sample): 2P ${r2(d.f2)}x, 3P ${r2(d.f3)}x, FT rate ${r2(d.fta)}x of league average.`;})
 };
 const opp=side=>({games_sample:Math.round(defence[side].games),two_point_allowed_vs_league:r2(defence[side].f2),three_point_allowed_vs_league:r2(defence[side].f3),free_throw_rate_allowed_vs_league:r2(defence[side].fta),turnover_rate_forced_vs_league:r2(defence[side].tov),offensive_rebound_rate_allowed_vs_league:r2(defence[side].oreb)});
 const payload={
  schema:SCHEMA,status:'research_forecast_not_for_betting',
  model:{version:PE.VERSION,params:params,params_sha256:sha(Buffer.from(JSON.stringify(params))),code_sha256:sha(fs.readFileSync(path.join(ROOT,'predict/player-engine.js'))),
   calibration:cal,calibration_note:'fitted from out-of-sample predictions of earlier seasons only (variant without availability information)'},
  game:{id:String(game.id),date:game.date,home:{id:String(game.home.id),abbr:game.home.abbr},away:{id:String(game.away.id),abbr:game.away.abbr}},
  information_cutoff_utc:new Date(cutoff).toISOString(),
  source_timestamps:{corpus_sha256:manifestHash(),games_observed:observed,last_observed_game:last?{id:last.id,date:last.date,result_available_at_utc:new Date(last.avail).toISOString()}:null,
   availability:{state:availability.state,source:availability.source,published_at_utc:availability.published_at_utc}},
  availability:{state:availability.state,home:availability.home,away:availability.away,out:f.out,uncertain:f.uncertain,
   note:availability.state==='official_report'?'Official availability supplied; participation of questionable players is simulated.':'No verified official injury/roster report: every candidate is treated as available. Not a pregame-confirmed lineup.'},
  quality:{availability_verified:availability.state==='official_report',grade:availability.state==='official_report'?'availability_known':'degraded_no_availability',
   notes:['Rotation is inferred from recent games, not confirmed starters.','Historical accuracy of this engine without availability information is statistically indistinguishable from Elo on win probability (see backtest report).']},
  forecast:{winner,winner_probability:r2(winProb*100)/100,home_win_probability:Math.round(f.home_win_probability*1e4)/1e4,home_score:r2(f.home_score),away_score:r2(f.away_score),margin_home:r2(f.margin),total:r2(f.total),possessions:r2(f.possessions),
   intervals_80:Object.fromEntries(Object.entries(f.intervals_80).map(([k,v])=>[k,v.map(r2)])),margin_sigma:r2(f.sigma),scenarios:f.scenarios.length},
  margin_components:components,
  team_totals:{home:teamTotals('home'),away:teamTotals('away')},
  opponent_profiles:{home_defence:opp('home'),away_defence:opp('away')},
  expected_rotation:{home:players.filter(p=>p.side==='home').slice(0,10).map(p=>({id:p.id,name:p.name,minutes:p.expected.minutes})),away:players.filter(p=>p.side==='away').slice(0,10).map(p=>({id:p.id,name:p.name,minutes:p.expected.minutes}))},
  players,
  spotlights:spot.map(s=>({id:s.id,name:label(s.id),side:s.side,strength:s.strength,normal_fantasy:r2(s.normal.fantasy),matchup_adjusted_fantasy:r2(s.final.fantasy),fantasy_change:r2(s.delta_fantasy_total),minutes_change_from_availability:r2(s.delta_minutes_from_availability)})),
  explanation:why,
  disclaimer:'Point estimates are not guarantees. Factor contributions are measured model components, not causal claims.'
 };
 return A.withIntegrity(payload);
}

function gradeForecast(forecast,box){
 if(!A.verifyIntegrity(forecast))throw new Error('forecast integrity hash does not verify; refusing to grade a modified forecast');
 if(String(box.id)!==forecast.game.id)throw new Error('box score is for a different game');
 const hs=box.hs,as=box.as,f=forecast.forecast,y=hs>as?1:0,p=f.home_win_probability;
 const iv=forecast.forecast.intervals_80,inside=(v,[lo,hi])=>v>=lo&&v<=hi;
 const played=new Map(box.players.filter(r=>r.min>0).map(r=>[r.tm+r.id,r]));
 const err={min:[],pts:[],reb:[],ast:[],fantasy:[]},fant=r=>(r.pts||0)+(r.tpm||0)+2*(r.fgm||0)-(r.fga||0)+(r.ftm||0)-(r.fta||0)+(r.reb||0)+2*(r.ast||0)+4*(r.stl||0)+4*(r.blk||0)-2*(r.tov||0);
 let outPlayed=[];
 for(const pl of forecast.players){
  const a=played.get((pl.side==='home'?'H':'A')+pl.id);if(!a)continue;
  err.min.push(Math.abs(pl.if_plays.minutes-a.min));err.pts.push(Math.abs(pl.if_plays.points-a.pts));err.reb.push(Math.abs(pl.if_plays.rebounds-a.reb));err.ast.push(Math.abs(pl.if_plays.assists-a.ast));err.fantasy.push(Math.abs(pl.if_plays.fantasy-fant(a)));
 }
 for(const id of [...(forecast.availability.out?.home||[]),...(forecast.availability.out?.away||[])])if([...played.keys()].some(k=>k.slice(1)===id))outPlayed.push(id);
 const mean=a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:null;
 return {schema:'nba-twin-lab-player-engine-grade-v1',forecast_integrity_sha256:forecast.integrity.canonical_payload_without_integrity,game:forecast.game,
  actual:{home_score:hs,away_score:as,margin_home:hs-as,total:hs+as},predicted:{home_score:f.home_score,away_score:f.away_score,margin_home:f.margin_home,total:f.total,home_win_probability:p},
  winner_correct:(p>=0.5)===(y===1),brier:(p-y)**2,log_loss:-(y*Math.log(Math.max(1e-6,p))+(1-y)*Math.log(Math.max(1e-6,1-p))),
  score_abs_error:{home:Math.abs(f.home_score-hs),away:Math.abs(f.away_score-as)},margin_abs_error:Math.abs(f.margin_home-(hs-as)),total_abs_error:Math.abs(f.total-(hs+as)),
  interval_80_hit:{margin:inside(hs-as,iv.margin),total:inside(hs+as,iv.total),home_score:inside(hs,iv.home_score),away_score:inside(as,iv.away_score)},
  players_graded:err.min.length,player_mae:{minutes:mean(err.min),points:mean(err.pts),rebounds:mean(err.reb),assists:mean(err.ast),fantasy:mean(err.fantasy)},
  officially_out_players_who_played:outPlayed,
  spotlights:forecast.spotlights.map(s=>{const a=played.get((s.side==='home'?'H':'A')+s.id);return {name:s.name,normal_fantasy:s.normal_fantasy,matchup_adjusted_fantasy:s.matchup_adjusted_fantasy,actual_fantasy:a?fant(a):null,exceeded_normal:a?fant(a)>s.normal_fantasy:null};})};
}

module.exports={loadAllCorpus,stateAsOf,buildForecast,gradeForecast,readAvailability,PARAMS_FILE,liveCalibration};

if(require.main===module){
 const arg=n=>{const i=process.argv.indexOf(n);return i>0?process.argv[i+1]:null;},cmd=process.argv[2];
 const params=JSON.parse(fs.readFileSync(PARAMS_FILE)).params;
 if(cmd==='forecast'){
  const games=JSON.parse(fs.readFileSync(path.join(ROOT,'data/games.json'))).games,id=arg('--game');
  const game=games.find(g=>g.id===id);if(!game)throw new Error('game not found in data/games.json');
  const corpus=loadAllCorpus(),availability=readAvailability(arg('--availability'),id);
  const artifact=buildForecast(corpus,params,game,availability,arg('--cutoff')?{cutoffMs:Date.parse(arg('--cutoff'))}:{});
  const out=path.resolve(arg('--out')||path.join(ROOT,'research-reviews/player-engine-v1/forecasts',id+'.forecast.json'));
  if(!out.startsWith(path.join(ROOT,'research-reviews')+path.sep)&&!out.startsWith('/tmp/')&&!out.startsWith('/private/tmp/'))throw new Error('forecasts are written only under research-reviews/');
  fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(artifact,null,1)+'\n',{flag:'wx'});
  console.log('wrote',out);
 }else if(cmd==='grade'){
  const forecast=JSON.parse(fs.readFileSync(arg('--forecast'))),box=JSON.parse(fs.readFileSync(arg('--box')));
  console.log(JSON.stringify(gradeForecast(forecast,box),null,1));
 }
}
