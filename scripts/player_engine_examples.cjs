#!/usr/bin/env node
'use strict';
/* Worked examples for the report (research only; read-only inputs; writes a single new file under research-reviews/).
 *  1. CHA @ WSH at its lock time with the official pregame injury report, then graded against the original box score.
 *  2. A real historical injury redistribution: OKC without Jalen Williams, same game forecast with and without him.
 */
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib');
const ROOT=path.join(__dirname,'..');
const A=require('./audit-core.cjs'),PE=require('../predict/player-engine.js'),F=require('./player_engine_forecast.cjs');
const params=JSON.parse(fs.readFileSync(F.PARAMS_FILE)).params,corpus=F.loadAllCorpus();
const names=JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(ROOT,'research-reviews/player-engine-v1/corpus/players.json.gz'))));
const idByName=new Map(Object.entries(names).map(([id,v])=>[A.normalizeName(v.n),id]));
const r2=v=>Math.round(v*100)/100;
const out={schema:'nba-twin-lab-player-engine-examples-v1'};

// ---- 1. CHA @ WSH with the official report that was public before the lock ----
{
 const lock=JSON.parse(fs.readFileSync(path.join(ROOT,'practice/2026-10-31-melbourne/forecast.lock.json')));
 const lf=lock.forecasts.find(f=>f.game_id==='401909277'),games=JSON.parse(fs.readFileSync(path.join(ROOT,'data/games.json'))).games,game=games.find(g=>g.id==='401909277');
 const map={home:{},away:{}},unmatched=[];
 for(const p of lf.v9_player_projections){
  const status=String(p.official_injury_report?.status||'').toLowerCase();if(!status||status==='not listed')continue;
  const id=idByName.get(A.normalizeName(p.name));
  if(!id){unmatched.push(p.name);continue;}
  map[p.side==='home'||p.team===game.home.abbr?'home':'away'][id]=status;
 }
 const availability={state:'official_report',source:lock.injury_report.source,published_at_utc:lock.injury_report.published_at,home:map.home,away:map.away};
 const cutoff=Date.parse(lock.locked_at_utc);
 const artifact=F.buildForecast(corpus,params,game,availability,{cutoffMs:cutoff,allowHistorical:true});
 const box=corpus.find(g=>g.id==='401909277');
 out.cha_wsh={note:'Retrospective research forecast made with information available at the lock time (2026-10-30T21:49Z), including the official injury report published 21:15Z. It is NOT the locked production forecast and was not tuned on this game.',
  unmatched_names:unmatched,availability_used:availability,forecast:artifact,grade:F.gradeForecast(artifact,box)};
}

// ---- 2. a real OKC Jalen Williams absence ----
{
 const idOf=n=>idByName.get(A.normalizeName(n));
 const jw=idOf('Jalen Williams'),am=idOf('Ajay Mitchell');
 const inGame=(g,id)=>g.players.some(p=>p.id===id&&p.min>0);
 const cand=corpus.filter(g=>g.season>=2025&&g.season<=2026&&(g.home.abbr==='OKC'||g.away.abbr==='OKC')).filter(g=>{
  const side=g.home.abbr==='OKC'?'H':'A';
  const dressed=g.players.some(p=>p.id===jw&&p.tm===side);
  return !dressed&&g.players.some(p=>p.id===am&&p.tm===side&&p.min>0);});
 // choose an absence with at least 12 prior OKC games in the same season observed, i.e. mid-season
 const target=cand.find(g=>corpus.filter(x=>x.season===g.season&&x.tip<g.tip&&(x.home.abbr==='OKC'||x.away.abbr==='OKC')).length>=20)||cand[0];
 if(!target){out.okc_jalen_williams={error:'no suitable absence in corpus'};}
 else{
  const okcSide=target.home.abbr==='OKC'?'home':'away',cutoff=target.tip;
  const {state}=F.stateAsOf(corpus,params,cutoff);
  const okcId=okcSide==='home'?target.home.id:target.away.id;
  const base={date:target.date,home:{id:target.home.id,availability:{}},away:{id:target.away.id,availability:{}}};
  const healthy=PE.forecastGame(state,base),absentInput=JSON.parse(JSON.stringify(base));absentInput[okcSide].availability[jw]='out';
  const absent=PE.forecastGame(state,absentInput);
  const pick=(f,id)=>f.players.find(p=>p.side===okcSide&&p.id===id);
  const rows=ids=>ids.map(id=>{const a=pick(healthy,id),b=pick(absent,id);return a&&b?{player:names[id]?.n||id,healthy:{minutes:r2(a.min_if_plays),fga:r2(a.fga_if_plays??a.fga),points:r2(a.pts_if_plays)},williams_out:{minutes:r2(b.min_if_plays),fga:r2(b.fga_if_plays??b.fga),points:r2(b.pts_if_plays)},evidence:(b.evidence||[]).filter(e=>e.absent===jw)}:null;}).filter(Boolean);
  const top=absent.players.filter(p=>p.side===okcSide).sort((x,y)=>y.min-x.min).slice(0,9).map(p=>p.id);
  const actual=target.players.filter(p=>p.tm===(okcSide==='home'?'H':'A')&&p.min>0);
  out.okc_jalen_williams={game:{id:target.id,date:target.date,okc_side:okcSide,opponent:okcSide==='home'?target.away.abbr:target.home.abbr},
   note:'Real game in which Jalen Williams was inactive. Same state, same opponent; the only difference is whether he is marked OUT. Illustrative of the allocation, not a prediction target.',
   okc_total_minutes:{healthy:r2(healthy.players.filter(p=>p.side===okcSide).reduce((s,p)=>s+p.expected_min,0)),williams_out:r2(absent.players.filter(p=>p.side===okcSide).reduce((s,p)=>s+p.expected_min,0))},
   williams_baseline_minutes:r2(PE.baselineMinutes(state.players.get(jw))),williams_profile_rates_per36:(()=>{const pr=PE.profile(state,state.players.get(jw)).rates;return {fga:r2(pr.fga*36),assists:r2(pr.ast*36),rebounds:r2(pr.reb*36)};})(),
   okc_points_raw:{healthy:r2(healthy.home_points_raw>0&&okcSide==='home'?healthy.home_points_raw:healthy.away_points_raw),williams_out:r2(okcSide==='home'?absent.home_points_raw:absent.away_points_raw)},
   rotation_before_after:rows(top),mitchell:rows([am]),
   actual_okc_rotation:actual.sort((x,y)=>y.min-x.min).slice(0,9).map(p=>({player:names[p.id]?.n||p.id,minutes:p.min,fga:p.fga,points:p.pts}))};
 }
}
const outFile=process.argv[2]||path.join(ROOT,'research-reviews/player-engine-v1/examples/examples-v1.json');
fs.mkdirSync(path.dirname(outFile),{recursive:true});fs.writeFileSync(outFile,JSON.stringify(out,null,1)+'\n',{flag:'wx'});
console.log('wrote',outFile);
