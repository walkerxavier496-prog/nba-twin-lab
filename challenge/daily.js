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
let data=null,selected=null;
function matchName(g){return g.away.abbr+' @ '+g.home.abbr}
function scoreFor(gameId){return data.review?.games?.find(game=>String(game.game_id)===String(gameId))||null}
function modelsFor(game){
 const embedded=game.challenge_predictions||null;
 const side=data.sidecar?.games?.find(item=>String(item.game_id)===String(game.game_id));
 return side?.predictions||embedded||{};
}
function drawGameSelector(){
 const games=data.lock.forecasts||[];
 $('game-selector').innerHTML=games.map(game=>{
  const actual=scoreFor(game.game_id),isSelected=String(game.game_id)===String(selected);
  return '<button type="button" class="game-button" data-game="'+esc(game.game_id)+'" aria-pressed="'+isSelected+'"><small>'+esc(shortTime(game.tip_utc))+'</small><b>'+esc(matchName(game))+'</b><small>'+(actual?'<span class="score">FINAL '+esc(actual.away.score)+'–'+esc(actual.home.score)+'</span>':'Pregame forecast locked')+'</small></button>'
 }).join('');
 document.querySelectorAll('#game-selector [data-game]').forEach(button=>button.onclick=()=>selectGame(button.dataset.game));
}
function drawGameDetail(){
 const game=(data.lock.forecasts||[]).find(game=>String(game.game_id)===String(selected));
 if(!game){$('game-detail').textContent='No game selected';return}
 const actual=scoreFor(selected),predictions=modelsFor(game),baseline=game.primary_forecast;
 const audited=data.sidecarReview?.games?.find(row=>String(row.game_id)===String(game.game_id));
 const scoredModels=audited?.models||(data.sidecar?null:actual?.models)||{};
 const score=actual?'<p class="score">Final: '+esc(actual.away.abbr)+' '+esc(actual.away.score)+' · '+esc(actual.home.abbr)+' '+esc(actual.home.score)+'</p>':'';
 const availableProbabilities=ids.map(id=>predictions[id]).filter(p=>p?.available===true&&isNumber(p.home_win_probability));
 const homePicks=availableProbabilities.filter(p=>p.home_win_probability>=0.5).length;
 const awayPicks=availableProbabilities.length-homePicks;
 const consensus=availableProbabilities.length?'<p class="muted">'+(homePicks===0||awayPicks===0?'All '+availableProbabilities.length+' models agree on the winner':awayPicks+' predict '+esc(game.away.abbr)+' · '+homePicks+' predict '+esc(game.home.abbr))+' · shared inputs mean these are not independent votes</p>':'';
 const rows=ids.map(id=>{
  const model=predictions[id];
  const available=model?.available===true && isNumber(model.home_win_probability);
  const p=available?model.home_win_probability:null;
  const winner=available?(p>=0.5?game.home.abbr:game.away.abbr):'—';
  const confidence=isNumber(p)?pct(Math.max(p,1-p)):'—';
  const forecastScore=model?.projected_score;
  const scoreText=forecastScore&&isNumber(forecastScore.away)&&isNumber(forecastScore.home)?dec(forecastScore.away,0)+'–'+dec(forecastScore.home,0):'—';
  const reason=!available&&model?.reason?'<small class="muted"> '+esc(model.reason)+'</small>':'';
  const graded=scoredModels[id];
  const verdict=graded?(graded.correct?'<span class="green">Correct</span>':'<span class="wrong">Wrong</span>'):'—';
  const brier=graded?dec(graded.brier,4):'—';
  return '<tr><td>'+esc(labels[id])+reason+'</td><td>'+esc(winner)+'</td><td class="'+(available?'green':'')+'">'+confidence+'</td><td>'+pct(p)+'</td><td>'+esc(scoreText)+'</td><td>'+verdict+'</td><td>'+brier+'</td></tr>'
 }).join('');
 const noChallenge=ids.every(id=>!predictions[id]);
 $('game-detail').innerHTML='<div class="match-title">'+esc(game.away.name)+' @ '+esc(game.home.name)+'</div>'+
  '<div class="muted">'+esc(fullTime(game.tip_utc))+'</div>'+score+
  '<p>Original production Elo: <b>'+esc(baseline.winner)+' '+pct(baseline.winner_probability)+'</b> · projected '+dec(baseline.projected_score?.away,0)+'–'+dec(baseline.projected_score?.home,0)+'</p>'+consensus+
  (noChallenge?'<p class="callout">No pregame six-model lock exists for this matchup. It will not be backfilled.</p>':'')+
  '<div class="tablewrap"><table><thead><tr><th>Model</th><th>Pick</th><th>Pick chance</th><th>Home win %</th><th>Score (away–home)</th><th>Result</th><th>Brier ↓</th></tr></thead><tbody>'+rows+'</tbody></table></div>'+
  '<p class="muted">M1 may differ slightly from the original Elo lock because the challengers have a distinct, later pretip timestamp. Model-level results appear only after the separately locked review is published; missing models are excluded.</p>';
}
function drawPlayers(){
 const game=data.lock.forecasts.find(game=>String(game.game_id)===String($('player-game').value));
 const body=$('players');if(!game){body.innerHTML='<tr><td colspan="9">Select a game</td></tr>';return}
 const final=scoreFor(game.game_id),results=new Map((final?.player_results||[]).map(row=>[String(row.player_id)+'|'+row.team,row]));
 const rows=(game.v9_player_projections||[]).map(player=>{
  const projected=player.projection_if_play||{},observed=results.get(String(player.player_id)+'|'+player.team);
  const actual=observed?.disposition==='played_scored'?observed.actual:null;
  const note=observed?.disposition==='dnp_excluded'?' · DNP':observed?.disposition==='not_listed_excluded'?' · not listed':'';
  return '<tr><td>'+esc(player.name)+' <small class="muted">'+esc(player.team+note)+'</small></td>'+
   ['pts','reb','ast','three_pm'].map(k=>'<td>'+dec(projected[k])+'</td>').join('')+
   ['pts','reb','ast','three_pm'].map(k=>'<td>'+dec(actual?.[k],0)+'</td>').join('')+'</tr>'
 });
 body.innerHTML=rows.join('')||'<tr><td colspan="9">No verified pregame V9 projections for this game</td></tr>';
}
function drawResults(){
 const review=data.sidecarReview,models=review?.summary||
  (data.sidecar?null:data.review?.summary?.models);
 const status=$('review-status');
 if(!models){status.textContent='Awaiting the separate final-results review. No postgame data will alter the locked forecasts.';return}
 status.textContent='Only completed games and available pregame models are scored. Lower Brier, log loss and score MAE are better.';
 $('model-results').innerHTML=ids.map(id=>{
  const result=models[id];
  if(!result)return '<tr><td>'+esc(labels[id])+'</td><td colspan="5">No scored pregame forecast</td></tr>';
  return '<tr><td>'+esc(labels[id])+'</td><td>'+Number(result.count||result.games||0)+'</td><td>'+pct(result.accuracy)+'</td><td>'+dec(result.brier,4)+'</td><td>'+dec(result.log_loss??result.logLoss,4)+'</td><td>'+dec(result.score_mae_per_team??result.scoreMAE,2)+'</td></tr>';
 }).join('');
}
function selectGame(gameId){
 selected=String(gameId);
 $('player-game').value=selected;
 drawGameSelector();drawGameDetail();drawPlayers();
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
 $('slate-date').textContent=latest.melbourne_date+' · Melbourne';
 $('lock-time').textContent='Original lock '+fullTime(lock.locked_at_utc)+(sidecar?' · Six-model lock '+fullTime(sidecar.locked_at_utc):'');
 $('slate-count').textContent=(lock.forecasts||[]).length+' games · '+(lock.forecasts||[]).reduce((s,g)=>s+(g.v9_player_projections||[]).length,0)+' player forecasts';
 $('status').textContent=review?'Reviewed finals':'Locked / awaiting finals';
 $('data-sources').textContent='Original immutable forecast: '+latest.lock_path+(sidecar?' · Verified six-model pretip supplement: audit/supplements/'+latest.melbourne_date+'/challenge.lock.json':' · No later challenger forecast backfilled')+'.';
 $('player-game').innerHTML=(lock.forecasts||[]).map(game=>'<option value="'+esc(game.game_id)+'">'+esc(matchName(game))+'</option>').join('');
 $('player-game').onchange=drawPlayers;
 selected=String(lock.forecasts[0]?.game_id||'');
 selectGame(selected);drawResults();
}
load().catch(error=>{ $('error').innerHTML='<div class="panel"><p class="callout">'+esc(error.message)+'</p><p class="muted">No forecast or result has been fabricated. Check the saved GitHub ledger.</p></div>';['game-selector','game-detail'].forEach(id=>$(id).textContent='Data unavailable'); });
})();