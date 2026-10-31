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
const dateLabel=key=>/^\d{8}$/.test(String(key))?new Intl.DateTimeFormat('en-AU',{timeZone:'Australia/Melbourne',weekday:'short',day:'numeric',month:'short',year:'numeric'}).format(new Date(Date.UTC(Number(key.slice(0,4)),Number(key.slice(4,6))-1,Number(key.slice(6,8)),12))):'selected date';
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
let performanceGame='all',performanceTeam='all',performanceType='all',history=null;
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
 const liveCount=all.filter(g=>g.phase==='live').length,finalCount=all.filter(g=>g.phase==='final').length,upcomingCount=all.filter(g=>g.phase==='scheduled').length;
 const empty=!all.length&&feed?.partial?'ESPN returned only one of the two required US date buckets. Results may be incomplete, so no scores are being guessed.':
    gameFilter==='mine'&&!followedTeams().length?
    'No teams followed yet. <a href="'+(String(window.location?.pathname||'').includes('/challenge/')?'../':'./')+'watchlist/">Manage followed teams</a> to customise this filter.':
    gameFilter==='live'&&finalCount?'No games are live right now. '+finalCount+' completed game'+(finalCount===1?' is':'s are')+' available under Final.':
    gameFilter==='live'?'No games are live right now for this Melbourne date. Upcoming and final games remain available in their filters.':
    gameFilter==='final'&&upcomingCount?'No final results yet for this Melbourne date. '+upcomingCount+' game'+(upcomingCount===1?' is':'s are')+' still upcoming.':
    gameFilter==='final'?'No completed games were returned for this Melbourne date.':
    all.length?'No followed teams have a game on this Melbourne date.':
    'No NBA games were returned for '+esc(dateLabel(feed?.melbourne_date||feed?.date))+'. ESPN’s adjacent US date buckets were checked.';
 $('live-game-list').innerHTML=filtered.length?filtered.map(g=>{
  const s=g.phase==='live'?'LIVE':g.phase==='final'?'FINAL':'UPCOMING';
  const points=g.phase==='scheduled'?'<span class="desk-time">'+esc(fmtTime(g.date))+'</span>':
   '<span class="desk-points">'+(g.away.score??'—')+' : '+(g.home.score??'—')+'</span>';
  return '<a class="desk-game '+(String(g.id)===String(selected)?'selected':'')+'" href="'+esc(gameHref(g.id))+'" aria-label="Open game centre for '+esc(g.away.abbr)+' at '+esc(g.home.abbr)+'" data-live-game="'+esc(g.id)+'">'+
  '<span class="desk-game-head"><span class="desk-status desk-status-'+(g.phase||'scheduled')+'">'+s+'</span><span>'+esc(status(g))+'</span></span>'+
  '<span class="desk-game-teams">'+logo(g.away)+'<strong>'+esc(g.away.abbr)+'</strong>'+points+'<strong>'+esc(g.home.abbr)+'</strong>'+logo(g.home)+'</span><span class="desk-game-open">OPEN GAME CENTRE ↗</span></a>';
 }).join(''):'<p class="desk-empty">'+empty+'</p>';
 // Game card links open the dedicated game centre; inline stats default to the selected game.
 if($('desk-counts'))$('desk-counts').textContent=(feed?.partial?'PARTIAL · ':'')+liveCount+' LIVE · '+finalCount+' FINAL · '+upcomingCount+' UPCOMING';
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
const profileHref=p=>(String(window.location?.pathname||'').includes('/challenge/')?'../':'./')+'player/?id='+
 encodeURIComponent(String(p.id||''))+'&name='+encodeURIComponent(p.name)+'&team='+encodeURIComponent(p.team);
const performanceValue=(p,key)=>key==='stocks'?(numeric(p.stl)||0)+(numeric(p.blk)||0):numeric(p[key]);
function performanceList(rows,key,count=5){return rows.filter(p=>performanceValue(p,key)!==null).slice().sort((a,b)=>(performanceValue(b,key)??-1)-(performanceValue(a,key)??-1)).slice(0,count)}
function performanceCard(p,key,rank){
 const image=p.id&&/^\d+$/.test(p.id)?'<img src="https://a.espncdn.com/i/headshots/nba/players/full/'+encodeURIComponent(p.id)+'.png" alt="" loading="lazy" onerror="this.style.display=\'none\'">':'';
 const labels={pts:'PTS',reb:'REB',ast:'AST',three:'3PM',stocks:'STOCKS',fpts:'FPTS'};
 return '<a class="performance-rank-card" href="'+esc(profileHref(p))+'">'+image+'<span class="performance-rank">#'+rank+'</span><span><strong>'+esc(p.name)+'</strong><small>'+esc(p.team)+' · '+esc(p.matchup)+'</small></span><em>'+fmt(performanceValue(p,key))+' '+labels[key]+'</em></a>';
}
function historyPanel(rows){
 const available=(history?.players||[]).filter(player=>player.games?.length>=2&&rows.some(row=>String(row.id)&&String(row.id)===String(player.id))).slice().sort((a,b)=>(b.last5?.averages?.pts??-1)-(a.last5?.averages?.pts??-1)).slice(0,3);
 if(!available.length)return '<div class="performance-history-empty"><b>HOT STREAKS · VERIFIED FORM</b><span>Last-5 and last-10 charts appear after at least two append-only final-game records. No one-game sample is called a streak.</span></div>';
 return '<div class="performance-history"><div class="performance-board-title"><b>HOT STREAKS · VERIFIED FORM</b><small>Append-only final boxes · sample shown</small></div>'+available.map(player=>{
  const games=player.games.slice(0,5).reverse(),max=Math.max(1,...games.map(g=>numeric(g.pts)||0));
  return '<a href="'+esc(profileHref(player))+'"><strong>'+esc(player.name)+'</strong><span>LAST '+player.last5.games+' · '+fmt(player.last5.averages.pts)+' PPG</span><i class="performance-spark" aria-label="Recent points: '+esc(games.map(g=>g.pts).join(', '))+'">'+games.map(g=>'<b style="height:'+Math.max(8,(numeric(g.pts)||0)/max*100).toFixed(0)+'%"></b>').join('')+'</i></a>';
 }).join('')+'</div>';
}
function renderPerformanceCentre(rows){
 const target=$('desk-top-performers');if(!target)return;
 if(!rows.length){target.innerHTML='<p>No verified player performances are available for these filters yet. Live and incomplete boxes remain pending; no statistics are invented.</p>';return}
 const featured=performanceList(rows,'fpts',1)[0]||performanceList(rows,'pts',1)[0];
 const featuredTag=window.TwinBoxscorePlus?.performanceTag?.(featured)||'GAME STANDOUT';
 const categories={pts:'TOP SCORERS',fpts:'FANTASY KINGS',reb:'GLASS CLEANERS',ast:'PLAYMAKERS',three:'SNIPERS',stocks:'DEFENSIVE MONSTERS'};
 const selected=performanceType==='all'?Object.keys(categories):[performanceType];
 const milestones=rows.filter(p=>p.tripleDouble||p.doubleDouble||p.pts>=40||p.reb>=20||p.ast>=15||p.three>=7||(performanceValue(p,'stocks')||0)>=5).slice().sort((a,b)=>(b.fpts??b.pts??0)-(a.fpts??a.pts??0));
 const portrait=featured.id&&/^\d+$/.test(featured.id)?'<img src="https://a.espncdn.com/i/headshots/nba/players/full/'+encodeURIComponent(featured.id)+'.png" alt="" onerror="this.style.display=\'none\'">':'';
 target.innerHTML='<div class="performance-board-title"><span><b>PLAYER PERFORMANCE CENTRE</b><small>Actual ESPN box scores · refreshes as each game updates</small></span><span>FPTS: ESPN DEFAULT</span></div>'+
 '<a class="performance-night" href="'+esc(profileHref(featured))+'"><span class="performance-night-copy"><small>PERFORMANCE OF THE NIGHT</small><strong>'+esc(featured.name)+'</strong><span>'+esc(featured.team)+' · '+esc(featured.matchup)+'</span><em>'+esc(featuredTag)+'</em></span>'+portrait+
 '<span class="performance-night-stats">'+[['PTS',featured.pts],['REB',featured.reb],['AST',featured.ast],['3PM',featured.three],['FPTS',featured.fpts]].map(([label,value])=>'<b><small>'+label+'</small>'+fmt(value)+'</b>').join('')+'</span></a>'+
 '<div class="performance-category-grid">'+selected.map(key=>'<section><div class="performance-board-title"><b>'+categories[key]+'</b><small>Top '+Math.min(5,performanceList(rows,key).length)+'</small></div>'+performanceList(rows,key).map((p,i)=>performanceCard(p,key,i+1)).join('')+'</section>').join('')+'</div>'+
 '<div class="performance-milestones"><div class="performance-board-title"><b>MILESTONES & ACHIEVEMENTS</b><small>Thresholds from this game only</small></div>'+(milestones.length?milestones.slice(0,8).map(p=>'<a href="'+esc(profileHref(p))+'"><strong>'+esc(p.name)+'</strong><span>'+esc(window.TwinBoxscorePlus?.performanceTag?.(p)||((performanceValue(p,'stocks')||0)+' STOCKS'))+'</span></a>').join(''):'<p>No verified threshold achievement in the loaded boxes.</p>')+'</div>'+historyPanel(rows);
}
function renderSummary(){
 const active=filteredGames().filter(g=>g.phase!=='scheduled');
 const allRows=active.flatMap(g=>(summaryCache.get(String(g.id))?.players||[]).map(p=>({...p,stocks:(numeric(p.stl)||0)+(numeric(p.blk)||0),gameId:g.id,matchup:g.away.abbr+' @ '+g.home.abbr})));
 const rows=sortable(allRows.filter(p=>(performanceGame==='all'||String(p.gameId)===performanceGame)&&(performanceTeam==='all'||p.team===performanceTeam)));
 const title=$('desk-matchup'),content=$('live-stats-rows');
 if(title)title.textContent=gameFilter==='all'?'GAME DAY · STANDOUTS':gameFilter==='live'?'LIVE GAMES · PLAYER LEADERS':gameFilter==='final'?'FINAL GAMES · PLAYER LEADERS':gameFilter==='mine'?'FOLLOWED TEAMS · GAME LEADERS':'PLAYER STATS';
 if($('desk-game-source'))$('desk-game-source').textContent='ESPN public game summaries · '+summaryCache.size+' available box scores · FPTS ESPN default format';
 if($('desk-sort-help'))$('desk-sort-help').textContent='Sort: '+sortStat.toUpperCase()+(sortDescending?' ↓':' ↑')+' · '+active.length+' matchups · scroll horizontally on mobile';
 if(content)content.innerHTML=rows.length?rows.map(p=>{
  const img=p.id&&/^\d+$/.test(p.id)?'<img src="https://a.espncdn.com/i/headshots/nba/players/full/'+encodeURIComponent(p.id)+'.png" alt="" loading="lazy" onerror="this.style.display=\'none\'">':'';
  const href=profileHref(p);
  const cols=['<a class="desk-player" href="'+esc(href)+'" aria-label="Open '+esc(p.name)+' player profile">'+img+
    '<span><b>'+esc(p.name)+'</b><small>'+esc(p.team)+' · '+esc(p.matchup)+'</small></span></a>'+
    (p.id&&/^\d+$/.test(p.id)?'<button type="button" class="watch-player-btn" data-watch-player="'+esc(p.id)+
    '" data-watch-name="'+esc(p.name)+'" data-watch-player-team="'+esc(p.team)+'">+ Follow</button>':''),
   esc(p.minutes??'—'),fmt(p.pts),fmt(p.reb),fmt(p.ast),fmt(p.three),fmt(p.stl),fmt(p.blk),fmt(p.tov),
   fmt(p.fgPct,'%'),fmt(p.ftPct,'%'),fmt(p.plusMinus),fmt(p.fpts)];
  return '<tr>'+cols.map((v,i)=>'<td'+(i===12?' class="desk-fpts"':'')+'>'+v+'</td>').join('')+'</tr>';
 }).join(''):'<tr><td colspan="13">Loading verified player box scores across this filter; no projected statistics are shown.</td></tr>';
 window.TwinWatchlist?.sync?.();
 renderPerformanceCentre(rows);
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
function updateDateControls(){
 const key=String(feed?.melbourne_date||feed?.date||'');
 const today=window.NbaScores?.melbourneDate?.(new Date());
 for(const button of document.querySelectorAll('[data-desk-date]')){
  const candidate=window.NbaScores?.shiftDateKey?.(today,Number(button.dataset.deskDate));
  const active=candidate===key;
  button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));
 }
 const picker=$('live-date');if(picker&&/^\d{8}$/.test(key))picker.value=key.slice(0,4)+'-'+key.slice(4,6)+'-'+key.slice(6,8);
 if($('live-date-note'))$('live-date-note').textContent='Melbourne game date: '+dateLabel(key)+' · ESPN US buckets '+(feed?.espn_dates||[]).join(' + ')+(feed?.partial?' · partial provider response':'');
}
function requestDate(key){
 if(!/^\d{8}$/.test(String(key))||String(key)===String(feed?.melbourne_date||feed?.date))return;
 document.dispatchEvent(new CustomEvent('twinlab:scoredatechange',{detail:{date:String(key)}}));
}
function setFeed(value){
 if(!value||!Array.isArray(value.games))return;
 const changed=String(feed?.melbourne_date||feed?.date||'')!==String(value.melbourne_date||value.date||'');
 if(changed){selected=null;lastLoaded=null;request++;batchRequest++;summaryCache.clear();}
 feed={...value,games:value.games.slice().sort((a,b)=>{
  const order=g=>g.phase==='live'?0:g.phase==='scheduled'?1:2;
  return order(a)-order(b)||Date.parse(a.date)-Date.parse(b.date);
 })};
 const gameSelect=$('performance-game'),teamSelect=$('performance-team');
 if(gameSelect){gameSelect.innerHTML='<option value="all">All games</option>'+feed.games.map(g=>'<option value="'+esc(g.id)+'">'+esc(g.away.abbr+' @ '+g.home.abbr)+'</option>').join('');gameSelect.value=feed.games.some(g=>String(g.id)===performanceGame)?performanceGame:'all';performanceGame=gameSelect.value}
 if(teamSelect){const teams=[...new Set(feed.games.flatMap(g=>[g.away.abbr,g.home.abbr]))].sort();teamSelect.innerHTML='<option value="all">All teams</option>'+teams.map(team=>'<option value="'+esc(team)+'">'+esc(team)+'</option>').join('');teamSelect.value=teams.includes(performanceTeam)?performanceTeam:'all';performanceTeam=teamSelect.value}
 const current=selectedGame();
 if(!current){
  const fav=feed.games.filter(g=>favourite(g));
  const prefer=feed.games.find(g=>g.phase==='live'&&favourite(g))||feed.games.find(g=>g.phase==='live')||
  fav[0]||feed.games.find(g=>g.phase==='scheduled')||feed.games[0];
  selected=prefer?.id||null;
 }
 const freshness=Number.isFinite(Date.parse(feed.fetched_at_utc))?fmtTime(feed.fetched_at_utc):'checked just now';
 if($('live-feed-freshness'))$('live-feed-freshness').textContent='ESPN scoreboard · '+dateLabel(feed.melbourne_date||feed.date)+' Melbourne · checked '+freshness+' · automatic refresh';
 updateDateControls();
 keepVisibleSelection();showGames();loadSelected();loadBatch();
}
function unavailable(){
 feed=null;lastLoaded=null;request++;batchRequest++;summaryCache.clear();
 if($('live-game-list'))$('live-game-list').innerHTML='<p class="desk-empty">ESPN live scoreboard unavailable. No scores or player stats are being guessed.</p>';
 if($('desk-counts'))$('desk-counts').textContent='ESPN SCOREBOARD UNAVAILABLE';
 if($('live-feed-freshness'))$('live-feed-freshness').textContent='ESPN unavailable · no live claim';
 if($('live-stats-rows'))$('live-stats-rows').innerHTML='<tr><td colspan="6">Live player data unavailable.</td></tr>';
 if($('desk-top-performers'))$('desk-top-performers').innerHTML='<p>Verified player data unavailable.</p>';
 setMessage('Live data currently unavailable');
}
function init(){
 if(!mounted)return;
 for(const button of document.querySelectorAll('[data-desk-filter]'))
  button.addEventListener('click',()=>{gameFilter=button.dataset.deskFilter;for(const b of document.querySelectorAll('[data-desk-filter]')){const active=b===button;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active))}keepVisibleSelection();showGames();loadSelected();loadBatch()});
 for(const button of document.querySelectorAll('[data-desk-date]'))button.addEventListener('click',()=>{
  const today=window.NbaScores?.melbourneDate?.(new Date());
  requestDate(window.NbaScores?.shiftDateKey?.(today,Number(button.dataset.deskDate)));
 });
 if($('live-date'))$('live-date').addEventListener('change',event=>requestDate(String(event.target.value||'').replaceAll('-','')));
 if($('live-sort'))$('live-sort').addEventListener('change',e=>{sortStat=e.target.value;sortDescending=true;renderSummary()});
 if($('performance-game'))$('performance-game').addEventListener('change',e=>{performanceGame=e.target.value;renderSummary()});
 if($('performance-team'))$('performance-team').addEventListener('change',e=>{performanceTeam=e.target.value;renderSummary()});
 if($('performance-type'))$('performance-type').addEventListener('change',e=>{performanceType=e.target.value;renderSummary()});
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
 fetch('./data/performance-centre.json',{cache:'no-store'}).then(response=>response.ok?response.json():null).then(value=>{history=value;renderSummary()}).catch(()=>{});
}
init();
window.NbaLiveDesk=Object.freeze({setFeed,unavailable,selectGame,parseBoxscore,extractPlays,highlight,fetchSummary});
})();
