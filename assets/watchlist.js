/* Twin Lab lightweight device-local NBA follows.
 * Stored only in this browser. Not cloud-synced, not background push alerts.
 */
(()=>{'use strict';
const KEY='nba-twin-lab:watchlist:v1',limit=150;
const canon=x=>window.TwinTeamPrefs?.canonical?.(x)||String(x||'').toUpperCase();
const safeName=s=>String(s||'').slice(0,90).trim();
const validId=id=>/^\d{1,15}$/.test(String(id||''));
function read(){
 try{
  const v=JSON.parse(localStorage.getItem(KEY)||'{}');
  return {teams:Array.isArray(v.teams)?v.teams.filter(x=>/^[A-Z]{2,4}$/.test(x)).slice(0,30):[],
   players:Array.isArray(v.players)?v.players.filter(p=>validId(p.id)&&safeName(p.name)).slice(0,limit):[]};
 }catch(e){return {teams:[],players:[]}}
}
let followed=read();
function state(){return {teams:[...followed.teams],players:followed.players.map(p=>({...p}))}}
function store(){
 try{localStorage.setItem(KEY,JSON.stringify(followed))}catch(e){}
 sync();
 try{document.dispatchEvent(new CustomEvent('twinlab:watchlistchange',{detail:state()}))}catch(e){}
}
function hasTeam(code){return followed.teams.includes(canon(code))}
function hasPlayer(id){return followed.players.some(p=>String(p.id)===String(id))}
function toggleTeam(code){
 const t=canon(code);
 if(!window.TwinTeamPrefs?.names?.[t])return false;
 followed.teams=hasTeam(t)?followed.teams.filter(v=>v!==t):[...followed.teams,t].slice(0,30);
 store();return hasTeam(t);
}
function togglePlayer(player){
 const id=String(player?.id||''),name=safeName(player?.name),team=canon(player?.team);
 if(!validId(id)||!name)return false;
 followed.players=hasPlayer(id)?followed.players.filter(p=>String(p.id)!==id):
  [...followed.players,{id,name,team}].slice(-limit);
 store();return hasPlayer(id);
}
function sync(){
 for(const b of document.querySelectorAll?.('[data-watch-team]')||[]){
  const active=hasTeam(b.dataset.watchTeam);b.setAttribute('aria-pressed',String(active));
  b.setAttribute('aria-label',(active?'Unfollow ':'Follow ')+(window.TwinTeamPrefs?.names?.[canon(b.dataset.watchTeam)]||b.dataset.watchTeam));
  b.textContent=active?'★':'☆';
 }
 for(const b of document.querySelectorAll?.('[data-watch-player]')||[]){
  const active=hasPlayer(b.dataset.watchPlayer);b.setAttribute('aria-pressed',String(active));
  b.setAttribute('aria-label',(active?'Unfollow ':'Follow ')+(b.dataset.watchName||'NBA player'));
  b.textContent=active?'★ Following':'+ Follow';
 }
 const badge=document.getElementById('watchlist-count');
 if(badge)badge.textContent=String(followed.teams.length+followed.players.length);
}
function init(){
 document.addEventListener('click',e=>{
  const b=e.target.closest?.('[data-watch-team],[data-watch-player]');
  if(!b)return;
  e.preventDefault();e.stopPropagation();
  if(b.dataset.watchTeam)toggleTeam(b.dataset.watchTeam);
  else togglePlayer({id:b.dataset.watchPlayer,name:b.dataset.watchName,team:b.dataset.watchPlayerTeam});
 });
 sync();
}
window.TwinWatchlist=Object.freeze({state,hasTeam,hasPlayer,toggleTeam,togglePlayer,sync});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();