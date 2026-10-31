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
 const isPredictions=/\/predict\/$/.test(current)||/\/challenge\/daily\.html$/.test(current);
 const isModelLab=/\/(models|challenge|audit)\/$/.test(current);
 const shortcut=document.querySelector('.app-header .header-action');
 if(shortcut){
  shortcut.href=href('watchlist/');
  shortcut.textContent='MY WATCHLIST';
  shortcut.setAttribute('aria-label','Manage followed NBA teams and players');
 }
 const link=(label,url,active)=>'<a class="nav-main-link'+(active?' active':'')+
  '" href="'+href(url)+'"'+(active?' aria-current="page"':'')+'>'+label+'</a>';
 nav.innerHTML=
  link('GAMES','#live-games',onHome||isGame)+
  link('PREDICTIONS','predict/',isPredictions)+
  link('LEAGUE','league/',isLeague)+
  link('PLAYERS','player-stats/',isStats)+
  link('MODEL LAB','challenge/',isModelLab);
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
   const active=a.textContent==='GAMES';
   a.classList.toggle('active',active);
   if(active)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');
  });
 });
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
