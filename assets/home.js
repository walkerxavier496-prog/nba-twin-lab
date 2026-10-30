(()=>{'use strict';
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const show=(id,value)=>{if($(id))$(id).textContent=value};
const pct=value=>typeof value==='number'&&Number.isFinite(value)?(100*value).toFixed(1)+'%':'—';
const formatTime=value=>{const d=new Date(value);return Number.isNaN(d.getTime())?'Date unavailable':new Intl.DateTimeFormat('en-AU',{timeZone:'Australia/Melbourne',weekday:'short',day:'numeric',month:'short',hour:'numeric',minute:'2-digit'}).format(d)};
async function read(url){const r=await fetch(url,{cache:'no-store'});if(!r.ok)throw Error('HTTP '+r.status);return r.json()}
function club(team,isHome=false){
 return '<div class="sports-club'+(isHome?' sports-club--home':'')+'">'+
  '<span class="club-mark club-mark--large" data-team="'+esc(team.abbr)+'">'+esc(team.abbr)+'</span>'+
  '<span><b class="sports-club__name">'+esc(team.abbr)+'</b><small class="sports-club__city">'+esc(team.name)+'</small></span></div>';
}
function featured(entry,lock){
 if(!lock||lock.scope?.melbourne_date!==entry.melbourne_date||!Array.isArray(lock.forecasts)||!lock.forecasts.length)throw Error('No valid pregame slate');
 const cutoff=Date.parse(lock.scope.first_tip_utc),locked=Date.parse(lock.locked_at_utc);
 if(!Number.isFinite(cutoff)||!Number.isFinite(locked)||locked>=cutoff)throw Error('Snapshot cannot be confirmed as pretip');
 const now=Date.now();
 const upcoming=lock.forecasts.find(game=>Date.parse(game.tip_utc)>now);
 const game=upcoming||lock.forecasts[0],primary=game.primary_forecast;
 if(!primary||!Number.isFinite(primary.winner_probability))throw Error('Missing verified Elo forecast');
 const label=Date.parse(game.tip_utc)>now?'UPCOMING · LOCKED':'ARCHIVED PREGAME LOCK';
 if($('feature-tip'))$('feature-tip').textContent=label+' · '+formatTime(game.tip_utc);
 if($('featured-game'))$('featured-game').innerHTML=
   club(game.away)+
   '<div class="sports-scorebug__vs"><span>AT</span><div class="sports-pick"><small>ELO PICK</small><strong>'+esc(primary.winner)+'</strong><em>'+pct(primary.winner_probability)+'</em></div></div>'+
   club(game.home,true);
 const scores=primary.projected_score;
 show('feature-detail','PRODUCTION ELO · '+(scores&&Number.isFinite(scores.away)&&Number.isFinite(scores.home)?
  'PROJECTED '+game.away.abbr+' '+Math.round(scores.away)+' – '+game.home.abbr+' '+Math.round(scores.home)+' · ':'')+
  'LOCKED '+formatTime(lock.locked_at_utc));
 if($('home-ticker'))$('home-ticker').innerHTML=lock.forecasts.map(game=>{
  const p=game.primary_forecast;
  return '<a class="court-ticker__item" href="./challenge/daily.html?game='+encodeURIComponent(game.game_id)+'#matchups" aria-label="'+esc(game.away.name+' at '+game.home.name+' locked forecast')+'">'+
    '<b>'+esc(game.away.abbr)+'</b><small>AT</small><b>'+esc(game.home.abbr)+'</b><small>ELO '+esc(p.winner)+' '+pct(p.winner_probability)+'</small></a>';
 }).join('');
}
Promise.allSettled([
 read('./data/audit-ledger.json'),
 read('./data/five-model-report.json')
]).then(async([ledgerResult,reportResult])=>{
 if(ledgerResult.status==='fulfilled'&&Array.isArray(ledgerResult.value.entries)){
  const entries=ledgerResult.value.entries.filter(e=>e.lock_path).sort((a,b)=>String(b.melbourne_date).localeCompare(String(a.melbourne_date)));
  show('home-locked',String(entries.length));
  if(entries.length){
   show('home-date',entries[0].melbourne_date);
   try{featured(entries[0],await read('./'+entries[0].lock_path))}
   catch(e){if($('featured-game'))$('featured-game').textContent='Verified game-night forecasts are unavailable right now.';
     if($('home-ticker'))$('home-ticker').textContent='No validated pregame predictions to show.';}
  }
 }
 if(reportResult.status==='fulfilled'&&Number.isFinite(reportResult.value.common_evaluation?.games))
  show('home-backtest',reportResult.value.common_evaluation.games.toLocaleString('en-AU')+' games');
}).catch(e=>{if($('home-ticker'))$('home-ticker').textContent='Unable to read the saved game slate.';});
})();