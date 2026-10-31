(()=>{'use strict';
const $=id=>document.getElementById(id),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
const logo=t=>window.NbaMedia?.image?.(t,{size:'small',label:t})||'<span>'+esc(t)+'</span>';
function render(){
 const api=window.TwinWatchlist;if(!api)return;
 const saved=api.state(),names=window.TwinTeamPrefs?.names||{};
 $('watchlist-status').textContent=saved.teams.length+' followed teams · '+saved.players.length+' followed players · saved locally on this device';
 $('watched-teams').innerHTML=saved.teams.length?saved.teams.map(t=>
  '<div class="watchlist-item"><span class="watchlist-person">'+logo(t)+'<span><strong>'+esc(names[t]||t)+'</strong><small>NBA team</small></span></span>'+
  '<button type="button" class="watchlist-remove" data-watch-team="'+esc(t)+'" aria-label="Unfollow '+esc(names[t]||t)+'">★</button></div>').join(''):
  '<div class="watchlist-empty">No teams followed yet. Open League and tap ☆ beside any team to follow it.</div>';
 $('watched-players').innerHTML=saved.players.length?saved.players.map(p=>
  '<div class="watchlist-item"><span class="watchlist-person"><img src="https://cdn.nba.com/headshots/nba/latest/260x190/'+encodeURIComponent(p.id)+'.png" loading="lazy" alt="" onerror="this.style.display=\'none\'">'+
  '<span><strong>'+esc(p.name)+'</strong><small>'+esc(p.team||'NBA player')+' · Verified player ID '+esc(p.id)+'</small></span></span>'+
  '<button type="button" class="watchlist-remove" data-watch-player="'+esc(p.id)+'" data-watch-name="'+esc(p.name)+'" data-watch-player-team="'+esc(p.team)+'" aria-label="Unfollow '+esc(p.name)+'">★</button></div>').join(''):
  '<div class="watchlist-empty">No players followed yet. Open a live game or player box score, then tap + Follow beside a player.</div>';
 api.sync();
}
document.addEventListener('twinlab:watchlistchange',render);
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',render,{once:true});else render();
})();