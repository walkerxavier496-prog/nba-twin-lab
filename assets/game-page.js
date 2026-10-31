/* NBA Twin Lab / Game Centre.
   Real game scores + ESPN player stats never update locked predictions. */
(()=>{'use strict';
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
const valid=id=>/^\d{7,10}$/.test(String(id||''));
const safeNum=v=>v===undefined||v===null||v===''?null:Number.isFinite(Number(v))?Number(v):null;
const fmt=d=>{const n=new Date(d);return Number.isFinite(n.getTime())?new Intl.DateTimeFormat('en-AU',{timeZone:'Australia/Melbourne',weekday:'short',day:'numeric',month:'short',hour:'numeric',minute:'2-digit'}).format(n):'Time not reported'};
const abbr=t=>String(t?.abbreviation||t?.abbr||t?.shortDisplayName||'').toUpperCase();
const logo=t=>window.NbaMedia?.image?.(t?.abbr,{size:'large',label:t?.abbr})||'<span>'+esc(t?.abbr||'NBA')+'</span>';
const id=new URLSearchParams(location.search).get('id');
let selectedTab='box',game=null,raw=null,players=[],plays=[],pending=false,lastLoaded=null,boxSort='pts',boxDescending=true;
const fallback='<p class="game-empty">No verified data is available from ESPN for this game yet.</p>';
const statusName=g=>g.phase==='live'?(g.period>4?'OT'+(g.period>5?g.period-4:''):'Q'+(g.period||'?'))+(g.clock?' · '+g.clock:'')+' · LIVE':g.phase==='final'?'FINAL':g.phase==='scheduled'?'UPCOMING':'STATUS UNAVAILABLE';
function parseSummary(data){
 const header=data?.header||{},competition=header.competitions?.[0]||{};
 const competitors=competition.competitors||[];
 const away=competitors.find(c=>c.homeAway==='away'),home=competitors.find(c=>c.homeAway==='home');
 if(!away||!home)return null;
 const status=competition.status||header.status||data.status||{},type=status.type||{};
 const phase=type.completed||type.state==='post'||type.name==='STATUS_FINAL'?'final':
  type.state==='in'||String(type.name||'').startsWith('STATUS_IN')?'live':'scheduled';
 const date=competition.date||header.date||data?.header?.competitions?.[0]?.date||data?.date||null;
 const mk=c=>({abbr:abbr(c.team),name:c.team?.displayName||c.team?.name||c.team?.shortDisplayName||'NBA team',
  score:phase==='scheduled'?null:safeNum(c.score),record:c.records?.find(x=>x.type==='total')?.summary||'',
  quarters:(c.linescores||[]).map(x=>safeNum(x.value??x.displayValue))});
 return {id:String(header.id||competition.id||id),date,away:mk(away),home:mk(home),phase,
  period:safeNum(status.period),clock:String(status.displayClock||''),status:String(type.shortDetail||type.detail||'')};
}
function quarterTotals(g){
 if(!g||(!g.away.quarters.length&&!g.home.quarters.length))return '';
 const n=Math.max(g.away.quarters.length,g.home.quarters.length),label=i=>i<4?'Q'+(i+1):'OT'+(i===4?'':i-3);
 const row=(t)=>'<tr><th scope="row">'+esc(t.abbr)+'</th>'+Array.from({length:n},(_,i)=>'<td>'+esc(t.quarters[i]??'—')+'</td>').join('')+'<td class="quarter-total">'+esc(t.score??'—')+'</td></tr>';
 return '<div class="game-periods-scroll"><table><thead><tr><th>TEAM</th>'+Array.from({length:n},(_,i)=>'<th>'+label(i)+'</th>').join('')+'<th>TOTAL</th></tr></thead><tbody>'+row(g.away)+row(g.home)+'</tbody></table></div>';
}
function parseTeamStats(summary){
 const teams=summary?.boxscore?.teams||[];
 const getTeam=t=>teams.find(x=>abbr(x.team)===t)||null;
 const stats={};
 for(const t of [game?.away?.abbr,game?.home?.abbr]){
  const team=getTeam(t);
  stats[t]={};
  for(const s of team?.statistics||[])stats[t][String(s.name||s.label||s.abbreviation||'').toLowerCase()]=s.displayValue??s.value??null;
 }
 return stats;
}
const metrics=[
 ['FIELD GOAL %',['fieldgoalpct','fieldgoalpercentage']],
 ['3 POINT %',['threepointfieldgoalpct','threepointpercentage']],
 ['FREE THROW %',['freethrowpct','freethrowpercentage']],
 ['REBOUNDS',['totalrebounds','rebounds']],
 ['ASSISTS',['assists']],
 ['TURNOVERS',['turnovers']],
 ['POINTS IN PAINT',['pointsinthepaint']],
 ['FAST BREAK POINTS',['fastbreakpoints']]
];
function showHeader(){
 if(!game)return;
 $('game-away-name').textContent=game.away.name;$('game-home-name').textContent=game.home.name;
 if($('game-away-profile'))$('game-away-profile').href='../team/?team='+encodeURIComponent(game.away.abbr);
 if($('game-home-profile'))$('game-home-profile').href='../team/?team='+encodeURIComponent(game.home.abbr);
 $('game-away-logo').innerHTML=logo(game.away);$('game-home-logo').innerHTML=logo(game.home);
 $('game-away-record').textContent=game.away.record||'AWAY';$('game-home-record').textContent=game.home.record||'HOME';
 const hasScores=['live','final'].includes(game.phase)&&game.away.score!==null&&game.home.score!==null;
 $('game-score').textContent=hasScores?game.away.score+' : '+game.home.score:'VS';
 $('game-state').textContent=statusName(game);
 $('game-state').className='game-live-status'+(game.phase==='live'?' game-live-status--live':'');
 $('game-clock').textContent=game.phase==='scheduled'?'TIPOFF · '+fmt(game.date):statusName(game);
 $('game-date').textContent=fmt(game.date)+' · Australia/Melbourne';
 $('game-periods').innerHTML=quarterTotals(game);
 document.title=game.away.abbr+' @ '+game.home.abbr+' | NBA Twin Lab';
}
function leaderCard(team){
 const group=players.filter(p=>p.team===team.abbr);
 if(!group.length)return '<div class="game-leader-card"><span class="game-leader-logo">'+logo(team)+'</span><p>No verified player stats yet for '+esc(team.abbr)+'</p></div>';
 const best=group.slice().sort((a,b)=>(b.pts??-1)-(a.pts??-1))[0];
 const uri=best.id&&/^\d+$/.test(best.id)?'https://a.espncdn.com/i/headshots/nba/players/full/'+encodeURIComponent(best.id)+'.png':null;
 return '<div class="game-leader-card"><span class="game-leader-logo">'+logo(team)+'</span>'+
  (uri?'<img src="'+uri+'" alt="" loading="lazy" onerror="this.style.display=\'none\'">':'')+
  '<div><small>'+esc(team.abbr)+' TOP SCORER</small><b>'+esc(best.name)+'</b><span>'+esc(best.pts??'—')+' PTS · '+esc(best.reb??'—')+' REB · '+esc(best.ast??'—')+' AST</span></div></div>';
}
function showLeaders(){
 $('game-leaders').innerHTML=game?(leaderCard(game.away)+leaderCard(game.home)):'';
}
const boxCols=[["name","PLAYER"],["minuteValue","MIN"],["pts","PTS"],["fgm","FG"],["fgPct","FG%"],["three","3PT"],["threePct","3P%"],["ftm","FT"],["ftPct","FT%"],["oreb","OREB"],["dreb","DREB"],["reb","REB"],["ast","AST"],["stl","STL"],["blk","BLK"],["tov","TO"],["plusMinus","+/-"],["pf","PF"],["fpts","FPTS"]];
function orderPlayers(group){
 return group.slice().sort((a,b)=>{
  if(boxSort==='name')return (boxDescending?-1:1)*a.name.localeCompare(b.name);
  const av=Number.isFinite(a[boxSort])?a[boxSort]:null,bv=Number.isFinite(b[boxSort])?b[boxSort]:null;
  if(av===null)return bv===null?a.name.localeCompare(b.name):1;
  if(bv===null)return -1;
  return (boxDescending?-1:1)*(av-bv)||a.name.localeCompare(b.name);
 });
}
function formatNumber(v,suffix=''){return Number.isFinite(v)?String(v)+suffix:'—'}
function showBox(){
 if(!game){$('game-box-groups').innerHTML=fallback;return}
 $('game-box-groups').innerHTML=[game.away,game.home].map(team=>{
  const list=orderPlayers(players.filter(p=>p.team===team.abbr));
  const rows=list.length?list.map(p=>{
   const shot=(m,a)=>Number.isFinite(m)&&Number.isFinite(a)?m+'-'+a:'—';
   const vals=[esc(p.name),esc(p.minutes??'—'),formatNumber(p.pts),
     shot(p.fgm,p.fga),formatNumber(p.fgPct,'%'),shot(p.three,p.threeA),formatNumber(p.threePct,'%'),
     shot(p.ftm,p.fta),formatNumber(p.ftPct,'%'),formatNumber(p.oreb),formatNumber(p.dreb),
     formatNumber(p.reb),formatNumber(p.ast),formatNumber(p.stl),formatNumber(p.blk),formatNumber(p.tov),
     formatNumber(p.plusMinus),formatNumber(p.pf),formatNumber(p.fpts)];
   const follow=p.id&&/^\d+$/.test(String(p.id))?
     '<button type="button" class="watch-player-btn" data-watch-player="'+esc(p.id)+'" data-watch-name="'+esc(p.name)+'" data-watch-player-team="'+esc(p.team)+'">+ Follow</button>':'';
   return '<tr>'+vals.map((v,i)=>'<td'+(i===18?' class="game-fpts"':'')+'>'+(i===0?'<b><a class="game-player-link" href="../player/?id='+encodeURIComponent(String(p.id||''))+'&name='+encodeURIComponent(p.name)+'&team='+encodeURIComponent(p.team)+'">'+v+'</a></b>'+follow:v)+'</td>').join('')+'</tr>';
  }).join(''):'<tr><td colspan="19">No published actual player statistics for this team yet.</td></tr>';
  const headings=boxCols.map(([key,label])=>'<th><button type="button" data-game-sort="'+key+'" aria-label="Sort by '+label+'">'+label+(boxSort===key?(boxDescending?' ↓':' ↑'):'')+'</button></th>').join('');
  return '<div class="game-box-team"><div class="game-box-team-title"><a class="game-team-link" href="../team/?team='+encodeURIComponent(team.abbr)+'">'+logo(team)+'<h3>'+esc(team.name)+'</h3></a></div>'+
   '<div class="game-table-scroll"><table><thead><tr>'+headings+'</tr></thead><tbody>'+rows+'</tbody></table></div></div>';
 }).join('');
 window.TwinWatchlist?.sync?.();
 for(const button of $('game-box-groups').querySelectorAll?.('[data-game-sort]')||[])button.addEventListener('click',()=>{
  const key=button.dataset.gameSort;boxDescending=key===boxSort?!boxDescending:true;boxSort=key;showBox();
 });
}
function showPlays(){
 const root=$('game-play-list');
 if(!plays.length){root.innerHTML=fallback;return}
 root.innerHTML=plays.slice().reverse().map(p=>{
  const type=window.NbaLiveDesk?.highlight?.(p)||'';
  return '<article class="game-play"><div class="game-play-time">'+esc(p.period||'?')+'Q · '+esc(p.clock||'—')+'</div>'+
  '<div><p>'+esc(p.desc)+'</p>'+(type?'<small>'+esc(type)+'</small>':'')+'</div>'+
  '<div class="game-play-score">'+(p.away===null||p.home===null?'':esc(p.away+'–'+p.home))+'</div></article>';
 }).join('');
}
function showTeam(){
 const data=parseTeamStats(raw),a=game?.away,b=game?.home;
 if(!a||!b){$('game-team-stats').innerHTML=fallback;return}
 let rows=[];
 const lookup=(team,keys)=>keys.map(k=>data[team.abbr]?.[k]).find(v=>v!==undefined&&v!==null&&v!=='');
 const numeric=v=>{const n=parseFloat(String(v??'').replace('%',''));return Number.isFinite(n)?n:null};
 for(const [label,keys]of metrics){
  const av=lookup(a,keys),bv=lookup(b,keys);if(av==null&&bv==null)continue;
  const an=numeric(av),bn=numeric(bv),share=an!==null&&bn!==null&&(an+bn)>0?Math.max(0,Math.min(100,an/(an+bn)*100)):50;
  rows.push('<div class="game-team-metric"><b>'+esc(av??'—')+'</b><div class="game-team-metric-centre"><span>'+esc(label)+'</span>'+
   '<div class="game-metric-track"><i style="width:'+share.toFixed(1)+'%"></i></div></div><b>'+esc(bv??'—')+'</b></div>');
 }
 $('game-team-stats').innerHTML='<div class="game-team-metric-head"><span>'+logo(a)+' '+esc(a.abbr)+'</span><span>'+logo(b)+' '+esc(b.abbr)+'</span></div>'+
 (rows.length?rows.join(''):fallback);
}
async function showMachine(){
 const root=$('game-forecast');if(!root||!game)return;
 root.innerHTML='<p>Checking immutable pregame forecasts…</p>';
 try{
  const ledger=await (await fetch('../data/audit-ledger.json',{cache:'no-store'})).json();
  const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Australia/Melbourne',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(game.date));
  const entries=(ledger.entries||[]).filter(e=>e.lock_path).sort((a,b)=>String(b.melbourne_date).localeCompare(String(a.melbourne_date)));
  const candidates=entries.filter(e=>e.melbourne_date===date);
  for(const entry of candidates){
   const response=await fetch('../'+entry.lock_path,{cache:'no-store'});if(!response.ok)continue;
   const lock=await response.json();
   const snapshot=lock.forecasts?.find(g=>String(g.game_id)===String(id));
   if(!snapshot||!lock.locked_at_utc||!(Date.parse(lock.locked_at_utc)<Date.parse(snapshot.tip_utc)))continue;
   const p=snapshot.primary_forecast;
   root.innerHTML='<div class="game-lock"><div class="eyebrow">IMMUTABLE FORECAST BEFORE TIPOFF</div>'+
    '<div class="game-lock-score">'+esc(p?.winner||'—')+' <strong>'+((p?.winner_probability??0)*100).toFixed(1)+'%</strong></div>'+
    '<p>Elo win prediction, locked '+esc(fmt(lock.locked_at_utc))+'. Model scores are projections, never game results.</p>'+
    '<a class="btn primary" href="../challenge/daily.html?game='+encodeURIComponent(id)+'#matchups">ALL SIX MODEL PREDICTIONS ↗</a></div>';return;
  }
  root.innerHTML='<p class="game-empty">No verified immutable pregame forecast exists for this game. We won’t generate a hindsight pick.</p>';
 }catch(e){root.innerHTML='<p class="game-empty">The locked-prediction ledger is currently unavailable. No forecast has been invented.</p>'}
}
function activate(tab,focus=false){
 selectedTab=tab;
 for(const key of ['box','plays','team','machine']){
  const active=key===tab;
  const button=$('tab-'+key),pane=$('pane-'+key);
  button.setAttribute('aria-selected',String(active));button.tabIndex=active?0:-1;
  pane.hidden=!active;
 }
 if(focus)$('tab-'+tab).focus();
 if(tab==='machine'&&game)showMachine();
}
function installTabs(){
 const buttons=[...document.querySelectorAll('[data-tab]')];
 for(const button of buttons)button.addEventListener('click',()=>activate(button.dataset.tab));
 for(const button of buttons)button.addEventListener('keydown',e=>{
  if(!['ArrowRight','ArrowLeft','Home','End'].includes(e.key))return;e.preventDefault();
  const i=buttons.indexOf(button),j=e.key==='Home'?0:e.key==='End'?buttons.length-1:
   (i+(e.key==='ArrowRight'?1:-1)+buttons.length)%buttons.length;
  activate(buttons[j].dataset.tab,true);
 });
}
async function refresh(){
 if(pending||!valid(id))return;pending=true;
 try{
  const response=await fetch('https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event='+encodeURIComponent(id),{cache:'no-store'});
  if(!response.ok)throw Error('HTTP '+response.status);
  const data=await response.json();
  const next=parseSummary(data);
  if(!next)throw Error('ESPN has not supplied the matchup information');
  raw=data;game=next;
  players=window.TwinBoxscorePlus?.parseBoxscore?.(data)||window.NbaLiveDesk?.parseBoxscore?.(data)||[];
  plays=window.NbaLiveDesk?.extractPlays?.(data)||[];
  showHeader();showLeaders();showBox();showPlays();showTeam();
  lastLoaded=new Date().toISOString();
  $('game-updated').textContent='ESPN public game summary (unofficial) · checked '+fmt(lastLoaded)+' · auto-refreshes every 60 seconds';
  if(selectedTab==='machine')showMachine();
 }catch(e){
  $('game-updated').textContent='ESPN game detail unavailable ('+e.message+'). No scores or player data are guessed.';
  if(!game){$('game-state').textContent='DATA UNAVAILABLE';$('game-score').textContent='— : —';$('game-box-groups').innerHTML=fallback;$('game-play-list').innerHTML=fallback;$('game-team-stats').innerHTML=fallback}
 }finally{pending=false}
}
function start(){
 installTabs();activate('box');
 if(!valid(id)){ $('game-state').textContent='INVALID GAME ID';$('game-clock').textContent='Open a game from Live Games to see its details.';return }
 refresh();if(typeof setInterval==='function')setInterval(()=>{if(document.visibilityState!=='hidden')refresh()},60000);
}
window.NbaGamePage=Object.freeze({parseSummary,quarterTotals,parseTeamStats,activate,refresh});
start();
})();