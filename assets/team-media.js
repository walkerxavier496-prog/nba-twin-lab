/* NBA team media — logo URLs are copied from the project's verified ESPN feed.
 * Public CDN/team marks belong to their owners; do not imply affiliation.
 * Text fallback remains visible if an image fails to load.
 */
(()=>{'use strict';
 const logos=Object.freeze({
  "HOU": "https://a.espncdn.com/i/teamlogos/nba/500/scoreboard/hou.png",
  "OKC": "https://a.espncdn.com/i/teamlogos/nba/500/scoreboard/okc.png",
  "GS": "https://a.espncdn.com/i/teamlogos/nba/500/scoreboard/gs.png",
  "LAL": "https://a.espncdn.com/i/teamlogos/nba/500/scoreboard/lal.png",
  "CLE": "https://a.espncdn.com/i/teamlogos/nba/500/scoreboard/cle.png",
  "NY": "https://a.espncdn.com/i/teamlogos/nba/500/scoreboard/ny.png",
  "BKN": "https://a.espncdn.com/i/teamlogos/nba/500/scoreboard/bkn.png",
  "CHA": "https://a.espncdn.com/i/teamlogos/nba/500/scoreboard/cha.png",
  "MIA": "https://a.espncdn.com/i/teamlogos/nba/500/scoreboard/mia.png",
  "ORL": "https://a.espncdn.com/i/teamlogos/nba/500/scoreboard/orl.png",
  "TOR": "https://a.espncdn.com/i/teamlogos/nba/500/scoreboard/tor.png",
  "ATL": "https://a.espncdn.com/i/teamlogos/nba/500/scoreboard/atl.png",
  "PHI": "https://a.espncdn.com/i/teamlogos/nba/500/scoreboard/phi.png",
  "BOS": "https://a.espncdn.com/i/teamlogos/nba/500/scoreboard/bos.png",
  "DET": "https://a.espncdn.com/i/teamlogos/nba/500/scoreboard/det.png",
  "CHI": "https://a.espncdn.com/i/teamlogos/nba/500/scoreboard/chi.png",
  "NO": "https://a.espncdn.com/i/teamlogos/nba/500/scoreboard/no.png",
  "MEM": "https://a.espncdn.com/i/teamlogos/nba/500/scoreboard/mem.png",
  "WSH": "https://a.espncdn.com/i/teamlogos/nba/500/scoreboard/wsh.png",
  "MIL": "https://a.espncdn.com/i/teamlogos/nba/500/scoreboard/mil.png",
  "LAC": "https://a.espncdn.com/i/teamlogos/nba/500/scoreboard/lac.png",
  "UTAH": "https://a.espncdn.com/i/teamlogos/nba/500/scoreboard/utah.png",
  "SA": "https://a.espncdn.com/i/teamlogos/nba/500/scoreboard/sa.png",
  "DAL": "https://a.espncdn.com/i/teamlogos/nba/500/scoreboard/dal.png",
  "SAC": "https://a.espncdn.com/i/teamlogos/nba/500/scoreboard/sac.png",
  "PHX": "https://a.espncdn.com/i/teamlogos/nba/500/scoreboard/phx.png",
  "MIN": "https://a.espncdn.com/i/teamlogos/nba/500/scoreboard/min.png",
  "POR": "https://a.espncdn.com/i/teamlogos/nba/500/scoreboard/por.png",
  "IND": "https://a.espncdn.com/i/teamlogos/nba/500/scoreboard/ind.png",
  "DEN": "https://a.espncdn.com/i/teamlogos/nba/500/scoreboard/den.png"
});
 const aliases=Object.freeze({GSW:'GS',NYK:'NY',SAS:'SA',NOP:'NO',UTA:'UTAH',WAS:'WSH',PHO:'PHX',BRK:'BKN',CHO:'CHA'});
 const validId=value=>/^\d{4,10}$/.test(String(value||''));
 const clean=abbr=>String(abbr||'').trim().toUpperCase().replace(/[^A-Z]/g,'');
 const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function logo(abbr){return logos[aliases[clean(abbr)]||clean(abbr)]||null}
 function image(abbr,{size='normal',label=''}={}){
  const code=clean(abbr),source=logo(code),name=label||code;
  return '<span class="team-logo team-logo--'+(size==='small'?'sm':size==='large'?'lg':'md')+'" data-team="'+escape(code)+'">'+
   (source?'<img src="'+escape(source)+'" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.style.display=\'none\'" />':'')+
   '<span class="team-logo__fallback">'+escape(name)+'</span></span>';
 }
 function headshot(playerId){
  // NBA player ID, not ESPN athlete ID. CDN may omit a player; fallback handles that.
  return validId(playerId)?'https://cdn.nba.com/headshots/nba/latest/260x190/'+encodeURIComponent(String(playerId))+'.png':null;
 }
 function playerImage(player){
  const photo=headshot(player?.player_id);
  const name=escape(player?.name||'NBA player');
  return '<span class="player-photo">'+(photo?'<img src="'+photo+'" alt="Portrait of '+name+'" loading="lazy" decoding="async" onerror="this.style.display=\'none\'">':'')+'<span class="player-photo__fallback" aria-hidden="true">◉</span></span>';
 }
 window.NbaMedia=Object.freeze({logo,image,headshot,playerImage,teamCount:Object.keys(logos).length});
})();