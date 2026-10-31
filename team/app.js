/* Team Centre — sourced 2026–27 match results and point-in-time NBA Twin Lab
 * snapshots. No inferred player is presented as an official healthy starter.
 * Does not alter locked predictions. */
(()=>{'use strict';
const $=id=>document.getElementById(id);
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const alias={GSW:'GS',NYK:'NY',SAS:'SA',NOP:'NO',UTA:'UTAH',WAS:'WSH',PHO:'PHX',BRK:'BKN',CHO:'CHA'};
const back={GS:'GSW',NY:'NYK',SA:'SAS',NO:'NOP',UTAH:'UTA',WSH:'WAS'};
const canon=x=>alias[String(x||'').toUpperCase()]||String(x||'').toUpperCase();
const valid=x=>Object.hasOwn(window.TwinTeamPrefs?.names||{},canon(x));
const number=x=>typeof x==='number'&&Number.isFinite(x)?x:null;
const fixed=(v,n=1)=>number(v)===null?'—':v.toFixed(n);
const time=x=>{const d=new Date(x);return !Number.isFinite(d.getTime())?'Date unavailable':
 new Intl.DateTimeFormat('en-AU',{timeZone:'Australia/Melbourne',day:'numeric',month:'short',hour:'numeric',minute:'2-digit'}).format(d)};
const logo=(code,size='large')=>window.NbaMedia?.image?.(code,{size,label:canon(code)})||'<b>'+esc(code)+'</b>';
const photo=id=>window.NbaMedia?.headshot?.(id)||null;
const safeID=x=>/^\d{4,10}$/.test(String(x||''))?String(x):null;
const same=(g,code)=>[canon(g?.home?.abbr),canon(g?.away?.abbr)].includes(code);
let gameRows=[],rotation=[],teamState=null,abbr='',snapshot=null,filter='all';
const stats=['ortg','drtg','pace','efg','three_pct','orb_rate','tov_rate','ftr'];
const source=path=>'../'+path;
const locationParams=new URLSearchParams(location.search);
const asked=canon(locationParams.get('team')||window.TwinTeamPrefs?.get?.()||'BOS');
abbr=valid(asked)?asked:'BOS';
function status(text){const e=$('team-data-status');if(e)e.textContent=text}
function metric(label,value,note=''){return '<div class="team-metric"><span>'+esc(label)+'</span><strong>'+esc(value)+'</strong><small>'+esc(note)+'</small></div>'}
function currentName(){return teamState?.name||window.TwinTeamPrefs?.names?.[abbr]||abbr}
function seasonGames(games){
 const season=Math.max(...games.map(g=>Number(g.season)||0));
 const relevant=games.filter(g=>Number(g.season)===season&&same(g,abbr)).sort((a,b)=>Date.parse(a.date)-Date.parse(b.date));
 const finals=relevant.filter(g=>g.status==='final'&&number(g.homeScore)!==null&&number(g.awayScore)!==null);
 const played=finals.map(g=>{
  const home=canon(g.home.abbr)===abbr,us=home?g.homeScore:g.awayScore,opp=home?g.awayScore:g.homeScore;
  return {...g,isHome:home,ourPoints:us,theirPoints:opp,isWin:us>opp};
 });
 const w=played.filter(g=>g.isWin).length,l=played.length-w;
 return {all:relevant,played,scheduled:relevant.filter(g=>g.status==='scheduled'),w,l,
  ppg:played.length?played.reduce((s,g)=>s+g.ourPoints,0)/played.length:null,
  papg:played.length?played.reduce((s,g)=>s+g.theirPoints,0)/played.length:null,
  season};
}
function selectedTeam(g){
 const home=canon(g.home.abbr)===abbr;
 return home?g.away:g.home;
}
function row(g){
 const opponent=selectedTeam(g),live=g.status==='final'&&number(g.homeScore)!==null&&number(g.awayScore)!==null;
 const usHome=canon(g.home.abbr)===abbr;
 const own=live?(usHome?g.homeScore:g.awayScore):null;
 const them=live?(usHome?g.awayScore:g.homeScore):null;
 const won=live?own>them:null;
 return '<a class="team-game-row" href="../game/?id='+encodeURIComponent(String(g.id))+'" aria-label="'+esc(currentName()+' '+(usHome?'versus ':'at ')+opponent.name+' '+(live?own+' to '+them:'scheduled '+time(g.date)))+'">'+
  '<span class="team-game-meta">'+logo(opponent.abbr,'small')+'<span><b>'+esc(opponent.name)+'</b><small>'+esc((usHome?'HOME · ':'AWAY · ')+time(g.date))+'</small></span></span>'+
  '<span class="team-game-result"><strong>'+(live?esc(own+'–'+them):'—')+'</strong><em class="'+(live?(won?'':'loss'):'upcoming')+'">'+(live?(won?'W':'L'):'UPCOMING')+'</em></span></a>';
}
function renderHeader(){
 const name=currentName();
 document.title=name+' · Team Centre · NBA Twin Lab';
 const followed=window.TwinWatchlist?.hasTeam?.(abbr)||false;
 $('team-identity').innerHTML=logo(abbr,'large')+'<div><div class="team-eyebrow">NBA TEAM CENTRE / 2026–27</div><h1>'+esc(name)+'</h1>'+
  '<p>Real results · verified historical game logs · model-driven team analytics</p>'+
  '<button type="button" class="team-follow" data-watch-team="'+esc(abbr)+'" aria-pressed="'+String(followed)+'">'+
   (followed?'★ FOLLOWING':'☆ FOLLOW TEAM')+'</button></div>';
 $('team-hero').style.setProperty('--team-color',window.TwinTeamPrefs?.accent?.[abbr]||'#2186ff');
 $('team-hero-metrics').innerHTML=
 metric('RECORD',teamState.w+'–'+teamState.l,'Confirmed 2026–27 finals')+
 metric('WIN RATE',teamState.played.length?fixed(100*teamState.w/teamState.played.length,1)+'%':'—','Based on completed games')+
 metric('POINTS PER GAME',fixed(teamState.ppg),'Final results')+
 metric('OPPONENT PPG',fixed(teamState.papg),'Final results');
 $('team-compare-link').href='../team-intelligence/?team='+encodeURIComponent(abbr);
 window.TwinWatchlist?.sync?.();
}
function renderGames(){
 $('team-recent-form').innerHTML=teamState.played.length?teamState.played.slice(-5).reverse().map(row).join(''):'<p class="team-empty">No final games found in the current source snapshot.</p>';
 $('team-next-games').innerHTML=teamState.scheduled.length?teamState.scheduled.slice(0,5).map(row).join(''):'<p class="team-empty">No upcoming games recorded in the current source snapshot.</p>';
 const shown=teamState.all.filter(g=>filter==='all'||filter==='completed'&&g.status==='final'||filter==='upcoming'&&g.status==='scheduled');
 $('team-fixtures').innerHTML=shown.length?shown.slice().reverse().map(row).join(''):'<p class="team-empty">No fixtures in this category. Unavailable data is not filled with invented games.</p>';
}
function renderStats(){
 const t=snapshot?.teams?.find(t=>canon(t.abbr)===abbr);
 $('team-stats-grid').innerHTML=[
  ['SCORING DIFFERENTIAL',teamState.ppg===null?'—':(teamState.ppg-teamState.papg>=0?'+':'')+fixed(teamState.ppg-teamState.papg),'Points per game'],
  ['RECENT FORM',teamState.played.slice(-5).map(g=>g.isWin?'W':'L').join(' · ')||'—','Last 5 completed games'],
  ['GAMES PLAYED',String(teamState.played.length),'Verified final results'],
  ['NEXT MATCHUP',teamState.scheduled.length?selectedTeam(teamState.scheduled[0]).abbr:'—',teamState.scheduled.length?time(teamState.scheduled[0].date):'No scheduled game']
 ].map(m=>metric(...m)).join('');
 const season=t?.season||null;
 if(!season){
  $('team-four-factors').innerHTML='<p class="team-empty">Historical Four Factors unavailable for this team.</p>';
  return;
 }
 $('team-four-factors').innerHTML=[
  ['OFFENSIVE RATING',fixed(season.ortg),'Points per 100 possessions'],
  ['DEFENSIVE RATING',fixed(season.drtg),'Lower is better'],
  ['PACE',fixed(season.pace),'Estimated possessions / 48min'],
  ['NET RATING',fixed(season.ortg-season.drtg),'Offensive minus defensive'],
  ['EFFECTIVE FG%',fixed(100*season.efg)+'%','eFG · actual team aggregate'],
  ['3-POINT FG%',fixed(100*season.three_pct)+'%','Actual makes / attempts'],
  ['TURNOVER RATE',fixed(100*season.tov_rate)+'%','Per possession'],
  ['OFFENSIVE REB RATE',fixed(100*season.orb_rate)+'%','Rebound opportunity']
 ].map(m=>metric(...m)).join('');
 const bars=[
  ['SCORING EFFICIENCY',season.ortg,130],
  ['DEFENSIVE EFFICIENCY (LOWER BETTER)',season.drtg,130],
  ['RECENT NET RATING',t.last5?.ortg!=null&&t.last5?.drtg!=null?t.last5.ortg-t.last5.drtg:null,25]
 ];
 $('team-efficiency-bars').innerHTML=bars.map(([name,value,max])=>
  '<div class="team-efficiency-line"><header><span>'+esc(name)+'</span><b>'+fixed(value)+'</b></header>'+
  '<div class="track"><i style="width:'+Math.min(100,Math.max(0,(value+(max===25?25:0))/(max===25?50:max)*100)).toFixed(1)+'%"></i></div></div>'
 ).join('');
 rotation=t.rotation||[];
 renderRotation();
}
function renderRotation(){
 $('team-roster-grid').innerHTML=rotation.length?rotation.map(p=>{
  const id=safeID(p.player_id),url=id?photo(id):null;
  const score=p.stats_if_play||{};
  return '<a class="team-player-card" href="?team='+encodeURIComponent(abbr)+'&player='+encodeURIComponent(id||'')+'#team-player-profile" data-player-id="'+esc(id||'')+'">'+
   '<div class="team-player-photo">'+(url?'<img src="'+esc(url)+'" alt="Portrait of '+esc(p.name)+'" loading="lazy" onerror="this.style.display=\'none\'">':'')+
   '<b aria-hidden="true">'+esc(p.name?.charAt(0)||'NBA')+'</b></div>'+
   '<div class="team-player-info"><strong>'+esc(p.name)+'</strong><span>'+fixed(p.expected_minutes)+' expected MIN · '+(p.availability||'inferred')+'</span>'+
   '<small>'+fixed(score.points)+' PTS · '+fixed(score.rebounds)+' REB · '+fixed(score.assists)+' AST <em>(if playing)</em></small></div></a>';
 }).join(''):'<p class="team-empty">No inferred player data in the dated snapshot.</p>';
 const player=locationParams.get('player');
 if(player)showPlayer(player);
}
function showPlayer(id){
 // NBA snapshot player IDs and ESPN IDs are distinct. Name must resolve via
 // documented current roster, not a fabricated ID conversion.
 const selected=rotation.find(p=>String(p.player_id)===String(id));
 if(!selected)return;
 const stats=selected.stats_if_play||{},panel=$('team-player-profile');
 const src=photo(selected.player_id);
 panel.hidden=false;
 if(location.hash==='#team-player-profile'&&typeof requestAnimationFrame==='function')
  requestAnimationFrame(()=>panel.scrollIntoView?.({block:'start'}));
 panel.innerHTML='<a class="team-profile-close" href="?team='+encodeURIComponent(abbr)+'#roster">CLOSE ✕</a>'+
  '<div class="player-detail-top">'+(src?'<img src="'+esc(src)+'" alt="Portrait of '+esc(selected.name)+'">':'')+
  '<div><div class="team-kicker">PLAYER BREAKDOWN · ESTIMATED</div><h3>'+esc(selected.name)+'</h3>'+
  '<p>'+esc(currentName())+' · playing time, stats and availability are inferred</p></div></div>'+
  '<div class="team-stats-grid">'+[
    ['PTS IF PLAYING',fixed(stats.points),'Conditional projection'],
    ['REB IF PLAYING',fixed(stats.rebounds),'Conditional projection'],
    ['AST IF PLAYING',fixed(stats.assists),'Conditional projection'],
    ['3PM IF PLAYING',fixed(stats.threes),'Conditional projection'],
    ['MIN IF PLAYING',fixed(selected.minutes_if_play),'Rotation model'],
    ['GAMES OBSERVED',String(selected.observed_games??'—'),'Prior match sample'],
    ['USAGE%',fixed(selected.usage)+'%','Observed / estimated'],
    ['PLAY CHANCE',fixed(100*selected.play_probability)+'%','Inferred · not verified']
   ].map(m=>metric(...m)).join('')+'</div>'+
   '<p class="team-source-caveat">Research model only. An inferred play chance is not an official injury status and should not be taken as a confirmed lineup.</p>';
}
async function load(){
 try{
 const [response,gamesResponse]=await Promise.all([fetch(source('data/v7-current.json'),{cache:'no-store'}),fetch(source('data/games.json'),{cache:'no-store'})]);
 if(!response.ok||!gamesResponse.ok)throw Error('Team source unavailable');
 snapshot=await response.json();
 const games=await gamesResponse.json();
 if(!Array.isArray(games.games)||!Array.isArray(snapshot.teams))throw Error('Missing verified source collections');
 const matching=games.games.filter(g=>same(g,abbr));
 const team=matching.flatMap(g=>[g.home,g.away]).find(t=>canon(t.abbr)===abbr);
 teamState={...seasonGames(games.games),name:team?.name||window.TwinTeamPrefs?.names?.[abbr]};
 renderHeader();renderGames();renderStats();
 status('SOURCE: '+(games.source?.name||'ESPN game data')+
  ' · Games dataset '+String(games.built_at_utc||'time unknown')+
  ' · Research snapshot '+String(snapshot.built_at_utc||'time unknown')+
  ' · Records are computed from confirmed finals (not official tiebreaker seedings)');
 }catch(error){status('Team Centre unavailable: '+error.message+'. No invented stats will be shown.')}
}
function init(){
 document.querySelectorAll('[data-game-filter]').forEach(button=>button.addEventListener('click',()=>{
  filter=button.dataset.gameFilter;
  document.querySelectorAll('[data-game-filter]').forEach(b=>b.classList.toggle('active',b===button));
  if(teamState)renderGames();
 }));
 document.addEventListener('twinlab:watchlistchange',()=>{if(teamState)renderHeader()});
 load();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();