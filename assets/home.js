/* Home page: latest immutable forecasts + independently refreshed ESPN scoreboard.
 * A displayed live/final score MUST come from a fresh direct scoreboard response.
 * Scores never influence or rewrite pregame predictions.
 */
(()=>{'use strict';
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pct=v=>typeof v==='number'&&Number.isFinite(v)?(v*100).toFixed(1)+'%':'—';
const fmt=v=>{const d=new Date(v);return !Number.isFinite(d.getTime())?'Date unavailable':new Intl.DateTimeFormat('en-AU',{timeZone:'Australia/Melbourne',weekday:'short',day:'numeric',month:'short',hour:'numeric',minute:'2-digit'}).format(d)};
const media=typeof window!=='undefined'?window.NbaMedia:null;
const scores=typeof window!=='undefined'?window.NbaScores:null;
const show=(id,value)=>{if($(id))$(id).textContent=value};
const usableTime=(...options)=>options.find(v=>v&&Number.isFinite(Date.parse(v)))||null;
const isoMelbourneDate=value=>/^\d{8}$/.test(String(value||''))?
 String(value).slice(0,4)+'-'+String(value).slice(4,6)+'-'+String(value).slice(6,8):String(value||'');
const teamImage=(team,size='large')=>media?.image?.(team.abbr,{size,label:team.abbr})||
 '<span class="club-mark'+(size==='large'?' club-mark--large':'')+'" data-team="'+esc(team.abbr)+'">'+esc(team.abbr)+'</span>';
const club=(team,isHome=false)=>'<a class="sports-club'+(isHome?' sports-club--home':'')+
 '" href="./team/?team='+encodeURIComponent(String(team.abbr))+'" aria-label="View '+esc(team.name)+' team statistics and roster">'+teamImage(team)+
 '<span><b class="sports-club__name">'+esc(team.abbr)+'</b><small class="sports-club__city">'+esc(team.name)+'</small></span></a>';
async function json(url){const r=await fetch(url,{cache:'no-store'});if(!r.ok)throw Error('HTTP '+r.status);return await r.json()}
async function verifiedJson(url,expectedSha){
 const response=await fetch(url,{cache:'no-store'});
 if(!response.ok)throw Error('HTTP '+response.status);
 const text=await response.text(),subtle=globalThis.crypto?.subtle;
 if(!subtle||!expectedSha)throw Error('Cryptographic artifact verification unavailable');
 const digest=await subtle.digest('SHA-256',new TextEncoder().encode(text));
 const actual=[...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
 if(actual!==String(expectedSha).toLowerCase())throw Error('Artifact SHA-256 does not match the audit ledger');
 return JSON.parse(text);
}
let archive=null,liveFeed=null,selectedMelbourneDate=null,ledgerEntries=[],archiveCache=new Map(),historySnapshot=null;
let archiveStatus='not loaded',reviewStatus='Daily review not loaded',sidecarStatus='Research sidecar not loaded';
function matchingForecast(game){
 return archive?.lock.forecasts?.find(g=>String(g.game_id)===String(game.id))||null;
}
function gameLink(game){return './game/?id='+encodeURIComponent(String(game.game_id||game.id))}
function statusOf(g){
 if(!g)return {text:'SCORE UNAVAILABLE',kind:'unavailable'};
 if(g.phase==='postponed')return {text:'POSTPONED',kind:'postponed'};
 if(g.phase==='live')return {text:scores?.label?.(g)||'IN PROGRESS',kind:'live'};
 if(g.phase==='final')return {text:'FINAL',kind:'final'};
 return {text:'SCHEDULED',kind:'scheduled'};
}
function observed(game){return liveFeed?.games?.find(g=>g.id===String(game.game_id||game.id))||null;}
function observedScore(game){
 const s=observed(game),state=statusOf(s);
 return {s,state,actual:!!s&&['live','final'].includes(s.phase)&&Number.isFinite(s.home.score)&&Number.isFinite(s.away.score)};
}
function gameTile(game){
 const isLocked=!!game.primary_forecast,meta=observedScore(game);
 const teamAway=game.away,teamHome=game.home,p=isLocked?game.primary_forecast:null;
 const href=gameLink(game);
 const when=fmt(usableTime(game.tip_utc,game.date,meta.s?.date));
 const state=meta.state;
 const outcome=meta.actual?esc(meta.s.away.score)+' – '+esc(meta.s.home.score):
  Number.isFinite(p?.home_win_probability)?'AWAY '+pct(p.away_win_probability)+' · HOME '+pct(p.home_win_probability):'NO VERIFIED PRODUCTION LOCK';
 const records='<span class="home-game__records">'+esc(teamAway.record||'Record unavailable')+' <i>·</i> '+esc(teamHome.record||'Record unavailable')+'</span>';
 const status=state.kind==='postponed'?'POSTPONED · ORIGINAL LOCK':meta.actual?state.text:p?'UPCOMING · LOCKED':'UPCOMING';
 const forecastLabel=state.kind==='postponed'?'ORIGINAL PRODUCTION LOCK · NOT CURRENT':meta.actual?'ESPN SCORE':'PRODUCTION ELO · LOCKED';
 return '<a class="home-game" href="'+href+'" aria-label="'+esc(teamAway.name)+' at '+esc(teamHome.name)+', '+esc(status)+'">'+
  '<div class="home-game__top"><span>'+esc(when)+'</span><span class="game-status">'+esc(status)+'</span></div>'+
  '<div class="home-game__teams">'+teamImage(teamAway,'small')+'<strong>'+esc(teamAway.abbr)+'</strong><span>AT</span><strong>'+esc(teamHome.abbr)+'</strong>'+teamImage(teamHome,'small')+'</div>'+
  records+'<div class="home-game__foot"><span>'+esc(forecastLabel)+'</span><strong>'+outcome+'</strong></div></a>';
}
function candidateGames(){
 if(!archive&&!liveFeed)return [];
 const live=liveFeed?.games||[];
 if(live.length)return live.map(g=>matchingForecast(g)||g);
 if(selectedMelbourneDate&&archive?.entry?.melbourne_date!==isoMelbourneDate(selectedMelbourneDate))return [];
 return archive?.lock.forecasts||[];
}
function playerSpotlight(game){
 const items=(game.v9_player_projections||[]).filter(p=>p&&p.player_id&&p.projection_if_play&&Number.isFinite(p.projection_if_play.pts));
 const picks=[game.away.abbr,game.home.abbr].map(abbr=>items.filter(p=>p.team===abbr).sort((a,b)=>b.projection_if_play.pts-a.projection_if_play.pts)[0]).filter(Boolean);
 // Hero artwork uses a full-resolution, credited action photograph, not a stretched 260px player headshot.
 if(!$('feature-players'))return;
 $('feature-players').innerHTML=picks.length?
  '<div class="feature-players__title">PLAYERS PROJECTED IN THIS MATCHUP <small>Conditional on playing</small></div><div class="feature-players__list">'+
  picks.map(p=>'<a href="./challenge/daily.html?game='+encodeURIComponent(String(game.game_id||game.id))+'#player-lab" class="feature-player">'+
  (media?.playerImage?.(p)||'')+'<span><b>'+esc(p.name)+'</b><small>'+esc(p.team)+' · projected '+p.projection_if_play.pts.toFixed(1)+' PTS</small></span></a>').join('')+'</div>':
  '<p class="small-note">No verified conditional player projections are available for this matchup.</p>';
}
function showModelDisagreement(game){
 const box=$('feature-confidence');
 if(!box)return;
 const p=game.primary_forecast;
 if(!p){box.innerHTML='';return}
 const supplement=archive?.sidecar?.games?.find(item=>String(item.game_id)===String(game.game_id||game.id));
 const models=supplement?.predictions||game.challenge_predictions||{};
 const chances=Object.entries(models).filter(([,m])=>m?.available===true&&Number.isFinite(m.home_win_probability));
 if(chances.length<2){
  box.innerHTML='<div class="feature-confidence__quiet">PRODUCTION ELO: '+pct(p.winner_probability)+' · research comparison unavailable ('+esc(sidecarStatus)+'). The original lock is unchanged.</div>';
  return;
 }
 const awayChances=chances.map(([name,m])=>({id:name,prob:1-m.home_win_probability}));
 const lo=awayChances.reduce((a,b)=>a.prob<b.prob?a:b),hi=awayChances.reduce((a,b)=>a.prob>b.prob?a:b);
 const spread=(hi.prob-lo.prob)*100,warning=spread>=20;
 const selectedName=p.winner;
 box.innerHTML='<div class="feature-confidence__'+(warning?'warning':'quiet')+'"><b>'+
  (warning?'⚠ MODELS DISAGREE · ':'MODEL SPREAD · ')+spread.toFixed(1)+' PERCENTAGE POINTS</b>'+
  '<span>'+esc(game.away.abbr)+' win chance spans '+pct(lo.prob)+' ('+esc(lo.id)+') to '+pct(hi.prob)+' ('+esc(hi.id)+'). This is a range of model opinions, not a calibrated prediction interval.</span>'+
  '<small>Original ELO '+esc(selectedName)+' '+pct(p.winner_probability)+' · not updated during the game · roster and official injury uncertainty remains.</small></div>';
}
function render(){
 if(!archive&&!liveFeed){
  show('scoreboard-source','Live scoreboard unavailable · '+archiveStatus);
  renderMachineScorecard();renderTeamTrends(historySnapshot);return;
 }
 const games=candidateGames();
 const source='ARCHIVED PREGAME FORECASTS · Actual live NBA scores and player box scores appear in the game centre above.';
 show('scoreboard-source',source);
 if($('home-games'))$('home-games').innerHTML=games.length?games.map(gameTile).join(''):
 '<p>NBA scoreboard is unavailable. The site will not invent game scores.</p>';
 if($('home-ticker'))$('home-ticker').innerHTML=games.map(game=>{
  const meta=observedScore(game),p=game.primary_forecast,link=gameLink(game);
  const label=meta.state.kind==='postponed'?'POSTPONED':meta.actual?meta.state.text:p?'LOCKED PRETIP':'SCHEDULED';
  const result=meta.actual?meta.s.away.score+'–'+meta.s.home.score:
    p?'ELO '+esc(p.winner)+' '+pct(p.winner_probability):'—';
  // This is the exact same NBA team-logo source used in game cards.
  // The accessible link announces full teams/status; logo failures show abbreviations.
  const badge=team=>media?.image?.(team.abbr,{size:'small',label:team.abbr})||
    '<span class="court-ticker__fallback">'+esc(team.abbr)+'</span>';
  const aria=esc(game.away.name+' at '+game.home.name+', '+label+', '+(meta.actual?
    meta.s.away.score+' to '+meta.s.home.score:result.replace(/&amp;/g,'&')));
  return '<a class="court-ticker__item" href="'+link+'" aria-label="'+aria+'">'+
    '<span class="court-ticker__matchup" aria-hidden="true">'+badge(game.away)+
    '<small>AT</small>'+badge(game.home)+'</span>'+
    '<small class="court-ticker__status">'+esc(label)+'</small>'+
    '<b class="court-ticker__score">'+result+'</b></a>';
 }).join('');
 // Feature the latest immutable pretip prediction, NEVER use a live score as a pick.
 const chosen=(archive?.lock?.forecasts||[]).find(g=>g.primary_forecast)||
   games.find(g=>g.primary_forecast)||games[0];
 if(!chosen){renderMachineScorecard();renderTeamTrends(historySnapshot);return}

 const prediction=chosen.primary_forecast,meta=observedScore(chosen);
 const homeChance=prediction?.home_win_probability;
 const awayChance=Number.isFinite(homeChance)?1-homeChance:null;
 const formatChance=v=>Number.isFinite(v)?Math.round(v*100)+'%':'—';
 const evidence='PRODUCTION ELO · ORIGINAL LOCK';
 show('feature-tip',fmt(chosen.tip_utc||chosen.date));
 if($('featured-game'))$('featured-game').innerHTML=
   '<div class="c3-feature-match"><a href="./team/?team='+encodeURIComponent(chosen.away.abbr)+'" class="c3-feature-team">'+teamImage(chosen.away,'large')+'<strong>'+esc(chosen.away.abbr)+'</strong></a>'+
   '<div class="c3-feature-versus">VS</div>'+
   '<a href="./team/?team='+encodeURIComponent(chosen.home.abbr)+'" class="c3-feature-team">'+teamImage(chosen.home,'large')+'<strong>'+esc(chosen.home.abbr)+'</strong></a></div>'+
   '<div class="c3-prob-label">WIN PROBABILITY · '+esc(evidence)+'</div>'+
   '<div class="c3-prob-head"><strong>'+formatChance(awayChance)+'</strong><span>AWAY / HOME</span><strong>'+formatChance(homeChance)+'</strong></div>'+
   (Number.isFinite(homeChance)?'<div class="c3-prob-track" role="img" aria-label="'+esc(chosen.away.name)+' '+formatChance(awayChance)+'; '+esc(chosen.home.name)+' '+formatChance(homeChance)+'">'+
    '<div class="c3-prob-away" style="width:'+(100*awayChance).toFixed(2)+'%"></div><div class="c3-prob-home" style="width:'+(100*homeChance).toFixed(2)+'%"></div></div>':
    '<p class="c3-muted">No verified locked probability available.</p>');
 show('feature-detail',(meta.actual?'Archived pretip forecast':'Locked before tipoff')+' · '+evidence+' · '+fmt(chosen.tip_utc||chosen.date));
 if($('feature-game-link'))$('feature-game-link').href=gameLink(chosen);
 showModelDisagreement(chosen);
 if(prediction)playerSpotlight(chosen);
 else if($('feature-players'))$('feature-players').innerHTML='<p class="small-note">No locked player projection for this matchup.</p>';
 const finals=(liveFeed?.games||[]).filter(g=>g.phase==='final'&&Number.isFinite(g.away.score)&&Number.isFinite(g.home.score))
  .sort((x,y)=>Date.parse(y.date||0)-Date.parse(x.date||0)).slice(0,3);
 if($('c3-latest-results'))$('c3-latest-results').innerHTML=finals.length?finals.map(g=>
  '<a class="c3-result-row" href="./game/?id='+encodeURIComponent(String(g.id))+'" aria-label="'+esc(g.away.name+' '+g.away.score+' at '+g.home.name+' '+g.home.score)+'">'+
  teamImage(g.away,'small')+'<b>'+esc(g.away.abbr)+'</b><strong>'+esc(g.away.score)+' – '+esc(g.home.score)+'</strong><b>'+esc(g.home.abbr)+'</b>'+teamImage(g.home,'small')+'</a>'
 ).join(''):'<p class="c3-muted">No verified recent NBA finals are available.</p>';
 renderMachineScorecard();
 renderTeamTrends(historySnapshot);
}
function showLiveAccess(feed){
 const target=$('hero-live-status');
 if(!target)return;
 if(!feed){target.textContent='LIVE SCOREBOARD UNAVAILABLE · NO SCORES GUESSED';target.classList?.remove?.('is-live');return}
 const games=feed.games||[],live=games.filter(g=>g.phase==='live').length,finals=games.filter(g=>g.phase==='final').length;
 const upcoming=games.filter(g=>g.phase==='scheduled').length,postponed=games.filter(g=>g.phase==='postponed').length;
 target.textContent=(live?live+' LIVE NOW':'NO GAMES LIVE NOW')+' · '+finals+' FINAL · '+upcoming+' UPCOMING'+
  (postponed?' · '+postponed+' POSTPONED':'');
 target.classList?.toggle?.('is-live',live>0);
}
function renderMachineScorecard(){
 const target=$('home-machine-scorecard');if(!target)return;
 const review=archive?.review,lock=archive?.lock;
 if(!review||!lock){
  target.innerHTML='<p class="home-panel-unavailable">No verified, lock-bound daily grading is available for '+esc(selectedMelbourneDate||'the selected date')+'. '+esc(archiveStatus)+'; '+esc(reviewStatus)+'. Reconstructed estimates are not used.</p>';
  return;
 }
 const grades=new Map((review.games||[]).map(game=>[String(game.game_id),game]));
 const forecasts=new Map((lock.forecasts||[]).map(game=>[String(game.game_id),game]));
 const checked=[];
 for(const [id,grade] of grades){
  const forecast=forecasts.get(id),production=grade.models?.production_elo_v7,locked=forecast?.primary_forecast;
  const actualHome=Number(grade.home?.score),actualAway=Number(grade.away?.score);
  if(!locked||!production||!Number.isFinite(actualHome)||!Number.isFinite(actualAway)||
     production.p!==locked.home_win_probability||production.actual!==(actualHome>actualAway?1:0)||
     production.correct!==(production.actual===(production.p>0.5?1:0)))continue;
  checked.push({forecast,grade,production,actualHome,actualAway});
 }
 const modelStats=review.summary?.models||{};
 const productionStats=modelStats.production_elo_v7;
 if(!checked.length||checked.length!==grades.size||!productionStats||productionStats.count!==checked.length){
  target.innerHTML='<p class="home-panel-unavailable">This date has no completed game that passes the original-lock and grading consistency checks.</p>';
  return;
 }
 const supportsDailyMetrics=productionStats.count>=5;
 const models=supportsDailyMetrics?Object.entries(modelStats).filter(([id])=>id!=='production_elo_v7').map(([id,value])=>
  '<tr><th scope="row">'+esc(value.label||id)+'</th><td>'+esc(value.count??'—')+'</td><td>'+pct(value.accuracy)+'</td><td>'+(Number.isFinite(value.brier)?value.brier.toFixed(3):'—')+'</td><td>'+(Number.isFinite(value.score_mae_per_team)?value.score_mae_per_team.toFixed(1):'—')+'</td></tr>').join(''):'';
 const rows=checked.sort((a,b)=>Date.parse(a.grade.tip_utc||0)-Date.parse(b.grade.tip_utc||0)).map(({forecast,grade,production,actualHome,actualAway})=>{
  const homePick=production.p>0.5,predicted=homePick?forecast.home.abbr:forecast.away.abbr;
  const actual=actualHome>actualAway?forecast.home.abbr:forecast.away.abbr;
  const scoreError=Number.isFinite(production.score_mae_per_team)?production.score_mae_per_team:null;
  return '<tr><td>'+esc(forecast.away.abbr)+' @ '+esc(forecast.home.abbr)+'</td><td>'+esc(predicted)+' · '+pct(homePick?production.p:1-production.p)+'</td><td>'+actual+' · '+actualAway+'–'+actualHome+'</td><td>'+ (predicted===actual?'Correct':'Incorrect')+'</td><td>'+ (scoreError===null?'—':scoreError.toFixed(1))+'</td></tr>';
 }).join('');
 target.innerHTML='<div class="home-scorecard-summary"><strong>PRODUCTION ELO · '+esc(productionStats.count)+' graded games</strong>'+
  (supportsDailyMetrics?'<span>Winner accuracy '+pct(productionStats.accuracy)+'</span><span>Brier '+(Number.isFinite(productionStats.brier)?productionStats.brier.toFixed(3):'—')+'</span><span>Score MAE '+(Number.isFinite(productionStats.score_mae_per_team)?productionStats.score_mae_per_team.toFixed(1):'—')+' points / team</span>':'<span>Daily accuracy withheld: fewer than five verified games</span>')+'</div>'+
  '<p class="home-scorecard-provenance">Original locked probabilities are matched to the lock-bound completed-game review. '+esc(review.generated_at_utc||'Review timestamp unavailable')+' · '+esc(archive.entry.review_path)+'.</p>'+
  '<div class="home-scorecard-table-wrap"><table class="home-scorecard-table"><caption>Official production game-by-game results</caption><thead><tr><th>Matchup</th><th>Locked pick</th><th>Final</th><th>Winner call</th><th>Score MAE</th></tr></thead><tbody>'+rows+'</tbody></table></div>'+
  (models?'<details class="home-research-scorecard"><summary>RESEARCH & EXPERIMENTAL MACHINES · '+esc(Object.keys(modelStats).length-1)+' models</summary><p>Historical daily results only; these machines are not the production forecast.</p><div class="home-scorecard-table-wrap"><table class="home-scorecard-table"><thead><tr><th>Research model</th><th>Games</th><th>Accuracy</th><th>Brier</th><th>Score MAE / team</th></tr></thead><tbody>'+models+'</tbody></table></div></details>':'');
}
function teamStreaks(snapshot,now=Date.now()){
 if(!snapshot||!Array.isArray(snapshot.games)||!Number.isFinite(Date.parse(snapshot.built_at_utc)))return [];
 const cutoff=Math.min(now,Date.parse(snapshot.built_at_utc));
 const recentWindowStart=cutoff-30*24*60*60*1000;
 const games=snapshot.games.filter(game=>game.status==='final'&&Date.parse(game.date)<=cutoff&&
  Date.parse(game.date)>=recentWindowStart&&
  Number.isFinite(game.homeScore)&&Number.isFinite(game.awayScore)).sort((a,b)=>Date.parse(b.date)-Date.parse(a.date));
 const teams=new Map();
 for(const game of games){
  for(const [team,score,opponent] of [
   [game.home,game.homeScore,game.awayScore],[game.away,game.awayScore,game.homeScore]
  ]){
   if(!team?.abbr)continue;
   const outcome=score>opponent?'W':'L';
   if(!teams.has(team.abbr))teams.set(team.abbr,{team,outcome,count:0,start:game.date,through:game.date,stopped:false});
   const streak=teams.get(team.abbr);
   if(streak.stopped)continue;
   if(streak.outcome===outcome){streak.count++;streak.start=game.date}
   else streak.stopped=true;
  }
 }
 return [...teams.values()].filter(streak=>streak.count>=3).sort((a,b)=>b.count-a.count||a.team.abbr.localeCompare(b.team.abbr));
}
function renderTeamTrends(snapshot){
 const target=$('home-team-trends');if(!target)return;
 const streaks=teamStreaks(snapshot);
 if(!snapshot||!streaks.length){
  target.innerHTML='<p class="home-panel-unavailable">No verified three-game team streak is available in the dated final-score snapshot. Team form is not inferred from today’s slate.</p>';
  return;
 }
 const shortDate=value=>new Intl.DateTimeFormat('en-AU',{timeZone:'Australia/Melbourne',day:'numeric',month:'short'}).format(new Date(value));
 target.innerHTML='<div class="home-trend-cards">'+streaks.slice(0,8).map(streak=>
  '<article><strong>'+esc(streak.team.abbr)+' · '+esc(streak.count)+'-GAME '+(streak.outcome==='W'?'WIN':'LOSS')+' STREAK</strong><span>'+esc(streak.team.name||streak.team.abbr)+' · '+esc(streak.count)+' consecutive finals · '+esc(shortDate(streak.start))+'–'+esc(shortDate(streak.through))+'</span></article>').join('')+'</div>'+
  '<p class="home-trend-source">Final scores: '+esc(snapshot.source?.name||'dated ESPN scoreboard snapshot')+' · snapshot created '+esc(snapshot.built_at_utc)+'. Streaks use consecutive completed games in the latest 30 days.</p>';
}
async function loadDailyArchive(date){
 const entry=ledgerEntries.find(item=>item.melbourne_date===date&&item.lock_path);
 if(!entry){
  archive=null;archiveStatus='no archived pregame lock for this date';reviewStatus='No lock-bound review exists';sidecarStatus='No research sidecar exists';show('home-projections','—');window.NbaLiveDesk?.setLockedForecasts?.([]);return;
 }
 if(archiveCache.has(date)){
  if(isoMelbourneDate(selectedMelbourneDate)===date){
   archive=archiveCache.get(date);archiveStatus='original forecast lock SHA-256 verified';reviewStatus=archive.reviewStatus;sidecarStatus=archive.sidecarStatus;window.NbaLiveDesk?.setLockedForecasts?.(archive.lock.forecasts||[]);
   const count=(archive.lock.forecasts||[]).reduce((total,game)=>total+(Array.isArray(game.v9_player_projections)?game.v9_player_projections.length:0),0);
   show('home-projections',count?count.toLocaleString('en-AU'):'—');
  }
  return;
 }
 archive=null;window.NbaLiveDesk?.setLockedForecasts?.([]);
 reviewStatus=entry.status==='reviewed'?'Review hash verification pending':'Review not yet marked complete';
 sidecarStatus='Research sidecar unavailable';
 try{
  const lock=await verifiedJson('./'+entry.lock_path,entry.lock_sha256);
  if(lock.scope?.melbourne_date!==date||lock.integrity?.canonical_payload_without_integrity!==entry.lock_integrity_sha256||
     !Number.isFinite(Date.parse(lock.locked_at_utc))||Date.parse(lock.locked_at_utc)>=Date.parse(lock.scope.first_tip_utc))
   throw Error('Forecast lock scope or pregame cutoff is invalid');
  const projectionCount=(lock.forecasts||[]).reduce((total,game)=>total+(Array.isArray(game.v9_player_projections)?game.v9_player_projections.length:0),0);
  show('home-projections',projectionCount?projectionCount.toLocaleString('en-AU'):'—');
  const loaded={entry,lock,sidecar:null,review:null};
  if(entry.review_path&&entry.review_sha256&&entry.status==='reviewed'){
   try{
    const review=await verifiedJson('./'+entry.review_path,entry.review_sha256);
    if(review.melbourne_date===date&&review.source_lock_integrity_sha256===entry.lock_integrity_sha256&&
       review.integrity?.algorithm==='sha256'&&review.integrity.canonical_payload_without_integrity){
     loaded.review=review;
     reviewStatus='Review SHA-256 verified and bound to the original lock';
    }else reviewStatus='Review does not match the date or original lock';
   }catch(error){reviewStatus='Review verification failed: '+error.message}
  }else reviewStatus='No completed, lock-bound review in the audit ledger';
  loaded.reviewStatus=reviewStatus;
  try{
   const sidecar=await json('./audit/supplements/'+date+'/challenge.lock.json');
   if(sidecar.original_forecast_sha256===entry.lock_sha256&&Date.parse(sidecar.locked_at_utc)<Date.parse(lock.scope.first_tip_utc)){
    loaded.sidecar=sidecar;sidecarStatus='Original-lock-bound research sidecar loaded';
   }else sidecarStatus='Research sidecar is not bound to the original lock';
  }catch(error){sidecarStatus='Research sidecar unavailable: '+error.message}
  loaded.sidecarStatus=sidecarStatus;
  archiveCache.set(date,loaded);
  if(isoMelbourneDate(selectedMelbourneDate)===date||!selectedMelbourneDate){
   archive=loaded;archiveStatus='original forecast lock SHA-256 verified';window.NbaLiveDesk?.setLockedForecasts?.(lock.forecasts||[]);
  }
 }catch(error){
  if(isoMelbourneDate(selectedMelbourneDate)===date||!selectedMelbourneDate){archive=null;archiveStatus=error.message;reviewStatus='Review cannot be verified without its original lock';show('home-projections','—');window.NbaLiveDesk?.setLockedForecasts?.([]);}
 }
}
async function refresh(date=selectedMelbourneDate){
 if(!scores?.fetchDate)return;
 try{
   selectedMelbourneDate=date||scores.melbourneDate?.(new Date())||scores.usDate?.(new Date());
   const archiveLoad=loadDailyArchive(isoMelbourneDate(selectedMelbourneDate));
   const feed=scores.fetchMelbourneDate?
     await scores.fetchMelbourneDate(selectedMelbourneDate):
     await scores.fetchDate(scores.usDate(new Date()));
   if(!Array.isArray(feed.games))throw Error('No games array returned');
   await archiveLoad;
   liveFeed=feed;
   window.NbaLiveDesk?.setFeed?.(feed);
   showLiveAccess(feed);
 }catch(error){liveFeed=null;window.NbaLiveDesk?.unavailable?.();showLiveAccess(null);}
 render();
}
async function init(){
 selectedMelbourneDate=scores?.melbourneDate?.(new Date())||scores?.usDate?.(new Date())||null;
 const [led,report,historyData]=await Promise.allSettled([
  json('./data/audit-ledger.json'),json('./data/five-model-report.json'),json('./data/games.json')
 ]);
 if(report.status==='fulfilled'&&Number.isFinite(report.value.common_evaluation?.games))show('home-backtest',report.value.common_evaluation.games.toLocaleString('en-AU')+' games');
 if(historyData.status==='fulfilled')historySnapshot=historyData.value;
 if(led.status==='fulfilled'){
   ledgerEntries=(led.value.entries||[]).filter(e=>e.lock_path).sort((a,b)=>String(b.melbourne_date).localeCompare(String(a.melbourne_date)));
   show('home-locked',String(ledgerEntries.length));
   if(ledgerEntries.length){show('home-date',ledgerEntries[0].melbourne_date);await loadDailyArchive(ledgerEntries[0].melbourne_date)}
 }
 render();
 document.addEventListener?.('twinlab:scoredatechange',event=>{
   const date=event?.detail?.date;
   if(/^\d{8}$/.test(String(date))&&date!==selectedMelbourneDate){selectedMelbourneDate=date;refresh(date)}
 });
 await refresh();
 if(typeof setInterval==='function')setInterval(refresh,60000);
}
init().catch(()=>{show('scoreboard-source','Scoreboard unavailable — no live scores displayed');render()});
if(typeof window!=='undefined')window.NbaHome=Object.freeze({teamStreaks,renderTeamTrends,renderMachineScorecard});
})();
