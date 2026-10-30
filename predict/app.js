/* NBA Twin Lab V4 prediction dashboard — no invented NBA data. */
(()=>{
'use strict';
const E=window.TwinPredict,$=id=>document.getElementById(id);
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=x=>new Intl.DateTimeFormat(undefined,{weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}).format(new Date(x));
const pct=x=>Math.round(100*x)+'%';
const one=x=>Number.isFinite(x)?x.toFixed(1):'—';
const round=x=>Number.isFinite(x)?Math.round(x):'—';
const today=new Date();
const seasonYear=today.getUTCFullYear()+(today.getUTCMonth()>=6?1:0);
let games=[],selected=null,source='',loadedAt=null,hasHistory=false;
function note(message,type=''){const n=$('notice');n.textContent=message;n.className='notice '+type}
function monthRanges(start,end){
 const out=[];let y=start.getUTCFullYear(),m=start.getUTCMonth();
 while(y<end.getUTCFullYear()||(y===end.getUTCFullYear()&&m<=end.getUTCMonth())){
   const first=new Date(Date.UTC(y,m,1)),last=new Date(Date.UTC(y,m+1,0));
   out.push([new Date(Math.max(first.getTime(),start.getTime())),new Date(Math.min(last.getTime(),end.getTime()))]);
   m++;if(m===12){m=0;y++}
 }return out;
}
const ymd=d=>d.toISOString().slice(0,10).replace(/-/g,'');
async function espnRange(start,end){
 const u=new URL('https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard');
 u.searchParams.set('dates',ymd(start)+'-'+ymd(end));u.searchParams.set('seasontype','2');u.searchParams.set('limit','500');
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),16000);
 try{const r=await fetch(u,{signal:controller.signal,cache:'no-store'});if(!r.ok)throw Error('ESPN HTTP '+r.status);
   return E.normalise(await r.json());}finally{clearTimeout(timer)}
}
async function load(){
 let staticGames=[],staticDate=null;
 try{
   const res=await fetch('../data/games.json',{cache:'no-store'});
   if(res.ok){
     const data=await res.json();
     if(data.schema===1&&Array.isArray(data.games)&&data.games.length>=800){
       staticGames=data.games;staticDate=data.built_at_utc;source='Verified GitHub snapshot';
     }
   }
 }catch(err){console.warn('Static game snapshot unavailable:',err)}
 if(staticGames.length){
   games=E.merge(staticGames);loadedAt=staticDate;
   note('Verified historical results loaded. Checking ESPN for the latest completed games and upcoming schedule…');
   render();
   try{
     const start=new Date(today.getTime()-3*86400000),end=new Date(today.getTime()+16*86400000);
     const fresh=await espnRange(start,end);
     if(fresh.length){games=E.merge(games,fresh);source='GitHub snapshot + ESPN browser refresh';loadedAt=new Date().toISOString()}
     else note('Historical snapshot loaded; live ESPN returned no games for the selected dates. Predictions may be stale.');
   }catch(err){note('Using the last validated GitHub snapshot. Live scoreboard refresh unavailable ('+err.message+'). Predictions may be stale.')}
   render();return;
 }
 note('No published schedule snapshot yet. Fetching ESPN scoreboard directly from your browser. This can take a moment.');
 const prev=seasonYear-1;
 const from=new Date(Date.UTC(prev-1,9,1)),to=new Date(Date.UTC(prev,3,30));
 const currFrom=new Date(Date.UTC(seasonYear-1,9,1)),currTo=new Date(today.getTime()+16*86400000);
 const ranges=[...monthRanges(from,to),...monthRanges(currFrom>today?currFrom:currFrom,currTo)];
 const all=[];
 try{
   for(let i=0;i<ranges.length;i++){
     const [a,b]=ranges[i];all.push(...await espnRange(a,b));
     note('Loading verified NBA scores and schedule… '+(i+1)+'/'+ranges.length+' date ranges.');
   }
   games=E.merge(all);source='ESPN browser scoreboard';loadedAt=new Date().toISOString();
   render();
 }catch(err){
   note('Unable to load a verified NBA scoreboard: '+err.message+'. Predictions are disabled until data access is restored.','bad');
   $('signal').textContent='SOURCE UNAVAILABLE';$('games').innerHTML='<div class="empty">NBA schedule unavailable. Try again later or check the data workflow on GitHub.</div>';
 }
}
function render(){
 const prevFinals=games.filter(g=>g.season===seasonYear-1&&g.status==='final').length;
 hasHistory=prevFinals>=800;
 const currentFinals=games.filter(g=>g.season===seasonYear&&g.status==='final').length;
 $('hero-count').textContent=games.length.toLocaleString();
 $('signal').textContent=hasHistory?'VERIFIED':'LIMITED';
 $('signal').style.color=hasHistory?'var(--teal)':'var(--red)';
 $('freshness').textContent=loadedAt?new Date(loadedAt).toLocaleString():'Unknown';
 $('games-played').textContent=currentFinals.toLocaleString();
 if(hasHistory)note('Using '+source+'. Historical baseline: '+prevFinals+' completed games from '+(seasonYear-2)+'–'+String(seasonYear-1).slice(2)+'. Forecasts exclude injuries and confirmed lineups.','good');
 else note('Only '+prevFinals+' previous-season finals available; require at least 800 before issuing probabilities. No forecasts will be fabricated.','bad');
 const stats=hasHistory?E.evaluate(games,seasonYear):{count:0};
 $('accuracy').textContent=stats.count>=10?pct(stats.accuracy):'—';
 $('brier').textContent=stats.count>=10?stats.brier.toFixed(3):'—';
 $('mae').textContent=stats.count>=10?one(stats.scoreMAE):'—';
 $('accuracy-sub').textContent=stats.count>=10?stats.count+' walk-forward games':stats.count+' games evaluated · need 10+';
 renderGames();renderTeams();
}
function available(){
 const range=$('range').value,term=$('team-search').value.trim().toLowerCase(),now=Date.now();
 let list=games.filter(g=>{
   if(range==='final')return g.status==='final'&&new Date(g.date).getTime()>now-14*86400000;
   const dt=new Date(g.date).getTime();
   return g.status!=='final'&&dt>=now-6*3600000&&(range==='all'||dt<now+Number(range)*86400000);
 });
 if(term)list=list.filter(g=>[g.home.name,g.away.name,g.home.abbr,g.away.abbr].some(x=>String(x).toLowerCase().includes(term)));
 return range==='final'?list.reverse():list;
}
function renderGames(){
 const list=available();
 $('games').innerHTML=list.length?list.map(g=>{
   const final=g.status==='final',score=final||g.status==='live';
   return '<button type="button" class="game '+(g.id===selected?'active':'')+'" data-id="'+esc(g.id)+'" aria-label="'+esc(g.away.name)+' at '+esc(g.home.name)+'">'+
   '<div class="game-top"><span>'+esc(fmt(g.date))+'</span><span>'+(final?'FINAL':g.status==='live'?'LIVE':'PREGAME')+'</span></div>'+
   '<div class="teams-line"><strong>'+esc(g.away.abbr||g.away.name)+'</strong><span class="versus">AT</span><strong>'+esc(g.home.abbr||g.home.name)+'</strong></div>'+
   '<div class="pills"><span class="pill">'+(score?esc(g.awayScore)+' – '+esc(g.homeScore):'Model forecast')+'</span><span class="pill gold">'+(final?'Result':g.status==='live'?'In progress':'Preview →')+'</span></div></button>';
 }).join(''):'<div class="empty">No games found for this range. Try “All scheduled” or a different team.</div>';
 if(!list.some(g=>g.id===selected))selected=list[0]?.id||null;
 $('games').querySelectorAll('button[data-id]').forEach(btn=>btn.onclick=()=>{selected=btn.dataset.id;renderGames();renderDetail()});
 renderDetail();
}
function metric(name,val){return '<div class="metricrow"><span>'+esc(name)+'</span><b>'+esc(val)+'</b></div>'}
function renderDetail(){
 const g=games.find(x=>x.id===selected);
 if(!g){$('detail').innerHTML='<div class="placeholder"><div class="placeholder-icon">◎</div><h3>No game selected</h3><p>Choose an upcoming NBA matchup.</p></div>';return}
 if(!hasHistory){$('detail').innerHTML='<div class="placeholder"><h3>Insufficient verified history</h3><p>The model requires at least 800 completed games from the previous season. No probabilities will be shown until this data is available.</p></div>';return}
 const state=E.ratings(games,g.date),p=E.forecast(g,state),h=p.home,a=p.away;
 const h2h=E.matchupHistory(games,g);
 const hWin=p.homeWin>=.5;
 const tag=g.status==='final'?'ARCHIVED PREGAME ESTIMATE':g.status==='live'?'PREGAME MODEL · LIVE GAME':'PREGAME ESTIMATE';
 $('detail').innerHTML=
 '<div class="headrow"><span class="eyebrow">'+esc(fmt(g.date))+'</span><span class="badge">'+tag+'</span></div>'+
 '<h3>'+esc(g.away.name)+' <span class="muted">at</span> '+esc(g.home.name)+'</h3>'+
 '<div class="odds"><div><div class="name">'+esc(g.away.abbr)+' · Away</div><div class="pct">'+pct(p.awayWin)+'</div></div>'+
 '<div><div class="name">'+esc(g.home.abbr)+' · Home</div><div class="pct">'+pct(p.homeWin)+'</div></div></div>'+
 '<div class="bar" role="img" aria-label="'+esc(g.away.abbr)+' '+pct(p.awayWin)+', '+esc(g.home.abbr)+' '+pct(p.homeWin)+'"><span style="width:'+100*p.awayWin+'%"></span></div>'+
 '<div class="forecast"><div><strong>'+round(p.awayScore)+' – '+round(p.homeScore)+'</strong><small>Projected score · Away–Home</small></div><div><strong>'+one(p.total)+'</strong><small>Projected total</small></div><div><strong>'+esc((hWin?g.home.abbr:g.away.abbr))+' '+one(Math.abs(p.margin))+'</strong><small>Projected winner & margin</small></div></div>'+
 '<div class="split"><div><h4>'+esc(g.away.abbr)+' · Away</h4>'+
 metric('Elo',round(a.elo))+metric('Record',a.wins+'–'+a.losses)+metric('Points/game',a.games?one(a.points/a.games):'No games')+
 metric('Allowed/game',a.games?one(a.allowed/a.games):'No games')+metric('Last 5',a.recent.slice(-5).map(x=>x.win?'W':'L').join(' ')||'—')+
 metric('Rest before tip',p.awayRest===null?'Unknown':p.awayRest+' days')+'</div>'+
 '<div><h4>'+esc(g.home.abbr)+' · Home</h4>'+
 metric('Elo',round(h.elo))+metric('Record',h.wins+'–'+h.losses)+metric('Points/game',h.games?one(h.points/h.games):'No games')+
 metric('Allowed/game',h.games?one(h.allowed/h.games):'No games')+metric('Last 5',h.recent.slice(-5).map(x=>x.win?'W':'L').join(' ')||'—')+
 metric('Rest before tip',p.homeRest===null?'Unknown':p.homeRest+' days')+'</div></div>'+
 '<h4 class="small">MATCHUP EXPLANATION</h4><div class="context">'+
 '<p><b>'+esc(hWin?g.home.name:g.away.name)+'</b> is favoured by '+one(Math.abs(p.eloEdge))+' adjusted Elo points. Home court contributes '+65+' Elo points; back-to-back scheduling contributes '+(p.eloEdge-(h.elo-a.elo)-65)+' Elo points.</p>'+
 '<p>Last '+h2h.length+' head-to-head meeting'+(h2h.length===1?'':'s')+': '+(h2h.length?h2h.map(x=>esc(x.away.abbr)+' '+x.awayScore+'–'+x.homeScore+' '+esc(x.home.abbr)).join(' · '):'No verified recent meetings')+'. Head-to-head history is context only, not a separate predictive weight.</p></div>'+
 (g.status==='final'?'<p class="context"><b>Actual final:</b> '+esc(g.away.abbr)+' '+g.awayScore+' – '+g.homeScore+' '+esc(g.home.abbr)+'. This forecast was recomputed using only games before tip-off.</p>':'')+
 '<p class="disclaimer">'+esc(p.confidence)+'. Elo baseline + scoring estimates; no verified injury/lineup adjustments, possession-based matchup metrics or betting-market input. Win probabilities are uncalibrated until sufficient backtesting. This is not betting advice.</p>';
}
function renderTeams(){
 const state=E.ratings(games,new Date(Date.now()+1000).toISOString());
 const rows=E.teamTable(state);
 $('power-season').textContent=state.season?(state.season-1)+'–'+String(state.season).slice(2):'No completed season';
 $('teams').innerHTML=rows.length?rows.map(t=>'<tr><td>#'+t.rank+'</td><td><b>'+esc(t.name)+'</b> <span class="muted">('+esc(t.abbr)+')</span></td>'+
 '<td>'+t.wins+'–'+t.losses+'</td><td>'+round(t.elo)+'</td><td>'+one(t.ppg)+'</td><td>'+one(t.oppg)+'</td><td>'+esc(t.form||'—')+'</td></tr>').join(''):'<tr><td colspan="7">No verified completed games.</td></tr>';
}
$('range').addEventListener('change',renderGames);
$('team-search').addEventListener('input',renderGames);
load();
})();