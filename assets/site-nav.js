/* Simplified NBA Twin Lab primary navigation. Three clear destinations,
 * short submenus, one consistent layout across game/analytics/league pages. */
(()=>{'use strict';
function init(){
 const nav=document.querySelector('.app-header nav[aria-label="Main navigation"]');
 if(!nav)return;
 const src=document.currentScript?.src;
 const base=src?new URL('../',src):new URL(document.querySelector('.app-header .brand')?.href||location.href);
 const href=p=>new URL(p,base).href;
 const current=location.pathname;
 const machine=/\/(predict|challenge|audit|models|player-stats)\//.test(current);
 const league=/\/(team-intelligence|twins|league|history|research|watchlist)\//.test(current);
 const live=!machine&&!league;
 nav.innerHTML=
  '<a class="nav-main-link'+(live?' active':'')+'" href="'+href('#live-games')+'"'+(live?' aria-current="page"':'')+'>LIVE</a>'+
  '<details class="nav-group'+(machine?' active':'')+'"><summary>THE MACHINE <span aria-hidden="true">⌄</span></summary><div class="nav-dropdown">'+
  '<a href="'+href('predict/')+'">Game Predictor</a><a href="'+href('challenge/daily.html#matchups')+'">Daily Predictions</a>'+
  '<a href="'+href('challenge/')+'">Model Power Rankings</a><a href="'+href('audit/')+'">Accuracy Audit</a></div></details>'+
  '<a class="nav-main-link" href="'+href('#live-player-stats')+'">PLAYER STATS</a>'+
  '<details class="nav-group'+(league?' active':'')+'"><summary>LEAGUE <span aria-hidden="true">⌄</span></summary><div class="nav-dropdown">'+
  '<a href="'+href('league/')+'">Standings</a><a href="'+href('team-intelligence/')+'">Team Intelligence</a>'+
  '<a href="'+href('twins/')+'">Player Twins</a><a href="'+href('watchlist/')+'">My Watchlist ★</a><a href="'+href('history/')+'">Historical Lab</a></div></details>';
 for(const menu of nav.querySelectorAll('details')){
  menu.addEventListener('toggle',()=>{if(menu.open)for(const other of nav.querySelectorAll('details'))if(other!==menu)other.open=false});
  menu.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>menu.open=false));
 }
 document.addEventListener('click',e=>{if(!nav.contains(e.target))for(const menu of nav.querySelectorAll('details'))menu.open=false});
 nav.addEventListener('keydown',e=>{if(e.key==='Escape'){for(const menu of nav.querySelectorAll('details'))menu.open=false;nav.querySelector('summary')?.focus()}});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();