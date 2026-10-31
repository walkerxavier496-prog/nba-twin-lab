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
 const isLeague=/\/(league|team|team-intelligence)\/$/.test(current);
 const isMachine=/\/(predict|models|challenge|audit)\/$/.test(current)||/\/challenge\/daily\.html$/.test(current);
 const shortcut=document.querySelector('.app-header .header-action');
 if(shortcut){
  shortcut.href=href('watchlist/');
  shortcut.textContent='MY WATCHLIST';
  shortcut.setAttribute('aria-label','Manage followed NBA teams and players');
 }
 const link=(label,url,active)=>'<a class="nav-main-link'+(active?' active':'')+
  '" href="'+href(url)+'"'+(active?' aria-current="page"':'')+'>'+label+'</a>';
 nav.innerHTML=
  link('LIVE','#live-games',onHome||isGame)+
  link('THE MACHINE','predict/',isMachine)+
  link('PLAYERS','player-stats/',isStats)+
  link('LEAGUE','league/',isLeague)+
  '<details class="nav-group nav-explore"><summary aria-label="Open more NBA Twin Lab sections">MORE <span aria-hidden="true">⌄</span></summary>'+
  '<div class="nav-dropdown" role="group" aria-label="More NBA Twin Lab tools">'+
  '<a href="'+href('challenge/daily.html')+'">Daily Predictions</a>'+
  '<a href="'+href('challenge/')+'">Six Model Rankings</a>'+
  '<a href="'+href('audit/')+'">Accuracy Ledger</a>'+
  '<a href="'+href('watchlist/')+'">My Teams & Players</a>'+
  '<a href="'+href('team-intelligence/')+'">Team Matchups</a>'+
  '<a href="'+href('league/#cup')+'">NBA Cup</a>'+
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
 // LIVE is the landing destination; hash changes must not introduce duplicate active links.
 window.addEventListener('hashchange',()=>{
  if(location.pathname.replace(/index\.html$/,'')!==rootPath)return;
  nav.querySelectorAll('.nav-main-link').forEach(a=>{
   const active=a.textContent==='LIVE';
   a.classList.toggle('active',active);
   if(active)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');
  });
 });
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
