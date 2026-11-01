#!/usr/bin/env node
'use strict';
/* Chronological walk-forward backtest of the player-first engine (research only).
 *
 *   node scripts/player_engine_backtest.cjs quick            # one config, timing + sanity
 *   node scripts/player_engine_backtest.cjs tune             # coordinate search on 2022-2023 only
 *   node scripts/player_engine_backtest.cjs eval [--params file.json] [--out dir]
 *
 * Information rule: a game's box score is fed to the engine only after the repository's
 * result-availability time for that game (predict/engine.js resultAvailability), exactly as the Elo and
 * Score Machine baselines are held to. Structural parameters are tuned on seasons before the test window and
 * frozen; game-level calibration constants (home advantage, scale, rest, spread) are fitted only from
 * predictions of EARLIER seasons. Nothing writes to data/, practice/ or audit/.
 */
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib');
const ROOT=path.join(__dirname,'..');
const E=require('../predict/engine.js'),PE=require('../predict/player-engine.js'),S=require('../predict/score-machine.js'),IO=require('./research_io.cjs');
const CORPUS=path.join(ROOT,'research-reviews/player-engine-v1/corpus');
const mean=a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:null;
const dayMs=86400000;

// ---------------------------------------------------------------- data
function loadCorpus(){
 const games=[];let excluded=0;
 for(const f of fs.readdirSync(CORPUS).filter(x=>/^\d{4}\.json\.gz$/.test(x)).sort()){
  for(const g of JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(CORPUS,f)))).games){
   const pts=s=>g.players.filter(p=>p.tm===s).reduce((a,p)=>a+(p.pts||0),0);
   if(pts('H')!==g.hs||pts('A')!==g.as||g.hs===g.as){excluded++;continue;}
   g.tip=Date.parse(g.date);g.avail=E.resultAvailability({date:g.date});games.push(g);
  }
 }
 games.sort((a,b)=>a.tip-b.tip||a.id.localeCompare(b.id));
 // schedule-derived (result-free) context: rest days and season game numbers
 const last=new Map(),count=new Map();
 for(const g of games){
  for(const [side,t] of [['home',g.home.id],['away',g.away.id]]){
   const prev=last.get(t),key=t+'|'+g.season;
   g['rest_'+side]=prev===undefined?null:Math.min(3,Math.max(0,Math.floor((g.tip-prev)/dayMs)-0));
   g['no_'+side]=(count.get(key)||0)+1;count.set(key,g['no_'+side]);last.set(t,g.tip);
  }
 }
 return {games,excluded};
}
function loadBaselines(corpusGames,testSeasons){
 const ids=new Set(corpusGames.map(g=>g.id));
 // --- production Elo (same construction as scripts/v7_backtest.cjs)
 const hist=IO.read('historical-games.json'),context=IO.read('context.json');
 const profilesFor=season=>{const out={};for(const t of context.teams.filter(x=>x.season===season-1)){out[t.abbr]=t;}return out;};
 const cache=new Map(),elo=new Map();
 for(const g of hist.games.filter(g=>g.status==='final'&&testSeasons.includes(g.season)&&ids.has(g.id))){
  let state=cache.get(g.date);if(!state){state=E.ratings(hist.games,g.date);cache.set(g.date,state);}
  const f=E.forecast(g,state,profilesFor(g.season));
  elo.set(g.id,{p:f.homeWin,margin:f.margin,home:f.homeScore,away:f.awayScore,total:f.total});
 }
 // --- Score Machine V1: per-season walk-forward exactly as scripts/score_machine_audit.cjs
 const intel=IO.read('v7-intelligence.json');
 const rows=intel.games.map(g=>({id:g.result_id,season:g.season,home:g.pregame.home,away:g.pregame.away,x:S.vector(g.pregame.home,g.pregame.away),
  margin:g.home_score-g.away_score,total:g.home_score+g.away_score})).filter(r=>r.x);
 const sm=new Map();
 for(const year of testSeasons){
  const model=S.train(rows.filter(r=>r.season<year));
  for(const r of rows.filter(r=>r.season===year)){const p=S.predict(model,r.home,r.away);if(p.available)sm.set(r.id,{p:p.home_win_probability,margin:p.projected_home_margin,home:p.projected_home_score,away:p.projected_away_score,total:p.projected_home_score+p.projected_away_score});}
 }
 return {elo,sm};
}

// ---------------------------------------------------------------- player-engine pass
// variants: 'naive' (no availability), 'inactive' (participation oracle: players not dressed are OUT), 'carry' (missed last 3 known games)
function runEngine(corpus,params,variant,predictSeasons,opts={}){
 const state=PE.createState(params),byAvail=[...corpus].sort((a,b)=>a.avail-b.avail||a.tip-b.tip);
 let ptr=0;const out=[];
 const prevTop=new Map();// season|team -> top-8 minute player ids of that season (ex-ante for the NEXT season)
 const seasonMinutes=new Map();
 for(const g of corpus){
  while(ptr<byAvail.length&&byAvail[ptr].avail<g.tip){
   const o=byAvail[ptr++];PE.observeGame(state,o);
   for(const r of o.players)if(r.min>0){const k=o.season+'|'+(r.tm==='H'?o.home.id:o.away.id);let m=seasonMinutes.get(k);if(!m){m=new Map();seasonMinutes.set(k,m);}m.set(r.id,(m.get(r.id)||0)+r.min);}
  }
  if(!predictSeasons.includes(g.season))continue;
  const input={date:g.date,home:{id:g.home.id,availability:{},extra:[]},away:{id:g.away.id,availability:{},extra:[]}};
  const meta={starsOut:[],turnover:0};
  for(const [side,tm] of [['home','H'],['away','A']]){
   const team=input[side],dressed=new Set(g.players.filter(p=>p.tm===tm).map(p=>p.id));
   if(variant==='inactive'){
    team.extra=[...dressed].filter(id=>state.players.has(id));
    const tr=PE.teamRec(state,team.id);meta.freshKey=meta.freshKey||{home:0,away:0};
    for(const pl of PE.candidates(state,team.id,team.extra))if(!dressed.has(pl.id)){
     team.availability[pl.id]='out';if(PE.baselineMinutes(pl)>=28)meta.starsOut.push(pl.id);
     if(PE.baselineMinutes(pl)>=16&&tr.gc-pl.lastGC<=3)meta.freshKey[side]++;
    }
   }else if(variant==='carry'){
    const t=PE.teamRec(state,team.id);
    for(const pl of PE.candidates(state,team.id,[]))if(t.gc-pl.lastGC>=3)team.availability[pl.id]='out';
   }
   // ex-ante roster-change indicator: last season's top-8 not on the as-of candidate list
   const pm=seasonMinutes.get((g.season-1)+'|'+team.id);
   if(pm){const top=[...pm].sort((a,b)=>b[1]-a[1]).slice(0,8).map(x=>x[0]),on=new Set(PE.candidates(state,team.id,[]).map(p=>p.id));meta.turnover=Math.max(meta.turnover,top.filter(id=>!on.has(id)).length);}
  }
  const f=PE.forecastGame(state,input,opts);
  PE.recordPrediction(state,g.id,{raw_margin:f.raw_margin,raw_total:f.raw_total});
  const row={id:g.id,season:g.season,date:g.date,tip:g.tip,hs:g.hs,as:g.as,raw:f,restDiff:(g.rest_home===null||g.rest_away===null)?0:Math.max(-3,Math.min(3,g.rest_home-g.rest_away)),
   first10:Math.max(g.no_home,g.no_away)<=10,starsOut:meta.starsOut.length>0,freshKey:meta.freshKey||{home:0,away:0},turnover:meta.turnover};
  if(opts.explain){
   const explained=PE.explainPlayers(state,input,PE.applyCalibration(f,PE.fitCalibration([]),0),opts);
   const brief=r=>({id:r.id,side:r.side,normal_fantasy:r.normal.fantasy,final_fantasy:r.final.fantasy,delta:r.delta_fantasy_total,normal_min:r.normal.min,dmin:r.delta_minutes_from_availability});
   row.spot=PE.spotlights(explained,state,2).map(brief);
   const rot=explained.filter(r=>r.normal.min>=14&&r.final.min>=14);
   row.stars=[...rot].sort((a,b)=>b.normal.fantasy-a.normal.fantasy).slice(0,2).map(brief);
   row.rotation=rot.map(brief);
  }
  out.push(row);
  // keep memory bounded: players needed later only for those who actually played
  const box=new Map(g.players.map(p=>[p.side||p.tm+p.id,p]));void box;
  row.players=f.players.map(p=>({id:p.id,side:p.side,b_min:state.players.get(p.id)?.mpg??null,b_pts:state.players.get(p.id)?.pts20??null,has_ev:(p.evidence&&p.evidence.length>0)?1:0,net_lost:p.net_lost,cond_base:p.cond_base,appr:p.appr,min:p.min,min_if_plays:p.min_if_plays,pts_if_plays:p.pts_if_plays,reb_if_plays:p.reb_if_plays,ast_if_plays:p.ast_if_plays,tpm_if_plays:p.tpm_if_plays,fantasy_if_plays:p.fantasy_if_plays,expected_min:p.expected_min,pts:p.pts,reb:p.reb,ast:p.ast,tpm:p.tpm,stl:p.stl,blk:p.blk,tov:p.tov,fga:p.fga,fgm:p.fgm,fta:p.fta,ftm:p.ftm,fantasy:p.fantasy,prob_plays:p.prob_plays}));
  row.raw={resid_diff:f.resid_diff,resid_total_sum:f.resid_total_sum,raw_margin:f.raw_margin,raw_total:f.raw_total,home_points_raw:f.home_points_raw,away_points_raw:f.away_points_raw,margin_scenario_sd:f.margin_scenario_sd,possessions:f.possessions,players:row.players};
 }
 return {rows:out,state};
}

// ---------------------------------------------------------------- calibration & metrics
function calibrate(rows,seasons){
 // walk-forward: each season is calibrated from predictions of strictly earlier seasons
 const out=new Map();
 for(const s of seasons){
  const prior=rows.filter(r=>r.season<s).map(r=>({raw_margin:r.raw.raw_margin,raw_total:r.raw.raw_total,margin:r.hs-r.as,total:r.hs+r.as,restDiff:r.restDiff,resid_diff:r.raw.resid_diff,resid_total_sum:r.raw.resid_total_sum,home:r.hs,away:r.as}));
  out.set(s,PE.fitCalibration(prior));
 }
 return out;
}
function finalise(rows,cals){
 return rows.map(r=>{
  const cal=cals.get(r.season);if(!cal)return null;
  const f=PE.applyCalibration({...r.raw,players:r.players},cal,r.restDiff);
  return {...r,cal,f};
 }).filter(Boolean);
}
const sigmoidSafe=p=>Math.min(1-1e-6,Math.max(1e-6,p));
function ece(ps,ys,bins=10){
 const b=Array.from({length:bins},()=>({n:0,p:0,y:0}));
 ps.forEach((p,i)=>{const k=Math.min(bins-1,Math.floor(p*bins));b[k].n++;b[k].p+=p;b[k].y+=ys[i];});
 return b.reduce((s,x)=>s+(x.n?x.n/ps.length*Math.abs(x.p/x.n-x.y/x.n):0),0);
}
function teamMetrics(items){// items: {p,margin,total,home,away, hs,as}
 const y=items.map(i=>i.hs>i.as?1:0),n=items.length;
 return {games:n,accuracy:mean(items.map((i,k)=>((i.p>=0.5)===(y[k]===1))?1:0)),brier:mean(items.map((i,k)=>(i.p-y[k])**2)),
  log_loss:mean(items.map((i,k)=>-(y[k]*Math.log(sigmoidSafe(i.p))+(1-y[k])*Math.log(1-sigmoidSafe(i.p))))),ece:ece(items.map(i=>i.p),y),
  team_score_mae:mean(items.map(i=>(Math.abs(i.home-i.hs)+Math.abs(i.away-i.as))/2)),margin_mae:mean(items.map(i=>Math.abs(i.margin-(i.hs-i.as)))),
  total_mae:mean(items.map(i=>Math.abs(i.total-(i.hs+i.as))))};
}
function bootstrapDiff(a,b,fn,B=600,seed=11){// paired game bootstrap of fn(a)-fn(b) over indices
 let s=seed;const rnd=()=>{s=(s*1664525+1013904223)%4294967296;return s/4294967296;};
 const n=a.length,diffs=[];
 for(let k=0;k<B;k++){const ia=[];for(let i=0;i<n;i++)ia.push(Math.floor(rnd()*n));diffs.push(fn(ia.map(i=>a[i]))-fn(ia.map(i=>b[i])));}
 diffs.sort((x,y)=>x-y);return {point:fn(a)-fn(b),ci95:[diffs[Math.floor(0.025*B)],diffs[Math.floor(0.975*B)]]};
}

module.exports={loadCorpus,loadBaselines,runEngine,calibrate,finalise,teamMetrics,ece,bootstrapDiff,mean};

// ---------------------------------------------------------------- player metrics
const boxFantasy=r=>(r.pts||0)+(r.tpm||0)+2*(r.fgm||0)-(r.fga||0)+(r.ftm||0)-(r.fta||0)+(r.reb||0)+2*(r.ast||0)+4*(r.stl||0)+4*(r.blk||0)-2*(r.tov||0);
function playerPairs(final,gameById){
 const pairs={min:[],pts:[],reb:[],ast:[],tpm:[],fantasy:[]},naive={min:[],pts:[]};let projectedMin=0,totalMin=0,missed=0;
 for(const r of final){
  const g=gameById.get(r.id),box=new Map(g.players.filter(p=>p.min>0).map(p=>[p.tm+p.id,p]));
  const seen=new Set();
  for(const p of r.players){
   const key=(p.side==='home'?'H':'A')+p.id,a=box.get(key);seen.add(key);
   if(!a)continue;
   const act={min:a.min,pts:a.pts,reb:a.reb,ast:a.ast,tpm:a.tpm,fantasy:boxFantasy(a),fga:a.fga};
   for(const k of ['min','pts','reb','ast','tpm','fantasy'])pairs[k].push([p[k+'_if_plays'],act[k],r.season,r.id]);
   if(p.has_ev){(pairs.ev_min||(pairs.ev_min=[])).push([p.min,a.min]);(pairs.ev_pts||(pairs.ev_pts=[])).push([p.pts,a.pts]);(pairs.ev_fga||(pairs.ev_fga=[])).push([p.fga,a.fga]);}
   if(p.b_min!==null)naive.min.push([p.b_min,a.min]);if(p.b_pts!==null)naive.pts.push([p.b_pts,a.pts]);
   projectedMin+=a.min;
  }
  for(const [key,a] of box){totalMin+=a.min;if(!seen.has(key))missed++;}
 }
 return {pairs,naive,coverage:{minutes_share_projected:projectedMin/totalMin,unprojected_players_who_played:missed,games:final.length}};
}
const mae=p=>mean(p.map(x=>Math.abs(x[0]-x[1])));
function playerSummary(pp){
 const out={};for(const k of Object.keys(pp.pairs))out[k]={n:pp.pairs[k].length,mae:mae(pp.pairs[k])};
 out.naive_recent_minutes_mae=mae(pp.naive.min);out.naive_recent_points_mae=mae(pp.naive.pts);out.coverage=pp.coverage;return out;
}
function bandCoverage(allFinal,gameById,testSeasons){
 // fit player bands on strictly earlier seasons, then measure 80% coverage on each test season
 const per={};
 const pairsFor=rows=>playerPairs(rows,gameById).pairs;
 for(const k of ['min','pts','reb','ast','fantasy'])per[k]={hit:0,n:0};
 for(const s of testSeasons){
  const prior=pairsFor(allFinal.filter(r=>r.season<s)),test=pairsFor(allFinal.filter(r=>r.season===s));
  for(const k of Object.keys(per)){
   const bands=PE.fitBands(prior[k]);if(!bands)continue;
   for(const [pred,act] of test[k]){const b=PE.band(bands,pred,0);per[k].n++;if(act>=b[0]&&act<=b[1])per[k].hit++;}
  }
 }
 return Object.fromEntries(Object.entries(per).map(([k,v])=>[k,{n:v.n,coverage_80:v.n?v.hit/v.n:null}]));
}

// ---------------------------------------------------------------- evaluation helpers
const teamItem=(r,base)=>({p:base.p,margin:base.margin,total:base.total,home:base.home,away:base.away,hs:r.hs,as:r.as});
const peItem=r=>({p:r.f.home_win_probability,margin:r.f.margin,total:r.f.total,home:r.f.home_score,away:r.f.away_score,hs:r.hs,as:r.as});
function compare(rows,get){// rows: array of {id,hs,as,model,others...}
 return teamMetrics(rows.map(get));
}
function coverage(final){
 const c=k=>mean(final.map(r=>{const [lo,hi]=r.f.intervals_80[k];const actual=k==='margin'?r.hs-r.as:k==='total'?r.hs+r.as:k==='home_score'?r.hs:r.as;return actual>=lo&&actual<=hi?1:0;}));
 return {margin:c('margin'),total:c('total'),home_score:c('home_score'),away_score:c('away_score')};
}

function prep(){
 const loaded=loadCorpus(),games=loaded.games,gameById=new Map(games.map(g=>[g.id,g]));
 return {games,gameById,excluded:loaded.excluded};
}

// ---------------------------------------------------------------- tuning (only information before 2024)
const BASEW=[[0.6,0.25,0.15],[1,0,0],[0.8,0.2,0],[0.4,0.3,0.3]];
const GRID={decay:[0.9,0.94,0.97],kRate:[150,300,600],minDecay:[0.8,0.86,0.92],usageTradeoff:[0,0.12,0.3],defLambda:[0,0.5,1],
 kRes:[4,8,16],resCarry:[0.3,0.5,0.8],teamDecay:[0.93,0.96,0.98],pairWeight:[0,0.3,0.6,1],pairUsageWeight:[0,0.3,0.6],pairKappa:[6,12,24,48],
 minCap:[36,38,40],seasonCarry:[0.4,0.6,0.8],kShoot:[50,100,200],usageExponent:[0.8,1,1.2],
 shareScale:[0,0.6,1,1.5],coreN:[7,8,9,10],fringeCap:[16,24,32],apprPower:[0,0.5,1],baseWIdx:[0,1,2,3]};
const withParam=(p,key,v)=>key==='baseWIdx'?{...p,baseW:BASEW[v],baseWIdx:v}:{...p,[key]:v};
function objective(ctx,params){
 const {rows}=runEngine(ctx.games,params,'inactive',[2022,2023]);
 const cal=calibrate(rows,[2023]),final=finalise(rows.filter(r=>r.season===2023),cal);
 const pp=playerSummary(playerPairs(final,ctx.gameById)),team=teamMetrics(final.map(peItem));
 return {J:pp.min.mae+pp.pts.mae+team.team_score_mae+team.margin_mae,min:pp.min.mae,pts:pp.pts.mae,team:team.team_score_mae,margin:team.margin_mae};
}
function tune(ctx){
 let best={...PE.DEFAULTS,baseWIdx:0},bestScore=objective(ctx,best);console.log('start',JSON.stringify(bestScore));
 for(let pass=0;pass<2;pass++){
  for(const [key,values] of Object.entries(GRID)){
   for(const v of values){
    if(best[key]===v||(key==='baseWIdx'&&best.baseWIdx===v))continue;
    const cand=withParam(best,key,v),sc=objective(ctx,cand);
    if(sc.J<bestScore.J-1e-4){best=cand;bestScore=sc;console.log(`pass ${pass} ${key}=${v} J=${sc.J.toFixed(4)} min=${sc.min.toFixed(3)} pts=${sc.pts.toFixed(3)} team=${sc.team.toFixed(3)}`);}
   }
  }
 }
 return {params:best,score:bestScore};
}

// ---------------------------------------------------------------- full evaluation
const TEST=[2024,2025,2026];
function evaluate(ctx,params){
 const base=loadBaselines(ctx.games,[2023,2024,2025,2026]);
 const variants={};
 for(const v of ['inactive','naive','carry']){
  const t0=Date.now(),{rows}=runEngine(ctx.games,params,v,[2022,2023,2024,2025,2026],v==='inactive'?{explain:true}:{});
  const cals=calibrate(rows,[2023,2024,2025,2026]);variants[v]={rows:finalise(rows,cals),cals};
  console.log(v,'forecasts',rows.length,((Date.now()-t0)/1000).toFixed(0)+'s');
 }
 // identical-game primary sample: test seasons with Elo and Score Machine and engine output
 const idsOf=v=>new Set(variants[v].rows.filter(r=>TEST.includes(r.season)).map(r=>r.id));
 let ids=[...idsOf('inactive')].filter(id=>base.elo.has(id)&&base.sm.has(id)&&idsOf('naive').has(id)&&idsOf('carry').has(id));
 const idSet=new Set(ids);
 const pick=v=>new Map(variants[v].rows.filter(r=>idSet.has(r.id)).map(r=>[r.id,r]));
 const M={inactive:pick('inactive'),naive:pick('naive'),carry:pick('carry')};
 const order=ids.slice().sort();
 const gameRows=order.map(id=>{const g=ctx.gameById.get(id);return {id,hs:g.hs,as:g.as,season:g.season,pe:M.inactive.get(id),naive:M.naive.get(id),carry:M.carry.get(id),elo:base.elo.get(id),sm:base.sm.get(id),g};});
 // constant home-advantage baseline from strictly earlier seasons
 const priorMargin=s=>mean(ctx.games.filter(g=>g.season<s&&g.season>=2022).map(g=>g.hs-g.as)),priorWin=s=>mean(ctx.games.filter(g=>g.season<s&&g.season>=2022).map(g=>g.hs>g.as?1:0));
 const priorTotal=s=>mean(ctx.games.filter(g=>g.season<s&&g.season>=2022).map(g=>g.hs+g.as));
 const modelItems={
  player_engine_inactive_known:gameRows.map(r=>peItem(r.pe)),player_engine_naive_no_availability:gameRows.map(r=>peItem(r.naive)),player_engine_carry_forward:gameRows.map(r=>peItem(r.carry)),
  production_elo:gameRows.map(r=>({...r.elo,hs:r.hs,as:r.as})),score_machine_v1:gameRows.map(r=>({...r.sm,hs:r.hs,as:r.as})),
  home_court_constant:gameRows.map(r=>({p:priorWin(r.season),margin:priorMargin(r.season),total:priorTotal(r.season),home:(priorTotal(r.season)+priorMargin(r.season))/2,away:(priorTotal(r.season)-priorMargin(r.season))/2,hs:r.hs,as:r.as}))
 };
 const report={schema:'nba-twin-lab-player-engine-backtest-v1',generated_at:new Date().toISOString(),params,test_seasons:TEST,matched_games:order.length,
  corpus_excluded_box_score_mismatch:ctx.excluded,availability_variants:{
   player_engine_inactive_known:'participation oracle: players not dressed are OUT (upper bound for an engine fed a correct official injury report; NOT a pregame-knowable forecast)',
   player_engine_naive_no_availability:'no availability information; as-of rosters only (pregame-knowable)',
   player_engine_carry_forward:'players who missed each of the last 3 known team games are OUT (pregame-knowable)'},
  models:{}};
 for(const [k,items] of Object.entries(modelItems))report.models[k]=teamMetrics(items);
 // paired uncertainty versus incumbents, resampling games
 const idx=order.map((_,i)=>i),diffs={};
 for(const challenger of ['player_engine_inactive_known','player_engine_naive_no_availability','player_engine_carry_forward']){
  for(const incumbent of ['production_elo','score_machine_v1']){
   const a=modelItems[challenger],b=modelItems[incumbent];diffs[`${challenger}_minus_${incumbent}`]={
    brier:bootstrapDiff(a,b,x=>teamMetrics(x).brier),margin_mae:bootstrapDiff(a,b,x=>teamMetrics(x).margin_mae),
    accuracy:bootstrapDiff(a,b,x=>teamMetrics(x).accuracy),team_score_mae:bootstrapDiff(a,b,x=>teamMetrics(x).team_score_mae),total_mae:bootstrapDiff(a,b,x=>teamMetrics(x).total_mae)};
  }
 }
 report.paired_differences_95ci=diffs;
 // subsets (flags are ex-ante except starsOut, which is oracle-defined by inactivity)
 const subsets={
  stars_out_oracle:r=>r.pe.starsOut,first_10_team_games:r=>r.pe.first10,major_roster_change_3plus_of_last_seasons_top8_gone:r=>r.pe.turnover>=3,
  no_star_out:r=>!r.pe.starsOut};
 report.subsets={};
 for(const [name,fn] of Object.entries(subsets)){
  const sel=gameRows.map((r,i)=>[r,i]).filter(([r])=>fn(r)).map(([,i])=>i);
  report.subsets[name]={games:sel.length};
  for(const k of ['player_engine_inactive_known','player_engine_naive_no_availability','production_elo','score_machine_v1'])report.subsets[name][k]=sel.length?teamMetrics(sel.map(i=>modelItems[k][i])):null;
 }
 // per season
 report.per_season={};
 for(const s of TEST){const sel=gameRows.map((r,i)=>[r,i]).filter(([r])=>r.season===s).map(([,i])=>i);report.per_season[s]={games:sel.length};
  for(const k of Object.keys(modelItems))report.per_season[s][k]=teamMetrics(sel.map(i=>modelItems[k][i]));}
 // intervals and players (matched games)
 report.interval_coverage_80=coverage(gameRows.map(r=>r.pe));
 const finalFor=v=>gameRows.map(r=>r[v==='inactive'?'pe':v]);
 report.player_metrics={inactive_known:playerSummary(playerPairs(finalFor('inactive'),ctx.gameById)),naive_no_availability:playerSummary(playerPairs(finalFor('naive'),ctx.gameById)),carry_forward:playerSummary(playerPairs(finalFor('carry'),ctx.gameById))};
 report.player_band_coverage_80=bandCoverage(variants.inactive.rows,ctx.gameById,TEST);
 // spotlights: measured-opportunity picks vs star picks vs the whole rotation (all vs each player's own normal expectation)
 const actualFantasy=(r,pick)=>{const a=ctx.gameById.get(r.id).players.find(p=>p.tm===(pick.side==='home'?'H':'A')&&p.id===pick.id&&p.min>0);return a?boxFantasy(a):null;};
 const agg=(sel)=>{const ex=[],hit=[];let games=0,n=0;for(const r of gameRows){const picks=sel(r.pe);let any=false;for(const p of picks){const a=actualFantasy(r.pe,p);if(a===null)continue;ex.push(a-p.normal_fantasy);hit.push(a>p.normal_fantasy?1:0);any=true;}if(any)games++;}
  return {picks:ex.length,games,mean_actual_minus_normal_fantasy:mean(ex),share_above_normal:mean(hit)};};
 report.spotlights={measured_opportunity_picks:agg(r=>r.spot||[]),star_picks_by_normal_fantasy:agg(r=>r.stars||[]),all_rotation_players:agg(r=>r.rotation||[])};
 return {report,variants,gameRows};
}

// ---------------------------------------------------------------- CLI
if(require.main===module){
 const cmd=process.argv[2],ctx=prep();
 console.log('corpus games',ctx.games.length,'excluded (box != score)',ctx.excluded);
 const arg=n=>{const i=process.argv.indexOf(n);return i>0?process.argv[i+1]:null;};
 if(cmd==='quick'){
  const t0=Date.now();
  console.log(JSON.stringify(objective(ctx,PE.DEFAULTS)),((Date.now()-t0)/1000).toFixed(1)+'s');
 }else if(cmd==='tune'){
  const result=tune(ctx);
  const out=arg('--out')||path.join(ROOT,'research-reviews/player-engine-v1/tuning/params-2022-2023.json');
  fs.mkdirSync(path.dirname(out),{recursive:true});
  fs.writeFileSync(out,JSON.stringify({schema:'nba-twin-lab-player-engine-tuning-v1',tuned_on:'seasons 2021 warm-up, 2022 calibration, 2023 validation; no test-season data',objective:'validation min MAE + points MAE + team-score MAE + margin MAE (inactive variant)',...result},null,1)+'\n',{flag:'wx'});
  console.log('wrote',out,JSON.stringify(result.params));
 }else if(cmd==='eval'){
  const pf=arg('--params'),params=pf?JSON.parse(fs.readFileSync(pf)).params:{};
  const {report}=evaluate(ctx,params);
  const out=arg('--out')||path.join(ROOT,'research-reviews/player-engine-v1/results',new Date().toISOString().replace(/[:.]/g,'-'),'report.json');
  fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(report,null,1)+'\n',{flag:'wx'});
  console.log('wrote',out);
 }
}
