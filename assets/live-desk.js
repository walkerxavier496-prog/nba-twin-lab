/* NBA Twin Lab Live Desk — independent actual game data, not model projections.
 * ESPN public unofficial summary provides player boxscores and play by play.
 * Alerts are opt-in while page is open; no push/background delivery.
 */
(()=>{'use strict';
const BASE='https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=';
const $=id=>document.getElementById(id);
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const numeric=x=>x!==null&&x!==undefined&&String(x).trim()!==''&&Number.isFinite(Number(x))?Number(x):null;
const valid=id=>/^\d{7,10}$/.test(String(id||''));
const fmtTime=x=>{const d=new Date(x);return Number.isFinite(d.getTime())?new Intl.DateTimeFormat('en-AU',{timeZone:'Australia/Melbourne',weekday:'short',day:'numeric',month:'short',hour:'numeric',minute:'2-digit'}).format(d):'Time unavailable'};
const logo=team=>window.NbaMedia?.image?.(team.abbr,{size:'small',label:team.abbr})||'<b>'+esc(team.abbr)+'</b>';
const status=g=>g.phase==='live'?(window.NbaScores?.label?.(g)||'LIVE'):g.phase==='final'?'FINAL':'UPCOMING';
const gameHref=id=>{const segment=String(window.location?.pathname||'').includes('/challenge/')?'../game/':'./game/';return segment+'?id='+encodeURIComponent(String(id))};
// "My teams" uses the actual followed teams first. Retain a legacy saved
// preferred team only when no clubs have been followed yet (no data loss).
const followedTeams=()=>{const followed=window.TwinWatchlist?.state?.().teams||[];
 const legacy=window.TwinTeamPrefs?.get?.();
 return followed.length?followed:legacy?[legacy]:[];
};
const favourite=g=>{const teams=followedTeams();
 const normal=code=>window.TwinTeamPrefs?.canonical?.(code)||code;
 return teams.some(t=>normal(t)===normal(g.home.abbr)||normal(t)===normal(g.away.abbr));
};
function parseBoxscore(raw){
 const groups=raw?.boxscore?.players;
 if(!Array.isArray(groups))return [];
 const players=[];
 for(const group of groups){
  const team=String(group.team?.abbreviation||group.team?.shortDisplayName||'');
  for(const statGroup of group.statistics||[]){
   const columns=statGroup.labels||statGroup.names||[],idx=k=>columns.findIndex(x=>String(x).toUpperCase()===k);
   for(const entry of statGroup.athletes||[]){
    const athlete=entry.athlete||{},stats=entry.stats||[],col=k=>{const i=idx(k);return i<0?null:stats[i]};
    if(entry.didNotPlay===true||entry.dnp===true||entry.active===false&&entry.didNotPlay)continue;
    const id=String(athlete.id||''),name=String(athlete.displayName||athlete.fullName||'');
    if(!name)continue;
    const pts=numeric(col('PTS')),reb=numeric(col('REB')),ast=numeric(col('AST')),min=col('MIN');
    if(pts===null&&reb===null&&ast===null)continue;
    const threes=col('3PT')??col('3PM-A')??col('3FG');
    const three=numeric(String(threes??'').split('-')[0]);
    players.push({id,name,team,pts,reb,ast,three,minutes:min==null?'—':String(min)});
   }
  }
 }
 return players.sort((a,b)=>(b.pts??-1)-(a.pts??-1));
}
function extractPlays(raw){
 const plays=Array.isArray(raw?.plays)?raw.plays:
  Array.isArray(raw?.scoringPlays)?raw.scoringPlays:[];
 return plays.map((p,i)=>{
  const desc=String(p.text||p.description||p.type?.text||'').trim();
  const id=String(p.id||p.sequenceNumber||[p.period?.number||'',p.clock?.displayValue||'',desc,i].join(':'));
  return {id,desc,period:p.period?.number||p.period,clock:String(p.clock?.displayValue||p.clock||''),
   home:numeric(p.homeScore),away:numeric(p.awayScore),scoring:p.scoringPlay===true};
 }).filter(p=>p.desc).slice(-120);
}
function highlight(p){
 const s=p.desc.toLowerCase();
 const matches=[['BUZZER BEATER',/buzzer.beat|buzzer.beater|at the buzzer/],['DUNK',/dunk/],['ALLEY-OOP',/alley.oop/],
  ['THREE POINTER',/makes? (?:a )?(?:\d+-foot )?three.point|makes? 3.pt|makes? 3.pointer|hits? (?:a )?three/],
  ['BLOCK',/blocks? (?:the )?.*shot|blocked shot/]];
 for(const [label,re]of matches)if(re.test(s))return label;
 return null;
}
async function fetchSummary(id,{fetchImpl=fetch}={}){
 if(!valid(id))throw Error('Invalid game ID');
 const response=await fetchImpl(BASE+encodeURIComponent(String(id)),{cache:'no-store',headers:{Accept:'application/json'}});
 if(!response.ok)throw Error('ESPN box score not available (HTTP '+response.status+')');
 const raw=await response.json();
 if(!raw||(!raw.boxscore&&!raw.plays&&!raw.scoringPlays))throw Error('No verified box score or play data available');
 return {players:window.TwinBoxscorePlus?.parseBoxscore?.(raw)||parseBoxscore(raw),plays:extractPlays(raw),source:'ESPN game summary',checkedAt:new Date().toISOString()};
}
const mounted=!!$('live-game-list');
let feed=null,selected=null,gameFilter='all',sortStat='pts',summaryCache=new Map(),lastLoaded=null,request=0,batchRequest=0,alerts=false,permission='default',sortDescending=true;
const seen=new Map(),messages=[];
function setMessage(str){const n=$('live-desk-status');if(n)n.textContent=str}
function selectedGame(){return feed?.games?.find(g=>String(g.id)===String(selected))||null}
const filteredGames=()=> (feed?.games||[]).filter(g=>gameFilter==='all'||gameFilter==='mine'&&favourite(g)||gameFilter==='live'&&g.phase==='live'||gameFilter==='final'&&g.phase==='final');
function keepVisibleSelection(){
 const visible=filteredGames();
 if(!visible.some(g=>String(g.id)===String(selected))){
  selected=visible[0]?.id||null;lastLoaded=null;request++;
 }
 if(!selected){
  if($('desk-matchup'))$('desk-matchup').textContent='No games in this filter';
  if($('live-stats-rows'))$('live-stats-rows').innerHTML='<tr><td colspan="6">Choose another game filter to see actual player statistics.</td></tr>';
  if($('live-plays'))$('live-plays').innerHTML='<li>Nothing to show for this filter.</li>';
 }
}
function showGames(){
 if(!$('live-game-list'))return;
 const all=feed?.games||[];
 const filtered=filteredGames();
 $('live-game-list').innerHTML=filtered.length?filtered.map(g=>{
  const s=g.phase==='live'?'LIVE':g.phase==='final'?'FINAL':'UPCOMING';
  const points=g.phase==='scheduled'?'<span class="desk-time">'+esc(fmtTime(g.date))+'</span>':
   '<span class="desk-points">'+(g.away.score??'—')+' : '+(g.home.score??'—')+'</span>';
  return '<a class="desk-game '+(String(g.id)===String(selected)?'selected':'')+'" href="'+esc(gameHref(g.id))+'" aria-label="Open game centre for '+esc(g.away.abbr)+' at '+esc(g.home.abbr)+'" data-live-game="'+esc(g.id)+'">'+
  '<span class="desk-game-head"><span class="desk-status desk-status-'+(g.phase||'scheduled')+'">'+s+'</span><span>'+esc(status(g))+'</span></span>'+
  '<span class="desk-game-teams">'+logo(g.away)+'<strong>'+esc(g.away.abbr)+'</strong>'+points+'<strong>'+esc(g.home.abbr)+'</strong>'+logo(g.home)+'</span><span class="desk-game-open">OPEN GAME CENTRE ↗</span></a>';
 }).join(''):'<p class="desk-empty">'+(gameFilter==='mine'&&!followedTeams().length?
    'No teams followed yet. <a href="'+(String(window.location?.pathname||'').includes('/challenge/')?'../':'./')+'watchlist/">Manage followed teams</a> to customise this filter.':
    'No games match this filter.')+'</p>';
 // Game card links open the dedicated game centre; inline stats default to the selected game.
 if($('desk-counts'))$('desk-counts').textContent=all.filter(g=>g.phase==='live').length+' LIVE · '+all.filter(g=>g.phase==='final').length+' FINAL · '+all.filter(g=>g.phase==='scheduled').length+' UPCOMING';
}
function sortable(rows){
 const key=sortStat,desc=sortDescending;
 return rows.slice().sort((a,b)=>{
  if(key==='name')return (desc?-1:1)*a.name.localeCompare(b.name);
  const x=Number.isFinite(a[key])?a[key]:null,y=Number.isFinite(b[key])?b[key]:null;
  if(x===null)return y===null?a.name.localeCompare(b.name):1;
  if(y===null)return -1;
  return (desc?-1:1)*(x-y)||a.name.localeCompare(b.name);
 });
}
function fmt(v,suffix=''){return typeof v==='number'&&Number.isFinite(v)?String(v)+suffix:'—'}
function renderSummary(){
 const active=filteredGames().filter(g=>g.phase!=='scheduled');
 const rows=sortable(active.flatMap(g=>(summaryCache.get(String(g.id))?.players||[]).map(p=>({...p,gameId:g.id,matchup:g.away.abbr+' @ '+g.home.abbr}))));
 const title=$('desk-matchup'),content=$('live-stats-rows');
 if(title)title.textContent=gameFilter==='all'?'ALL GAMES · TODAY’S STANDOUTS':gameFilter==='live'?'LIVE GAMES · PLAYER LEADERS':gameFilter==='final'?'FINAL GAMES · PLAYER LEADERS':gameFilter==='mine'?'FOLLOWED TEAMS · GAME LEADERS':'PLAYER STATS';
 if($('desk-game-source'))$('desk-game-source').textContent='ESPN public game summaries · '+summaryCache.size+' available box scores · FPTS ESPN default format';
 if($('desk-sort-help'))$('desk-sort-help').textContent='Sort: '+sortStat.toUpperCase()+(sortDescending?' ↓':' ↑')+' · '+active.length+' matchups · scroll horizontally on mobile';
 if(content)content.innerHTML=rows.length?rows.map(p=>{
  const img=p.id&&/^\d+$/.test(p.id)?'<img src="https://a.espncdn.com/i/headshots/nba/players/full/'+encodeURIComponent(p.id)+'.png" alt="" loading="lazy" onerror="this.style.display=\'none\'">':'';
  const cols=['<span class="desk-player">'+img+'<span><b>'+esc(p.name)+'</b><small>'+esc(p.team)+' · '+esc(p.matchup)+'</small></span></span>'+(p.id&&/^\d+$/.test(p.id)?'<button type="button" class="watch-player-btn" data-watch-player="'+esc(p.id)+'" data-watch-name="'+esc(p.name)+'" data-watch-player-team="'+esc(p.team)+'">+ Follow</button>':''),
   esc(p.minutes??'—'),fmt(p.pts),fmt(p.reb),fmt(p.ast),fmt(p.three),fmt(p.stl),fmt(p.blk),fmt(p.tov),
   fmt(p.fgPct,'%'),fmt(p.ftPct,'%'),fmt(p.plusMinus),fmt(p.fpts)];
  return '<tr>'+cols.map((v,i)=>'<td'+(i===12?' class="desk-fpts"':'')+'>'+v+'</td>').join('')+'</tr>';
 }).join(''):'<tr><td colspan="13">Loading verified player box scores across this filter; no projected statistics are shown.</td></tr>';
 window.TwinWatchlist?.sync?.();
 const target=$('desk-top-performers');
 if(target){
  const scorers=rows.slice().sort((a,b)=>(b.pts??-1)-(a.pts??-1)).slice(0,5);
  target.innerHTML=scorers.length?'<div class="desk-top-title"><b>TODAY’S TOP SCORERS</b><small>Single-game standouts, not multi-game streaks</small></div><div class="desk-performance-list">'+scorers.map((p,i)=>
   '<a href="'+esc(gameHref(p.gameId))+'" class="desk-performance"><b>#'+(i+1)+'</b><span><strong>'+esc(p.name)+'</strong><small>'+esc(p.team)+' · '+esc(p.matchup)+'</small></span><em>'+fmt(p.pts)+' PTS</em>'+
   '<small class="desk-hot-tag">'+esc(window.TwinBoxscorePlus?.performanceTag?.(p)||'GAME LEADER')+'</small></a>').join('')+'</div>':
   '<p>No verified performances are available for these games yet.</p>';
 }
 const g=selectedGame();
 if($('live-plays'))$('live-plays').innerHTML=lastLoaded?.id===String(g?.id)&&lastLoaded.plays.length?
  lastLoaded.plays.slice(-8).reverse().map(p=>'<li><small>'+esc(String(p.period||'?'))+'Q '+esc(p.clock)+'</small><span>'+esc(p.desc)+'</span></li>').join(''):'<li>Verified play-by-play appears as published by ESPN.</li>';
}
function sendAlerts(game,plays){
 const ids=new Set(plays.map(p=>p.id)),past=seen.get(String(game.id));
 if(past&&alerts&&game.phase==='live'){
  const fresh=plays.filter(p=>!past.has(p.id)&&highlight(p));
  for(const p of fresh.slice(-2)){
   const name=highlight(p),msg=name+': '+p.desc;
   messages.unshift(msg);messages.splice(6);
   if(typeof Notification!=='undefined'&&Notification.permission==='granted'){
    try{new Notification(game.away.abbr+' @ '+game.home.abbr+' · '+name,{body:p.desc,tag:'twinlab-play-'+game.id+'-'+p.id})}catch(e){}
   }
  }
 }
 seen.set(String(game.id),ids);
 if($('live-alert-feed'))$('live-alert-feed').innerHTML=messages.length?
  messages.map(m=>'<li>'+esc(m)+'</li>').join(''):'<li>'+(alerts?'Watching the selected game for verified dunks, threes, blocks and buzzer plays.':'Highlight alerts are off. Enable them to monitor the selected game while this page is open.')+'</li>';
}
async function loadSelected(){
 const g=selectedGame();if(!g)return;
 renderSummary();
 if(g.phase==='scheduled'){lastLoaded=null;renderSummary();setMessage('UPCOMING · no actual player stats before tipoff');return}
 const token=++request;
 setMessage('Loading actual player box score…');
 try{
  const result=await fetchSummary(g.id);
  if(token!==request)return;
  lastLoaded={id:String(g.id),...result};summaryCache.set(String(g.id),lastLoaded);
  sendAlerts(g,result.plays);
  setMessage('ESPN player box score · refreshed '+fmtTime(result.checkedAt));
  renderSummary();
 }catch(e){
  if(token!==request)return;
  lastLoaded=null;setMessage(e.message+' · no statistics invented');renderSummary();
 }
}
async function loadBatch(){
 const current=++batchRequest,eligible=filteredGames().filter(g=>g.phase!=='scheduled');
 if(!eligible.length){renderSummary();return}
 let next=0,ok=0,failed=0;
 async function worker(){
  while(next<eligible.length&&current===batchRequest){
   const game=eligible[next++],key=String(game.id),cached=summaryCache.get(key);
   if(cached&&Date.now()-Date.parse(cached.checkedAt)<45000){ok++;continue}
   try{
    const fresh=await fetchSummary(key);
    if(current!==batchRequest)return;
    summaryCache.set(key,{id:key,...fresh});
    ok++;
   }catch(e){failed++;summaryCache.delete(key)}
   if(current===batchRequest)renderSummary();
  }
 }
 await Promise.all(Array.from({length:Math.min(3,eligible.length)},worker));
 if(current!==batchRequest)return;
 renderSummary();
 setMessage('ESPN actual box scores: '+ok+'/'+eligible.length+' games checked'+(failed?' · '+failed+' unavailable':'')+'.');
}
function selectGame(id){
 if(!feed?.games?.some(g=>String(g.id)===String(id)))return;
 if(String(selected)!==String(id)){selected=String(id);lastLoaded=null;request++}
 showGames();loadSelected();
}
function setFeed(value){
 if(!value||!Array.isArray(value.games))return;
 feed={...value,games:value.games.slice().sort((a,b)=>{
  const order=g=>g.phase==='live'?0:g.phase==='scheduled'?1:2;
  return order(a)-order(b)||Date.parse(a.date)-Date.parse(b.date);
 })};
 const current=selectedGame();
 if(!current){
  const fav=feed.games.filter(g=>favourite(g));
  const prefer=feed.games.find(g=>g.phase==='live'&&favourite(g))||feed.games.find(g=>g.phase==='live')||
  fav[0]||feed.games.find(g=>g.phase==='scheduled')||feed.games[0];
  selected=prefer?.id||null;
 }
 const freshness=Number.isFinite(Date.parse(feed.fetched_at_utc))?fmtTime(feed.fetched_at_utc):'checked just now';
 if($('live-feed-freshness'))$('live-feed-freshness').textContent='ESPN scoreboard · checked '+freshness+' · automatic refresh';
 keepVisibleSelection();showGames();loadSelected();loadBatch();
}
function unavailable(){
 feed=null;lastLoaded=null;request++;batchRequest++;summaryCache.clear();
 if($('live-game-list'))$('live-game-list').innerHTML='<p class="desk-empty">ESPN live scoreboard unavailable. No scores or player stats are being guessed.</p>';
 if($('live-feed-freshness'))$('live-feed-freshness').textContent='ESPN unavailable · no live claim';
 if($('live-stats-rows'))$('live-stats-rows').innerHTML='<tr><td colspan="6">Live player data unavailable.</td></tr>';
 if($('desk-top-performers'))$('desk-top-performers').innerHTML='<p>Verified player data unavailable.</p>';
 setMessage('Live data currently unavailable');
}
function init(){
 if(!mounted)return;
 for(const button of document.querySelectorAll('[data-desk-filter]'))
  button.addEventListener('click',()=>{gameFilter=button.dataset.deskFilter;for(const b of document.querySelectorAll('[data-desk-filter]')){const active=b===button;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active))}keepVisibleSelection();showGames();loadSelected();loadBatch()});
 if($('live-sort'))$('live-sort').addEventListener('change',e=>{sortStat=e.target.value;sortDescending=true;renderSummary()});
 for(const b of document.querySelectorAll('[data-stat-sort]'))b.addEventListener('click',()=>{const key=b.dataset.statSort;sortDescending=sortStat===key?!sortDescending:true;sortStat=key;if($('live-sort'))$('live-sort').value=key;renderSummary()});
 const alertsButton=$('live-alerts-toggle');
 if(alertsButton)alertsButton.addEventListener('click',async()=>{
  if(alerts){alerts=false;alertsButton.textContent='Enable highlight alerts';alertsButton.setAttribute('aria-pressed','false');return}
  alerts=true;alertsButton.setAttribute('aria-pressed','true');alertsButton.textContent='Highlight alerts on';
  if(typeof Notification!=='undefined'&&Notification.permission==='default'){
   try{permission=await Notification.requestPermission()}catch(e){permission='denied'}
  }else permission=typeof Notification!=='undefined'?Notification.permission:'unsupported';
  if($('live-alert-note'))$('live-alert-note').textContent=permission==='granted'?'Desktop notifications enabled for new highlighted plays in the selected game while this page is open.':'In-page alerts for the selected game are enabled; system notifications unavailable or not permitted.';
 });
 document.addEventListener('twinlab:teamchange',()=>{keepVisibleSelection();showGames();loadSelected();loadBatch()});
 document.addEventListener('twinlab:watchlistchange',()=>{keepVisibleSelection();showGames();loadSelected();loadBatch()});
}
init();
window.NbaLiveDesk=Object.freeze({setFeed,unavailable,selectGame,parseBoxscore,extractPlays,highlight,fetchSummary});
})();