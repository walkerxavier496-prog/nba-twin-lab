/* My NBA — personal team/player gateway backed by existing followed items.
 * Real final results come from the immutable-sourced game dataset; NBA player
 * images use the right provider's ID (ESPN ID != NBA stats ID). */
(()=>{'use strict';
const $=id=>document.getElementById(id);
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const media=()=>window.NbaMedia;
const canonical=x=>window.TwinTeamPrefs?.canonical?.(x)||String(x||'').toUpperCase();
const logo=t=>media()?.image?.(t,{size:'large',label:t})||'<span>'+esc(t)+'</span>';
const fmt=x=>{const d=new Date(x);return Number.isFinite(d.getTime())?
 new Intl.DateTimeFormat('en-AU',{timeZone:'Australia/Melbourne',day:'numeric',month:'short'}).format(d):'—'};
const safe=x=>/^\d{1,15}$/.test(String(x||''))?String(x):null;
const imageFromESPN=id=>safe(id)?'https://a.espncdn.com/i/headshots/nba/players/full/'+encodeURIComponent(String(id))+'.png':null;
const key=name=>String(name||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
let games=[],players=[],sourceDate='',teamStats=new Map(),snapshot=null;
function derived(abbr){
 const code=canonical(abbr);
 const related=games.filter(g=>g.season===2027&&[canonical(g.home?.abbr),canonical(g.away?.abbr)].includes(code));
 const final=related.filter(g=>g.status==='final'&&Number.isFinite(g.homeScore)&&Number.isFinite(g.awayScore)).sort((a,b)=>Date.parse(a.date)-Date.parse(b.date));
 let w=0,l=0;
 for(const g of final){
  const own=canonical(g.home.abbr)===code?g.homeScore:g.awayScore,other=canonical(g.home.abbr)===code?g.awayScore:g.homeScore;
  if(own>other)w++;else l++;
 }
 const next=related.filter(g=>g.status==='scheduled'&&Date.parse(g.date)>Date.now()-900000).sort((a,b)=>Date.parse(a.date)-Date.parse(b.date))[0];
 return {w,l,next};
}
function findPlayer(p){
 const abbr=canonical(p.team);
 const name=key(p.name);
 const exact=(snapshot?.teams||[]).flatMap(t=>(t.rotation||[]).map(q=>({team:canonical(t.abbr),...q})))
  .find(q=>key(q.name)===name&&(!abbr||q.team===abbr));
 return exact||null;
}
function render(){
 const api=window.TwinWatchlist;if(!api)return;
 const saved=api.state(),names=window.TwinTeamPrefs?.names||{};
 if($('watchlist-status'))$('watchlist-status').textContent=
  saved.teams.length+' FOLLOWED TEAMS · '+saved.players.length+' FOLLOWED PLAYERS · Local to this browser · Game source '+(sourceDate||'not loaded');
 if($('watchlist-overview'))$('watchlist-overview').innerHTML=
  '<div><strong>'+saved.teams.length+'</strong><span>TEAMS FOLLOWED</span></div>'+
  '<div><strong>'+saved.players.length+'</strong><span>PLAYERS FOLLOWED</span></div>'+
  '<div><strong>'+saved.teams.reduce((total,t)=>total+derived(t).w,0)+'</strong><span>FOLLOWED TEAM WINS</span></div>';
 const teamMarkup=saved.teams.map((t,i)=>{
  const record=derived(t);
  const href='../team/?team='+encodeURIComponent(t);
  const next=record.next,opp=next?(canonical(next.home.abbr)===canonical(t)?next.away:next.home):null;
  return '<article class="watch-team-card"><a class="watch-team-main" href="'+href+'" aria-label="Open '+esc(names[t]||t)+' statistics, roster, results and schedule">'+
    '<span class="watch-logo">'+logo(t)+'</span><span class="watch-team-identity"><small>TEAM '+String(i+1).padStart(2,'0')+'</small>'+
    '<strong>'+esc(names[t]||t)+'</strong><span class="watch-team-record">'+record.w+'–'+record.l+' <i>· SEASON RECORD</i></span>'+
    '<span class="watch-next">'+(next?'NEXT · '+esc(fmt(next.date))+' vs '+esc(opp?.name||'TBA'):'VIEW FULL TEAM STATS')+'</span></span>'+
    '<span class="watch-open">↗</span></a>'+
    '<button type="button" class="watchlist-remove" data-watch-team="'+esc(t)+'" aria-label="Unfollow '+esc(names[t]||t)+'">★ FOLLOWING</button></article>';
 }).join('');
 $('watched-teams').innerHTML=teamMarkup||
  '<div class="watchlist-empty"><strong>YOUR TEAM COLLECTION IS EMPTY</strong><p>Follow a team from the standings and you’ll see its next fixtures, season record and team profile here.</p><a href="../league/">EXPLORE NBA TEAMS ↗</a></div>';
 const playerMarkup=saved.players.map(p=>{
  const matched=findPlayer(p);
  const id=safe(p.id),nbaId=safe(matched?.player_id);
  // Follow buttons on the live ESPN box scores save ESPN athlete IDs.
  // The matching NBA snapshot uses DIFFERENT NBA athlete IDs.
  const pic=(id?imageFromESPN(id):null)||(nbaId?media()?.headshot?.(nbaId):null);
  const team=canonical(p.team)||matched?.team||'';
  const href=matched?
   '../team/?team='+encodeURIComponent(matched.team)+'&player='+encodeURIComponent(matched.player_id)+'#team-player-profile':
   '../player/?id='+encodeURIComponent(id||'')+'&name='+encodeURIComponent(p.name)+'&team='+encodeURIComponent(team);
  return '<article class="watch-player-card"><a class="watch-player-main" href="'+href+'" aria-label="Open '+esc(p.name)+' player profile">'+
   '<div class="watch-player-art"><span class="watch-player-initial">'+esc(p.name.slice(0,1))+'</span>'+
   (pic?'<img src="'+esc(pic)+'" alt="Portrait of '+esc(p.name)+'" loading="lazy" onerror="this.style.display=\'none\'">':'')+'</div>'+
   '<div class="watch-player-data"><small>PLAYER SPOTLIGHT · '+esc(team)+'</small><strong>'+esc(p.name)+'</strong>'+
   '<span>'+(matched?esc((matched.stats_if_play?.points||0).toFixed(1))+' projected PTS · '+esc((matched.stats_if_play?.rebounds||0).toFixed(1))+' REB (if playing)':'OPEN PLAYER PROFILE')+'</span>'+
   '<b>EXPLORE PLAYER ↗</b></div></a>'+
   '<button type="button" class="watchlist-remove" data-watch-player="'+esc(id||'')+'" data-watch-name="'+esc(p.name)+'" data-watch-player-team="'+esc(team)+'" aria-label="Unfollow '+esc(p.name)+'">★ FOLLOWING</button></article>';
 }).join('');
 $('watched-players').innerHTML=playerMarkup||
   '<div class="watchlist-empty"><strong>BUILD YOUR PLAYER COLLECTION</strong><p>Follow players from live game box scores and view their individual performance information.</p><a href="../#live-player-stats">FIND NBA PLAYERS ↗</a></div>';
 if($('watchlist-spotlight'))$('watchlist-spotlight').innerHTML=saved.teams.length?
  '<div class="watch-spotlight-logos">'+saved.teams.slice(0,4).map(t=>'<a href="../team/?team='+encodeURIComponent(t)+'" aria-label="View '+esc(names[t]||t)+'">'+logo(t)+'</a>').join('')+'</div>'+
  '<p>YOUR TEAMS. YOUR NBA.</p><strong>One dashboard. Every matchup.</strong><small>Explore squads, recent games, next fixtures and player performance without leaving Twin Lab.</small>'+
  '<a class="watch-spotlight-action" href="../team/?team='+encodeURIComponent(saved.teams[0])+'">EXPLORE '+esc(names[saved.teams[0]]||saved.teams[0]).toUpperCase()+' ↗</a>':
  '<p>FOLLOW THE GAME</p><strong>Build your own NBA universe.</strong><small>Select a team from the ladder to unlock your personalised dashboard.</small>'+
  '<a class="watch-spotlight-action" href="../league/">FIND A TEAM ↗</a>';
 api.sync();
}
async function load(){
 const results=await Promise.allSettled([
   fetch('../data/games.json',{cache:'no-store'}).then(r=>r.ok?r.json():Promise.reject(Error('games source unavailable'))),
   fetch('../data/v7-current.json',{cache:'no-store'}).then(r=>r.ok?r.json():Promise.reject(Error('player snapshot unavailable')))
 ]);
 if(results[0].status==='fulfilled'){games=results[0].value.games||[];sourceDate=String(results[0].value.built_at_utc||'').slice(0,10);}
 if(results[1].status==='fulfilled')snapshot=results[1].value;
 render();
}
document.addEventListener('twinlab:watchlistchange',render);
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{render();load()},{once:true});else{render();load();}
})();