'use strict';
// Initial publications are deliberately outside the official lock ledger.
const fs = require('node:fs'), path = require('node:path');
const A = require('./audit-core.cjs');
const ROOT = path.join(__dirname, '..');
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const relative = (root, file) => path.relative(root, file).split(path.sep).join('/');
function exclusive(file, value) {
  fs.mkdirSync(path.dirname(file), {recursive:true});
  fs.writeFileSync(file, JSON.stringify(value,null,2)+'\n', {flag:'wx'});
}
function derived(file, value) {
  const bytes=JSON.stringify(value,null,2)+'\n';
  if(fs.existsSync(file)&&fs.readFileSync(file,'utf8')===bytes)return;
  fs.mkdirSync(path.dirname(file),{recursive:true});
  fs.writeFileSync(file+'.tmp',bytes); fs.renameSync(file+'.tmp',file);
}
function morningDue(now) {
  return Number.isFinite(now) && A.melbourneHour(now)>=6;
}
function toInitial(lock, now) {
  if(!A.verifyIntegrity(lock))throw Error('Invalid forecast inputs');
  if(!Number.isFinite(now)||!(now<Date.parse(lock.scope?.first_tip_utc))||
     (lock.forecasts||[]).some(g=>!(now<Date.parse(g.tip_utc))))throw Error('Initial publication refused at or after tip');
  const {integrity,locked_at_utc,locked_at_melbourne,...payload}=lock;
  return A.withIntegrity({...payload,schema:'courthesis-morning-initial-v1',phase:'initial',
    published_at_utc:new Date(now).toISOString(),published_at_melbourne:A.melbourneDisplay(now),
    publication_target:'06:00 Australia/Melbourne; best-effort scheduled delivery',
    notice:'Initial morning forecast. Not a final locked pretip forecast. Later locks are separate artifacts.'});
}
function publishMorning({root=ROOT,now,build,clock=()=>now}) {
  if(!morningDue(now))return {status:'not_due'};
  const date=A.melbourneDate(now),file=path.join(root,'audit','morning',date,'initial.json');
  if(fs.existsSync(file)) { const value=read(file); if(!A.verifyIntegrity(value))throw Error('Initial integrity failed'); return {status:'existing',file}; }
  const forecast=build({date,now,morningPreview:true});
  // Forecast construction and upstream requests can cross tipoff. Stamp the
  // actual write attempt, never the tracker start or the scheduled target.
  const publishedAt=clock(),value=toInitial(forecast,publishedAt);
  if(value.scope.melbourne_date!==date||A.melbourneDate(publishedAt)!==date)throw Error('Morning date mismatch');
  exclusive(file,value); return {status:'published',file};
}
function critique(snapshot, games, phase) {
  games=[...games].sort((a,b)=>String(a.game_id).localeCompare(String(b.game_id)));
  const expected=new Set(snapshot.forecasts.map(g=>String(g.game_id))),seen=new Set(),rows={};
  for(const game of [...games].sort((a,b)=>String(a.game_id).localeCompare(String(b.game_id)))) {
    if(seen.has(String(game.game_id)))throw Error('Duplicate reviewed game');
    if(!expected.has(String(game.game_id)))throw Error('Unexpected reviewed game');
    seen.add(String(game.game_id));
    for(const [id,row] of Object.entries(game.models||{}).sort())(rows[id]||=[]).push(row);
  }
  return {schema:'courthesis-daily-critique-v1',phase,melbourne_date:snapshot.scope.melbourne_date,
    source_integrity_sha256:snapshot.integrity.canonical_payload_without_integrity,
    status:seen.size===expected.size?'complete':'partial',expected_games:expected.size,reviewed_games:seen.size,pending_games:expected.size-seen.size,
    models:Object.fromEntries(Object.entries(rows).sort().map(([id,values])=>[id,{...A.probabilityMetrics(values),calibration:A.calibration(values)}])),
    player_stats:A.summarizeGames(games).player_stats,
    notes:['Descriptive self-critique only; no model parameters or production selection change.',
      'Daily samples are small. Confidence gaps and calibration bins are descriptive evidence, not proof of model superiority.',
      seen.size<expected.size?'Pending games are excluded, never zero-filled.':'All forecast games have verified complete results.',
      ...Object.entries(rows).sort().map(([id,values])=>{const m=A.probabilityMetrics(values);return `${id}: n=${m.count}; confidence assessment=${m.confidence_assessment}; mean confidence minus accuracy=${m.confidence_gap}.`;})]};
}
function initialFiles(root) {
  const dir=path.join(root,'audit','morning');
  return fs.existsSync(dir)?fs.readdirSync(dir).filter(d=>/^\d{4}-\d{2}-\d{2}$/.test(d)).sort().map(d=>path.join(dir,d,'initial.json')).filter(fs.existsSync):[];
}
function verifiedInitial(file) {
  const value=read(file);
  if(!A.verifyIntegrity(value)||value.schema!=='courthesis-morning-initial-v1'||value.phase!=='initial'||value.locked_at_utc||
     A.melbourneDate(value.published_at_utc)!==value.scope?.melbourne_date||!morningDue(Date.parse(value.published_at_utc))||
     !(Date.parse(value.published_at_utc)<Date.parse(value.scope?.first_tip_utc))||
     !value.forecasts?.length||new Set(value.forecasts.map(g=>String(g.game_id))).size!==value.forecasts.length||
     value.forecasts.some(g=>!/^\d+$/.test(String(g.game_id))||!(Date.parse(value.published_at_utc)<Date.parse(g.tip_utc))))throw Error(`Invalid morning snapshot: ${file}`);
  return value;
}
function verifiedReviews(file,snapshot) {
  const dir=path.join(path.dirname(file),'games');
  const files=fs.existsSync(dir)?fs.readdirSync(dir).filter(f=>f.endsWith('.review.json')).sort().map(f=>path.join(dir,f)):[];
  return files.map(f=>{
    const review=read(f), forecast=snapshot.forecasts.find(g=>String(g.game_id)===review.game_id);
    if(!A.verifyIntegrity(review)||review.schema!=='courthesis-morning-game-review-v1'||review.source_sha256!==A.sha256(fs.readFileSync(file))||!forecast||review.games?.length!==1)throw Error(`Invalid morning review: ${f}`);
    // Recompute all grades from the preserved normalized verified result.
    if(A.sha256(review.provider_response)!==review.provider?.response_sha256)throw Error('Morning provider hash mismatch');
    const actual=A.parseEspnSummary(review.provider_response,review.game_id);
    if(A.stableStringify(actual)!==A.stableStringify(review.actual))throw Error('Morning normalized result mismatch');
    const scored=A.scoreReview(A.withIntegrity({...snapshot,forecasts:[forecast]}),{[review.game_id]:actual},Date.parse(review.reviewed_at_utc));
    if(A.stableStringify(scored.games)!==A.stableStringify(review.games))throw Error(`Morning grade mismatch: ${f}`);
    return review;
  });
}
async function reviewMorning(file,now,{fetcher=fetch,dryRun=false}={}) {
  const snapshot=verifiedInitial(file),existing=verifiedReviews(file,snapshot),ids=new Set(existing.map(r=>r.game_id)),pending=[];
  for(const forecast of snapshot.forecasts) {
    const id=String(forecast.game_id); if(ids.has(id)||now<=Date.parse(forecast.tip_utc))continue;
    try {
      const url=`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=${encodeURIComponent(id)}`;
      const response=await fetcher(url,{signal:AbortSignal.timeout(20000)});
      if(!response.ok)throw Error(`HTTP ${response.status}`);
      const raw=await response.json(),actual=A.parseEspnSummary(raw,id);
      const scored=A.scoreReview(A.withIntegrity({...snapshot,forecasts:[forecast]}),{[id]:actual},now);
      const artifact=A.withIntegrity({schema:'courthesis-morning-game-review-v1',phase:'initial',game_id:id,
        source_sha256:A.sha256(fs.readFileSync(file)),reviewed_at_utc:new Date(now).toISOString(),
        provider:{name:'ESPN public NBA summary (unofficial)',url,response_sha256:A.sha256(raw)},provider_response:raw,actual,games:scored.games});
      if(!dryRun)exclusive(path.join(path.dirname(file),'games',`${id}.review.json`),artifact);
    } catch(error) {pending.push({game_id:id,reason:error.message});}
  }
  return pending;
}
function verify(root=ROOT) {
  for(const file of initialFiles(root)) {const snapshot=verifiedInitial(file);verifiedReviews(file,snapshot);}
}
async function run({now,build,dryRun=false,root=ROOT,lockedRecords=[],fetcher,clock=()=>now}={}) {
  let publication={status:morningDue(now)?'unavailable':'not_due'};
  if(!dryRun)try {publication=publishMorning({root,now:clock(),build,clock});}catch(error){publication.reason=error.message;}
  const days=[];
  for(const file of initialFiles(root)) {
    const snapshot=verifiedInitial(file),pending=await reviewMorning(file,clock(),{fetcher,dryRun});
    const games=verifiedReviews(file,snapshot).flatMap(r=>r.games),report=critique(snapshot,games,'initial');
    if(!dryRun)derived(path.join(path.dirname(file),'critique.json'),report);
    days.push({date:snapshot.scope.melbourne_date,published_at_utc:snapshot.published_at_utc,
      snapshot_path:relative(root,file),report_path:relative(root,path.join(path.dirname(file),'critique.json')),report,pending,
      forecasts:snapshot.forecasts.map(g=>({game_id:g.game_id,tip_utc:g.tip_utc,home:g.home.abbr,away:g.away.abbr,home_win_probability:g.primary_forecast.home_win_probability,
        result:(()=>{const row=games.find(row=>String(row.game_id)===String(g.game_id));return row?{home:row.home.score,away:row.away.score,status:'verified_final'}:null;})()}))});
  }
  const locked=[];
  for(const record of lockedRecords) {
    const snapshot=read(path.join(root,record.entry.lock_path));
    if(!A.verifyIntegrity(snapshot)||(record.review&&!A.verifyIntegrity(record.review)))throw Error('Locked report source integrity failed');
    const report=critique(snapshot,record.review?.games||[],'locked');
    const destination=path.join(root,'audit','critiques',snapshot.scope.melbourne_date,'locked.json');
    if(!dryRun)derived(destination,report);
    locked.push({date:snapshot.scope.melbourne_date,report_path:relative(root,destination),report});
  }
  const checkedAt=clock();
  if(!dryRun)derived(path.join(root,'data','daily-cycle.json'),{schema:'courthesis-daily-cycle-v1',timezone:'Australia/Melbourne',
    checked_at_utc:new Date(checkedAt).toISOString(),date:A.melbourneDate(checkedAt),publication,days,locked});
  return {publication,days,locked};
}
module.exports={morningDue,toInitial,publishMorning,critique,reviewMorning,verifiedReviews,verify,run};
