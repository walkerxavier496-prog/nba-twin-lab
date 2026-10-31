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
function renderGames(){
 const list=available();
 $('games').innerHTML=list.length?list.map(g=>{
   const final=g.status==='final',score=final||g.status==='live';
   return '<button type="button" class="game '+(g.id===selected?'active':'')+'" data-id="'+esc(g.id)+'" aria-label="'+esc(g.away.name)+' at '+esc(g.home.name)+'">'+
   '<div class="game-top"><span>'+esc(fmt(g.date))+'</span><span>'+(final?'FINAL':g.status==='live'?'LIVE':'PREGAME')+'</span></div>'+
   '<div class="teams-line"><span class="predict-team">'+imgTeam(g.away)+'<strong>'+esc(g.away.abbr||g.away.name)+'</strong></span><span class="versus">AT</span><span class="predict-team">'+imgTeam(g.home)+'<strong>'+esc(g.home.abbr||g.home.name)+'</strong></span></div>'+
   '<div class="pills"><span class="pill">'+(score?esc(g.awayScore)+' – '+esc(g.homeScore):'Model forecast')+'</span><span class="pill gold">'+(final?'Result':g.status==='live'?'In progress':'Preview →')+'</span></div></button>';
 }).join(''):'<div class="empty">No games found for this range. Try “All scheduled” or a different team.</div>';
 if(!list.some(g=>g.id===selected))selected=list[0]?.id||null;
 $('games').querySelectorAll('button[data-id]').forEach(btn=>btn.onclick=()=>{selected=btn.dataset.id;renderGames();renderDetail()});
 renderDetail();
}
function metric(name,val){return '<div class="metricrow"><span>'+esc(name)+'</span><b>'+esc(val)+'</b></div>'}
function renderDetail(){
 const g=games.find(x=>x.id===selected);
 if(!g){$('detail').innerHTML='<div class="placeholder"><div class="placeholder-icon">◎</div><h3>No game selected</h3><p>Choose an upcoming NBA matchup.</p></div>';return}
 if(!hasHistory){$('detail').innerHTML='<div class="placeholder"><h3>Insufficient verified history</h3><p>The model requires at least 800 completed games from the previous season. No probabilities will be shown until this data is available.</p></div>';return}
 const state=E.ratings(games,g.date),simulations=Number($('simulations').value),mode=$('model-choice').value,cacheKey=g.id+'|'+g.date+'|'+simulations;
 if(!simulationCache.has(cacheKey))simulationCache.set(cacheKey,E.monteCarlo(g,state,profiles,{simulations}));
 const simulation=simulationCache.get(cacheKey),base=simulation.baseline;
 const roster=rosterPreview(g,base);
 const p=mode==='roster'&&roster.available?
   {...simulation,homeWin:roster.homeWin,awayWin:roster.awayWin,homeScore:base.homeScore,awayScore:base.awayScore,total:base.total,margin:base.margin}:
   mode==='mc'?simulation:{...simulation,homeWin:base.homeWin,awayWin:base.awayWin,homeScore:base.homeScore,awayScore:base.awayScore,total:base.total,margin:base.margin};
 const h=base.home,a=base.away;
 const h2h=E.matchupHistory(games,g);
 const hp=profiles[g.home.abbr]||Object.values(profiles).find(t=>t.name===g.home.name),ap=profiles[g.away.abbr]||Object.values(profiles).find(t=>t.name===g.away.name);
 const style=t=>t?metric('Net rating',one(t.n_rtg))+metric('Offensive rating',one(t.o_rtg))+metric('Defensive rating',one(t.d_rtg))+metric('Pace',one(t.pace))+metric('3-point attempt rate',Number.isFinite(t.x3p_ar)?one(100*t.x3p_ar)+'%':'—')+metric('Effective FG%',Number.isFinite(t.e_fg_percent)?one(100*t.e_fg_percent)+'%':'—')+metric('Turnover rate',Number.isFinite(t.tov_percent)?one(t.tov_percent)+'%':'—')+metric('Offensive rebounding',Number.isFinite(t.orb_percent)?one(t.orb_percent)+'%':'—'):'Prior-year team stats unavailable';
 const hWin=p.homeWin>=.5;
 const modelName=mode==='elo'?'ELO · HISTORICAL BASELINE':mode==='roster'?(roster.available?'ROSTER-AWARE · BETA':'ROSTER DATA UNAVAILABLE · ELO FALLBACK'):'V5 POSSESSION MONTE CARLO';
 const tag=(g.status==='final'?'ARCHIVED PREGAME':g.status==='live'?'PREGAME · LIVE GAME':'PREGAME')+' · '+modelName;
 const combinedGames=h.games+a.games;
 const oddsGap=Math.abs(simulation.homeWin-base.homeWin);
 const baselineHigh=Math.max(base.homeWin,base.awayWin)>=.7;
 const caution=(combinedGames<20&&baselineHigh)||oddsGap>=.15?
  '<div class="uncertainty-banner" role="note"><b>MODEL UNCERTAINTY: DO NOT CONFUSE ELO CONFIDENCE WITH A VERIFIED CURRENT-ROSTER FORECAST</b>'+
  '<p>'+esc(h.abbr)+' and '+esc(a.abbr)+' have only '+combinedGames+' combined team-games of current-season evidence before this matchup. Historical Elo is strongly informed by the prior season. '+
  'Elo and possession simulation differ by '+(oddsGap*100).toFixed(1)+' probability points; their inputs and assumptions are different. Verified injuries and confirmed starters are not included. '+
  '<a href="../challenge/daily.html?game='+encodeURIComponent(String(g.id))+'#matchups">See the frozen six-model challenge when available ↗</a></p></div>':'';

 $('detail').innerHTML=
 '<div class="headrow"><span class="eyebrow">'+esc(fmt(g.date))+'</span><span class="badge">'+tag+'</span></div>'+
 '<h3>'+esc(g.away.name)+' <span class="muted">at</span> '+esc(g.home.name)+'</h3>'+
 caution+
 '<div class="odds"><div><div class="name">'+esc(g.away.abbr)+' · Away</div><div class="pct">'+pct(p.awayWin)+'</div></div>'+
 '<div><div class="name">'+esc(g.home.abbr)+' · Home</div><div class="pct">'+pct(p.homeWin)+'</div></div></div>'+
 '<div class="bar" role="img" aria-label="'+esc(g.away.abbr)+' '+pct(p.awayWin)+', '+esc(g.home.abbr)+' '+pct(p.homeWin)+'"><span style="width:'+100*p.awayWin+'%"></span></div>'+
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
 sciencePanel(g,base)+
 (g.status==='final'?'<p class="context"><b>Actual final:</b> '+esc(g.away.abbr)+' '+g.awayScore+' – '+g.homeScore+' '+esc(g.home.abbr)+'. This forecast was recomputed using only games before tip-off.</p>':'')+
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
Promise.all([loadContext(),loadReport(),loadSciencePreview(),loadRosterResearch()]).then(load);
})();
