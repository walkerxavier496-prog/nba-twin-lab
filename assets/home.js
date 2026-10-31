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
const teamImage=(team,size='large')=>media?.image?.(team.abbr,{size,label:team.abbr})||
 '<span class="club-mark'+(size==='large'?' club-mark--large':'')+'" data-team="'+esc(team.abbr)+'">'+esc(team.abbr)+'</span>';
const club=(team,isHome=false)=>'<div class="sports-club'+(isHome?' sports-club--home':'')+'">'+teamImage(team)+
 '<span><b class="sports-club__name">'+esc(team.abbr)+'</b><small class="sports-club__city">'+esc(team.name)+'</small></span></div>';
async function json(url){const r=await fetch(url,{cache:'no-store'});if(!r.ok)throw Error('HTTP '+r.status);return await r.json()}
let archive=null,liveFeed=null;
function matchingForecast(game){
 return archive?.lock.forecasts?.find(g=>String(g.game_id)===String(game.id))||null;
}
function gameLink(game){return './game/?id='+encodeURIComponent(String(game.game_id||game.id))}
function statusOf(g){
 if(!g)return {text:'SCORE UNAVAILABLE',kind:'unavailable'};
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
 const matchId=String(game.game_id||game.id);
 const href=gameLink(game);
 const when=fmt(usableTime(game.tip_utc,game.date,meta.s?.date));
 const out='<div class="home-game__versus">AT</div>'; // Locked picks only; real results live above.
 return '<a class="home-game" href="'+href+'" aria-label="'+esc(teamAway.name)+' at '+esc(teamHome.name)+'">'+
  '<div class="home-game__top"><span>'+esc(when)+'</span><span class="game-status">PRETIP LOCK</span></div>'+
  '<div class="home-game__teams">'+teamImage(teamAway,'small')+out+teamImage(teamHome,'small')+'</div>'+
  '<div class="home-game__foot">'+(p?'<span>ELO PICK <strong>'+esc(p.winner)+'</strong></span><strong>'+pct(p.winner_probability)+'</strong>':'<span>NO VERIFIED PREGAME LOCK</span>')+'</div></a>';
}
function candidateGames(){
 if(!archive&&!liveFeed)return [];
 const live=liveFeed?.games||[];
 // Show today's NBA games as returned by the real scoreboard, even if the last
 // forecast lock is from an earlier date. Never show an archived lock as today.
 if(live.length)return live.map(g=>matchingForecast(g)||g);
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
  box.innerHTML='<div class="feature-confidence__quiet">PREGAME ELO: '+pct(p.winner_probability)+' · historical rating baseline; verified injury and rotation inputs are missing.</div>';
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
 if(!archive&&!liveFeed)return;
 const games=candidateGames();
 const source='ARCHIVED PREGAME FORECASTS · Actual live NBA scores and player box scores appear in the game centre above.';
 show('scoreboard-source',source);
 if($('home-games'))$('home-games').innerHTML=games.length?games.map(gameTile).join(''):
 '<p>NBA scoreboard is unavailable. The site will not invent game scores.</p>';
 if($('home-ticker'))$('home-ticker').innerHTML=games.map(game=>{
  const meta=observedScore(game),p=game.primary_forecast,link=gameLink(game);
  const label=meta.actual?meta.state.text:p?'LOCKED PRETIP':'SCHEDULED';
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
 // Prefer a genuine active NBA game, then an upcoming game, then a final.
 const chosen=games.find(g=>observed(g)?.phase==='live')||
    games.find(g=>(new Date(g.tip_utc||g.date)).getTime()>Date.now())||games[0];
 if(!chosen)return;
 const prediction=chosen.primary_forecast,meta=observedScore(chosen),detail=meta.actual?
   meta.state.text+' · '+chosen.away.abbr+' '+meta.s.away.score+' – '+chosen.home.abbr+' '+meta.s.home.score+
   ' · ESPN SCORE (NOT A PREDICTION)':
   prediction?'LOCKED ELO FORECAST · '+prediction.winner+' '+pct(prediction.winner_probability)+' · '+fmt(chosen.tip_utc):
    'No locked prediction for this matchup; score data is separate.';
 show('feature-tip',meta.state.text+' · '+fmt(chosen.tip_utc||chosen.date));
 if($('featured-game'))$('featured-game').innerHTML=
  club(chosen.away)+
  '<div class="sports-scorebug__vs">AT<div class="sports-pick"><small>'+(meta.actual?'ESPN '+(meta.s.phase==='final'?'FINAL':'LIVE SCORE'):prediction?'ELO PICK':'SCHEDULED')+'</small><strong>'+esc(meta.actual?meta.s.away.score+'–'+meta.s.home.score:prediction?prediction.winner:'VS')+'</strong><em>'+esc(meta.actual?meta.state.text:prediction?pct(prediction.winner_probability):'')+'</em></div></div>'+
  club(chosen.home,true);
 show('feature-detail',detail);
 if($('feature-game-link'))$('feature-game-link').href=gameLink(chosen);
 // Headshots must be from the exact game in the frozen forecast. No unrelated
 // old team photographs or NBA-cup/Team-USA visual claims.
 showModelDisagreement(chosen);
 if(prediction)playerSpotlight(chosen);
 else if($('feature-players'))$('feature-players').innerHTML='<p class="small-note">No pregame player forecast is locked for this matchup.</p>';
}
async function refresh(){
 if(!scores?.fetchDate||!scores?.usDate)return;
 try{
   const currentDate=scores.usDate(new Date());
   const feed=await scores.fetchDate(currentDate);
   if(!Array.isArray(feed.games)||feed.games.length===0)throw Error('No games returned');
   liveFeed=feed;
   window.NbaLiveDesk?.setFeed?.(feed);
 }catch(error){liveFeed=null;window.NbaLiveDesk?.unavailable?.();}
 render();
}
async function init(){
 const [led,report]=await Promise.allSettled([json('./data/audit-ledger.json'),json('./data/five-model-report.json')]);
 if(report.status==='fulfilled'&&Number.isFinite(report.value.common_evaluation?.games))show('home-backtest',report.value.common_evaluation.games.toLocaleString('en-AU')+' games');
 if(led.status==='fulfilled'){
   const entries=(led.value.entries||[]).filter(e=>e.lock_path).sort((a,b)=>String(b.melbourne_date).localeCompare(String(a.melbourne_date)));
   show('home-locked',String(entries.length));
   if(entries.length){
     show('home-date',entries[0].melbourne_date);
     try{
       const lock=await json('./'+entries[0].lock_path);
       if(lock.scope?.melbourne_date===entries[0].melbourne_date&&Date.parse(lock.locked_at_utc)<Date.parse(lock.scope.first_tip_utc)){
        archive={entry:entries[0],lock,sidecar:null};
        const count=(lock.forecasts||[]).reduce((total,g)=>total+(Array.isArray(g.v9_player_projections)?g.v9_player_projections.length:0),0);
        if(count>0)show('home-projections',count.toLocaleString('en-AU'));

        try{
          const dated=await json('./audit/supplements/'+entries[0].melbourne_date+'/challenge.lock.json');
          if(dated.original_forecast_sha256===entries[0].lock_sha256&&Date.parse(dated.locked_at_utc)<Date.parse(lock.scope.first_tip_utc))
            archive.sidecar=dated;
        }catch(error){/* no sidecar => no fabricated comparison */}
       }
     }catch(error){}
   }
 }
 render();
 await refresh();
 if(typeof setInterval==='function')setInterval(refresh,60000);
}
init().catch(()=>{show('scoreboard-source','Scoreboard unavailable — no live scores displayed');render()});
})();