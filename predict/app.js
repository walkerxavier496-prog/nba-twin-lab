/* NBA Twin Lab V5 prediction dashboard — no invented NBA data. */
(()=>{
'use strict';
const E=window.TwinPredict,$=id=>document.getElementById(id);
const imgTeam=team=>window.NbaMedia?.image?.(team.abbr,{size:'small',label:team.abbr})||'';
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=x=>new Intl.DateTimeFormat(undefined,{weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}).format(new Date(x));
const pct=x=>Math.round(100*x)+'%';
const one=x=>Number.isFinite(x)?x.toFixed(1):'—';
const round=x=>Number.isFinite(x)?Math.round(x):'—';
const today=new Date();
const seasonYear=today.getUTCFullYear()+(today.getUTCMonth()>=6?1:0);
let games=[],selected=null,source='',loadedAt=null,hasHistory=false,context=null,profiles={},modelReport=null,scienceSnapshot=null,scienceReport=null,rosterPriors=null,rosterReport=null;
let liveScoreFeed=null;
let officialAvailability=null;
const liveSource=window.NbaScores||null;
const scoreFor=id=>liveScoreFeed?.games?.find(g=>String(g.id)===String(id))||null;
const verifiedScore=s=>s&&['live','final'].includes(s.phase)&&Number.isFinite(s.home.score)&&Number.isFinite(s.away.score);
const scoreState=s=>s?.phase==='live'?liveSource?.label?.(s)||'LIVE':s?.phase==='final'?'FINAL':'SCHEDULED';
const simulationCache=new Map();
const alias={GS:'GSW',NY:'NYK',SA:'SAS',NO:'NOP',UTAH:'UTA',WSH:'WAS',PHX:'PHO',BKN:'BRK',CHA:'CHO'};
async function loadContext(){try{const r=await fetch('../data/context.json',{cache:'no-store'});if(!r.ok)return;const d=await r.json();if(d.schema!==1||!Array.isArray(d.teams))return;context=d;const prior=d.teams.filter(t=>t.season===seasonYear-1);for(const t of prior)profiles[t.abbr]=t;for(const [from,to] of Object.entries(alias))if(profiles[to])profiles[from]=profiles[to];}catch(e){console.warn('Team advanced context unavailable:',e)}}
async function loadReport(){try{const r=await fetch('../data/model-report.json',{cache:'no-store'});if(!r.ok)return;const d=await r.json();if(d.schema===1&&d.strict_no_future_data)modelReport=d;}catch(e){console.warn('Model scorecard unavailable:',e)}}
async function loadSciencePreview(){
 try{
  const [s,r]=await Promise.all([
   fetch('../data/v7-current.json',{cache:'no-store'}),
   fetch('../data/game-science-report.json',{cache:'no-store'})]);
  if(!s.ok)return;
  const snapshot=await s.json();
  if(snapshot.strict_no_future_data&&snapshot.teams?.length===30)scienceSnapshot=snapshot;
  if(r.ok){
   const report=await r.json();
   if(report.strict_no_future_data&&report.status==='research_only_not_promoted')scienceReport=report;
  }
 }catch(e){console.warn('Experimental science preview unavailable:',e)}
}
async function loadRosterResearch(){
 try{
  const [p,r]=await Promise.all([
   fetch('../data/roster-priors.json',{cache:'no-store'}),
   fetch('../data/roster-research-report.json',{cache:'no-store'})]);
  if(!p.ok||!r.ok)return;
  const priors=await p.json(),report=await r.json();
  if(priors.strict_no_future_data&&report.strict_no_future_data&&report.status==='research_only_not_promoted'&&
     report.sample?.rolling===4920&&Object.keys(priors.teams||{}).length===30){
    rosterPriors=priors;rosterReport=report;
  }
 }catch(e){console.warn('Roster research unavailable:',e)}
}
async function loadOfficialAvailability(){
 try{
  const response=await fetch('../data/availability-current.json',{cache:'no-store'});
  if(!response.ok)return;
  const data=await response.json();
  if(data?.schema==='nba-twin-lab-availability-v18'&&data.strict_no_future_data===true)officialAvailability=data;
 }catch(error){console.warn('Official lineup status unavailable; historical model only:',error)}
}
function rosterIntegrityPanel(audit){
 if(!audit)return '<div class="context"><p>V18 roster audit unavailable. Treat probabilities as historical team estimates.</p></div>';
 const pretty={official_availability_missing:'No connected official injury feed',invalid_injury_cutoff:'No verified pre-tip injury timestamp',
  game_injury_report_unverified:'No verified injury report for this game',official_roster_unverified:'Current active roster not independently verified',
  stale_team_snapshot:'Team rotation snapshot is stale',invalid_snapshot_cutoff:'Missing pre-tip team data',
  season_mismatch:'Team snapshot belongs to another season',team_missing_from_snapshot:'Team rotation missing',
  availability_scenario_required:'Questionable / doubtful / probable player requires scenarios',
  inferred_player_not_on_verified_roster:'Inferred player is absent from the verified roster',
  rotation_missing:'No trustworthy estimated rotation'};
 const describe=team=>{
  const heading='<h4>'+esc(team.team)+' · EXPECTED ROTATION (NOT CONFIRMED STARTERS)</h4>';
  const rows=team.players.slice(0,10).map(p=>{
   const label=p.name+(p.status==='NOT_LISTED'?'': ' · '+p.status);
   const minutes=p.excluded?'0m · EXCLUDED':p.expected_minutes===null?
    '0–'+round(p.max_minutes)+'m · uncertain':round(p.expected_minutes)+'m · '+(team.official_roster_verified?'estimated':'inferred');
   return metric(label,minutes);
  }).join('');
  return '<div>'+heading+(rows||'<p>No pregame rotation available</p>')+'</div>';
 };
 const issues=[...new Set(audit.issues)].map(code=>pretty[code]||code.replaceAll('_',' '));
 return '<div class="context v18-roster-integrity" role="note">'+
  '<h4>V18 · ROSTER & INJURY INTEGRITY AUDIT</h4>'+
  '<p><b>'+(audit.source_checks_passed?'SOURCE CHECKS PASSED · RESEARCH ONLY':'INPUTS NOT VERIFIED · HISTORICAL MODEL ONLY')+
  '</b>. These are expected rotations, never confirmed starters. The main probability above is historical Elo and is <b>not</b> recalculated using verified game-day availability.</p>'+
  '<p>Checks: '+esc(issues.length?issues.join(' · '):'Timestamped roster and injury inputs checked')+
  '. A roster-first probability model still requires independent historical and prospective validation.</p>'+
  '<div class="split">'+describe(audit.away)+describe(audit.home)+'</div>'+
  '<p class="disclaimer">OUT means 0 estimated minutes when an official matching injury designation is available; questionable players receive a range. When the official feed is unavailable all minutes are inferred and must not be treated as confirmed participation.</p></div>';
}
function rosterStrengthPanel(strength){
 if(!strength)return '';
 if(!strength.available)return '<div class="context"><h4>V18 · PLAYER-STRENGTH EXPERIMENT</h4><p>Unavailable: '+esc(strength.reason||'Unverified live roster')+'. No roster-first winner probability has been published.</p></div>';
 const range=strength.home_minus_away_impact_range;
 const home=strength.home,away=strength.away;
 return '<div class="context"><h4>V18 · CURRENT PLAYERS ONLY · RESEARCH</h4>'+
  '<p><b>Home minus away player-impact range: '+one(range[0])+' to '+one(range[1])+
  '</b> (not predicted points, scores or win probability). Player impact follows the current verified roster; absent players do not contribute.</p>'+
  '<p>'+esc(home.team)+' '+home.scenarios+'/'+home.possible_scenarios+' plausible availability cases · '+
  esc(away.team)+' '+away.scenarios+'/'+away.possible_scenarios+' cases · regulation minutes conserved at 240 per team.</p>'+
  '<p class="disclaimer">Impact proxies and replacement minutes are not historically calibrated to win probability. This experiment does not replace or modify Elo.</p></div>';
}
function rosterPreview(game,baseline){
 if(!window.TwinRoster||!scienceSnapshot||!rosterPriors||!rosterReport)return {available:false,reason:'Verified roster research data is not yet published'};
 return window.TwinRoster.modelForecast({
  game,baseline,snapshot:scienceSnapshot,priorRotations:rosterPriors,report:rosterReport});
}
function rosterPanel(game,baseline,roster){
 if(game.status!=='scheduled')return '';
 if(!roster.available)return '<div class="context"><p><b>Roster-aware forecast unavailable:</b> '+esc(roster.reason)+'. Legacy Elo can be overconfident after major trades. Do not interpret its probability as accounting for current rosters.</p></div>';
 const h=game.home.abbr,a=game.away.abbr;
 const rh=Math.round(roster.retentionHome*100),ra=Math.round(roster.retentionAway*100);
 const large=roster.rosterUncertainty>.2&&Math.max(baseline.homeWin,1-baseline.homeWin)>=.75;
 return '<div class="context"><h4>OFFSEASON ROSTER CHECK · EXPERIMENTAL</h4>'+
  '<p>Previous-season rotation minutes retained (inferred): <b>'+esc(h)+' '+rh+'%</b> · <b>'+esc(a)+' '+ra+'%</b>. Missing players can also reflect injuries, so these are not official transaction figures.</p>'+
  '<p>Roster-aware model: <b>'+esc(h)+' '+pct(roster.homeWin)+'</b> · <b>'+esc(a)+' '+pct(roster.awayWin)+'</b>. Legacy Elo: '+esc(h)+' '+pct(baseline.homeWin)+'.</p>'+
  (large?'<p><b>High uncertainty:</b> This is a heavily changed matchup. The old Elo number should not be treated as a reliable high-confidence forecast.</p>':'')+
  '<p>Historical rolling-origin sample: '+Number(rosterReport.sample.rolling).toLocaleString()+' games · roster Brier '+Number(rosterReport.models.roster.rolling.brier).toFixed(4)+' versus Elo '+Number(rosterReport.models.elo.rolling.brier).toFixed(4)+'. Current roster status is inferred, not confirmed; improvement over our previous player-adjusted model is not statistically conclusive.</p></div>';
}
function sciencePanel(game,baseline){
 if(game.status!=='scheduled')return '';
 if(!scienceSnapshot||!scienceReport||!window.TwinSciencePreview)return '<div class="context"><p><b>Basketball-science preview:</b> Awaiting verified research data. Live Elo remains unchanged.</p></div>';
 const x=window.TwinSciencePreview.preview({game,baseline,snapshot:scienceSnapshot,report:scienceReport});
 if(!x.available)return '<div class="context"><p><b>Basketball-science preview unavailable:</b> '+esc(x.reason)+'. The Elo forecast above is unaffected.</p></div>';
 return '<h4 class="small">EXPERIMENTAL SCIENCE FORECAST · NOT THE LIVE DEFAULT</h4>'+
  '<div class="context"><p><b>'+esc(game.home.abbr)+' win chance:</b> '+pct(x.homeWin)+' using adjusted strength, recent efficiency momentum and rest. Elo baseline: '+pct(baseline.homeWin)+'.</p>'+
  '<p>Pregame form indicator: '+one(x.features.momentum)+' · Rest indicator: '+one(x.features.restScience)+' · Adjusted-strength residual: '+one(x.features.team)+'. Model fitted on earlier seasons only. This is an experimental comparison, not a verified edge or guaranteed result.</p></div>';
}
function note(message,type=''){const n=$('notice');n.textContent=message;n.className='notice '+type}
function monthRanges(start,end){
 const out=[];let y=start.getUTCFullYear(),m=start.getUTCMonth();
 while(y<end.getUTCFullYear()||(y===end.getUTCFullYear()&&m<=end.getUTCMonth())){
   const first=new Date(Date.UTC(y,m,1)),last=new Date(Date.UTC(y,m+1,0));
   out.push([new Date(Math.max(first.getTime(),start.getTime())),new Date(Math.min(last.getTime(),end.getTime()))]);
   m++;if(m===12){m=0;y++}
 }return out;
}
const ymd=d=>d.toISOString().slice(0,10).replace(/-/g,'');
async function espnRange(start,end){
 const u=new URL('https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard');
 u.searchParams.set('dates',start.getUTCFullYear()+String(start.getUTCMonth()+1).padStart(2,'0')); // Month queries work; hyphenated ranges return HTTP 400.
 u.searchParams.set('seasontype','2');u.searchParams.set('limit','500');
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),16000);
 try{const r=await fetch(u,{signal:controller.signal,cache:'no-store'});if(!r.ok)throw Error('ESPN HTTP '+r.status);
   return E.normalise(await r.json());}finally{clearTimeout(timer)}
}
async function load(){
 let staticGames=[],staticDate=null;
 try{
   const res=await fetch('../data/games.json',{cache:'no-store'});
   if(res.ok){
     const data=await res.json();
     if(data.schema===1&&Array.isArray(data.games)&&data.games.length>=800){
       staticGames=data.games;staticDate=data.built_at_utc;source='Verified GitHub snapshot';
     }
   }
 }catch(err){console.warn('Static game snapshot unavailable:',err)}
 if(staticGames.length){
   games=E.merge(staticGames);loadedAt=staticDate;
   note('Verified historical results loaded. Checking ESPN for the latest completed games and upcoming schedule…');
   render();
   try{
     const start=new Date(today.getTime()-3*86400000),end=new Date(today.getTime()+16*86400000);
     const fresh=(await Promise.all(monthRanges(start,end).map(([a,b])=>espnRange(a,b)))).flat();
     if(fresh.length){games=E.merge(games,fresh);source='GitHub snapshot + ESPN browser refresh';loadedAt=new Date().toISOString()}
     else note('Historical snapshot loaded; live ESPN returned no games for the selected dates. Predictions may be stale.');
   }catch(err){note('Using the last validated GitHub snapshot. Live scoreboard refresh unavailable ('+err.message+'). Predictions may be stale.')}
   render();return;
 }
 note('No published schedule snapshot yet. Fetching ESPN scoreboard directly from your browser. This can take a moment.');
 const prev=seasonYear-1;
 const from=new Date(Date.UTC(prev-1,9,1)),to=new Date(Date.UTC(prev,3,30));
 const currFrom=new Date(Date.UTC(seasonYear-1,9,1)),currTo=new Date(today.getTime()+16*86400000);
 const ranges=[...monthRanges(from,to),...monthRanges(currFrom>today?currFrom:currFrom,currTo)];
 const all=[];
 try{
   for(let i=0;i<ranges.length;i++){
     const [a,b]=ranges[i];all.push(...await espnRange(a,b));
     note('Loading verified NBA scores and schedule… '+(i+1)+'/'+ranges.length+' date ranges.');
   }
   games=E.merge(all);source='ESPN browser scoreboard';loadedAt=new Date().toISOString();
   render();
 }catch(err){
   note('Unable to load a verified NBA scoreboard: '+err.message+'. Predictions are disabled until data access is restored.','bad');
   $('signal').textContent='SOURCE UNAVAILABLE';$('games').innerHTML='<div class="empty">NBA schedule unavailable. Try again later or check the data workflow on GitHub.</div>';
 }
}
function render(){
 const prevFinals=games.filter(g=>g.season===seasonYear-1&&g.status==='final').length;
 hasHistory=prevFinals>=800;
 const currentFinals=games.filter(g=>g.season===seasonYear&&g.status==='final').length;
 $('hero-count').textContent=games.length.toLocaleString();
 $('signal').textContent=hasHistory?'VERIFIED':'LIMITED';
 $('signal').style.color=hasHistory?'var(--teal)':'var(--red)';
 $('freshness').textContent=loadedAt?new Date(loadedAt).toLocaleString():'Unknown';
 $('games-played').textContent=currentFinals.toLocaleString();
 if(hasHistory)note('Using '+source+'. Historical baseline: '+prevFinals+' completed games from '+(seasonYear-2)+'–'+String(seasonYear-1).slice(2)+'. Forecasts exclude injuries and confirmed lineups.','good');
 else note('Only '+prevFinals+' previous-season finals available; require at least 800 before issuing probabilities. No forecasts will be fabricated.','bad');
 renderScorecard();
 renderGames();renderTeams();
}
function renderScorecard(){
 const mc=modelReport?.monte_carlo,elo=modelReport?.elo,count=modelReport?.held_out_games||0;
 $('accuracy').textContent=count?pct(mc.accuracy):'—';
 $('brier').textContent=count?mc.brier.toFixed(3):'—';
 $('elo-brier').textContent=count?elo.brier.toFixed(3):'—';
 $('ece').textContent=count?mc.ece.toFixed(3):'—';
 $('mae').textContent=count?one(mc.scoreMAE):'—';
 $('accuracy-sub').textContent=count?count+' pre-tipoff games':'Scorecard unavailable';
 $('validation-sample').textContent=count?count+' games · '+Number(modelReport.simulations_per_game).toLocaleString()+' sims/game':'Scorecard unavailable';
 for(const [id,val] of Object.entries({'mc-accuracy':count?pct(mc.accuracy):'—','mc-brier':count?mc.brier.toFixed(4):'—','mc-ece':count?mc.ece.toFixed(4):'—','mc-mae':count?one(mc.scoreMAE)+' pts':'—','elo-accuracy':count?pct(elo.accuracy):'—','elo-brier-table':count?elo.brier.toFixed(4):'—','elo-ece':count?elo.ece.toFixed(4):'—','elo-mae':count?one(elo.scoreMAE)+' pts':'—'}))$(id).textContent=val;
 if(count){const stamp=new Date(modelReport.generated_at_utc).toLocaleString();$('validation-note').textContent='Strict walk-forward holdout generated '+stamp+'. Every forecast uses only earlier finals and previous-season advanced profiles. Brier and expected calibration error are lower-is-better. The sample is too small to claim a durable edge.'}
}
function available(){
 const range=$('range').value,term=$('team-search').value.trim().toLowerCase(),now=Date.now();
 let list=games.filter(g=>{
   if(range==='final')return g.status==='final'&&new Date(g.date).getTime()>now-14*86400000;
   const dt=new Date(g.date).getTime();
   return g.status!=='final'&&dt>=now-6*3600000&&(range==='all'||dt<now+Number(range)*86400000);
 });
 if(term)list=list.filter(g=>[g.home.name,g.away.name,g.home.abbr,g.away.abbr].some(x=>String(x).toLowerCase().includes(term)));
 return range==='final'?list.reverse():list;
}
async function refreshLiveScores(){
 if(!liveSource?.fetchDate)return;
 try{
  const d=liveSource.melbourneDate?.(new Date())||liveSource.usDate?.(new Date());
  const source=liveSource.fetchMelbourneDate?await liveSource.fetchMelbourneDate(d):await liveSource.fetchDate(d);
  if(!Array.isArray(source.games)||!source.games.length)throw Error('No games returned');
  liveScoreFeed=source;
 }catch(err){liveScoreFeed=null;}
 renderGames();
}
function renderGames(){
 const list=available();
 $('games').innerHTML=list.length?list.map(g=>{
   const seen=scoreFor(g.id),live=verifiedScore(seen);
   const final=seen?.phase==='final'||(!seen&&g.status==='final');
   const score=live||(final&&Number.isFinite(g.awayScore)&&Number.isFinite(g.homeScore));
   const awayScore=live?seen.away.score:g.awayScore,homeScore=live?seen.home.score:g.homeScore;
   const gameState=live?scoreState(seen):final?'FINAL':g.status==='live'?'SCORE UNAVAILABLE':'PREGAME';
   return '<button type="button" class="game '+(g.id===selected?'active':'')+'" data-id="'+esc(g.id)+'" aria-label="'+esc(g.away.name)+' at '+esc(g.home.name)+'">'+
   '<div class="game-top"><span>'+esc(fmt(g.date))+'</span><span>'+esc(gameState)+'</span></div>'+
   '<div class="teams-line"><span class="predict-team">'+imgTeam(g.away)+'<strong>'+esc(g.away.abbr||g.away.name)+'</strong></span><span class="versus">AT</span><span class="predict-team">'+imgTeam(g.home)+'<strong>'+esc(g.home.abbr||g.home.name)+'</strong></span></div>'+
   '<div class="pills"><span class="pill">'+(score?esc(awayScore)+' – '+esc(homeScore):'Model forecast')+'</span><span class="pill gold">'+(live?'ESPN · refreshed':final?'Result':g.status==='live'?'Score unavailable':'Preview →')+'</span></div></button>';
 }).join(''):'<div class="empty">No games found for this range. Try “All scheduled” or a different team.</div>';
 if(!list.some(g=>g.id===selected))selected=list[0]?.id||null;
 $('games').querySelectorAll('button[data-id]').forEach(btn=>btn.onclick=()=>{selected=btn.dataset.id;renderGames();renderDetail()});
 renderDetail();
}
function metric(name,val){return '<div class="metricrow"><span>'+esc(name)+'</span><b>'+esc(val)+'</b></div>'}
function renderDetail(){
 const g=games.find(x=>x.id===selected);
 const observed=g?scoreFor(g.id):null;
 const verifiedObserved=verifiedScore(observed);
 const liveBanner=verifiedObserved?'<div class="real-score-banner"><b>ESPN '+esc(scoreState(observed))+'</b><strong>'+esc(g.away.abbr)+' '+observed.away.score+' – '+esc(g.home.abbr)+' '+observed.home.score+'</strong><small>Real scoreboard · completely separate from the probabilities below</small></div>':'';
 if(!g){$('detail').innerHTML='<div class="placeholder"><div class="placeholder-icon">◎</div><h3>No game selected</h3><p>Choose an upcoming NBA matchup.</p></div>';return}
 if(!hasHistory){$('detail').innerHTML='<div class="placeholder"><h3>Insufficient verified history</h3><p>The model requires at least 800 completed games from the previous season. No probabilities will be shown until this data is available.</p></div>';return}
 const state=E.ratings(games,new Date(Math.min(Date.now(),Date.parse(g.date))).toISOString()),simulations=Number($('simulations').value),mode=$('model-choice').value,cacheKey=g.id+'|'+g.date+'|'+simulations+'|'+mode+'|'+JSON.stringify(games)+'|'+(window.dataRevision||'');
 if(!simulationCache.has(cacheKey))simulationCache.set(cacheKey,E.monteCarlo(g,state,profiles,{simulations}));
 const simulation=simulationCache.get(cacheKey),base=simulation.baseline;
 const roster=rosterPreview(g,base);
 const integrity=window.TwinRosterIntegrity?.auditGame({
  game:g,snapshot:scienceSnapshot,availability:officialAvailability,now:Date.now()})||null;
 const strength=window.TwinRosterStrength?.matchup(integrity)||null;
 const p=mode==='roster'&&roster.available?
   {...simulation,homeWin:roster.homeWin,awayWin:roster.awayWin,homeScore:base.homeScore,awayScore:base.awayScore,total:base.total,margin:base.margin}:
   mode==='mc'?simulation:{...simulation,homeWin:base.homeWin,awayWin:base.awayWin,homeScore:base.homeScore,awayScore:base.awayScore,total:base.total,margin:base.margin};
 const h=base.home,a=base.away;
 const h2h=E.matchupHistory(games,g);
 const hp=profiles[g.home.abbr]||Object.values(profiles).find(t=>t.name===g.home.name),ap=profiles[g.away.abbr]||Object.values(profiles).find(t=>t.name===g.away.name);
 const style=t=>t?metric('Net rating',one(t.n_rtg))+metric('Offensive rating',one(t.o_rtg))+metric('Defensive rating',one(t.d_rtg))+metric('Pace',one(t.pace))+metric('3-point attempt rate',Number.isFinite(t.x3p_ar)?one(100*t.x3p_ar)+'%':'—')+metric('Effective FG%',Number.isFinite(t.e_fg_percent)?one(100*t.e_fg_percent)+'%':'—')+metric('Turnover rate',Number.isFinite(t.tov_percent)?one(t.tov_percent)+'%':'—')+metric('Offensive rebounding',Number.isFinite(t.orb_percent)?one(t.orb_percent)+'%':'—'):'Prior-year team stats unavailable';
 const hWin=p.homeWin>=.5;
 const versusPanel='<div class="v19-versus-panel" aria-label="'+esc(g.away.name)+' versus '+esc(g.home.name)+'">'+
  '<div class="v19-versus-team">'+imgTeam(g.away)+'<span><b>'+esc(g.away.name)+'</b><small>AWAY · '+a.wins+'–'+a.losses+'</small></span></div>'+
  '<div class="v19-versus-middle"><span>VS</span><small>'+esc(fmt(g.date))+'</small></div>'+
  '<div class="v19-versus-team v19-versus-home">'+imgTeam(g.home)+'<span><b>'+esc(g.home.name)+'</b><small>HOME · '+h.wins+'–'+h.losses+'</small></span></div>'+
  '</div>';
 const modelComparisons=[
  {name:'Elo · Production',p:base.homeWin,desc:'Historical rating baseline',kind:'elo'},
  {name:'Roster · Research',p:roster.available?roster.homeWin:null,desc:'Inferred rotation; not verified lineup',kind:'roster'},
  {name:'Monte Carlo · Diagnostic',p:simulation.homeWin,desc:'Seeded possession simulations',kind:'mc'}
 ];
 const modelCards='<section class="v19-model-comparison" aria-label="Model probability comparison">'+
  '<div class="v19-model-heading"><h4>MODEL BREAKDOWN</h4><a href="../challenge/daily.html?game='+encodeURIComponent(String(g.id))+'#matchups">VIEW LOCKED SIX-MODEL AUDIT ↗</a></div>'+
  '<div class="v19-model-cards">'+modelComparisons.map(m=>'<article class="v19-model-card'+(mode===m.kind?' selected':'')+'">'+
   '<small>'+esc(m.name)+'</small>'+
   (m.p===null?'<strong>Unavailable</strong><p>'+esc(m.desc)+'</p>':
    '<strong>'+pct(m.p)+'</strong><div class="v19-model-meter" role="img" aria-label="'+esc(g.home.abbr)+' win probability '+pct(m.p)+'"><i style="width:'+Math.max(0,Math.min(100,m.p*100))+'%"></i></div><p>'+esc(g.home.abbr)+' win chance · '+esc(m.desc)+'</p>')+
   '</article>').join('')+'</div><p class="v19-model-note">The roster beta uses inferred player participation; V18 game-day official roster verification is displayed separately below. Model probabilities are not votes and should not be averaged without validation.</p></section>';
 const modelName=mode==='elo'?'ELO · HISTORICAL BASELINE':mode==='roster'?(roster.available?'ROSTER-AWARE · BETA':'ROSTER DATA UNAVAILABLE · ELO FALLBACK'):'V5 POSSESSION MONTE CARLO';
 const tag=(g.status==='final'?'RESEARCH ESTIMATE · NOT ARCHIVED':g.status==='live'?'PREGAME · LIVE GAME':'PREGAME')+' · '+modelName;
 const combinedGames=h.games+a.games;
 const oddsGap=Math.abs(simulation.homeWin-base.homeWin);
 const baselineHigh=Math.max(base.homeWin,base.awayWin)>=.7;
 const caution=(combinedGames<20&&baselineHigh)||oddsGap>=.15?
  '<div class="uncertainty-banner" role="note"><b>MODEL UNCERTAINTY: DO NOT CONFUSE ELO CONFIDENCE WITH A VERIFIED CURRENT-ROSTER FORECAST</b>'+
  '<p>'+esc(h.abbr)+' and '+esc(a.abbr)+' have only '+combinedGames+' combined team-games of current-season evidence before this matchup. Historical Elo is strongly informed by the prior season. '+
  'Elo and possession simulation differ by '+(oddsGap*100).toFixed(1)+' probability points; their inputs and assumptions are different. Verified injuries and confirmed starters are not included. '+
  '<a href="../challenge/daily.html?game='+encodeURIComponent(String(g.id))+'#matchups">See the frozen six-model challenge when available ↗</a></p></div>':'';

 const integrityFlag=g.status==='scheduled'&&!integrity?.source_checks_passed?
  '<div class="uncertainty-banner" role="note"><b>HISTORICAL TEAM PROBABILITY · GAME-DAY ROSTER NOT VERIFIED</b><p>This estimate still carries old team ratings. No verified roster-first model is active. Do not interpret the percentage as incorporating confirmed game-day injuries or starting lineups.</p></div>':'';
 $('detail').innerHTML=
 '<div class="headrow"><span class="eyebrow">'+esc(fmt(g.date))+'</span><span class="badge">'+tag+'</span></div>'+liveBanner+
 versusPanel+
 caution+integrityFlag+
 '<div class="odds"><div><div class="name">'+esc(g.away.abbr)+' · Away</div><div class="pct">'+pct(p.awayWin)+'</div></div>'+
 '<div><div class="name">'+esc(g.home.abbr)+' · Home</div><div class="pct">'+pct(p.homeWin)+'</div></div></div>'+
 '<div class="bar" role="img" aria-label="'+esc(g.away.abbr)+' '+pct(p.awayWin)+', '+esc(g.home.abbr)+' '+pct(p.homeWin)+'"><span style="width:'+100*p.awayWin+'%"></span></div>'+
 modelCards+
 '<div class="forecast"><div><strong>'+round(p.awayScore)+' – '+round(p.homeScore)+'</strong><small>'+(mode==='mc'?'Simulated mean':'Elo projected')+' score · Away–Home</small></div><div><strong>'+round(simulation.awayRange[0])+'–'+round(simulation.awayRange[1])+' / '+round(simulation.homeRange[0])+'–'+round(simulation.homeRange[1])+'</strong><small>Monte Carlo 80% ranges · A / H</small></div><div><strong>'+one(simulation.possessions)+'</strong><small>Simulated possessions/team</small></div><div><strong>'+simulations.toLocaleString()+'</strong><small>Diagnostic simulations</small></div></div>'+
 '<div class="split"><div><h4>'+esc(g.away.abbr)+' · Away</h4>'+
 metric('Elo',round(a.elo))+metric('Record',a.wins+'–'+a.losses)+metric('Points/game',a.games?one(a.points/a.games):'No games')+
 metric('Allowed/game',a.games?one(a.allowed/a.games):'No games')+metric('Last 5',a.recent.slice(-5).map(x=>x.win?'W':'L').join(' ')||'—')+
 metric('Rest before tip',base.awayRest===null?'Unknown':base.awayRest+' days')+metric('Turnover chance',one(100*p.awayProfile.turnover)+'%')+metric('3-point attempt rate',one(100*p.awayProfile.threeRate)+'%')+'</div>'+
 '<div><h4>'+esc(g.home.abbr)+' · Home</h4>'+
 metric('Elo',round(h.elo))+metric('Record',h.wins+'–'+h.losses)+metric('Points/game',h.games?one(h.points/h.games):'No games')+
 metric('Allowed/game',h.games?one(h.allowed/h.games):'No games')+metric('Last 5',h.recent.slice(-5).map(x=>x.win?'W':'L').join(' ')||'—')+
 metric('Rest before tip',base.homeRest===null?'Unknown':base.homeRest+' days')+metric('Turnover chance',one(100*p.homeProfile.turnover)+'%')+metric('3-point attempt rate',one(100*p.homeProfile.threeRate)+'%')+'</div></div>'+
 '<h4 class="small">PRIOR-SEASON TEAM STYLE · '+(seasonYear-2)+'–'+String(seasonYear-1).slice(2)+'</h4><div class="split"><div><h4>'+esc(g.away.abbr)+'</h4>'+style(ap)+'</div><div><h4>'+esc(g.home.abbr)+'</h4>'+style(hp)+'</div></div><p class="disclaimer">Verified team advanced statistics are previous-season context, not live current-season ratings. They do not adjust for offseason roster changes.</p>'+ 
 '<h4 class="small">MATCHUP EXPLANATION</h4><div class="context">'+
 '<p><b>'+esc(hWin?g.home.name:g.away.name)+'</b> has a '+pct(hWin?p.homeWin:p.awayWin)+' '+(mode==='elo'?'Elo win estimate. Elo is the default because it beat standalone V5 Monte Carlo on the untouched five-season audit.':'win rate across '+simulations.toLocaleString()+' seeded possession simulations.')+' The matchup expectation is '+one(Math.abs(base.eloEdge))+' rating points; Monte Carlo separately plays turnovers, free throws, 2s, 3s, misses and offensive rebounds using validated historical team rates.</p>'+
 '<p>Last '+h2h.length+' head-to-head meeting'+(h2h.length===1?'':'s')+': '+(h2h.length?h2h.map(x=>esc(x.away.abbr)+' '+x.awayScore+'–'+x.homeScore+' '+esc(x.home.abbr)).join(' · '):'No verified recent meetings')+'. Head-to-head history is context only, not a separate predictive weight.</p></div>'+
 rosterPanel(g,base,roster)+
 rosterIntegrityPanel(integrity)+
 rosterStrengthPanel(strength)+
 sciencePanel(g,base)+
 (g.status==='final'?'<p class="context"><b>Actual final:</b> '+esc(g.away.abbr)+' '+g.awayScore+' – '+g.homeScore+' '+esc(g.home.abbr)+'. The probabilities above are reconstructed research estimates using pre-tip information, not archived pregame forecasts, and are not used for official grading.</p>':'')+
 '<p class="disclaimer">'+esc(base.confidence)+'. Selected model: '+modelName+'. Seeded Monte Carlo diagnostics reproduce with identical inputs. Legacy Elo has no trade, injury, confirmed-lineup, travel or betting-market input. The roster experiment uses inferred rotation changes, not verified player availability; prior-season style can miss offseason changes; a probability is never a guarantee. This is not betting advice.</p>';
}
function renderTeams(){
 const state=E.ratings(games,new Date(Date.now()+1000).toISOString());
 const rows=E.teamTable(state);
 $('power-season').textContent=state.season?(state.season-1)+'–'+String(state.season).slice(2):'No completed season';
 $('teams').innerHTML=rows.length?rows.map(t=>'<tr><td>#'+t.rank+'</td><td><b>'+esc(t.name)+'</b> <span class="muted">('+esc(t.abbr)+')</span></td>'+
 '<td>'+t.wins+'–'+t.losses+'</td><td>'+round(t.elo)+'</td><td>'+one(t.ppg)+'</td><td>'+one(t.oppg)+'</td><td>'+esc(t.form||'—')+'</td></tr>').join(''):'<tr><td colspan="7">No verified completed games.</td></tr>';
}
$('range').addEventListener('change',renderGames);
$('team-search').addEventListener('input',renderGames);
$('simulations').addEventListener('change',()=>{simulationCache.clear();renderDetail()});
$('model-choice').addEventListener('change',renderDetail);
Promise.all([loadContext(),loadReport(),loadSciencePreview(),loadRosterResearch(),loadOfficialAvailability()]).then(async()=>{await load();await refreshLiveScores();if(typeof setInterval==='function')setInterval(refreshLiveScores,60000)});
})();
