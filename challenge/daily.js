(()=>{'use strict';
const $ = id => document.getElementById(id);
const esc = value => String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const isNumber = value => typeof value === 'number' && Number.isFinite(value);
const dec = (value,d=1) => isNumber(value) ? value.toFixed(d) : '—';
const pct = value => isNumber(value) ? (value*100).toFixed(1)+'%' : '—';
const ids=['m1_elo','m2_science','m3_player_roster','m4_monte_carlo','m5_regularized_ml','m6_ensemble'];
const labels={m1_elo:'M1 · Elo',m2_science:'M2 · Basketball Science',m3_player_roster:'M3 · Player / Roster',m4_monte_carlo:'M4 · Monte Carlo',m5_regularized_ml:'M5 · Machine Learning',m6_ensemble:'M6 · Weighted Ensemble'};
const shortTime=value=>{const d=new Date(value);return Number.isNaN(d.getTime())?'Time unavailable':new Intl.DateTimeFormat('en-AU',{timeZone:'Australia/Melbourne',hour:'numeric',minute:'2-digit',hour12:true}).format(d)};
const fullTime=value=>{const d=new Date(value);return Number.isNaN(d.getTime())?'Unavailable':new Intl.DateTimeFormat('en-AU',{timeZone:'Australia/Melbourne',dateStyle:'medium',timeStyle:'short'}).format(d)};
async function json(location,optional=false){
 try{const response=await fetch(location,{cache:'no-store'});if(!response.ok)throw Error('HTTP '+response.status);return await response.json()}
 catch(error){if(optional)return null;throw Error('Cannot load '+location+': '+error.message)}
}
let data=null,selected=null,matchupFilter='all',scoreFeed=null;
const scoreAdapter=typeof window!=='undefined'?window.NbaScores:null;
const liveFor=id=>scoreFeed?.games?.find(game=>String(game.id)===String(id))||null;
const scoreLabel=game=>game?.phase==='final'?'FINAL':game?.phase==='live'?(scoreAdapter?.label?.(game)||'LIVE'):'PREGAME';
const hasScore=game=>game&&['live','final'].includes(game.phase)&&isNumber(game.home.score)&&isNumber(game.away.score);
function matchName(g){return g.away.abbr+' @ '+g.home.abbr}
const media=typeof window!=='undefined'?window.NbaMedia:null;
const crest=(team,large=false)=>media?.image?.(team.abbr,{size:large?'large':'small',label:team.abbr})||
'<span class="club-mark'+(large?' club-mark--large':'')+'" data-team="'+esc(team.abbr)+'">'+esc(team.abbr)+'</span>';
const portrait=player=>media?.playerImage?.(player)||'<span class="player-photo player-photo--fallback" aria-hidden="true">◉</span>';
const fmtGameTip=g=>shortTime(g.tip_utc);
function scoreFor(gameId){return data.review?.games?.find(game=>String(game.game_id)===String(gameId))||null}
function modelsFor(game){
 const embedded=game.challenge_predictions||null;
 const side=data.sidecar?.games?.find(item=>String(item.game_id)===String(game.game_id));
 return side?.predictions||embedded||{};
}
function drawDisagreements(){
 const entries=(data.lock.forecasts||[]).map(game=>{
  const probabilities=ids.map(id=>modelsFor(game)[id]).filter(p=>p?.available===true&&isNumber(p.home_win_probability)).map(p=>p.home_win_probability);
  if(probabilities.length<2)return null;
  const home=probabilities.filter(p=>p>=0.5).length,away=probabilities.length-home;
  return {game,spread:Math.max(...probabilities)-Math.min(...probabilities),home,away,split:home>0&&away>0,count:probabilities.length};
 }).filter(Boolean).sort((a,b)=>Number(b.split)-Number(a.split)||b.spread-a.spread).slice(0,6);
 $('disagreements').innerHTML=entries.length?entries.map(x=>
  '<button class="watch" type="button" data-game="'+esc(x.game.game_id)+'"><small>'+esc(shortTime(x.game.tip_utc))+' · '+(x.split?'SPLIT PICK':'CONFIDENCE GAP')+'</small>'+
  '<strong>'+esc(matchName(x.game))+'</strong>'+
  '<small><b>'+(x.spread*100).toFixed(1)+' percentage points</b> between highest and lowest probabilities</small>'+
  '<small>'+x.away+' favour '+esc(x.game.away.abbr)+' · '+x.home+' favour '+esc(x.game.home.abbr)+'</small></button>'
 ).join(''):'<p class="muted">No overlapping, available model forecasts for comparison.</p>';
 document.querySelectorAll('#disagreements [data-game]').forEach(button=>button.onclick=()=>selectGame(button.dataset.game));
}
function drawGameSelector(){
 const query=String($('match-search').value||'').trim().toLowerCase();
 const games=(data.lock.forecasts||[]).filter(game=>{
  const match=(game.home.name+' '+game.away.name+' '+game.home.abbr+' '+game.away.abbr).toLowerCase();
  if(query&&!match.includes(query))return false;
  const available=ids.map(id=>modelsFor(game)[id]).filter(p=>p?.available===true&&isNumber(p.home_win_probability));
  const home=available.filter(p=>p.home_win_probability>=.5).length;
  const away=available.length-home;
  const spread=available.length>1?Math.max(...available.map(p=>p.home_win_probability))-Math.min(...available.map(p=>p.home_win_probability)):0;
  if(matchupFilter==='split'&&!(home&&away))return false;
  if(matchupFilter==='gap'&&spread<.15)return false;
  return true;
 });
 $('game-count').textContent=games.length+' of '+(data.lock.forecasts||[]).length+' games'+(query?' · search: '+query:'');
 $('game-selector').innerHTML=games.length?games.map(game=>{
  const actual=scoreFor(game.game_id),observed=liveFor(game.game_id),isSelected=String(game.game_id)===String(selected);
  const featured=modelsFor(game).m6_ensemble?.home_win_probability;
  const picked=isNumber(featured)?(featured>=.5?game.home.abbr:game.away.abbr):game.primary_forecast?.winner;
  const probability=isNumber(featured)?Math.max(featured,1-featured):game.primary_forecast?.winner_probability;
  return '<button type="button" class="game-button" data-game="'+esc(game.game_id)+'" aria-pressed="'+isSelected+'" aria-label="'+esc(matchName(game)+' '+shortTime(game.tip_utc))+'">'+
   '<div class="game-button__inner"><div class="game-button__meta"><small>'+esc(shortTime(game.tip_utc))+'</small><b>'+esc(matchName(game))+'</b><small>'+(hasScore(observed)?'<span class="score">'+esc(scoreLabel(observed))+' · '+observed.away.score+'–'+observed.home.score+'</span>':actual?'<span class="score">FINAL '+esc(actual.away.score)+'–'+esc(actual.home.score)+'</span>':'ENS PICK '+esc(picked||'—')+' · '+pct(probability))+'</small></div><div class="game-button__marks">'+crest(game.away)+crest(game.home)+'</div></div></button>';
 }).join(''):'<p class="muted">No matchups fit these filters. Try another team or select All games.</p>';
 document.querySelectorAll('#game-selector [data-game]').forEach(button=>button.onclick=()=>selectGame(button.dataset.game));
}
function drawGameDetail(){
 const game=(data.lock.forecasts||[]).find(game=>String(game.game_id)===String(selected));
 if(!game){$('game-detail').textContent='No game selected';return}
 const actual=scoreFor(selected),observed=liveFor(selected),predictions=modelsFor(game),baseline=game.primary_forecast;
 const audited=data.sidecarReview?.games?.find(row=>String(row.game_id)===String(game.game_id));
 const scoredModels=audited?.models||(data.sidecar?null:actual?.models)||{};
 const score=hasScore(observed)?'<p class="score">ESPN '+esc(scoreLabel(observed))+': '+esc(game.away.abbr)+' '+observed.away.score+' · '+esc(game.home.abbr)+' '+observed.home.score+' <small>· not a model projection</small></p>':actual?'<p class="score">Audited final: '+esc(actual.away.abbr)+' '+esc(actual.away.score)+' · '+esc(actual.home.abbr)+' '+esc(actual.home.score)+'</p>':'';
 const availableProbabilities=ids.map(id=>predictions[id]).filter(p=>p?.available===true&&isNumber(p.home_win_probability));
 const homePicks=availableProbabilities.filter(p=>p.home_win_probability>=0.5).length;
 const awayPicks=availableProbabilities.length-homePicks;
 const consensus=availableProbabilities.length?'<p class="muted">'+(homePicks===0||awayPicks===0?'All '+availableProbabilities.length+' models favour '+esc(homePicks?game.home.abbr:game.away.abbr):awayPicks+' favour '+esc(game.away.abbr)+' · '+homePicks+' favour '+esc(game.home.abbr))+' · these are not independent votes</p>':'';
 const cells=[],cards=[];
 for(const id of ids){
  const model=predictions[id];
  const available=model?.available===true&&isNumber(model.home_win_probability);
  const p=available?model.home_win_probability:null;
  const winner=available?(p>=.5?game.home.abbr:game.away.abbr):'—';
  const confidence=isNumber(p)?pct(Math.max(p,1-p)):'—';
  const projected=model?.projected_score;
  const projectedText=projected&&isNumber(projected.away)&&isNumber(projected.home)?dec(projected.away,0)+'–'+dec(projected.home,0):'—';
  const reason=!available&&model?.reason?esc(model.reason):null;
  const graded=scoredModels[id];
  const verdict=graded?(graded.correct?'Correct':'Wrong'):'—';
  const brier=graded?dec(graded.brier,4):'—';
  cells.push('<tr><td>'+esc(labels[id])+(reason?'<small class="muted"> '+reason+'</small>':'')+'</td><td>'+esc(winner)+'</td><td class="'+(available?'green':'')+'">'+confidence+'</td><td>'+pct(p)+'</td><td>'+esc(projectedText)+'</td><td class="'+(graded?.correct?'green':graded?'wrong':'')+'">'+verdict+'</td><td>'+brier+'</td></tr>');
  cards.push('<article class="model-card'+(available?'':' model-card--unavailable')+'"><div class="model-card__name">'+esc(labels[id])+'</div>'+
   (available?'<div class="model-card__meta"><div><small>PICK</small><strong>'+esc(winner)+'</strong></div><div style="text-align:right"><small>WIN CHANCE</small><strong>'+confidence+'</strong></div></div>'+
   '<div class="model-card__bar" role="img" aria-label="'+esc(game.home.abbr)+' home win probability '+pct(p)+'"><div class="model-card__fill" style="width:'+((p||0)*100).toFixed(2)+'%"></div></div>'+
   '<div class="model-card__footer"><span>'+esc(game.away.abbr)+' '+pct(1-p)+'</span><span>'+esc(game.home.abbr)+' '+pct(p)+'</span></div>'+
   '<div class="model-card__footer"><span>Score '+esc(projectedText)+'</span><span class="model-card__grade'+(graded&&!graded.correct?' wrong':'')+'">'+(graded?(graded.correct?'✓ Correct':'✕ Wrong'):'Pregame')+(graded?' · Brier '+brier:'')+'</span></div>':
   '<div class="model-card__meta"><strong>Unavailable</strong></div><p class="muted">'+(reason||'No eligible pregame model snapshot')+'</p>')+'</article>');
 }
 const allChances=availableProbabilities.map(p=>p.home_win_probability);
 const spanPoints=allChances.length>1?(Math.max(...allChances)-Math.min(...allChances))*100:0;
 const uncertain=spanPoints>=20;
 const reliability=uncertain?'<div class="uncertainty-banner" role="note"><b>HIGH MODEL DISAGREEMENT · '+spanPoints.toFixed(1)+' percentage points</b><p>These are different forecasts of the same matchup. A strong Elo favourite is not high confidence when other techniques disagree this much. Historical Elo does not incorporate verified starting lineups, injuries or all current roster changes. Do not treat the biggest percentage as the consensus.</p></div>':
 '<div class="uncertainty-banner uncertainty-banner--quiet"><b>Model probability spread: '+spanPoints.toFixed(1)+' points</b><p>Pregame probabilities remain estimates. Player availability is not independently verified.</p></div>';
 const noChallenge=ids.every(id=>!predictions[id]);
 const tipElapsed=Date.now()>=Date.parse(game.tip_utc);
 const scorebug='<section class="sports-scorebug" aria-label="Locked pregame matchup"><div class="sports-scorebug__top"><b>🏀 GAME NIGHT / LOCKED FORECAST</b><small>'+esc(fullTime(game.tip_utc))+'</small></div>'+
   '<div class="sports-scorebug__match"><div class="sports-club">'+crest(game.away,true)+'<span><b class="sports-club__name">'+esc(game.away.abbr)+'</b><small class="sports-club__city">'+esc(game.away.name)+'</small></span></div>'+
   '<div class="sports-scorebug__vs">AT<div class="sports-pick"><small>ELO PICK</small><strong>'+esc(baseline.winner)+'</strong><em>'+pct(baseline.winner_probability)+'</em></div></div>'+
   '<div class="sports-club sports-club--home">'+crest(game.home,true)+'<span><b class="sports-club__name">'+esc(game.home.abbr)+'</b><small class="sports-club__city">'+esc(game.home.name)+'</small></span></div></div>'+
   '<div class="sports-scorebug__bottom"><span>'+(hasScore(observed)?'ESPN '+esc(scoreLabel(observed))+' · NOT A PREDICTION':actual?'AUDITED FINAL':tipElapsed?'ARCHIVED PREGAME FORECAST':'PREGAME · SNAPSHOT LOCKED')+'</span><strong>'+ (hasScore(observed)?esc(game.away.abbr)+' '+observed.away.score+' – '+esc(game.home.abbr)+' '+observed.home.score:actual?esc(actual.away.abbr)+' '+esc(actual.away.score)+' – '+esc(actual.home.abbr)+' '+esc(actual.home.score):'ELO PROJECTED '+esc(game.away.abbr)+' '+dec(baseline.projected_score?.away,0)+' – '+esc(game.home.abbr)+' '+dec(baseline.projected_score?.home,0))+'</strong></div></section>';
 $('game-detail').innerHTML=scorebug+reliability+'<div class="match-title">'+esc(game.away.name)+' @ '+esc(game.home.name)+'</div>'+
  '<div class="muted">'+esc(fullTime(game.tip_utc))+'</div>'+score+
  '<p>Original production Elo: <b>'+esc(baseline.winner)+' '+pct(baseline.winner_probability)+'</b> · projected '+dec(baseline.projected_score?.away,0)+'–'+dec(baseline.projected_score?.home,0)+'</p>'+consensus+
  (noChallenge?'<p class="callout">No pregame six-model lock exists for this matchup. It will not be backfilled.</p>':'')+
  '<div class="model-cards">'+cards.join('')+'</div>'+
  '<div class="tablewrap"><table><thead><tr><th>Model</th><th>Pick</th><th>Pick chance</th><th>Home win %</th><th>Score (away–home)</th><th>Result</th><th>Brier ↓</th></tr></thead><tbody>'+cells.join('')+'</tbody></table></div>'+
  '<p class="muted">M1 may differ slightly from the original Elo lock because challengers have a separate pretip timestamp. Grades appear only after their final-results review is published.</p>';
}
function drawPlayers(){
 const game=data.lock.forecasts.find(game=>String(game.game_id)===String($('player-game').value));
 const body=$('players'),mobile=$('player-cards');
 if(!game){body.innerHTML='<tr><td colspan="9">Select a game</td></tr>';mobile.innerHTML='';return}
 const search=String($('player-search').value||'').trim().toLowerCase();
 const team=String($('player-team').value||'all');
 const sort=String($('player-sort').value||'pts');
 const actual=scoreFor(game.game_id);
 const results=new Map((actual?.player_results||[]).map(row=>[String(row.player_id)+'|'+row.team,row]));
 const projections=(game.v9_player_projections||[]).filter(player=>{
  if(team!=='all'&&team!==player.team)return false;
  return !search||(player.name+' '+player.team).toLowerCase().includes(search);
 }).sort((a,b)=>sort==='name'?a.name.localeCompare(b.name):
  (Number(b.projection_if_play?.[sort])||0)-(Number(a.projection_if_play?.[sort])||0));
 $('player-count').textContent=projections.length+' of '+(game.v9_player_projections||[]).length+' players · conditional projections';
 const rows=[],cards=[];
 for(const player of projections){
  const predicted=player.projection_if_play||{};
  const observed=results.get(String(player.player_id)+'|'+player.team);
  const played=observed?.disposition==='played_scored';
  const outcome=played?observed.actual:null;
  const note=observed?.disposition==='dnp_excluded'?' · DNP':observed?.disposition==='not_listed_excluded'?' · not listed':'';
  const fields=['pts','reb','ast','three_pm'];
  rows.push('<tr><td><span class="player-name-wrap">'+portrait(player)+'<span>'+esc(player.name)+' <small class="muted">'+esc(player.team+note)+'</small></span></span></td>'+
   fields.map(k=>'<td>'+dec(predicted[k])+'</td>').join('')+
   fields.map(k=>'<td>'+dec(outcome?.[k],0)+'</td>').join('')+'</tr>');
  cards.push('<article class="player-card"><div class="player-card__head"><span class="player-name-wrap">'+portrait(player)+'<b>'+esc(player.name)+'</b></span><small>'+esc(player.team+note)+'</small></div><div class="player-card__grid">'+
    fields.map((k,i)=>'<div class="player-card__stat"><small>'+['PTS','REB','AST','3PM'][i]+'</small><strong>'+dec(predicted[k])+'</strong><em>'+(played?'Actual '+dec(outcome?.[k],0):'Predicted')+'</em></div>').join('')+'</div></article>');
 }
 body.innerHTML=rows.join('')||'<tr><td colspan="9">No players fit your filters</td></tr>';
 mobile.innerHTML=cards.join('')||'<p class="muted">No players fit your filters.</p>';
}
function drawResults(){
 const review=data.sidecarReview,models=review?.summary||(data.sidecar?null:data.review?.summary?.models);
 const status=$('review-status');
 if(!models){status.textContent='Awaiting the separate final-results review. No postgame data will alter the locked forecasts.';$('review-cards').innerHTML='<p class="muted">Final results have not been published for this slate yet.</p>';return}
 status.textContent='Only completed games and available pregame models are scored. Lower Brier, log loss and score MAE are better.';
 const cards=[];
 $('model-results').innerHTML=ids.map(id=>{
  const result=models[id];
  if(!result){cards.push('<article class="review-card"><strong>'+esc(labels[id])+'</strong><p class="muted">No scored pregame forecast</p></article>');return '<tr><td>'+esc(labels[id])+'</td><td colspan="5">No scored pregame forecast</td></tr>'}
  const count=Number(result.count??result.games??0);
  cards.push('<article class="review-card"><div class="review-card__top"><strong>'+esc(labels[id])+'</strong><b>'+pct(result.accuracy)+'</b></div><div class="review-card__stats"><span>'+count+' games</span><span>Brier '+dec(result.brier,4)+'</span><span>Log loss '+dec(result.log_loss??result.logLoss,4)+'</span></div></article>');
  return '<tr><td>'+esc(labels[id])+'</td><td>'+count+'</td><td>'+pct(result.accuracy)+'</td><td>'+dec(result.brier,4)+'</td><td>'+dec(result.log_loss??result.logLoss,4)+'</td><td>'+dec(result.score_mae_per_team??result.scoreMAE,2)+'</td></tr>';
 }).join('');
 $('review-cards').innerHTML=cards.join('');
}
function updatePlayerTeams(){
 const game=data.lock.forecasts.find(g=>String(g.game_id)===String($('player-game').value));
 if(!game)return;
 const current=$('player-team').value;
 const items=[['all','Both teams'],[game.away.abbr,game.away.abbr],[game.home.abbr,game.home.abbr]];
 $('player-team').innerHTML=items.map(([value,label])=>'<option value="'+esc(value)+'">'+esc(label)+'</option>').join('');
 $('player-team').value=items.some(([value])=>value===current)?current:'all';
}
function selectGame(gameId){
 selected=String(gameId);
 $('player-game').value=selected;
 updatePlayerTeams();drawGameSelector();drawGameDetail();drawPlayers();
}
async function refreshScores(){
 if(!data?.lock||!scoreAdapter?.fetchDate||!scoreAdapter?.usDate)return;
 const today=scoreAdapter.usDate(new Date());
 const locked=scoreAdapter.usDate(data.lock.forecasts[0].tip_utc);
 let fresh=null;
 // The LIVE desk always uses the current US game date, never the most recent
 // pretip forecast lock date (which could be yesterday or last month).
 try{
  fresh=await scoreAdapter.fetchDate(today);
  if(!fresh.games?.length)throw Error('No games on current scoreboard');
  window.NbaLiveDesk?.setFeed?.(fresh);
 }catch(e){window.NbaLiveDesk?.unavailable?.();}
 // The archived prediction comparison is always scoped to the locked slate.
 // Its scores must never be silently mapped to a newer game's results.
 try{
  scoreFeed=locked===today?fresh:await scoreAdapter.fetchDate(locked);
  if(!scoreFeed?.games?.length)scoreFeed=null;
 }catch(e){scoreFeed=null;}
 if($('daily-live-source'))$('daily-live-source').textContent=fresh?
  'LIVE GAME CENTRE: ESPN checked '+fullTime(fresh.fetched_at_utc)+
  ' · current date scores · every 60 seconds · locked model forecasts are separate':
  'Current ESPN scoreboard unavailable · no live scores invented. Archived lock comparisons remain historical.';
 drawGameSelector();drawGameDetail();
}
async function load(){
 const ledger=await json('../data/audit-ledger.json');
 const latest=[...(ledger.entries||[])].filter(entry=>entry.lock_path).sort((a,b)=>String(b.melbourne_date).localeCompare(String(a.melbourne_date)))[0];
 if(!latest)throw Error('No locked pregame slates yet');
 const lock=await json('../'+latest.lock_path);
 if(lock.scope?.melbourne_date!==latest.melbourne_date)throw Error('Ledger and lock date differ');
 const sidePath='../audit/supplements/'+latest.melbourne_date+'/challenge.lock.json';
 const [sidecar,review,sidecarReview]=await Promise.all([
  json(sidePath,true),latest.review_path?json('../'+latest.review_path,true):Promise.resolve(null),
  json('../audit/supplements/'+latest.melbourne_date+'/challenge.review.json',true)
 ]);
 if(sidecar&&sidecar.original_forecast_sha256!==latest.lock_sha256)throw Error('Supplement refers to a different original immutable lock');
 if(sidecar&&Date.parse(sidecar.locked_at_utc)>=Date.parse(lock.scope.first_tip_utc))throw Error('Supplement was not locked before first tip');
 data={ledger,latest,lock,sidecar,review,sidecarReview};
 if($('daily-ticker')){
  $('daily-ticker').innerHTML=lock.forecasts.map(game=>{
    const forecast=game.primary_forecast||{};
    return '<a class="court-ticker__item" href="#matchups" data-ticker-game="'+esc(game.game_id)+'" aria-label="'+esc(matchName(game)+' forecast')+'"><b>'+esc(game.away.abbr)+'</b><small>AT</small><b>'+esc(game.home.abbr)+'</b><small>ELO '+esc(forecast.winner)+' '+pct(forecast.winner_probability)+'</small></a>';
  }).join('');
  document.querySelectorAll('#daily-ticker [data-ticker-game]').forEach(link=>link.onclick=()=>selectGame(link.dataset.tickerGame));
 }
 $('slate-date').textContent=latest.melbourne_date+' · Melbourne';
 $('lock-time').textContent='Original lock '+fullTime(lock.locked_at_utc)+(sidecar?' · Six-model lock '+fullTime(sidecar.locked_at_utc):'');
 $('slate-count').textContent=(lock.forecasts||[]).length+' games · '+(lock.forecasts||[]).reduce((s,g)=>s+(g.v9_player_projections||[]).length,0)+' player forecasts';
 $('status').textContent=review?'Reviewed finals':'Locked / awaiting finals';
 $('data-sources').textContent='Original immutable forecast: '+latest.lock_path+(sidecar?' · Verified six-model pretip supplement: audit/supplements/'+latest.melbourne_date+'/challenge.lock.json':' · No later challenger forecast backfilled')+'.';
 $('player-game').innerHTML=(lock.forecasts||[]).map(game=>'<option value="'+esc(game.game_id)+'">'+esc(matchName(game))+'</option>').join('');
 $('player-game').onchange=()=>{selected=String($('player-game').value);updatePlayerTeams();drawGameSelector();drawGameDetail();drawPlayers();};
 $('player-search').oninput=drawPlayers;
 $('player-team').onchange=drawPlayers;
 $('player-sort').onchange=drawPlayers;
 $('match-search').oninput=drawGameSelector;
 document.querySelectorAll('.chipset [data-filter]').forEach(button=>button.onclick=()=>{
  matchupFilter=button.dataset.filter||'all';
  document.querySelectorAll('.chipset [data-filter]').forEach(chip=>{const active=chip.dataset.filter===matchupFilter;chip.classList.toggle('active',active);chip.setAttribute('aria-pressed',String(active));});
  drawGameSelector();
 });
 $('stat-games').textContent=String(lock.forecasts.length);
 const countAvailable=lock.forecasts.length?ids.filter(id=>modelsFor(lock.forecasts[0])[id]?.available===true).length:0;
 $('stat-models').textContent=String(countAvailable);
 $('stat-players').textContent=String(lock.forecasts.reduce((n,g)=>n+(g.v9_player_projections||[]).length,0));
 $('stat-review').textContent=review?'REVIEWED':'PENDING';
 $('stat-review').className=review?'review-complete':'review-pending';
 $('stat-review-note').textContent=review?'Final-result audit available':'Awaiting verified final box scores';
 const deepLink=typeof location!=='undefined'?new URLSearchParams(location.search).get('game'):null;
 selected=String((deepLink&&lock.forecasts.some(g=>String(g.game_id)===String(deepLink)))?deepLink:lock.forecasts[0]?.game_id||'');
 drawDisagreements();selectGame(selected);drawResults();
 refreshScores();
 if(typeof setInterval==='function')setInterval(refreshScores,60000);
}
load().catch(error=>{ $('error').innerHTML='<div class="panel"><p class="callout">'+esc(error.message)+'</p><p class="muted">No forecast or result has been fabricated. Check the saved GitHub ledger.</p></div>';['game-selector','game-detail'].forEach(id=>$(id).textContent='Data unavailable'); });
})();