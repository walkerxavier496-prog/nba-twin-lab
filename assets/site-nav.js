/* V19: four clear destinations, with research utilities moved into Explore.
 * Navigation is presentation only; it never touches game or forecast data. */
(()=>{'use strict';
function init(){
 const nav=document.querySelector('.app-header nav[aria-label="Main navigation"]');
 if(!nav)return;
 const src=document.currentScript?.src;
 const base=src?new URL('../',src):new URL(document.querySelector('.app-header .brand')?.href||location.href);
 const href=p=>new URL(p,base).href;
 const current=location.pathname;
 const isStats=/\/player-stats\//.test(current)||(current===base.pathname&&location.hash==='#live-player-stats');
 const isLeague=/\/(team-intelligence|twins|league|history|research|watchlist)\//.test(current);
 const isMachine=/\/(predict|challenge|audit|models)\//.test(current);
 const isLive=!isStats&&!isLeague&&!isMachine;
 const link=(label,url,active)=>'<a class="nav-main-link'+(active?' active':'')+
  '" href="'+href(url)+'"'+(active?' aria-current="page"':'')+'>'+label+'</a>';
 nav.innerHTML=
  link('LIVE','#live-games',isLive)+
  link('THE MACHINE','challenge/daily.html#matchups',isMachine)+
  link('PLAYER STATS','#live-player-stats',isStats)+
  link('LEAGUE','league/',isLeague)+
  '<details class="nav-group nav-explore"><summary aria-label="Explore more NBA Twin Lab tools">EXPLORE <span aria-hidden="true">⌄</span></summary>'+
  '<div class="nav-dropdown" role="group" aria-label="More NBA tools">'+
  '<a href="'+href('predict/')+'">Game Predictor</a>'+
  '<a href="'+href('challenge/')+'">Model Rankings</a>'+
  '<a href="'+href('audit/')+'">Accuracy & Audit</a>'+
  '<a href="'+href('team-intelligence/')+'">Team Intelligence</a>'+
  '<a href="'+href('league/#cup')+'">NBA Cup</a>'+
  '<a href="'+href('watchlist/')+'">★ My Watchlist</a>'+
  '<a href="'+href('twins/')+'">Player Twins</a>'+
  '</div></details>';
 for(const menu of nav.querySelectorAll('details')){
  menu.addEventListener('toggle',()=>{if(menu.open)for(const other of nav.querySelectorAll('details'))if(other!==menu)other.open=false});
  menu.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>menu.open=false));
 }
 document.addEventListener('click',e=>{if(!nav.contains(e.target))for(const menu of nav.querySelectorAll('details'))menu.open=false});
 nav.addEventListener('keydown',e=>{if(e.key==='Escape'){for(const menu of nav.querySelectorAll('details'))menu.open=false;nav.querySelector('summary')?.focus()}});

 // Active destinations remain correct when the user switches live/stat anchors.
 window.addEventListener('hashchange',()=>{
  if(location.pathname!==base.pathname)return;
  for(const a of nav.querySelectorAll('.nav-main-link')){
   if(a.textContent!=='LIVE'&&a.textContent!=='PLAYER STATS')continue;
   const active=location.hash==='#live-player-stats'?a.textContent==='PLAYER STATS':a.textContent==='LIVE';
   a.classList.toggle('active',active);
   if(active)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');
  }
 });
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();