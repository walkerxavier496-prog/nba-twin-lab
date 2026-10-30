#!/usr/bin/env node
/* Honest walk-forward season test: opening-day prior, lightly weighted preseason,
   evolving regular-season trends, and model-vs-actual standings.
   No 2026-27 game result is used before its tipoff. */
'use strict';
const fs=require('node:fs');
const path=require('node:path');
const E=require('../predict/engine.js');
const ROOT=path.resolve(__dirname,'..');
const EAST='ATL BOS BKN CHA CHI CLE DET IND MIA MIL NYK ORL PHI TOR WAS'.split(' ');
const WEST='DAL DEN GSW HOU LAC LAL MEM MIN NOP OKC PHO POR SAC SAS UTA'.split(' ');
const alias={GS:'GSW',NY:'NYK',SA:'SAS',NO:'NOP',UTAH:'UTA',WSH:'WAS',PHX:'PHO',BKN:'BRK',CHA:'CHO'};
const canonical=a=>({GS:'GSW',NY:'NYK',SA:'SAS',NO:'NOP',UTAH:'UTA',WSH:'WAS',PHX:'PHO'}[a]||a);
const now=()=>new Date().toISOString();
const round=(n,d=2)=>Number(n.toFixed(d));
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const load=file=>JSON.parse(fs.readFileSync(path.join(ROOT,'data',file),'utf8'));
function profilesFor(context,season){
 const p={};
 for(const t of context.teams||[])if(t.season===season-1)p[t.abbr]=t;
 for(const [from,to] of Object.entries(alias))if(p[to])p[from]=p[to];
 return p;
}
function preseasonOffsets(games){
 const ratings=new Map();
 for(const g of games.slice().sort((a,b)=>a.date.localeCompare(b.date))){
   if(g.status!=='final'||g.homeScore===g.awayScore)continue;
   const h=g.home.id,a=g.away.id,hr=ratings.get(h)||0,ar=ratings.get(a)||0;
   const p=E.logistic(hr-ar); // preseason home courts are often neutral
   const outcome=g.homeScore>g.awayScore?1:0;
   const mov=clamp(Math.log(Math.abs(g.homeScore-g.awayScore)+1)/2.6,.5,1.6);
   const delta=2.0*mov*(outcome-p); // K=2 vs regular season K=18: ~11% influence
   ratings.set(h,clamp(hr+delta,-22,22));
   ratings.set(a,clamp(ar-delta,-22,22));
 }
 return ratings;
}
function applyPreseason(state,offsets){
 for(const [id,t] of state.teams){
   const offset=offsets.get(id)||0;
   // Preseason matters on opening night, fades as actual games accumulate.
   t.elo+=offset*Math.exp(-t.games/5);
 }
 return state;
}
function conference(abbr){return EAST.includes(canonical(abbr))?'East':WEST.includes(canonical(abbr))?'West':'Unknown'}
function pregame(game,games,profiles,offsets){
 const state=E.ratings(games,game.date);
 if(offsets)applyPreseason(state,offsets);
 return E.forecast(game,state,profiles);
}
function standing(rows,n){
 const byTeam=new Map();
 for(const g of rows){
   for(const [team,p,actual,pick] of [
     [g.home,g.homeWin,g.homeActual,g.homePick],
     [g.away,1-g.homeWin,1-g.homeActual,1-g.homePick]]){
     const id=team.id;
     if(!byTeam.has(id))byTeam.set(id,{id,team:team.name,abbr:canonical(team.abbr),
       conference:conference(team.abbr),games:0,actualWins:0,expectedWins:0,pickedWins:0});
     const t=byTeam.get(id);
     if(n!=='all'&&t.games>=n)continue;
     t.games++;t.actualWins+=actual;t.expectedWins+=p;t.pickedWins+=pick;
   }
 }
 const items=[...byTeam.values()];
 for(const t of items){
   t.actualLosses=t.games-t.actualWins;
   t.pickedLosses=t.games-t.pickedWins;
   t.expectedWins=round(t.expectedWins);
   t.actualPct=t.games?t.actualWins/t.games:0;
   t.expectedPct=t.games?t.expectedWins/t.games:0;
 }
 for(const conf of ['East','West']){
   const subset=items.filter(t=>t.conference===conf);
   const actual=subset.slice().sort((a,b)=>b.actualPct-a.actualPct||b.actualWins-a.actualWins||a.abbr.localeCompare(b.abbr));
   const projected=subset.slice().sort((a,b)=>b.expectedPct-a.expectedPct||b.expectedWins-a.expectedWins||a.abbr.localeCompare(b.abbr));
   actual.forEach((t,i)=>t.actualRank=i+1);
   projected.forEach((t,i)=>t.projectedRank=i+1);
 }
 return items.sort((a,b)=>a.conference.localeCompare(b.conference)||a.projectedRank-b.projectedRank)
   .map(t=>({...t,actualPct:round(t.actualPct,4),expectedPct:round(t.expectedPct,4),
     winDifference:round(t.actualWins-t.expectedWins),rankDifference:t.actualRank-t.projectedRank}));
}
function forecast82(state,teams,profiles,offsets,asOf){
 const s={...state,teams:new Map([...state.teams].map(([id,t])=>[id,{...t}]))};
 if(offsets)applyPreseason(s,offsets);
 const all=[...teams.values()];
 const future=new Date(Date.parse(asOf)+14*86400000).toISOString();
 const result={};
 for(const team of all){
   let sum=0,count=0;
   for(const opponent of all){
     if(team.id===opponent.id)continue;
     for(const home of [true,false]){
       const g={id:'projection',date:future,season:2027,
         home:home?team:opponent,away:home?opponent:team};
       const p=E.forecast(g,s,profiles);
       sum+=home?p.homeWin:p.awayWin;
       count++;
     }
   }
   result[team.id]=sum/count;
 }
 return result;
}
function run(games,context,preseason){
 const season=games.coverage.current_season;
 const all=E.merge(games.games);
 const finals=all.filter(g=>g.season===season&&g.status==='final');
 if(finals.length<1)throw Error('No completed current-season games');
 const previous=all.filter(g=>g.season===season-1&&g.status==='final');
 if(previous.length!==1230)throw Error('Historical 1,230-game baseline missing');
 const first=finals[0].date;
 const profiles=profilesFor(context,season);
 const teams=new Map();
 for(const g of all.filter(x=>x.season===season))for(const t of [g.home,g.away])teams.set(t.id,{...t,date:first});
 if(teams.size!==30)throw Error('Current season schedule does not cover 30 teams');
 const pre=preseason?.season===season&&preseason.games?.length>=35?preseason.games:[];
 const offsets=pre.length?preseasonOffsets(pre):null;
 const rows=[],baseline=[];
 for(const g of finals){
   const p=pregame(g,all,profiles,offsets);
   const b=pregame(g,all,profiles,null);
   const actual=g.homeScore>g.awayScore?1:0;
   const pick=p.homeWin>=.5?1:0;
   const game={id:g.id,date:g.date,home:g.home,away:g.away,
     homeWin:round(p.homeWin,6),homePick:pick,homeActual:actual,
     homeScore:g.homeScore,awayScore:g.awayScore,
     projectedHomeScore:round(p.homeScore,1),projectedAwayScore:round(p.awayScore,1),
     brier:round((p.homeWin-actual)**2,6),correct:pick===actual,
     pregameHomeRating:round(p.homeRating),pregameAwayRating:round(p.awayRating)};
   rows.push(game);
   baseline.push({p:b.homeWin,actual,correct:(b.homeWin>=.5)===!!actual});
 }
 const metrics=arr=>({
   games:arr.length,
   correct:arr.filter(x=>x.correct).length,
   accuracy:round(100*arr.filter(x=>x.correct).length/arr.length,1),
   brier:round(arr.reduce((s,x)=>s+(x.brier??(x.p-x.actual)**2),0)/arr.length,4)
 });
 const firstState=E.ratings(all,first);
 const endDate=new Date(Math.max(...finals.map(g=>Date.parse(g.date)))+86400000).toISOString();
 const latestState=E.ratings(all,endDate);
 const opening=forecast82(firstState,teams,profiles,offsets,first);
 const updated=forecast82(latestState,teams,profiles,offsets,endDate);
 const snapshots={};
 const allActual=Object.fromEntries(standing(rows,'all').map(t=>[t.id,t.actualWins]));
 for(const n of [1,3,5,'all']){
   snapshots[String(n)]=standing(rows,n).map(t=>{
     const played=latestState.teams.get(t.id)?.games||0;
     return {...t,
       opening82:round(82*opening[t.id],1),
       updated82:round(allActual[t.id]+(82-played)*updated[t.id],1)};
   });
 }
 return {schema:1,season,generated_at_utc:now(),
   as_of_utc:endDate,source_games_built_at_utc:games.built_at_utc,
   methodology:{walk_forward:true,preseason_games:pre.length,
     preseason_weight:'Elo K=2 vs regular-season K=18 (~11%); preseason rating offset decays exp(-team_games/5)',
     preseason_status:pre.length?'verified ESPN preseason games':'NO preseason feed; prior-year regular season only',
     previous_season:'2025-26 1,230 games',trend:'Current-season completed games update Elo after every final',
     previous_season_srs:'Prior-year SRS contributes to opening model and decays as games accumulate',
     expected_wins:'Sum of game-by-game pre-tipoff win probabilities',
     picked_wins:'Number of games with pre-tipoff probability >50%',
     opening82:'Opening-night 82-game estimate versus an equally weighted league opponent pool, 50% home games',
     updated82:'Actual wins so far plus estimated win probability over remaining games versus a balanced league pool; not the real remaining schedule',
     caution:'Projections do not account for injuries, transactions or exact future schedule; not calibrated betting odds'},
   metrics:{withPreseason:metrics(rows),withoutPreseason:metrics(baseline)},
   games:rows,snapshots};
}
if(require.main===module){
 const games=load('games.json'),context=load('context.json');
 let preseason=null;try{preseason=load('preseason.json')}catch(e){console.warn('Preseason not available; running prior-season-only comparison')}
 const result=run(games,context,preseason);
 const dest=path.join(ROOT,'data','season-test.json');
 fs.writeFileSync(dest,JSON.stringify(result));
 console.log('NBA Twin Lab · opening-night walk-forward season test');
 console.log('Preseason games:',result.methodology.preseason_games);
 console.log('Games evaluated:',result.metrics.withPreseason.games);
 console.log('Model with preseason:',result.metrics.withPreseason);
 console.log('Model without preseason:',result.metrics.withoutPreseason);
 for(const conf of ['East','West']){
   console.log('\n'+conf+' — expected standing vs actual through '+result.as_of_utc.slice(0,10));
   console.log('Team   Model rank / Actual rank  ExpW  PickW  ActualW-L  Opening82  Updated82');
   for(const t of result.snapshots.all.filter(t=>t.conference===conf))
     console.log([t.abbr.padEnd(5),String(t.projectedRank).padStart(2)+' / '+String(t.actualRank).padStart(2),
       String(t.expectedWins).padStart(5),String(t.pickedWins).padStart(5),
       String(t.actualWins+'-'+t.actualLosses).padStart(7),
       String(t.opening82).padStart(8),String(t.updated82).padStart(8)].join('  '));
 }
}
module.exports={run,standing,preseasonOffsets,applyPreseason,profilesFor};
