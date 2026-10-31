/* V19 Concept 3: independent destinations for home, live scores, prediction lab,
 * player projections and league. No page is a disguised duplicate of another.
 * Presentation-only navigation; preserves all existing research routes.
 */
(()=>{'use strict';
function init(){
 const nav=document.querySelector('.app-header nav[aria-label="Main navigation"]');
 if(!nav)return;
 // DOMContentLoaded handlers have no document.currentScript: anchor to the
 // repository's existing home-brand href, never the domain root.
 const src=document.currentScript?.src;
 const base=src?new URL('../',src):new URL(document.querySelector('.app-header .brand')?.href||location.href);
 const href=p=>new URL(p,base).href;
 const current=location.pathname.replace(/index\.html$/,'');
 const rootPath=base.pathname;
 const onHome=current===rootPath;
 const isScores=onHome&&['#live-games','#live-player-stats'].includes(location.hash);
 const isGame=/\/game\/$/.test(current);
 const isStats=/\/(player-stats|player)\/$/.test(current);
 const isLeague=/\/(league|team)\/$/.test(current);
 const isMachine=/\/(predict|challenge|audit|models)\//.test(current);
 // Home already has a Live tab; use the header shortcut for real team/player
 // following instead of another redundant scoreboard button.
 const shortcut=document.querySelector('.app-header .header-action');
 if(shortcut){
  shortcut.href=href('watchlist/');
  shortcut.textContent='MY WATCHLIST ★';
  shortcut.setAttribute('aria-label','Manage your followed NBA teams and players');
 }
 const link=(label,url,active)=>'<a class="nav-main-link'+(active?' active':'')+
  '" href="'+href(url)+'"'+(active?' aria-current="page"':'')+'>'+label+'</a>';
 nav.innerHTML=
  link('HOME','',onHome&&!isScores)+
  link('LIVE','#live-games',isScores||isGame)+
  link('PREDICTIONS','challenge/daily.html#matchups',isMachine)+
  link('PLAYER STATS','player-stats/',isStats)+
  link('LEAGUE','league/',isLeague)+
  '<details class="nav-group nav-explore"><summary aria-label="Explore more NBA Twin Lab tools">EXPLORE <span aria-hidden="true">⌄</span></summary>'+
  '<div class="nav-dropdown" role="group" aria-label="More NBA tools">'+
  '<a href="'+href('predict/')+'">Game Predictor</a>'+
  '<a href="'+href('challenge/')+'">THE MACHINE · Model Rankings</a>'+
  '<a href="'+href('audit/')+'">Accuracy & Audit</a>'+
  '<a href="'+href('#live-player-stats')+'">Live Box Scores (not projections)</a>'+
  '<a href="'+href('team/')+'">Team Centre</a>'+\n  '<a href="'+href('team-intelligence/')+'">Team Intelligence</a>'+
  '<a href="'+href('league/#cup')+'">NBA Cup</a>'+
  '<a href="'+href('watchlist/')+'">★ My Watchlist</a>'+
  '<a href="'+href('twins/')+'">Player Twins</a>'+
  '</div></details>';
 for(const menu of nav.querySelectorAll('details')){
  menu.addEventListener('toggle',()=>{
   if(menu.open)for(const other of nav.querySelectorAll('details'))if(other!==menu)other.open=false;
  });
  menu.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>menu.open=false));
 }
 document.addEventListener('click',e=>{
  if(!nav.contains(e.target))for(const menu of nav.querySelectorAll('details'))menu.open=false;
 });
 nav.addEventListener('keydown',e=>{
  if(e.key==='Escape'){for(const menu of nav.querySelectorAll('details'))menu.open=false;nav.querySelector('summary')?.focus()}
 });
 // Live box scores are an independent subsection of Home, NOT Player Projections.
 window.addEventListener('hashchange',()=>{
  if(location.pathname.replace(/index\.html$/,'')!==rootPath)return;
  const live=['#live-games','#live-player-stats'].includes(location.hash);
  for(const a of nav.querySelectorAll('.nav-main-link')){
   if(!['HOME','LIVE'].includes(a.textContent))continue;
   const active=a.textContent==='LIVE'?live:!live;
   a.classList.toggle('active',active);
   if(active)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');
  }
 });
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();