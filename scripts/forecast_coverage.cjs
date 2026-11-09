#!/usr/bin/env node
'use strict';
// Read-only forecast coverage audit. Never creates forecasts or edits historical evidence.
const fs=require('node:fs'),path=require('node:path');
const A=require('./audit-core.cjs');
const ROOT=path.join(__dirname,'..');
const dateRe=/^20\d{2}-\d{2}-\d{2}$/;
const safeNumber=x=>Number.isFinite(x)?Math.round(x*10)/10:null;
function examineDay({date,games,locks,nowMs}) {
 if(!dateRe.test(date))throw Error('Invalid Melbourne date');
 const candidates=games.filter(g=>A.melbourneDate(g.date)===date&&g.id&&Number.isFinite(Date.parse(g.date)));
 const gamesById=new Map();
 for(const g of candidates){
  if(gamesById.has(String(g.id)))throw Error('Duplicate NBA game '+g.id+' on '+date);
  gamesById.set(String(g.id),g);
 }
 const eligible=new Map();
 const errors=[];
 for(const lock of locks){
  if(lock.scope?.melbourne_date!==date)continue;
  if(!A.verifyIntegrity(lock)){errors.push('invalid lock integrity');continue}
  const lockTime=Date.parse(lock.locked_at_utc);
  if(!Number.isFinite(lockTime)){errors.push('invalid lock timestamp');continue}
  for(const f of lock.forecasts||[]){
   if(!f.game_id)continue;
   const g=gamesById.get(String(f.game_id));
   if(!g)continue;
   const tip=Date.parse(g.date);
   if(!(lockTime<tip)){errors.push('not pre-tip '+f.game_id);continue}
   if(eligible.has(String(f.game_id)))errors.push('duplicate locked ID '+f.game_id);
   else eligible.set(String(f.game_id),f);
  }
 }
 const ids=[...gamesById.keys()];
 const uncovered=ids.filter(id=>!eligible.has(id));
 const firstTip=ids.length?Math.min(...[...gamesById.values()].map(g=>Date.parse(g.date))):null;
 const begun=ids.filter(id=>nowMs>=Date.parse(gamesById.get(id).date));
 const missed=begun.filter(id=>!eligible.has(id));
 const notBegun=ids.filter(id=>nowMs<Date.parse(gamesById.get(id).date));
 return {date,known_games:ids.length,locked_games:eligible.size,unforecasted_game_ids:uncovered,
  missed_after_tip_ids:missed,upcoming_unlocked_ids:notBegun.filter(id=>!eligible.has(id)),
  first_tip_utc:firstTip===null?null:new Date(firstTip).toISOString(),integrity_errors:errors,
  status:errors.length?'integrity_error':!ids.length?'no_games':missed.length?'missed':
    uncovered.length?'pending':'locked'};
}
function runAudit({root=ROOT,now=new Date(),days=14,date=null,warn=false}={}) {
 const gameData=JSON.parse(fs.readFileSync(path.join(root,'data','games.json'),'utf8'));
 const games=(gameData.games||[]).filter(x=>Number(x.season)===Number(gameData.coverage?.current_season));
 const directories=[path.join(root,'audit','snapshots'),path.join(root,'practice')];
 const locks=[];
 for(const dir of directories) {
  if(!fs.existsSync(dir))continue;
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})) {
   if(!entry.isDirectory())continue;
   const candidate=path.join(dir,entry.name,'forecast.lock.json');
   if(fs.existsSync(candidate))locks.push(JSON.parse(fs.readFileSync(candidate,'utf8')));
  }
 }
 const nowMs=now.getTime();
 if(!Number.isFinite(nowMs))throw Error('Invalid now timestamp');
 const today=A.melbourneDate(nowMs);
 const dates=date?[date]:[...new Set(games.map(g=>A.melbourneDate(g.date)))].filter(d=>{
  const daysAgo=(Date.parse(today+'T00:00:00Z')-Date.parse(d+'T00:00:00Z'))/86400000;
  return daysAgo>=0&&daysAgo<days;
 }).sort();
 if(date&&!dateRe.test(date))throw Error('Invalid --date');
 const rows=dates.map(d=>examineDay({date:d,games,locks,nowMs}));
 const built=Date.parse(gameData.built_at_utc);
 const feedAgeHours=Number.isFinite(built)?safeNumber((nowMs-built)/3600000):null;
 const result={schema:'nba-forecast-coverage-check-v1',reported_at_utc:now.toISOString(),games_source_built_at_utc:gameData.built_at_utc||null,
  schedule_feed_age_hours:feedAgeHours,schedule_feed_stale:feedAgeHours===null||feedAgeHours>18||feedAgeHours<0,
  dates:rows,totals:{known_games:rows.reduce((n,x)=>n+x.known_games,0),
    locked_games:rows.reduce((n,x)=>n+x.locked_games,0),
    missed_forecasts_after_tip:rows.reduce((n,x)=>n+x.missed_after_tip_ids.length,0),
    integrity_errors:rows.reduce((n,x)=>n+x.integrity_errors.length,0)}};
 if(warn){
  for(const row of rows){
   if(row.missed_after_tip_ids.length)console.log('::warning title=Unforecasted NBA games::'+row.date+': '+row.missed_after_tip_ids.length+' genuine games passed tipoff without an immutable pretip lock. No retroactive prediction will be created.');
   if(row.integrity_errors.length)console.log('::error title=Forecast lock integrity::'+row.date+': '+row.integrity_errors.join(', '));
  }
  if(result.schedule_feed_stale)console.log('::warning title=Stale NBA schedule feed::Data age '+feedAgeHours+' hours; upcoming games may be impossible to lock safely.');
 }
 return result;
}
function parseArgs(argv){
 const opts={};for(let i=0;i<argv.length;i++){const x=argv[i];
  if(x==='--date')opts.date=argv[++i];
  else if(x==='--recent')opts.days=Number(argv[++i]);
  else if(x==='--now')opts.now=new Date(argv[++i]);
  else if(x==='--warn')opts.warn=true;
  else throw Error('Unknown argument '+x);
 }
 if(!Number.isInteger(opts.days??14)||(opts.days??14)<1||(opts.days??14)>90)throw Error('--recent must be 1–90 days');
 return opts;
}
if(require.main===module)try {
 const result=runAudit(parseArgs(process.argv.slice(2)));
 console.log(JSON.stringify(result,null,2));
}catch(error){console.error(error.stack||error.message);process.exitCode=1}
module.exports={examineDay,runAudit,parseArgs};
